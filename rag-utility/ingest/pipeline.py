import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from tqdm import tqdm

from db.connection import get_conn
from db.schema import SQL_DELETE_CHUNK, SQL_SELECT_EXISTING, SQL_UPSERT_CHUNK
from ingest.chunker import extract_chunks, extract_chunks_from_text
from ingest.embedder import embed_batch

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class IngestResult:
    source: str
    inserted: int
    updated: int
    deleted: int
    skipped: int

    def __str__(self) -> str:
        return (
            f"{self.source}: "
            f"inserted={self.inserted} "
            f"updated={self.updated} "
            f"deleted={self.deleted} "
            f"skipped={self.skipped}"
        )


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def run_pipeline(pdf_path: str, project: str, version: str) -> IngestResult:
    """
    Full incremental ingestion pipeline for a single PDF document.

    Steps:
        1. Extract structured chunks from the PDF via the chunker.
        2. Embed all chunks in one batched pass.
        3. Load existing (chapter, section, checksum) rows from the DB.
        4. INSERT new chunks, UPDATE changed chunks, SKIP unchanged chunks.
        5. DELETE rows whose (chapter, section) no longer exist in the PDF.

    Args:
        pdf_path: Path to the PDF file on disk.
        project:  Project identifier stored on every chunk row.
        version:  Version string stored on every chunk row.

    Returns:
        IngestResult with counts for each action taken.
    """
    source = Path(pdf_path).name

    # --- 1. Extract chunks ------------------------------------------------
    logger.info("Extracting chunks from '%s'", source)
    ext = Path(pdf_path).suffix.lower()
    if ext in (".md", ".txt"):
        chunks = extract_chunks_from_text(pdf_path, project, source, version)
    else:
        chunks = extract_chunks(pdf_path, project, source, version)
    logger.info("Extracted %d chunks", len(chunks))

    if not chunks:
        logger.warning("No chunks extracted from '%s' — aborting pipeline", source)
        return IngestResult(source=source, inserted=0, updated=0, deleted=0, skipped=0)

    # --- 2. Embed all chunks ----------------------------------------------
    logger.info("Embedding %d chunks (model: all-MiniLM-L6-v2)", len(chunks))
    vectors = embed_batch([c.embed_text for c in chunks])   # shape (n, 384)

    # --- 3. Load existing checksums from DB -------------------------------
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SQL_SELECT_EXISTING, (project, source, version))
            rows = cur.fetchall()

    existing: dict[tuple[str, str], str] = {
        (row[0], row[1]): row[2] for row in rows
    }
    new_keys: set[tuple[str, str]] = {(c.chapter, c.section) for c in chunks}

    # --- 4. Upsert new / changed chunks -----------------------------------
    inserted = updated = skipped = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            for chunk, vector in tqdm(
                zip(chunks, vectors),
                total=len(chunks),
                desc=f"Upserting {source}",
                unit="chunk",
            ):
                key = (chunk.chapter, chunk.section)

                if key not in existing:
                    action = "insert"
                elif existing[key] != chunk.checksum:
                    action = "update"
                else:
                    skipped += 1
                    continue  # checksum unchanged — no DB write needed

                chunk_id = hashlib.md5(
                    f"{chunk.project}|{chunk.source}|{chunk.chapter}|{chunk.section}".encode()
                ).hexdigest()

                try:
                    cur.execute(
                        SQL_UPSERT_CHUNK,
                        (
                            chunk_id,
                            chunk.project,
                            chunk.source,
                            chunk.version,
                            chunk.chapter,
                            chunk.section,
                            chunk.content,
                            vector.tolist(),
                            chunk.checksum,
                        ),
                    )
                except Exception:
                    logger.error(
                        "Failed to upsert chunk project=%s source=%s chapter=%s section=%s",
                        chunk.project, chunk.source, chunk.chapter, chunk.section,
                    )
                    raise

                if action == "insert":
                    inserted += 1
                else:
                    updated += 1

    # --- 5. Delete removed chunks -----------------------------------------
    removed_keys = set(existing.keys()) - new_keys
    deleted = 0

    if removed_keys:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for chapter, section in tqdm(
                    removed_keys,
                    desc=f"Deleting removed chunks from {source}",
                    unit="chunk",
                ):
                    try:
                        cur.execute(
                            SQL_DELETE_CHUNK,
                            (project, source, version, chapter, section),
                        )
                        deleted += 1
                    except Exception:
                        logger.error(
                            "Failed to delete chunk project=%s source=%s chapter=%s section=%s",
                            project, source, chapter, section,
                        )
                        raise

    result = IngestResult(
        source=source,
        inserted=inserted,
        updated=updated,
        deleted=deleted,
        skipped=skipped,
    )
    logger.info("Pipeline complete — %s", result)
    return result
