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

A judge model from a different model family than the generator rates
the 4 paths per question from 1 to 5 for **relevance**, **diversity** and **actionability**.
The judge is Gemini when its quota allows; otherwise it automatically falls back to Qwen on Groq
(`qwen/qwen3.8-27b`), so the generator (`gpt-oss-120b`) never grades its own output. The results file
records which judge produced each score (`judge_calls`). Known limitations
to discuss in the report: judge bias, positional bias, and no human calibration. A small human rating
of 10 questions is recommended as a sanity check.

## 4. Provider latency

The same short prompt is sent 3 times to every available provider (Groq cloud, Gemini cloud, Ollama
local); the median is reported. The comparison shows the cost of privacy and offline use: a 120B model on
Groq's inference hardware vs. an 8B model (`llama3.1`, Q4) on a student laptop CPU. Note the models differ,
so this measures the deployment option end to end, not hardware alone.

## 5. Retrieval-augmented generation

`eval/sample_docs/nimbus_handbook.md` is a **fictional** handbook, so the model cannot know the answers
from pre-training. For 10 questions (`eval/rag_set.json`):

- **hit@4:** does any of the top-4 retrieved chunks contain the expected key fact?
- **faithfulness:** the judge rates the generated, cited answer against a reference (1–5).

## Running

```bash
npm run ai:eval                         # 10 questions (default)
node scripts/run-python.mjs eval/run_eval.py --limit 40   # full benchmark
# re-run only some sections (others are kept from the last results), e.g. RAG answered by local Ollama:
node scripts/run-python.mjs eval/run_eval.py --sections latency,rag --main ollama
```

Free-tier rate limits apply; the scripts back off and retry on short HTTP 429s. Note that the Gemini free
tier for `gemini-2.5-flash-lite` can be as low as **20 requests per day**; when it is exhausted the scripts
switch judge instead of waiting.

## Suggested user study

10–15 participants solve 3 tasks with a plain chatbot and with StratifyAI (counterbalanced order), then
complete the System Usability Scale (SUS) and a 5-point "felt in control of the depth" question.
Report the mean SUS, a paired comparison and qualitative feedback.
