"""Augment the classifier dataset with LLM-generated questions (optional).

The hand-written seed set (data/questions.csv) is small; this script asks a free LLM to write more
varied questions per class, de-duplicates them against the seed, and saves data/questions_generated.csv.
Review a sample by hand before training on it.

Usage:  python scripts/generate_dataset.py --per-class 40 --provider groq
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.classifier import LABELS  # noqa: E402
from app.config import DATA_DIR  # noqa: E402
from llm import available, chat  # noqa: E402

DESCRIPTIONS = {
    "coding": "programming, debugging, software engineering, APIs, DevOps",
    "data_analysis": "analysing datasets, statistics, charts, metrics, forecasting",
    "business_strategy": "startups, marketing, pricing, growth, competition",
    "learning": "explaining a concept, 'what is', 'how does X work'",
    "decision_making": "choosing between options, 'should I', X vs Y",
    "creative": "brainstorming ideas, names, stories, designs, slogans",
    "research": "academic research, literature reviews, methodology, evidence",
    "personal_planning": "study plans, routines, career plans, budgets, habits",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=40)
    ap.add_argument("--provider", default=None)
    args = ap.parse_args()
    provider = args.provider or (available() or [None])[0]
    if not provider:
        sys.exit("No provider available: set GROQ_API_KEY or GEMINI_API_KEY in .env, or start Ollama.")

    seed = set(pd.read_csv(DATA_DIR / "questions.csv")["text"].str.lower())
    rows = []
    for label in LABELS:
        prompt = (
            f"Write {args.per_class} diverse, realistic questions a university student or professional might ask an AI assistant "
            f"in the category '{label}' ({DESCRIPTIONS[label]}). Vary length, tone and topic; some casual, some formal. "
            'Respond as JSON: {"questions": ["...", "..."]}'
        )
        res = chat(provider, [{"role": "user", "content": prompt}], json_mode=True, max_tokens=3000, temperature=1.0)
        try:
            questions = json.loads(res["text"][res["text"].index("{") : res["text"].rindex("}") + 1])["questions"]
        except (ValueError, KeyError) as exc:
            print(f"  {label}: could not parse output ({exc}), skipping")
            continue
        new = [q.strip() for q in questions if isinstance(q, str) and q.strip().lower() not in seed]
        rows += [{"label": label, "text": q} for q in new]
        print(f"{label:18s} +{len(new)}")

    out = DATA_DIR / "questions_generated.csv"
    pd.DataFrame(rows).drop_duplicates("text").to_csv(out, index=False)
    print(f"Saved {len(rows)} generated questions to {out} using {provider}")


if __name__ == "__main__":
    main()
