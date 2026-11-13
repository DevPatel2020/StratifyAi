# Evaluation methodology

All experiments are reproducible with free providers and write JSON results that the app's
**Evaluation** page visualises.

## 1. Question-type classifier

- **Data:** `ai-service/data/questions.csv`, 200 hand-written questions, 25 per class across 8 classes
  (coding, data analysis, business strategy, learning, decision making, creative, research, personal
  planning). Optionally augmented with `scripts/generate_dataset.py` (LLM-generated, de-duplicated; review
  a sample by hand before training).
- **Features:** TF-IDF word 1–2-grams + character 2–5-grams (robust on small data and typos).
- **Models compared:** Logistic Regression, calibrated Linear SVM, Complement Naive Bayes.
- **Protocol:** stratified 80/20 train/test split (seed 42); 5-fold stratified CV on the training split
  to select the model by macro F1; report held-out accuracy, macro F1, per-class P/R/F1 and the confusion
  matrix; refit the winner on all data for deployment.
- **Run:** `npm run ai:train` → `ai-service/reports/classifier_metrics.json`.

## 2. Token savings (the core claim)

For each benchmark question (`eval/benchmark.jsonl`, 40 questions, 5 per class):

- **Baseline:** one full answer ("answer thoroughly and completely").
- **StratifyAI step 1:** path generation + execution of step 1 of the first path.
- **StratifyAI steps 1–2:** path generation + execution of steps 1–2.

Savings = `1 − tokens(StratifyAI) / tokens(baseline)`, summed over all questions, counting prompt and
completion tokens as reported by the provider. Path-generation tokens are **included**, so the comparison
is honest about StratifyAI's overhead.

## 3. Path quality (LLM-as-judge)

A judge model (Gemini when the main model is Groq, so the judge differs from the generator) rates
the 4 paths per question from 1 to 5 for **relevance**, **diversity** and **actionability**. Known limitations
to discuss in the report: judge bias, positional bias, and no human calibration. A small human rating
of 10 questions is recommended as a sanity check.

## 4. Provider latency

The same short prompt is sent 3 times to every available provider (Groq cloud, Gemini cloud, Ollama
local); the median is reported. The interesting comparison is Groq `llama-3.1-8b-instant` vs. the
same model running locally in Ollama: same weights, different hardware.

## 5. Retrieval-augmented generation

`eval/sample_docs/nimbus_handbook.md` is a **fictional** handbook, so the model cannot know the answers
from pre-training. For 10 questions (`eval/rag_set.json`):

- **hit@4:** does any of the top-4 retrieved chunks contain the expected key fact?
- **faithfulness:** the judge rates the generated, cited answer against a reference (1–5).

## Running

```bash
npm run ai:eval                         # 10 questions (default)
node scripts/run-python.mjs eval/run_eval.py --limit 40   # full benchmark
```

Free-tier rate limits apply; the scripts back off and retry on HTTP 429.

## Suggested user study

10–15 participants solve 3 tasks with a plain chatbot and with StratifyAI (counterbalanced order), then
complete the System Usability Scale (SUS) and a 5-point "felt in control of the depth" question.
Report the mean SUS, a paired comparison and qualitative feedback.
