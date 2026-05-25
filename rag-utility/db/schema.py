from db.connection import get_conn

# ---------------------------------------------------------------------------
# DDL
# ---------------------------------------------------------------------------

_SQL_CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS vector;"

_SQL_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS rag_knowledge (
    id          SERIAL PRIMARY KEY,
    project     TEXT        NOT NULL,
    source      TEXT        NOT NULL,
    version     TEXT        NOT NULL,
    chapter     TEXT        NOT NULL DEFAULT '',
    section     TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL,
    embedding   vector(384) NOT NULL,
    checksum    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

_SQL_CREATE_UNIQUE_INDEX = """
CREATE UNIQUE INDEX IF NOT EXISTS rag_knowledge_source_chunk_idx
    ON rag_knowledge (project, source, version, chapter, section);
"""

_SQL_CREATE_HNSW_INDEX = """
CREATE INDEX IF NOT EXISTS rag_knowledge_embedding_idx
    ON rag_knowledge USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
"""

# ---------------------------------------------------------------------------
# CRUD constants — used by ingest/pipeline.py and search/searcher.py
# ---------------------------------------------------------------------------

# Upsert a chunk; the WHERE clause makes the update a no-op when checksum
# is unchanged, so pg_affected_rows distinguishes insert/update/skip.
SQL_UPSERT_CHUNK = """
INSERT INTO rag_knowledge
    (chunk_id, project, source, version, chapter, section, content, embedding, checksum)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (project, source, version, chapter, section)
DO UPDATE SET
    chunk_id   = EXCLUDED.chunk_id,
    content    = EXCLUDED.content,
    embedding  = EXCLUDED.embedding,
    checksum   = EXCLUDED.checksum,
    updated_at = now()
WHERE rag_knowledge.checksum != EXCLUDED.checksum;
"""

# Fetch all (chapter, section, checksum) rows for a given document so the
# pipeline can diff against newly extracted chunks.
SQL_SELECT_EXISTING = """
SELECT chapter, section, checksum
FROM   rag_knowledge
WHERE  project = %s
  AND  source  = %s
  AND  version = %s;
"""

# Delete a specific chunk identified by its composite key.
SQL_DELETE_CHUNK = """
DELETE FROM rag_knowledge
WHERE  project = %s
  AND  source  = %s
  AND  version = %s
  AND  chapter = %s
  AND  section = %s;
"""

# Semantic search: returns top-k rows ordered by cosine distance (ascending).
# Caller appends optional WHERE filters before the ORDER BY clause.
SQL_SEARCH_BASE = """
SELECT
    id,
    project,
    source,
    version,
    chapter,
    section,
    content,
    1 - (embedding <=> %s::vector) AS score
FROM rag_knowledge
"""
SQL_SEARCH_ORDER = """
ORDER BY embedding <=> %s::vector
LIMIT %s;
"""

# List distinct projects.
SQL_LIST_PROJECTS = """
SELECT DISTINCT project
FROM   rag_knowledge
ORDER  BY project;
"""

# List sources with chunk counts, with optional filters applied by the caller.
SQL_LIST_SOURCES_BASE = """
SELECT
    source,
    project,
    version,
    COUNT(*) AS chunk_count
FROM rag_knowledge
"""
SQL_LIST_SOURCES_TAIL = """
GROUP  BY source, project, version
ORDER  BY project, source, version;
"""

# ---------------------------------------------------------------------------
# Schema bootstrap
# ---------------------------------------------------------------------------

def ensure_schema() -> None:
    """Create the pgvector extension, table, and indexes if they do not exist.

    Safe to call on every application startup — all statements use
    IF NOT EXISTS guards.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(_SQL_CREATE_EXTENSION)
            cur.execute(_SQL_CREATE_TABLE)
            cur.execute(_SQL_CREATE_UNIQUE_INDEX)
            cur.execute(_SQL_CREATE_HNSW_INDEX)
