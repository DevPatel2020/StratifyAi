"""Minimal OpenAI-compatible client for the offline scripts (dataset generation, evaluation).

Uses the same free providers as the desktop app: Groq, Gemini (OpenAI-compatible endpoint) and Ollama.
Keys come from the project's .env file and are never printed.
"""

from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import config  # noqa: E402,F401  (loads .env)

PROVIDERS = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key": lambda: os.getenv("GROQ_API_KEY", "").strip(),
        "model": lambda: os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
    },
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "key": lambda: os.getenv("GEMINI_API_KEY", "").strip(),
        "model": lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite"),
    },
    "ollama": {
        "url": f"{os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')}/v1/chat/completions",
        "key": lambda: "ollama",
        "model": lambda: os.getenv("OLLAMA_MODEL", "llama3.1"),
    },
}


def available() -> list[str]:
    out = []
    for name, p in PROVIDERS.items():
        if name == "ollama":
            try:
                httpx.get(PROVIDERS["ollama"]["url"].replace("/v1/chat/completions", "/api/tags"), timeout=2)
                out.append(name)
            except httpx.HTTPError:
                pass
        elif p["key"]():
            out.append(name)
    return out


def reset_seconds(message: str) -> float | None:
    """Parse 'try again in 1m30.5s' / 'retry in 12h30m' / 'try again in 217ms' from a 429 body."""
    m = re.search(r"(?:try|retry)(?: again)? in ([\d.]+ms|(?:[\d.]+h)?(?:[\d.]+m(?!s))?(?:[\d.]+s)?)", message)
    if not m or not m.group(1):
        return None
    text = m.group(1)
    if text.endswith("ms") and "m" not in text[:-2]:
        return float(text[:-2]) / 1000
    total = 0.0
    for value, unit in re.findall(r"([\d.]+)(h|m(?!s)|s)", text):
        total += float(value) * {"h": 3600, "m": 60, "s": 1}[unit]
    return total or None


class QuotaExhausted(RuntimeError):
    """Raised when a provider's per-day (or otherwise long) quota is used up; callers should switch provider."""


def chat(
    provider: str,
    messages: list[dict],
    *,
    json_mode: bool = False,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    model: str | None = None,
) -> dict:
    """Returns {text, prompt_tokens, completion_tokens, latency_ms}. Retries short rate limits."""
    p = PROVIDERS[provider]
    model = model or p["model"]()
    reasoning = any(tag in model.lower() for tag in ("gpt-oss", "qwen3", "deepseek-r1"))
    body = {"model": model, "messages": messages, "max_tokens": max(max_tokens, 600) if reasoning else max_tokens, "temperature": temperature}
    if provider == "groq" and "gpt-oss" in model:
        body["reasoning_effort"] = "low"  # otherwise hidden reasoning can exhaust the token budget
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    for attempt in range(4):
        started = time.perf_counter()
        r = httpx.post(p["url"], json=body, headers={"Authorization": f"Bearer {p['key']()}"}, timeout=300)
        latency = (time.perf_counter() - started) * 1000
        if r.status_code == 429:
            wait = reset_seconds(r.text)
            if wait is None:
                wait = float(r.headers.get("retry-after", 2 ** (attempt + 2)))
            if wait > 90 or attempt == 3:
                raise QuotaExhausted(f"{provider}: rate limit resets in {wait:.0f}s")
            print(f"  rate limited by {provider}, waiting {wait:.0f}s")
            time.sleep(min(wait, 60))
            continue
        r.raise_for_status()
        data = r.json()
        usage = data.get("usage") or {}
        text = data["choices"][0]["message"]["content"] or ""
        return {
            "text": text,
            "prompt_tokens": usage.get("prompt_tokens", len(str(messages)) // 4),
            "completion_tokens": usage.get("completion_tokens", len(text) // 4),
            "latency_ms": latency,
        }
    raise RuntimeError(f"{provider}: still rate limited")
