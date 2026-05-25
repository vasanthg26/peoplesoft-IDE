# RAG Utility — Design Specification

## Purpose

Ingest PeopleSoft documentation PDFs into a PostgreSQL pgvector store and expose a semantic search REST API. Enables retrieval-augmented generation over versioned PeopleSoft documentation.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Embedding Model](#embedding-model)
4. [Chunking Strategy](#chunking-strategy)
5. [Incremental Ingestion Logic](#incremental-ingestion-logic)
6. [REST API Specification](#rest-api-specification)
7. [Folder Structure](#folder-structure)
8. [Environment Configuration](#environment-configuration)
9. [Dependencies](#dependencies)
10. [Agent Build Instructions](#agent-build-instructions)

---

## Architecture Overview

```
PDF File
   │
   ▼
ingest/chunker.py       → extracts structured chunks (chapter/section/content)
   │
   ▼
ingest/embedder.py      → generates 384-dim vectors via all-MiniLM-L6-v2
   │
   ▼
ingest/pipeline.py      → checksum diff logic → upserts to PostgreSQL
   │
   ▼
db/connection.py        → psycopg2 connection pool
db/schema.py            → DDL helpers, index creation
   │
   ▼
search/searcher.py      → cosine similarity queries via pgvector
   │
   ▼
api/server.py           → FastAPI app exposing REST endpoints
   │
   ▼
cli.py                  → command-line entry point for ingestion
```

---

## Database Schema

### Table: `rag_knowledge`

Already created in PostgreSQL. Schema reference for all layers:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_knowledge (
    id          SERIAL PRIMARY KEY,
    project     TEXT        NOT NULL,          -- e.g. "HRMS", "FSCM"
    source      TEXT        NOT NULL,          -- filename or doc title
    version     TEXT        NOT NULL,          -- e.g. "9.2", "8.60"
    chapter     TEXT        NOT NULL DEFAULT '',
    section     TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL,          -- raw chunk text
    embedding   vector(384) NOT NULL,          -- all-MiniLM-L6-v2 output
    checksum    TEXT        NOT NULL,          -- MD5 of content
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite unique key for dedup / incremental update targeting
CREATE UNIQUE INDEX IF NOT EXISTS rag_knowledge_source_chunk_idx
    ON rag_knowledge (project, source, version, chapter, section);

-- pgvector HNSW index for fast ANN search
CREATE INDEX IF NOT EXISTS rag_knowledge_embedding_idx
    ON rag_knowledge USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### Column Semantics

| Column    | Type         | Description |
|-----------|--------------|-------------|
| project   | TEXT         | Top-level product grouping (e.g. "HRMS") |
| source    | TEXT         | Source document identifier (filename without path) |
| version   | TEXT         | Document/product version string |
| chapter   | TEXT         | Top-level heading extracted from PDF |
| section   | TEXT         | Sub-heading under the chapter |
| content   | TEXT         | Full text of the chunk |
| embedding | vector(384)  | Float vector from all-MiniLM-L6-v2 |
| checksum  | TEXT         | MD5 hex digest of `content` for change detection |

---

## Embedding Model

**Model:** `sentence-transformers/all-MiniLM-L6-v2`
**Dimensions:** 384
**Library:** `sentence-transformers`

### Usage contract

- Load model once at process startup; store as a module-level singleton in `ingest/embedder.py`.
- Encode a list of strings in batches (batch size 64) to avoid OOM on large ingestion runs.
- Return `numpy.ndarray` of shape `(n, 384)` from `embed_batch(texts: list[str]) -> np.ndarray`.
- Expose `embed_one(text: str) -> list[float]` as a convenience wrapper for search queries.
- Normalize embeddings to unit vectors before storage (cosine similarity requires this).

---

## Chunking Strategy

**File:** `ingest/chunker.py`

### Goals

- One chunk per logical unit: chapter intro, section, function/event/method description.
- Preserve enough surrounding context in each chunk for meaningful retrieval.
- Never split in the middle of a sentence or code block.

### Algorithm

1. **Parse PDF** using `pdfplumber`. Extract pages as plain text preserving whitespace.
2. **Detect headings** using heuristics:
   - ALL-CAPS lines or lines matching `Chapter \d+` / `Section \d+[\.\d]*` patterns.
   - Bold text detected via character-level font metadata from pdfplumber.
   - Numbered list items at depth 1 (e.g. `1.`, `2.`) treated as section boundaries.
3. **Build a heading tree**: `chapter → [sections]`. Each section collects subsequent paragraphs until the next heading of equal or higher level.
4. **Function/Event/Method detection**: Lines matching patterns like `Function Name:`, `Method:`, `Event:`, `PeopleCode Function` split a section into per-function sub-chunks.
5. **Size guardrails**:
   - Minimum chunk size: 50 tokens (discard noise fragments).
   - Maximum chunk size: 512 tokens. Chunks exceeding this are split at paragraph boundaries, with a 50-token overlap carried forward as context prefix.
6. **Context prefix**: Each chunk prepends `[Project: {project} | Version: {version} | {chapter} > {section}]` to the `content` field before embedding, but this prefix is stripped from the stored `content` column.

### Output

```python
@dataclass
class Chunk:
    project: str
    source: str
    version: str
    chapter: str
    section: str
    content: str          # clean text, no prefix
    embed_text: str       # content with context prefix, used for embedding only
    checksum: str         # md5(content)
```

---

## Incremental Ingestion Logic

**File:** `ingest/pipeline.py`

### Per-document run

```
1. Extract all Chunk objects from PDF via chunker
2. Load existing rows from DB for (project, source, version):
       existing = {(chapter, section): checksum}
3. For each new chunk:
       key = (chapter, section)
       if key not in existing:
           INSERT new row
       elif existing[key] != chunk.checksum:
           UPDATE row (content, embedding, checksum, updated_at)
       else:
           SKIP (unchanged)
4. For each key in existing not present in new chunks:
       DELETE row (section was removed from document)
5. Log counts: inserted, updated, deleted, skipped
```

### Checksum computation

```python
import hashlib

def md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()
```

Checksum is computed from the raw `content` string only (not the embed_text prefix).

### Concurrency

- Pipeline is single-threaded per document run.
- Safe to run multiple CLI invocations in parallel for different `(project, source, version)` tuples due to the unique index.
- Use `ON CONFLICT DO UPDATE` (upsert) as the DB operation to make INSERT/UPDATE atomic:

```sql
INSERT INTO rag_knowledge
    (project, source, version, chapter, section, content, embedding, checksum)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (project, source, version, chapter, section)
DO UPDATE SET
    content    = EXCLUDED.content,
    embedding  = EXCLUDED.embedding,
    checksum   = EXCLUDED.checksum,
    updated_at = now()
WHERE rag_knowledge.checksum != EXCLUDED.checksum;
```

Deletions are handled as a separate explicit `DELETE` step after the upsert loop.

---

## REST API Specification

**File:** `api/server.py`
**Framework:** FastAPI

### Base URL

`http://localhost:8000`

---

### `POST /ingest`

Ingest a PDF file into the knowledge base.

**Request body (multipart/form-data)**

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| file    | File   | Yes      | PDF file to ingest |
| project | string | Yes      | Project identifier (e.g. "HRMS") |
| version | string | Yes      | Document version (e.g. "9.2") |

**Response `200 OK`**

```json
{
  "source": "HCM_PeopleCode_Reference.pdf",
  "inserted": 142,
  "updated": 3,
  "deleted": 0,
  "skipped": 87
}
```

**Response `422 Unprocessable Entity`** — validation errors
**Response `500 Internal Server Error`** — ingestion failure with `{"detail": "..."}`

---

### `GET /search`

Semantic search over ingested knowledge.

**Query parameters**

| Parameter | Type    | Required | Default | Description |
|-----------|---------|----------|---------|-------------|
| q         | string  | Yes      | —       | Search query text |
| project   | string  | No       | —       | Filter by project |
| version   | string  | No       | —       | Filter by version |
| source    | string  | No       | —       | Filter by source document |
| limit     | integer | No       | 5       | Max results (1–50) |

**Response `200 OK`**

```json
{
  "query": "how to use FindFirst function",
  "results": [
    {
      "id": 1042,
      "project": "HRMS",
      "source": "HCM_PeopleCode_Reference.pdf",
      "version": "9.2",
      "chapter": "Built-in Functions",
      "section": "FindFirst",
      "content": "FindFirst(array, value) searches...",
      "score": 0.9312
    }
  ]
}
```

`score` is cosine similarity (0–1, higher is more relevant).

---

### `GET /projects`

List all distinct projects in the knowledge base.

**Response `200 OK`**

```json
{
  "projects": ["FSCM", "HRMS", "Campus Solutions"]
}
```

---

### `GET /sources`

List all distinct sources, optionally filtered by project/version.

**Query parameters**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| project   | string | No       | Filter by project |
| version   | string | No       | Filter by version |

**Response `200 OK`**

```json
{
  "sources": [
    {
      "source": "HCM_PeopleCode_Reference.pdf",
      "project": "HRMS",
      "version": "9.2",
      "chunk_count": 234
    }
  ]
}
```

---

### `GET /health`

Health check — verifies DB connectivity and model load.

**Response `200 OK`**

```json
{
  "status": "ok",
  "db": "connected",
  "model": "all-MiniLM-L6-v2",
  "vector_dims": 384
}
```

**Response `503 Service Unavailable`** if DB is unreachable.

---

## Folder Structure

```
rag-utility/
├── db/
│   ├── __init__.py
│   ├── connection.py       # psycopg2 connection pool; get_conn() context manager
│   └── schema.py           # ensure_schema(): creates extension, table, indexes if missing
│
├── ingest/
│   ├── __init__.py
│   ├── chunker.py          # extract_chunks(pdf_path, project, source, version) -> list[Chunk]
│   ├── embedder.py         # embed_batch(texts) -> np.ndarray; embed_one(text) -> list[float]
│   └── pipeline.py         # run_pipeline(pdf_path, project, version) -> IngestResult
│
├── search/
│   ├── __init__.py
│   └── searcher.py         # semantic_search(query, *, project, version, source, limit) -> list[Result]
│
├── api/
│   ├── __init__.py
│   └── server.py           # FastAPI app; mounts all routers
│
├── cli.py                  # `python cli.py ingest --file foo.pdf --project X --version Y`
├── .env                    # environment variables (never commit)
├── .env.example            # committed template
├── requirements.txt
└── design.md               # this file
```

---

## Environment Configuration

**File:** `.env` (never commit; use `.env.example` as template)

```dotenv
# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=ragdb
PGUSER=raguser
PGPASSWORD=secret

# Connection pool
DB_MIN_CONN=1
DB_MAX_CONN=10

# API
API_HOST=0.0.0.0
API_PORT=8000

# Embedding
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_BATCH_SIZE=64
```

**File:** `.env.example`

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=ragdb
PGUSER=raguser
PGPASSWORD=

DB_MIN_CONN=1
DB_MAX_CONN=10

API_HOST=0.0.0.0
API_PORT=8000

EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_BATCH_SIZE=64
```

Load with `python-dotenv` at the top of `db/connection.py` and `api/server.py`.

---

## Dependencies

**File:** `requirements.txt`

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
python-multipart>=0.0.9
psycopg2-binary>=2.9.9
pgvector>=0.2.5
sentence-transformers>=2.7.0
pdfplumber>=0.11.0
python-dotenv>=1.0.1
numpy>=1.26.0
```

---

## Agent Build Instructions

### Agent 2 — DB Layer (`db/`)

**Files to create:** `db/__init__.py`, `db/connection.py`, `db/schema.py`

Responsibilities:
- Load env vars from `.env` using `python-dotenv`.
- Implement `get_conn()` as a `contextlib.contextmanager` that yields a psycopg2 connection from a `ThreadedConnectionPool` (min/max from env).
- `schema.py` exposes `ensure_schema()` which runs the DDL in the [Database Schema](#database-schema) section using `IF NOT EXISTS` guards — safe to call on every startup.
- Register the `pgvector` type extension via `register_vector(conn)` from the `pgvector.psycopg2` package on every new connection.
- No business logic in this layer — pure connectivity and DDL.

### Agent 3 — Ingest Layer (`ingest/`)

**Files to create:** `ingest/__init__.py`, `ingest/chunker.py`, `ingest/embedder.py`, `ingest/pipeline.py`, `cli.py`

Responsibilities:
- `chunker.py`: implement the [Chunking Strategy](#chunking-strategy). Return `list[Chunk]`. Do not import from `db/` or `search/`.
- `embedder.py`: load model once as module-level singleton. Implement `embed_batch` and `embed_one`. Normalize vectors. Do not import from `db/`.
- `pipeline.py`: implement the [Incremental Ingestion Logic](#incremental-ingestion-logic). Imports from `db/connection.py`, `ingest/chunker.py`, `ingest/embedder.py`. Returns an `IngestResult` dataclass with `inserted`, `updated`, `deleted`, `skipped` counts.
- `cli.py`: argparse CLI with subcommand `ingest`. Calls `db.schema.ensure_schema()` then `ingest.pipeline.run_pipeline(...)`. Prints result summary to stdout.

### Agent 4 — Search & API (`search/`, `api/`)

**Files to create:** `search/__init__.py`, `search/searcher.py`, `api/__init__.py`, `api/server.py`

Responsibilities:
- `searcher.py`: implement `semantic_search(query, *, project=None, version=None, source=None, limit=5)`. Embeds query with `embed_one`, builds parameterized SQL with optional WHERE clauses, returns `list[dict]` with fields matching the `/search` response schema. Use `<=>` operator (cosine distance); score = `1 - distance`.
- `api/server.py`: FastAPI app. On startup call `ensure_schema()` and load the embedding model. Implement all five endpoints per the [REST API Specification](#rest-api-specification). Use `UploadFile` for `/ingest`. Handle exceptions with appropriate HTTP status codes and `{"detail": "..."}` bodies.
- Keep routers thin — delegate all logic to `pipeline.py` and `searcher.py`.

### Agent 5 — Testing

**Files to create:** `tests/` directory with test files

Responsibilities:
- Test `chunker.py` with a sample PDF or mocked pdfplumber output: verify chunk boundaries, min/max size guardrails, checksum determinism.
- Test `embedder.py`: verify output shape `(n, 384)`, unit norm, determinism across two calls.
- Test `pipeline.py` against a real test DB (use a separate `ragdb_test` database): run insert, then re-run with one changed chunk and one removed chunk — verify counts.
- Test all five API endpoints via FastAPI `TestClient`: happy path + error cases (missing params, non-PDF upload, DB down simulation).
- Use `pytest` with fixtures for DB setup/teardown.
- All tests must pass with `pytest -v` before marking the build complete.
