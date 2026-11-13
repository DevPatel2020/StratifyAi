"""Retrieval-augmented generation store: local embeddings + ChromaDB vector search."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np

from .chunking import chunk_text, load_pages
from .config import CHROMA_DIR, EMBEDDINGS, OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL


def make_embedding_function():
    """'chroma' = all-MiniLM-L6-v2 via ONNX runtime (no PyTorch needed); 'ollama' = nomic-embed-text."""
    from chromadb.utils import embedding_functions

    if EMBEDDINGS == "ollama":
        return embedding_functions.OllamaEmbeddingFunction(url=f"{OLLAMA_BASE_URL}/api/embeddings", model_name=OLLAMA_EMBED_MODEL)
    return embedding_functions.DefaultEmbeddingFunction()


class DocumentStore:
    def __init__(self, path: Path = CHROMA_DIR, collection: str = "documents"):
        import chromadb

        path.mkdir(parents=True, exist_ok=True)
        self.registry_path = path / f"{collection}_registry.json"
        self.client = chromadb.PersistentClient(path=str(path))
        self.embed = make_embedding_function()
        self.collection = self.client.get_or_create_collection(
            collection, embedding_function=self.embed, metadata={"hnsw:space": "cosine"}
        )
        self.registry: dict[str, dict] = (
            json.loads(self.registry_path.read_text("utf-8")) if self.registry_path.exists() else {}
        )

    def _save_registry(self) -> None:
        self.registry_path.write_text(json.dumps(self.registry, indent=2), "utf-8")

    def list(self) -> list[dict]:
        return sorted(self.registry.values(), key=lambda d: -d["addedAt"])

    def add(self, filename: str, data: bytes) -> dict:
        doc_id = hashlib.sha1(data).hexdigest()[:16]
        if doc_id in self.registry:
            return self.registry[doc_id]
        pages = load_pages(filename, data)
        ids, docs, metas = [], [], []
        for page, text in pages:
            for i, chunk in enumerate(chunk_text(text)):
                ids.append(f"{doc_id}:{page or 0}:{i}")
                docs.append(chunk)
                metas.append({"doc_id": doc_id, "source": filename, "page": page or 0})
        if not docs:
            raise ValueError("No extractable text found (scanned PDFs need OCR first).")
        for start in range(0, len(ids), 64):  # batch to keep embedding memory bounded
            self.collection.add(ids=ids[start : start + 64], documents=docs[start : start + 64], metadatas=metas[start : start + 64])
        info = {"id": doc_id, "name": filename, "chunks": len(docs), "pages": len(pages), "addedAt": int(time.time())}
        self.registry[doc_id] = info
        self._save_registry()
        return info

    def delete(self, doc_id: str) -> bool:
        if doc_id not in self.registry:
            return False
        self.collection.delete(where={"doc_id": doc_id})
        del self.registry[doc_id]
        self._save_registry()
        return True

    def search(self, query: str, k: int = 4) -> list[dict]:
        if self.collection.count() == 0:
            return []
        res = self.collection.query(query_texts=[query], n_results=min(k, self.collection.count()))
        hits = []
        for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
            hits.append(
                {
                    "docId": meta["doc_id"],
                    "source": meta["source"],
                    "page": meta["page"] or None,
                    "text": text,
                    "score": round(1.0 - float(dist), 4),  # cosine similarity
                }
            )
        return hits

    def similarity(self, query: str, candidates: list[str]) -> list[float]:
        """Cosine similarity between a query and candidate texts (used by the path ranker)."""
        vectors = np.array(self.embed([query, *candidates]), dtype=float)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-12
        return [round(float(s), 4) for s in vectors[1:] @ vectors[0]]
