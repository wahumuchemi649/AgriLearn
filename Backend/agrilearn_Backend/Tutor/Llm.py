"""Gemini calls for the tutor: embeddings (for search) and answers."""
import math

from agrilearn_Backend.Farm.debrief_ai import DEBRIEF_MODEL, NoApiKey, _get_api_key
import os

TUTOR_MODEL = DEBRIEF_MODEL
# Used when the main model is overloaded or out of quota. Pick a lighter "flash-lite" model
# from the model list in Google AI Studio. I can't check current names from here, so confirm it.
FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")

_TRANSIENT = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "504",
              "DEADLINE_EXCEEDED", "timed out", "timeout", "NOT_FOUND")

EMBED_MODEL = "gemini-embedding-001"
EMBED_DIMS = 768  # must match SyllabusChunk.embedding
TUTOR_MODEL = DEBRIEF_MODEL  # same model as the debrief; change here if you want a different one


def _client():
    from google import genai
    from google.genai import types

    key = _get_api_key()
    if not key:
        raise NoApiKey("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key, http_options=types.HttpOptions(timeout=30_000)), types


def _unit(vec):
    # Gemini only returns unit-length vectors at full size, so normalise the 768 version
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / n for x in vec]


def embed(texts, *, query=False):
    """Return one 768-number vector per text."""
    client, types = _client()
    out = []
    for i in range(0, len(texts), 50):
        resp = client.models.embed_content(
            model=EMBED_MODEL,
            contents=texts[i:i + 50],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT",
                output_dimensionality=EMBED_DIMS,
            ),
        )
        out.extend(_unit(list(e.values)) for e in resp.embeddings)
    return out


def generate(system_prompt, user_prompt):
    client, types = _client()
    models = [TUTOR_MODEL]
    if FALLBACK_MODEL and FALLBACK_MODEL != TUTOR_MODEL:
        models.append(FALLBACK_MODEL)

    last = None
    for model in models:
        try:
            resp = client.models.generate_content(
                model=model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.4,
                    max_output_tokens=1024,
                ),
            )
            text = (resp.text or "").strip()
            if text:
                return text
            last = ValueError(f"{model} returned an empty answer")
        except Exception as exc:
            last = exc
            import logging; logging.getLogger(__name__).warning("Gemini %s failed: %s", model, exc)
            if not any(t.lower() in str(exc).lower() for t in _TRANSIENT):
                raise  # a real bug (bad key, bad request): don't hide it behind a fallback
    raise last
    return (resp.text or "").strip()