import os

import numpy as np
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()

_MODEL_NAME: str = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
_BATCH_SIZE: int = int(os.environ.get("EMBEDDING_BATCH_SIZE", 64))

# Module-level singleton — loaded once on first use.
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed_batch(texts: list[str]) -> np.ndarray:
    """
    Encode a list of strings into unit-normalised embedding vectors.

    Args:
        texts: List of strings to encode.

    Returns:
        numpy.ndarray of shape (len(texts), 384), dtype float32,
        with each row normalised to unit length.
    """
    model = _get_model()
    vectors: np.ndarray = model.encode(
        texts,
        batch_size=_BATCH_SIZE,
        show_progress_bar=False,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return vectors


def embed_one(text: str) -> list[float]:
    """
    Encode a single string and return a normalised list of floats.

    Convenience wrapper around embed_batch for search queries.
    """
    return embed_batch([text])[0].tolist()
