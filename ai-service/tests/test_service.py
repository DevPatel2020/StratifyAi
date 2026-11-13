import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.chunking import chunk_text  # noqa: E402
from app.classifier import LABELS, QuestionClassifier, normalize  # noqa: E402
from app.tools import safe_eval  # noqa: E402


@pytest.mark.parametrize(
    "expr,expected",
    [("2+3*4", 14), ("(1200*0.18)/12", 18), ("2^10", 1024), ("sqrt(16)+abs(-2)", 6), ("round(pi, 2)", 3.14)],
)
def test_calculator(expr, expected):
    assert safe_eval(expr) == expected


@pytest.mark.parametrize("expr", ["__import__('os').system('dir')", "open('x')", "[x for x in range(3)]", "a.b", "9**99999"])
def test_calculator_rejects_unsafe(expr):
    with pytest.raises((ValueError, SyntaxError)):
        safe_eval(expr)


def test_chunking_respects_size_and_overlap():
    text = " ".join(f"Sentence number {i} talks about retrieval augmented generation." for i in range(120))
    chunks = chunk_text(text, size=300, overlap=50)
    assert len(chunks) > 5
    assert all(len(c) <= 360 for c in chunks)
    joined = " ".join(chunks)
    assert "Sentence number 0" in joined and "Sentence number 119" in joined


def test_chunking_short_and_empty():
    assert chunk_text("") == []
    assert chunk_text("hello world") == ["hello world"]


def test_normalize():
    assert normalize("  Visit https://x.com in 2024!! ") == "visit url in 0 !!"


def test_trained_classifier_predicts_known_examples():
    clf = QuestionClassifier()
    if not clf.loaded:
        pytest.skip("classifier not trained yet (run scripts/train_classifier.py)")
    out = clf.predict("Should I choose Vue or Svelte for my side project?")
    assert out["label"] in LABELS
    assert 0 <= out["confidence"] <= 1
    assert abs(sum(out["probabilities"].values()) - 1) < 0.01


def test_api_health_and_calculate():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"
    assert client.post("/tools/calculate", json={"expression": "6*7"}).json()["result"] == "42"
    assert client.post("/tools/calculate", json={"expression": "1/0"}).json()["result"].startswith("Error")
