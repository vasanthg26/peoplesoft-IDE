import os
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv

load_dotenv()

_pool: pool.ThreadedConnectionPool | None = None


def _get_pool() -> pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.ThreadedConnectionPool(
            minconn=int(os.environ.get("DB_MIN_CONN", 1)),
            maxconn=int(os.environ.get("DB_MAX_CONN", 10)),
            host=os.environ["PGHOST"],
            port=int(os.environ.get("PGPORT", 5432)),
            dbname=os.environ["PGDATABASE"],
            user=os.environ["PGUSER"],
            password=os.environ["PGPASSWORD"],
        )
    return _pool


@contextmanager
def get_conn():
    """Yield a psycopg2 connection from the pool with pgvector registered.

    The connection is returned to the pool on exit. Rolls back on exception
    so the connection is reusable.
    """
    conn_pool = _get_pool()
    conn = conn_pool.getconn()
    try:
        register_vector(conn)
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn_pool.putconn(conn)


def close_pool() -> None:
    """Close all connections in the pool. Call on application shutdown."""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
