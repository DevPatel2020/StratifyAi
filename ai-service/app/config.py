import os
from pathlib import Path

from dotenv import load_dotenv

SERVICE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = SERVICE_DIR.parent

# Same .env as the desktop app (project root); the service dir can override.
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(SERVICE_DIR / ".env", override=True)

DATA_DIR = SERVICE_DIR / "data"
MODELS_DIR = SERVICE_DIR / "models"
REPORTS_DIR = SERVICE_DIR / "reports"
CHROMA_DIR = Path(os.getenv("CHROMA_DIR", SERVICE_DIR / "chroma"))
EVAL_RESULTS = SERVICE_DIR / "eval" / "results" / "latest.json"

CLASSIFIER_PATH = MODELS_DIR / "classifier.joblib"
CLASSIFIER_METRICS = REPORTS_DIR / "classifier_metrics.json"

EMBEDDINGS = os.getenv("EMBEDDINGS", "chroma").lower()  # chroma | ollama
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

CHUNK_SIZE = 900
CHUNK_OVERLAP = 150
