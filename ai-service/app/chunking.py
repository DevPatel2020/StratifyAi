"""Document loading and chunking for RAG."""

from __future__ import annotations

import io
import re

from .config import CHUNK_OVERLAP, CHUNK_SIZE


def load_pages(filename: str, data: bytes) -> list[tuple[int | None, str]]:
    """Return (page_number, text) pairs. PDFs keep page numbers for citations."""
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]
    text = data.decode("utf-8", errors="replace")
    return [(None, text)]


def clean(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Greedy chunking on paragraph/sentence boundaries with character overlap between chunks."""
    text = clean(text)
    if not text:
        return []
    if len(text) <= size:
        return [text]
    pieces = re.split(r"(?<=[.!?])\s+|\n\n", text)
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        piece = piece.strip()
        if not piece:
            continue
        while len(piece) > size:  # very long sentence: hard split
            head, piece = piece[:size], piece[size - overlap :]
            if current:
                chunks.append(current)
                current = ""
            chunks.append(head)
        if len(current) + len(piece) + 1 <= size:
            current = f"{current} {piece}".strip()
        else:
            if current:
                chunks.append(current)
            tail = current[-overlap:] if overlap and current else ""
            if " " in tail:  # start the overlap on a word boundary
                tail = tail[tail.index(" ") + 1 :]
            current = f"{tail} {piece}".strip()
    if current:
        chunks.append(current)
    return chunks
