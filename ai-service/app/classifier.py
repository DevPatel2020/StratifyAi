"""Question-type classifier (TF-IDF features + linear model), trained by scripts/train_classifier.py."""

from __future__ import annotations

import re
from pathlib import Path

import joblib

from .config import CLASSIFIER_PATH

LABELS = [
    "coding",
    "data_analysis",
    "business_strategy",
    "learning",
    "decision_making",
    "creative",
    "research",
    "personal_planning",
]


def normalize(text: str) -> str:
    """Lower-case, collapse whitespace and keep punctuation that carries intent (?, vs)."""
    text = text.lower().strip()
    text = re.sub(r"https?://\S+", " url ", text)
    text = re.sub(r"\d+", " 0 ", text)
    return re.sub(r"\s+", " ", text)


class QuestionClassifier:
    def __init__(self, path: Path = CLASSIFIER_PATH):
        self.path = path
        self.pipeline = None
        self.load()

    def load(self) -> bool:
        if self.path.exists():
            self.pipeline = joblib.load(self.path)
        return self.loaded

    @property
    def loaded(self) -> bool:
        return self.pipeline is not None

    def predict(self, text: str) -> dict:
        if not self.loaded:
            raise RuntimeError("Classifier not trained. Run: python scripts/train_classifier.py")
        x = [normalize(text)]
        classes = list(self.pipeline.classes_)
        if hasattr(self.pipeline, "predict_proba"):
            probs = self.pipeline.predict_proba(x)[0]
        else:  # e.g. LinearSVC without calibration: softmax over decision scores
            import numpy as np

            scores = self.pipeline.decision_function(x)[0]
            e = np.exp(scores - scores.max())
            probs = e / e.sum()
        ranked = sorted(zip(classes, probs), key=lambda p: -p[1])
        return {
            "label": ranked[0][0],
            "confidence": float(ranked[0][1]),
            "probabilities": {c: round(float(p), 4) for c, p in ranked},
        }
