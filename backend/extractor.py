"""Hugging Face LLM extractor for DGPC call transcriptions.

Deux modèles d'extraction sélectionnables (même format de prompt / parsing) :
  - "qwen"  : rayantrk06/student-dgpc-qwen35-2b   (léger, défaut)
  - "gemma" : rayantrk06/student-dgpc-gemma3-12b  (12B, chargé en 4-bit par défaut)
Le choix du modèle est passé par requête (champ "model"). Chaque modèle est chargé
paresseusement et mis en cache.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Modèles disponibles (clé courte -> identifiant Hugging Face).
EXTRACTOR_MODELS = {
    "qwen": os.getenv("DGPC_EXTRACTOR_QWEN_ID", "rayantrk06/student-dgpc-qwen35-2b"),
    "gemma": os.getenv("DGPC_EXTRACTOR_GEMMA_ID", "rayantrk06/student-dgpc-gemma3-12b"),
}
DEFAULT_MODEL_KEY = os.getenv("DGPC_EXTRACTOR_DEFAULT", "qwen").strip().lower()
# Gemma 12B : chargé en 4-bit par défaut pour tenir en VRAM (A5000 24 Go).
GEMMA_4BIT = os.getenv("DGPC_EXTRACTOR_GEMMA_4BIT", "1") not in ("0", "false", "False")

MAX_NEW_TOKENS = int(os.getenv("DGPC_EXTRACTOR_MAX_NEW_TOKENS", "768"))
EXTRACTOR_PROMPT_MODE = os.getenv("DGPC_EXTRACTOR_PROMPT_MODE", "reasoning").strip().lower()
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")

JSON_RE = re.compile(r"<json>\s*(\{.*?\})\s*</json>", re.DOTALL)
THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL)

# Cache des modèles chargés : clé courte -> (tokenizer, model).
_loaded: dict[str, tuple[Any, Any]] = {}


def _resolve_key(model: str | None) -> str:
    key = (model or DEFAULT_MODEL_KEY).strip().lower()
    if key in EXTRACTOR_MODELS:
        return key
    # tolère qu'on passe directement un identifiant HF connu
    for k, mid in EXTRACTOR_MODELS.items():
        if key == mid.lower():
            return k
    return DEFAULT_MODEL_KEY


def get_extractor_status() -> dict[str, Any]:
    return {
        "default_model": DEFAULT_MODEL_KEY,
        "available_models": {k: {"model_id": v, "loaded": k in _loaded} for k, v in EXTRACTOR_MODELS.items()},
        "loaded_models": list(_loaded.keys()),
        "max_new_tokens": MAX_NEW_TOKENS,
        "prompt_mode": EXTRACTOR_PROMPT_MODE,
        "gemma_4bit": GEMMA_4BIT,
        "hf_token_present": bool(HF_TOKEN),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
    }


def _json_only_mode() -> bool:
    return EXTRACTOR_PROMPT_MODE in {"json_only", "json-only", "json"}


def build_inference_prompt(transcription: str) -> str:
    """Use the exact pure-completion format used during extractor training."""
    text = transcription.strip()
    if _json_only_mode():
        return f"### Transcription ###\n{text}\n\n### Fiche ###\n<json>\n{{"
    return f"### Transcription ###\n{text}\n\n### Raisonnement ###\n"


def _torch_dtype():
    if not torch.cuda.is_available():
        return torch.float32
    if torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


def load_extractor_model(model: str | None = None):
    """Lazy-load (and cache) the Hugging Face extractor model for the given key."""
    key = _resolve_key(model)
    if key in _loaded:
        return _loaded[key]

    model_id = EXTRACTOR_MODELS[key]
    token_kwargs = {"token": HF_TOKEN} if HF_TOKEN else {}
    dtype = _torch_dtype()

    print(f"[EXTRACTOR] Loading '{key}' -> {model_id}")
    print(f"[EXTRACTOR] Device: {get_extractor_status()['device']} (dtype: {dtype})")

    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=False, **token_kwargs)

    model_kwargs: dict[str, Any] = {
        "device_map": "auto",
        "low_cpu_mem_usage": True,
        "trust_remote_code": False,
        **token_kwargs,
    }
    if key == "gemma" and GEMMA_4BIT and torch.cuda.is_available():
        from transformers import BitsAndBytesConfig
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=dtype, bnb_4bit_quant_type="nf4",
        )
    else:
        model_kwargs["torch_dtype"] = dtype

    hf_model = AutoModelForCausalLM.from_pretrained(model_id, **model_kwargs)
    hf_model.eval()
    print(f"[EXTRACTOR] Model '{key}' loaded")
    _loaded[key] = (tokenizer, hf_model)
    return _loaded[key]


def _find_first_json_object(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(text[start : index + 1])
                except json.JSONDecodeError:
                    return None
                return parsed if isinstance(parsed, dict) else None
    return None


def parse_extractor_output(generated_text: str) -> dict[str, Any]:
    json_match = JSON_RE.search(generated_text)
    think_match = THINK_RE.search(generated_text)

    parsed = None
    error = ""
    if json_match:
        try:
            parsed = json.loads(json_match.group(1))
        except json.JSONDecodeError as exc:
            error = f"Malformed JSON: {exc}"
    else:
        parsed = _find_first_json_object(generated_text)
        if parsed is None:
            error = "No parseable JSON object found"

    return {
        "json_valid": parsed is not None,
        "parsed": parsed,
        "think": think_match.group(1).strip() if think_match else "",
        "error": error,
        "raw": generated_text.strip(),
    }


@torch.no_grad()
def extract_call_fields(transcription: str, model: str | None = None) -> dict[str, Any]:
    if not transcription or len(transcription.strip()) < 3:
        raise ValueError("Transcription is empty")

    key = _resolve_key(model)
    tokenizer, hf_model = load_extractor_model(key)
    prompt = build_inference_prompt(transcription)
    inputs = tokenizer(prompt, return_tensors="pt").to(hf_model.device)

    output = hf_model.generate(
        **inputs,
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False,
        pad_token_id=tokenizer.eos_token_id,
    )
    full_text = tokenizer.decode(output[0], skip_special_tokens=True)
    generated = full_text[len(prompt):] if full_text.startswith(prompt) else full_text
    if _json_only_mode():
        stripped = generated.lstrip()
        parse_input = "<json>\n" + (stripped if stripped.startswith("{") else "{" + stripped)
    else:
        parse_input = generated
    result = parse_extractor_output(parse_input)
    result["model"] = key
    result["model_id"] = EXTRACTOR_MODELS[key]
    result["prompt_mode"] = EXTRACTOR_PROMPT_MODE
    return result
