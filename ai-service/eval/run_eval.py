"""End-to-end evaluation of the StratifyAI pipeline (results feed the app's Evaluation page).

Experiments
  1. Token savings  - full single-shot answer vs. StratifyAI (path generation + step 1, and + steps 1-2).
  2. Path quality   - an LLM judge (a different provider when available) rates the 4 generated paths 1-5
                      for relevance, diversity and actionability.
  3. Latency        - median latency of each available provider on the same short prompt (3 runs).
  4. RAG            - retrieval hit@4 on a fictional handbook + judged answer faithfulness (1-5).

Usage:  python eval/run_eval.py --limit 10
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import sys
import tempfile
import time
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
SERVICE_DIR = EVAL_DIR.parent
sys.path.insert(0, str(SERVICE_DIR))
sys.path.insert(0, str(SERVICE_DIR / "scripts"))

from app.config import EVAL_RESULTS  # noqa: E402
from llm import QuotaExhausted, available, chat  # noqa: E402

SYSTEM = "You are StratifyAI, a strategic thinking assistant. Use Markdown."


class Judge:
    """LLM judge from a different provider/model family than the generator, with automatic fallback.

    Preferred: Gemini. If its free quota is exhausted, Qwen on Groq (a different model family from the
    gpt-oss generator) takes over, so the judge never grades its own model's output.
    """

    FALLBACK = ("groq", "qwen/qwen3.8-27b")

    def __init__(self, provider: str):
        self.current = (provider, None)
        self.used: dict[str, int] = {}

    def __call__(self, messages: list[dict], **kw) -> dict:
        for _ in range(2):
            provider, model = self.current
            try:
                res = chat(provider, messages, model=model, **kw)
                key = f"{provider}:{model or 'default'}"
                self.used[key] = self.used.get(key, 0) + 1
                return res
            except QuotaExhausted as exc:
                if self.current == self.FALLBACK:
                    raise
                print(f"  judge {provider} unavailable ({exc}); switching to {self.FALLBACK[1]}")
                self.current = self.FALLBACK
        raise RuntimeError("judge unavailable")


def parse_json(text: str) -> dict:
    return json.loads(text[text.index("{") : text.rindex("}") + 1])


def paths_prompt(q: str) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": f"Question: {q}\nCreate exactly 4 genuinely different thinking paths (based on frameworks such as First Principles, "
            "SWOT, 5 Whys, Pros & Cons, Data-Driven Analysis), each with 3 concrete steps (max 14 words each). "
            'Respond ONLY as JSON: {"paths":[{"name":"","framework":"","rationale":"","steps":["","",""]}]}',
        },
    ]


def step_prompt(q: str, path: dict, upto: int) -> list[dict]:
    steps = "\n".join(f"Step {i + 1}: {s}" for i, s in enumerate(path["steps"][:upto]))
    return [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": f"Original question: {q}\nApproach: {path['name']}\nExecute ONLY these steps:\n{steps}\n"
            "Show your reasoning for each step, then a short 'Current progress' section. Do not go beyond these steps.",
        },
    ]


def tokens(r: dict) -> int:
    return r["prompt_tokens"] + r["completion_tokens"]


def eval_pipeline(questions: list[dict], main: str, judge: "Judge") -> dict:
    full_total = s1_total = s2_total = 0
    quality = {"relevance": [], "diversity": [], "actionability": []}
    per_question = []
    for i, item in enumerate(questions, 1):
        q = item["question"]
        print(f"[{i}/{len(questions)}] {q[:70]}")
        full = chat(main, [{"role": "system", "content": SYSTEM}, {"role": "user", "content": f"{q}\nAnswer thoroughly and completely."}], max_tokens=2048)
        paths_res = chat(main, paths_prompt(q), json_mode=True, max_tokens=1200, temperature=0.8)
        try:
            paths = parse_json(paths_res["text"])["paths"][:4]
            assert paths and all(len(p["steps"]) >= 2 for p in paths)
        except Exception:
            print("  could not parse paths, skipping question")
            continue
        s1 = chat(main, step_prompt(q, paths[0], 1), max_tokens=2048)
        s2 = chat(main, step_prompt(q, paths[0], 2), max_tokens=2048)
        full_t, s1_t, s2_t = tokens(full), tokens(paths_res) + tokens(s1), tokens(paths_res) + tokens(s2)
        full_total, s1_total, s2_total = full_total + full_t, s1_total + s1_t, s2_total + s2_t

        try:
            j = judge(
                [
                    {
                        "role": "system",
                        "content": "You evaluate thinking paths generated for a question. Rate 1-5: relevance (fit to the question), "
                        "diversity (paths are genuinely different), actionability (steps are concrete). "
                        'Respond ONLY as JSON: {"relevance":n,"diversity":n,"actionability":n}',
                    },
                    {"role": "user", "content": f"Question: {q}\nPaths: {json.dumps(paths)}"},
                ],
                json_mode=True,
                max_tokens=100,
                temperature=0,
            )
            scores = parse_json(j["text"])
            for k in quality:
                quality[k].append(float(scores[k]))
        except Exception as exc:
            print(f"  judge failed: {exc}")
        per_question.append({"question": q, "type": item["type"], "full_tokens": full_t, "step1_tokens": s1_t, "step2_tokens": s2_t})

    def mean(xs):
        return round(statistics.mean(xs), 3) if xs else None

    pq = {k: mean(v) for k, v in quality.items()}
    vals = [v for v in pq.values() if v is not None]
    pq["overall"] = round(statistics.mean(vals), 3) if vals else None
    return {
        "token_savings": {
            "full_tokens": full_total,
            "step1_tokens": s1_total,
            "step2_tokens": s2_total,
            "step1_vs_full": round(1 - s1_total / full_total, 4) if full_total else None,
            "step2_vs_full": round(1 - s2_total / full_total, 4) if full_total else None,
        },
        "path_quality": pq,
        "per_question": per_question,
    }


def eval_latency(providers: list[str]) -> dict:
    out = {}
    for p in providers:
        times = []
        for _ in range(3):
            try:
                times.append(chat(p, [{"role": "user", "content": "In two sentences, what is strategic thinking?"}], max_tokens=120)["latency_ms"])
            except QuotaExhausted as exc:
                print(f"  latency {p}: {exc}, skipped")
                break
            except Exception as exc:
                print(f"  latency {p}: {exc}")
        if times:
            out[p] = {"median_ms": round(statistics.median(times)), "runs": len(times)}
    return out


def eval_rag(main: str, judge: "Judge") -> dict:
    from app.rag import DocumentStore

    tmp = Path(tempfile.mkdtemp(prefix="stratify_eval_"))
    try:
        store = DocumentStore(path=tmp, collection="eval")
        doc = EVAL_DIR / "sample_docs" / "nimbus_handbook.md"
        store.add(doc.name, doc.read_bytes())
        cases = json.loads((EVAL_DIR / "rag_set.json").read_text("utf-8"))
        hits, faith = 0, []
        for case in cases:
            results = store.search(case["question"], 4)
            context = "\n\n".join(f"[{i + 1}] {r['text']}" for i, r in enumerate(results))
            if any(case["keyword"].lower() in r["text"].lower() for r in results):
                hits += 1
            ans = chat(
                main,
                [
                    {"role": "system", "content": "Answer ONLY from the provided excerpts and cite them like [1]. If the answer is not there, say so."},
                    {"role": "user", "content": f"Excerpts:\n{context}\n\nQuestion: {case['question']}"},
                ],
                max_tokens=300,
                temperature=0,
            )["text"]
            try:
                j = judge(
                    [
                        {
                            "role": "system",
                            "content": 'Rate 1-5 how faithful and correct the answer is compared to the reference. Respond ONLY as JSON: {"score": n}',
                        },
                        {"role": "user", "content": f"Question: {case['question']}\nReference: {case['answer']}\nAnswer: {ans}"},
                    ],
                    json_mode=True,
                    max_tokens=30,
                    temperature=0,
                )
                faith.append(float(parse_json(j["text"])["score"]))
            except Exception as exc:
                print(f"  rag judge failed: {exc}")
        return {
            "cases": len(cases),
            "hit_rate": round(hits / len(cases), 4),
            "faithfulness": round(statistics.mean(faith), 3) if faith else None,
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=10, help="number of benchmark questions (max 40)")
    ap.add_argument("--skip-rag", action="store_true")
    ap.add_argument(
        "--sections",
        default="pipeline,latency,rag",
        help="comma list of sections to run; results of other sections are kept from the previous latest.json",
    )
    ap.add_argument("--main", default=None, help="provider that generates answers (default: first available)")
    ap.add_argument("--judge", default=None, help="judge provider (default: gemini, falling back to qwen on groq)")
    args = ap.parse_args()
    sections = {s.strip() for s in args.sections.split(",") if s.strip()}
    if args.skip_rag:
        sections.discard("rag")

    providers = available()
    if not providers:
        sys.exit("No provider available: set GROQ_API_KEY or GEMINI_API_KEY in .env, or start Ollama.")
    main_p = args.main or providers[0]
    judge_p = args.judge or ("gemini" if "gemini" in providers and main_p != "gemini" else (providers[1] if len(providers) > 1 else main_p))
    print(f"Main provider: {main_p} · judge: {judge_p} · available: {providers} · sections: {sorted(sections)}")

    lines = (EVAL_DIR / "benchmark.jsonl").read_text("utf-8").splitlines()
    questions = [json.loads(l) for l in lines if l.strip()]
    # stratified subset: interleave question types
    by_type: dict[str, list] = {}
    for q in questions:
        by_type.setdefault(q["type"], []).append(q)
    subset = [q for group in zip(*by_type.values()) for q in group][: args.limit]

    judge = Judge(judge_p)
    previous = json.loads(EVAL_RESULTS.read_text("utf-8")) if EVAL_RESULTS.exists() else {}
    partial = sections != {"pipeline", "latency", "rag"}
    result = dict(previous) if partial else {}
    result["timestamp"] = int(time.time())
    if "pipeline" in sections:
        result.update({"main_provider": main_p, "judge_provider": judge_p, "n_questions": len(subset)})
        result.update(eval_pipeline(subset, main_p, judge))
    if "latency" in sections:
        print("Measuring provider latency…")
        result["latency"] = eval_latency(providers)
    if "rag" in sections:
        print("Evaluating RAG…")
        result["rag"] = {**eval_rag(main_p, judge), "answer_provider": main_p}
    result["judge_calls"] = {**previous.get("judge_calls", {}), **judge.used} if partial else judge.used

    EVAL_RESULTS.parent.mkdir(parents=True, exist_ok=True)
    EVAL_RESULTS.write_text(json.dumps(result, indent=2), "utf-8")
    (EVAL_RESULTS.parent / f"run_{result['timestamp']}.json").write_text(json.dumps(result, indent=2), "utf-8")
    ts = result.get("token_savings") or {}
    print(f"\nToken savings: step1 {ts.get('step1_vs_full')}, steps1-2 {ts.get('step2_vs_full')}")
    print(f"Path quality: {result.get('path_quality')}")
    print(f"Latency: {result.get('latency')}")
    print(f"RAG: {result.get('rag')}")
    print(f"Judge calls: {result.get('judge_calls')}")
    print(f"Saved {EVAL_RESULTS}")


if __name__ == "__main__":
    main()
