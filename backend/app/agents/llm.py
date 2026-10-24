"""Thin client for Gemma 4 on the Gemini API, with a small tool-calling loop.

Agents speak a simple chat format ({"role": "system"|"user"|"assistant", "content": str}); this module
translates it to Gemini `contents` + `systemInstruction`.
"""

import json
import time
from collections.abc import Callable

import httpx
from fastapi import HTTPException

from ..config import GEMINI_API_KEY, GEMINI_URL, LLM_MODEL

Tool = tuple[dict, Callable[..., object]]  # (function declaration for the model, python implementation)

_RETRYABLE = {429, 500, 502, 503, 504}


def _generate(body: dict) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(503, "AI is not configured: set GEMINI_API_KEY in backend/.env")
    url = f"{GEMINI_URL}/models/{LLM_MODEL}:generateContent"
    r = None
    attempts = 4
    for attempt in range(attempts):
        try:
            r = httpx.post(url, json=body, headers={"x-goog-api-key": GEMINI_API_KEY}, timeout=120)
        except httpx.HTTPError as e:
            if attempt == attempts - 1:
                raise HTTPException(503, f"AI model unavailable: cannot reach Gemini API ({e.__class__.__name__})")
        else:
            if r.status_code not in _RETRYABLE:
                break
        if attempt < attempts - 1:
            time.sleep(2**attempt * 1.5)  # 1.5s, 3s, 6s
    if r.status_code in (400, 401, 403) and "API key" in r.text:
        raise HTTPException(503, "AI model unavailable: the Gemini API key was rejected")
    if r.status_code in _RETRYABLE:
        raise HTTPException(503, f"AI model '{LLM_MODEL}' is busy right now, please try again in a moment")
    if r.status_code >= 400:
        raise HTTPException(502, f"AI model error: {r.text[:300]}")
    data = r.json()
    if not data.get("candidates"):
        reason = data.get("promptFeedback", {}).get("blockReason", "no answer returned")
        raise HTTPException(502, f"AI model returned no answer ({reason})")
    return data["candidates"][0].get("content") or {"role": "model", "parts": []}


def _to_gemini(messages: list[dict]) -> tuple[dict | None, list[dict]]:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
        if m["role"] != "system"
    ]
    return ({"parts": [{"text": system}]} if system else None), contents


def _text(content: dict) -> str:
    # Gemma 4 returns its reasoning as separate "thought" parts; only the answer goes to users.
    return "".join(p.get("text", "") for p in content.get("parts", []) if not p.get("thought")).strip()


def _body(system: dict | None, contents: list[dict], **extra) -> dict:
    body = {"contents": contents, **extra}
    if system:
        body["systemInstruction"] = system
    return body


def complete(messages: list[dict], *, json_mode: bool = False, temperature: float = 0.3) -> str:
    system, contents = _to_gemini(messages)
    config = {"temperature": temperature}
    if json_mode:
        config["responseMimeType"] = "application/json"
    return _text(_generate(_body(system, contents, generationConfig=config)))


def run_agent(messages: list[dict], tools: dict[str, Tool], *, max_steps: int = 5) -> tuple[str, list[str]]:
    """Let the model call tools until it produces a final answer. Returns (answer, tool names used)."""
    system, contents = _to_gemini(messages)
    declarations = [{"functionDeclarations": [spec for spec, _ in tools.values()]}]
    config = {"temperature": 0.2}
    used: list[str] = []
    for _ in range(max_steps):
        content = _generate(_body(system, contents, tools=declarations, generationConfig=config))
        calls = [p["functionCall"] for p in content.get("parts", []) if "functionCall" in p]
        if not calls:
            return _text(content), used
        # Send the model turn back verbatim: it carries call ids and thought signatures.
        contents.append({"role": "model", "parts": content["parts"]})
        responses = []
        for call in calls:
            name, args = call["name"], call.get("args") or {}
            if name in tools:
                try:
                    result = tools[name][1](**args)
                except TypeError as e:
                    result = {"error": f"bad arguments: {e}"}
                used.append(name)
            else:
                result = {"error": f"unknown tool {name}"}
            response = {"name": name, "response": {"result": json.loads(json.dumps(result, default=str))}}
            if "id" in call:
                response["id"] = call["id"]
            responses.append({"functionResponse": response})
        contents.append({"role": "user", "parts": responses})
    # Out of steps: ask for an answer with what it has.
    contents.append({"role": "user", "parts": [{"text": "Answer now using the information gathered so far."}]})
    return _text(_generate(_body(system, contents, generationConfig=config))), used
