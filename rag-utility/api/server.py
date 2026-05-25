import logging
import os
import tempfile
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse

load_dotenv()

from db.connection import close_pool, get_conn
from db.schema import (
    SQL_LIST_PROJECTS,
    SQL_LIST_SOURCES_BASE,
    SQL_LIST_SOURCES_TAIL,
    ensure_schema,
)
from ingest.embedder import embed_one
from ingest.pipeline import run_pipeline
from search.searcher import semantic_search

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    # Warm up the embedding model so the first request isn't slow.
    embed_one("warmup")
    logger.info("Startup complete — schema verified, model loaded")
    yield
    close_pool()
    logger.info("Shutdown complete — connection pool closed")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="RAG Utility API",
    description="Semantic search over ingested PeopleSoft documentation.",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# POST /ingest
# ---------------------------------------------------------------------------

@app.post("/ingest")
async def ingest(
    file: UploadFile,
    project: str = Form(...),
    version: str = Form(...),
):
    """Ingest a PDF file into the knowledge base."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PDF files are accepted.",
        )

    contents = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = run_pipeline(tmp_path, project, version)
    except Exception as exc:
        logger.error("Ingestion failed for file=%s project=%s version=%s: %s",
                     file.filename, project, version, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return {
        "source": result.source,
        "inserted": result.inserted,
        "updated": result.updated,
        "deleted": result.deleted,
        "skipped": result.skipped,
    }


# ---------------------------------------------------------------------------
# GET /search
# ---------------------------------------------------------------------------

@app.get("/search")
def search(
    q: str = Query(..., description="Search query text"),
    project: str | None = Query(None, description="Filter by project"),
    version: str | None = Query(None, description="Filter by version"),
    source: str | None = Query(None, description="Filter by source document"),
    limit: int = Query(5, ge=1, le=50, description="Max results"),
):
    """Semantic search over the knowledge base."""
    try:
        results = semantic_search(
            q,
            project=project,
            version=version,
            source=source,
            limit=limit,
        )
    except Exception as exc:
        logger.error("Search failed for query=%r: %s", q, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return {"query": q, "results": results}


# ---------------------------------------------------------------------------
# GET /projects
# ---------------------------------------------------------------------------

@app.get("/projects")
def list_projects():
    """List all distinct projects in the knowledge base."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(SQL_LIST_PROJECTS)
                rows = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to list projects: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return {"projects": [row[0] for row in rows]}


# ---------------------------------------------------------------------------
# GET /sources
# ---------------------------------------------------------------------------

@app.get("/sources")
def list_sources(
    project: str | None = Query(None, description="Filter by project"),
    version: str | None = Query(None, description="Filter by version"),
):
    """List all distinct sources, optionally filtered by project and/or version."""
    filters: list[str] = []
    params: list = []

    if project is not None:
        filters.append("project = %s")
        params.append(project)
    if version is not None:
        filters.append("version = %s")
        params.append(version)

    where_clause = ("WHERE " + " AND ".join(filters)) if filters else ""
    sql = f"{SQL_LIST_SOURCES_BASE}\n{where_clause}\n{SQL_LIST_SOURCES_TAIL}"

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as exc:
        logger.error("Failed to list sources: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return {
        "sources": [
            {
                "source": row[0],
                "project": row[1],
                "version": row[2],
                "chunk_count": row[3],
            }
            for row in rows
        ]
    }


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Health check — verifies DB connectivity and model load."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db_status = "connected"
    except Exception as exc:
        logger.error("Health check DB ping failed: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "error",
                "db": "unreachable",
                "model": os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
                "vector_dims": 384,
            },
        )

    return {
        "status": "ok",
        "db": db_status,
        "model": os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
        "vector_dims": 384,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.server:app",
        host=os.environ.get("API_HOST", "0.0.0.0"),
        port=int(os.environ.get("API_PORT", 8000)),
        reload=False,
    )
