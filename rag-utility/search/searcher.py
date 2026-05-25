import logging

from db.connection import get_conn
from db.schema import SQL_SEARCH_BASE, SQL_SEARCH_ORDER
from ingest.embedder import embed_one

logger = logging.getLogger(__name__)


def semantic_search(
    query: str,
    *,
    project: str | None = None,
    version: str | None = None,
    source: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """
    Embed query and return top-k results ordered by cosine similarity.

    Args:
        query:   Natural language search string.
        project: Optional filter — must match the project column exactly.
        version: Optional filter — must match the version column exactly.
        source:  Optional filter — must match the source column exactly.
        limit:   Maximum number of results to return (1–50).

    Returns:
        List of dicts with keys: id, project, source, version, chapter,
        section, content, score.
    """
    query_vector = embed_one(query)

    # Build WHERE clauses dynamically for optional filters.
    filters: list[str] = []
    params: list = [query_vector]  # first placeholder: score calculation in SELECT

    if project is not None:
        filters.append("project = %s")
        params.append(project)
    if version is not None:
        filters.append("version = %s")
        params.append(version)
    if source is not None:
        filters.append("source = %s")
        params.append(source)

    where_clause = ("WHERE " + " AND ".join(filters)) if filters else ""

    # ORDER BY clause needs the vector again as a separate parameter.
    params.extend([query_vector, max(1, min(limit, 50))])

    sql = f"{SQL_SEARCH_BASE}\n{where_clause}\n{SQL_SEARCH_ORDER}"

    logger.debug("semantic_search sql=%s params_count=%d", sql, len(params))

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(sql, params)
                rows = cur.fetchall()
            except Exception:
                logger.error(
                    "semantic_search failed for query=%r project=%r version=%r source=%r",
                    query, project, version, source,
                )
                raise

    return [
        {
            "id": row[0],
            "project": row[1],
            "source": row[2],
            "version": row[3],
            "chapter": row[4],
            "section": row[5],
            "content": row[6],
            "score": round(float(row[7]), 4),
        }
        for row in rows
    ]
