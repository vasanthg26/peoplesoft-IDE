"""
RAG Utility CLI

Usage:
    python cli.py ingest --file path/to/doc.pdf --project HRMS --version 9.2
    python cli.py search "how to use FindFirst" --project HRMS --limit 5
    python cli.py projects
    python cli.py sources [--project HRMS] [--version 9.2]
"""

import argparse
import json
import logging
import sys


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
        level=level,
        stream=sys.stderr,
    )


# ---------------------------------------------------------------------------
# Subcommand: ingest
# ---------------------------------------------------------------------------

def cmd_ingest(args: argparse.Namespace) -> None:
    from db.schema import ensure_schema
    from ingest.pipeline import run_pipeline

    ensure_schema()
    result = run_pipeline(args.file, args.project, args.version)
    print(
        f"source:   {result.source}\n"
        f"inserted: {result.inserted}\n"
        f"updated:  {result.updated}\n"
        f"deleted:  {result.deleted}\n"
        f"skipped:  {result.skipped}"
    )


# ---------------------------------------------------------------------------
# Subcommand: search
# ---------------------------------------------------------------------------

def cmd_search(args: argparse.Namespace) -> None:
    from search.searcher import semantic_search

    results = semantic_search(
        args.query,
        project=args.project,
        version=args.version,
        source=args.source,
        limit=args.limit,
    )

    if not results:
        print("No results found.")
        return

    for i, r in enumerate(results, 1):
        print(
            f"[{i}] score={r['score']:.4f}  "
            f"{r['project']} / {r['source']} / {r['version']}\n"
            f"    {r['chapter']} > {r['section']}\n"
            f"    {r['content'][:200].strip()}\n"
        )


# ---------------------------------------------------------------------------
# Subcommand: projects
# ---------------------------------------------------------------------------

def cmd_projects(args: argparse.Namespace) -> None:
    from db.connection import get_conn
    from db.schema import SQL_LIST_PROJECTS

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SQL_LIST_PROJECTS)
            rows = cur.fetchall()

    if not rows:
        print("No projects found.")
        return

    for (project,) in rows:
        print(project)


# ---------------------------------------------------------------------------
# Subcommand: sources
# ---------------------------------------------------------------------------

def cmd_sources(args: argparse.Namespace) -> None:
    from db.connection import get_conn
    from db.schema import SQL_LIST_SOURCES_BASE, SQL_LIST_SOURCES_TAIL

    filters: list[str] = []
    params: list = []

    if args.project:
        filters.append("project = %s")
        params.append(args.project)
    if args.version:
        filters.append("version = %s")
        params.append(args.version)

    where_clause = ("WHERE " + " AND ".join(filters)) if filters else ""
    sql = f"{SQL_LIST_SOURCES_BASE}\n{where_clause}\n{SQL_LIST_SOURCES_TAIL}"

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    if not rows:
        print("No sources found.")
        return

    for source, project, version, chunk_count in rows:
        print(f"{project:15} {version:8} {chunk_count:6} chunks   {source}")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cli.py",
        description="RAG Utility — ingest PDFs and search the knowledge base",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable debug logging"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # --- ingest ---
    p_ingest = sub.add_parser("ingest", help="Ingest a PDF into the knowledge base")
    p_ingest.add_argument("--file", required=True, metavar="PATH", help="Path to the PDF file")
    p_ingest.add_argument("--project", required=True, help="Project identifier (e.g. HRMS)")
    p_ingest.add_argument("--version", required=True, help="Document version (e.g. 9.2)")

    # --- search ---
    p_search = sub.add_parser("search", help="Semantic search over the knowledge base")
    p_search.add_argument("query", help="Search query text")
    p_search.add_argument("--project", default=None, help="Filter by project")
    p_search.add_argument("--version", default=None, help="Filter by version")
    p_search.add_argument("--source", default=None, help="Filter by source document")
    p_search.add_argument(
        "--limit", type=int, default=5, metavar="N",
        help="Maximum number of results (1–50, default 5)",
    )

    # --- projects ---
    sub.add_parser("projects", help="List all distinct projects")

    # --- sources ---
    p_sources = sub.add_parser("sources", help="List all sources with chunk counts")
    p_sources.add_argument("--project", default=None, help="Filter by project")
    p_sources.add_argument("--version", default=None, help="Filter by version")

    return parser


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    _setup_logging(getattr(args, "verbose", False))

    dispatch = {
        "ingest": cmd_ingest,
        "search": cmd_search,
        "projects": cmd_projects,
        "sources": cmd_sources,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
