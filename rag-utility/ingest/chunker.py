import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber

_MD_H1_RE = re.compile(r"^#\s+(.+)")
_MD_H2_RE = re.compile(r"^#{2,3}\s+(.+)")

# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------
# Approximate token count using whitespace split (1 word ≈ 1 token).
# Exact tokenization is unnecessary for guardrail purposes.

MIN_TOKENS = 50
MAX_TOKENS = 512
OVERLAP_TOKENS = 50


def _token_count(text: str) -> int:
    return len(text.split())


# ---------------------------------------------------------------------------
# Heading and boundary patterns
# ---------------------------------------------------------------------------

_CHAPTER_RE = re.compile(r"^(chapter\s+\d+|ch\.\s*\d+)", re.IGNORECASE)
_SECTION_RE = re.compile(
    r"^(section\s+\d+[\.\d]*|\d+\.\d[\.\d]*\s+\S)", re.IGNORECASE
)
_NUMBERED_RE = re.compile(r"^\d+\.\s+[A-Z]")   # depth-1: "1. Title"
_FUNC_RE = re.compile(
    r"^(Function\s+Name|Method|Event|PeopleCode\s+Function|Built-in\s+Function)\s*[:\-]",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Chunk dataclass
# ---------------------------------------------------------------------------

@dataclass
class Chunk:
    project: str
    source: str
    version: str
    chapter: str
    section: str
    content: str       # clean text, no context prefix
    embed_text: str    # content with context prefix, used for embedding only
    checksum: str      # md5(content)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _make_embed_text(
    project: str, version: str, chapter: str, section: str, content: str
) -> str:
    return f"[Project: {project} | Version: {version} | {chapter} > {section}]\n{content}"


def _is_bold_line(chars: list[dict]) -> bool:
    """Return True if the majority of characters in the line use a bold font."""
    if not chars:
        return False
    bold_count = sum(
        1 for c in chars if "bold" in (c.get("fontname") or "").lower()
    )
    return bold_count / len(chars) > 0.5


def _classify_heading(text: str, is_bold: bool) -> tuple[str, int] | None:
    """
    Return (kind, level) where kind is 'chapter' (level 1) or 'section'
    (level 2), or None if the line is not a heading.
    """
    stripped = text.strip()
    if not stripped or len(stripped) < 3:
        return None

    if _CHAPTER_RE.match(stripped):
        return ("chapter", 1)
    if _SECTION_RE.match(stripped):
        return ("section", 2)
    if _NUMBERED_RE.match(stripped):
        return ("section", 2)
    # ALL-CAPS heuristic — ignore lines that are just punctuation or numbers
    if stripped.isupper() and len(stripped) > 3 and stripped.replace(" ", "").isalpha():
        return ("chapter", 1)
    # Bold short line — treat as a section boundary
    if is_bold and len(stripped) <= 80 and "\n" not in stripped:
        return ("section", 2)
    return None


def _is_function_boundary(text: str) -> bool:
    return bool(_FUNC_RE.match(text.strip()))


