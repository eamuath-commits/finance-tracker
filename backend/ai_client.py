"""Thin, optional client for a local Ollama model (runs on the user's Mac).

Everything here FAILS SOFT: if OLLAMA_URL is unset or the box is unreachable,
every call returns None so the app keeps working (the deterministic rules still
categorize). The finance ledger never depends on the AI being up.
"""
import json
import os
import urllib.request

import categorizer

OLLAMA_URL = os.environ.get("OLLAMA_URL", "").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "20"))


def available() -> bool:
    return bool(OLLAMA_URL)


def _generate(prompt: str) -> str:
    body = json.dumps({
        "model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
        "format": "json", "options": {"temperature": 0, "num_predict": 24},
    }).encode()
    req = urllib.request.Request(OLLAMA_URL + "/api/generate", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        return json.load(r).get("response", "")


def suggest_category(merchant, notes=None, amount=None, direction=None):
    """Return a category from categorizer.CATEGORIES, or None on any failure.
    Only meant for merchants the deterministic rules could not settle."""
    if not OLLAMA_URL:
        return None
    prompt = (
        "Categorize ONE Saudi bank transaction into exactly one of: "
        + ", ".join(categorizer.CATEGORIES) + ".\n"
        + categorizer.AI_RULES + "\n"
        + f'Transaction: merchant="{merchant}" note="{(notes or "")[:160]}" '
        + f'amount={amount} direction={direction}\n'
        + 'Return ONLY JSON: {"category": <one label>}.'
    )
    try:
        cat = (json.loads(_generate(prompt)) or {}).get("category")
    except Exception:
        return None
    return cat if cat in categorizer.CATEGORIES else None
