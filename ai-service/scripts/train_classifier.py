"""Train and evaluate the question-type classifier.

Compares several classical text classifiers with stratified 5-fold cross-validation, picks the best by
macro F1, reports held-out test metrics (accuracy, macro F1, per-class report, confusion matrix), then
refits the winner on all data and saves it to models/classifier.joblib.

Usage:  python scripts/train_classifier.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_DIR))

from app.classifier import LABELS, normalize  # noqa: E402
from app.config import CLASSIFIER_METRICS, CLASSIFIER_PATH, DATA_DIR  # noqa: E402

SEED = 42


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    df["text"] = df["text"].astype(str).str.strip()
    df = df[df["label"].isin(LABELS) & (df["text"].str.len() > 5)]
    return df.drop_duplicates(subset="text").reset_index(drop=True)


def load_dataset() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (hand-written seed set, LLM-generated augmentation set, possibly empty)."""
    seed = _clean(pd.read_csv(DATA_DIR / "questions.csv"))
    generated_path = DATA_DIR / "questions_generated.csv"
    generated = _clean(pd.read_csv(generated_path)) if generated_path.exists() else seed.iloc[0:0]
    generated = generated[~generated["text"].str.lower().isin(set(seed["text"].str.lower()))]
    return seed, generated.reset_index(drop=True)


def features() -> FeatureUnion:
    # word n-grams capture intent phrases ("should i", "how do i"); char n-grams are robust to typos and small data
    return FeatureUnion(
        [
            ("word", TfidfVectorizer(preprocessor=normalize, ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ("char", TfidfVectorizer(preprocessor=normalize, analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)),
        ]
    )


def candidates() -> dict[str, Pipeline]:
    return {
        "Logistic Regression": Pipeline([("features", features()), ("clf", LogisticRegression(C=8.0, max_iter=3000, random_state=SEED))]),
        "Linear SVM (calibrated)": Pipeline(
            [("features", features()), ("clf", CalibratedClassifierCV(LinearSVC(C=0.8, random_state=SEED), cv=3))]
        ),
        "Complement Naive Bayes": Pipeline([("features", features()), ("clf", ComplementNB(alpha=0.3))]),
    }


def main() -> None:
    seed, generated = load_dataset()
    df = pd.concat([seed, generated], ignore_index=True)
    print(f"Dataset: {len(seed)} hand-written + {len(generated)} LLM-generated questions, {df['label'].nunique()} classes")
    print(df["label"].value_counts().to_string())

    # The test set is drawn ONLY from hand-written questions, so synthetic data can't inflate the score.
    s_train, s_test = train_test_split(seed, test_size=0.2, stratify=seed["label"], random_state=SEED)
    train = pd.concat([s_train, generated], ignore_index=True)
    x_train, y_train = train["text"], train["label"]
    x_test, y_test = s_test["text"], s_test["label"]
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    comparison = {}
    for name, model in candidates().items():
        scores = cross_validate(model, x_train, y_train, cv=cv, scoring=["accuracy", "f1_macro"])
        comparison[name] = {
            "cv_accuracy": float(np.mean(scores["test_accuracy"])),
            "cv_accuracy_std": float(np.std(scores["test_accuracy"])),
            "cv_macro_f1": float(np.mean(scores["test_f1_macro"])),
        }
        print(f"{name:28s} CV acc {comparison[name]['cv_accuracy']:.3f} ± {comparison[name]['cv_accuracy_std']:.3f}  macro-F1 {comparison[name]['cv_macro_f1']:.3f}")

    best_name = max(comparison, key=lambda n: comparison[n]["cv_macro_f1"])
    best = candidates()[best_name]
    best.fit(x_train, y_train)
    pred = best.predict(x_test)
    report = classification_report(y_test, pred, labels=LABELS, output_dict=True, zero_division=0)
    metrics = {
        "best_model": best_name,
        "timestamp": int(time.time()),
        "n_train": int(len(x_train)),
        "n_test": int(len(x_test)),
        "n_generated": int(len(generated)),
        "test_set": "hand-written only",
        "labels": LABELS,
        "accuracy": float(accuracy_score(y_test, pred)),
        "macro_f1": float(f1_score(y_test, pred, average="macro")),
        "cv_mean": comparison[best_name]["cv_accuracy"],
        "cv_std": comparison[best_name]["cv_accuracy_std"],
        "per_class": {label: report[label] for label in LABELS},
        "confusion_matrix": confusion_matrix(y_test, pred, labels=LABELS).tolist(),
        "model_comparison": comparison,
    }
    print(f"\nBest: {best_name}  test accuracy {metrics['accuracy']:.3f}  macro-F1 {metrics['macro_f1']:.3f}")
    print(classification_report(y_test, pred, labels=LABELS, zero_division=0))

    # deploy: refit on all labelled data
    final = candidates()[best_name].fit(df["text"], df["label"])
    CLASSIFIER_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLASSIFIER_METRICS.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(final, CLASSIFIER_PATH)
    CLASSIFIER_METRICS.write_text(json.dumps(metrics, indent=2), "utf-8")
    print(f"Saved model to {CLASSIFIER_PATH} and metrics to {CLASSIFIER_METRICS}")


if __name__ == "__main__":
    main()