def _split_into_parts(
    text: str, section: str, max_tokens: int, overlap_tokens: int
) -> list[tuple[str, str]]:
    """
    Split text that exceeds max_tokens into paragraph-bounded parts with
    trailing-overlap carried into each successive part.

    Returns a list of (section_name, content) pairs. When only one part
    results, the section name is unchanged.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    parts: list[str] = []
    current_words: list[str] = []

    for para in paragraphs:
        para_words = para.split()
        if (
            _token_count(" ".join(current_words)) + len(para_words) > max_tokens
            and current_words
        ):
            parts.append(" ".join(current_words))
            # carry last overlap_tokens words as context prefix
            current_words = current_words[-overlap_tokens:] + para_words
        else:
            current_words.extend(para_words)

    if current_words:
        parts.append(" ".join(current_words))

    if not parts:
        return []
    if len(parts) == 1:
        return [(section, parts[0])]
    return [(f"{section} [{i + 1}]", part) for i, part in enumerate(parts)]


# ---------------------------------------------------------------------------
# PDF line extraction
# ---------------------------------------------------------------------------

def _extract_lines(pdf_path: str) -> list[tuple[str, bool]]:
    """
    Parse the PDF and return a flat list of (line_text, is_bold) tuples
    across all pages in reading order.

    Lines are reconstructed by grouping pdfplumber character objects that
    share the same y0 coordinate (rounded to the nearest point).
    """
    lines: list[tuple[str, bool]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            char_rows: dict[int, list[dict]] = {}
            for char in (page.chars or []):
                y_key = round(char["y0"])
                char_rows.setdefault(y_key, []).append(char)

            # Iterate top-to-bottom (highest y0 first in PDF coordinates)
            for y_key in sorted(char_rows.keys(), reverse=True):
                row_chars = sorted(char_rows[y_key], key=lambda c: c["x0"])
                line_text = "".join(c.get("text", "") for c in row_chars).strip()
                if line_text:
                    lines.append((line_text, _is_bold_line(row_chars)))

    return lines


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def extract_chunks(
    pdf_path: str,
    project: str,
    source: str,
    version: str,
) -> list[Chunk]:
    """
    Parse the PDF at pdf_path and return a list of Chunk objects split by
    chapter/section headings and function/method boundaries.

    Args:
        pdf_path: Absolute or relative path to the PDF file.
        project:  Project identifier (e.g. "HRMS").
        source:   Document identifier — typically the filename.
        version:  Document/product version string (e.g. "9.2").

    Returns:
        List of Chunk objects ready for embedding and storage.
    """
    lines = _extract_lines(pdf_path)

    chunks: list[Chunk] = []
    current_chapter = "Introduction"
    current_section = "Overview"
    buffer: list[str] = []

    def flush(chapter: str, section: str, raw_lines: list[str]) -> None:
        text = "\n".join(raw_lines).strip()
        if _token_count(text) < MIN_TOKENS:
            return
        for sec_name, content in _split_into_parts(
            text, section, MAX_TOKENS, OVERLAP_TOKENS
        ):
            embed_text = _make_embed_text(project, version, chapter, sec_name, content)
            chunks.append(
                Chunk(
                    project=project,
                    source=source,
                    version=version,
                    chapter=chapter,
                    section=sec_name,
                    content=content,
                    embed_text=embed_text,
                    checksum=_md5(content),
                )
            )

    for line_text, is_bold in lines:
        heading = _classify_heading(line_text, is_bold)
        is_func = _is_function_boundary(line_text)

        if heading is not None:
            kind, level = heading
            flush(current_chapter, current_section, buffer)
            buffer = []
            if level == 1:              # chapter-level heading
                current_chapter = line_text.strip()
                current_section = "Overview"
            else:                       # section-level heading
                current_section = line_text.strip()
        elif is_func:
            flush(current_chapter, current_section, buffer)
            # Start a new buffer with this line; clean name for section key
            current_section = line_text.strip().rstrip(":-").strip()
            buffer = [line_text]
        else:
            buffer.append(line_text)

    # Flush any remaining content
    flush(current_chapter, current_section, buffer)

    return chunks


# ---------------------------------------------------------------------------
# Markdown / plain-text entry point
# ---------------------------------------------------------------------------

def extract_chunks_from_text(
    file_path: str,
    project: str,
    source: str,
    version: str,
) -> list[Chunk]:
    """
    Parse a Markdown or plain-text file and return Chunk objects.

    Heading rules:
        # Title      → chapter boundary (level 1)
        ## / ### …   → section boundary (level 2)

    All other lines accumulate in a buffer; it is flushed at each boundary
    and at end-of-file using the same _split_into_parts logic as the PDF path.
    """
    text = Path(file_path).read_text(encoding="utf-8")
    lines = text.splitlines()

    chunks: list[Chunk] = []
    current_chapter = "Introduction"
    current_section = "Overview"
    buffer: list[str] = []

    def flush(chapter: str, section: str, raw_lines: list[str]) -> None:
        content = "\n".join(raw_lines).strip()
        if _token_count(content) < MIN_TOKENS:
            return
        for sec_name, part in _split_into_parts(content, section, MAX_TOKENS, OVERLAP_TOKENS):
            embed_text = _make_embed_text(project, version, chapter, sec_name, part)
            chunks.append(
                Chunk(
                    project=project,
                    source=source,
                    version=version,
                    chapter=chapter,
                    section=sec_name,
                    content=part,
                    embed_text=embed_text,
                    checksum=_md5(part),
                )
            )

    for line in lines:
        h1 = _MD_H1_RE.match(line)
        h2 = _MD_H2_RE.match(line)
        if h1:
            flush(current_chapter, current_section, buffer)
            buffer = []
            current_chapter = h1.group(1).strip()
            current_section = "Overview"
        elif h2:
            flush(current_chapter, current_section, buffer)
            buffer = []
            current_section = h2.group(1).strip()
        else:
            buffer.append(line)

    flush(current_chapter, current_section, buffer)
    return chunks
