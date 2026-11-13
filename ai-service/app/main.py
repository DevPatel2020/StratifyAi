"""FastAPI entry point. Run: uvicorn app.main:app --port 8765 (the desktop app starts it automatically)."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from functools import lru_cache
import threading

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .classifier import QuestionClassifier
from .config import CLASSIFIER_METRICS, EMBEDDINGS, EVAL_RESULTS
from .tools import safe_eval, web_search

log = logging.getLogger("stratify")
classifier = QuestionClassifier()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load ChromaDB and the embedding model in the background (first run downloads ~80 MB)."""

    def _warm():
        try:
            store().similarity("warm up", ["embedding model"])
        except Exception as exc:  # pragma: no cover
            log.warning("warm-up failed: %s", exc)

    threading.Thread(target=_warm, daemon=True).start()
    yield


app = FastAPI(title="StratifyAI AI service", version="2.0.0", lifespan=lifespan)


@lru_cache(maxsize=1)
def store():
    # created lazily: ChromaDB + the ONNX embedding model take a moment to load
    from .rag import DocumentStore

    return DocumentStore()


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class SimilarityIn(BaseModel):
    query: str = Field(min_length=1, max_length=5000)
    candidates: list[str] = Field(min_length=1, max_length=20)


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=5000)
    k: int = Field(default=4, ge=1, le=10)


class WebSearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=300)
    max_results: int = Field(default=5, ge=1, le=10)


class CalcIn(BaseModel):
    expression: str = Field(min_length=1, max_length=200)


@app.get("/health")
def health():
    docs = 0
    try:
        docs = len(store().registry)
    except Exception as exc:  # pragma: no cover - reported, not fatal
        log.warning("vector store unavailable: %s", exc)
    return {"status": "ok", "classifier_loaded": classifier.loaded, "documents": docs, "embeddings": EMBEDDINGS}


@app.post("/classify")
def classify(body: TextIn):
    if not classifier.loaded:
        raise HTTPException(503, "Classifier not trained. Run scripts/train_classifier.py")
    return classifier.predict(body.text)


@app.post("/similarity")
def similarity(body: SimilarityIn):
    return {"scores": store().similarity(body.query, body.candidates)}


@app.get("/documents")
def list_documents():
    return {"documents": store().list()}


@app.post("/documents")
async def upload_document(file: UploadFile = File(...)):
    name = file.filename or "document.txt"
    if not name.lower().endswith((".pdf", ".txt", ".md", ".markdown", ".csv")):
        raise HTTPException(400, "Only PDF, TXT, MD and CSV files are supported")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 25 MB)")
    try:
        return store().add(name, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    if not store().delete(doc_id):
        raise HTTPException(404, "Document not found")
    return {"ok": True}


@app.post("/search")
def search(body: SearchIn):
    return {"results": store().search(body.query, body.k)}


@app.post("/tools/web_search")
def tool_web_search(body: WebSearchIn):
    try:
        return {"results": web_search(body.query, body.max_results)}
    except Exception as exc:
        raise HTTPException(502, f"Web search failed: {exc}") from exc


@app.post("/tools/calculate")
def tool_calculate(body: CalcIn):
    try:
        return {"result": str(safe_eval(body.expression))}
    except (ValueError, SyntaxError, ZeroDivisionError, OverflowError, TypeError) as exc:
        return {"result": f"Error: {exc}"}


@app.get("/eval/results")
def eval_results():
    def read(path):
        return json.loads(path.read_text("utf-8")) if path.exists() else None

    return {"classifier": read(CLASSIFIER_METRICS), "eval": read(EVAL_RESULTS)}
