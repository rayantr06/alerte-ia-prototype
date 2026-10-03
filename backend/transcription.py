"""
Transcription module for DGPC emergency call audio.

The app can run with an explicit model path:
  DGPC_ASR_MODEL_DIR="/path/to/your/local/checkpoint"

If no environment variable is provided, it tries the local fine-tuned Stage 2
checkpoint available in this workspace, then falls back to backend/whisper_model.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline


BACKEND_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = BACKEND_DIR.parent
STAGE2_MODEL_DIR = (
    WORKSPACE_ROOT
    / "allignement"
    / "stage2"
    / "whisper-large-v3-turbo-kabyle-stage2"
)
LEGACY_MODEL_DIR = BACKEND_DIR / "whisper_model"

DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
PIPELINE_DEVICE = 0 if torch.cuda.is_available() else -1
TORCH_DTYPE = torch.float16 if torch.cuda.is_available() else torch.float32


def _resolve_model_dir() -> Path:
    configured = os.getenv("DGPC_ASR_MODEL_DIR")
    if configured:
        return Path(configured).expanduser().resolve()

    if STAGE2_MODEL_DIR.exists():
        return STAGE2_MODEL_DIR

    return LEGACY_MODEL_DIR


# Priorité : un repo Hugging Face (DGPC_ASR_MODEL_ID, ex. "rayantrk06/whisper-...-stage2").
# Sinon, un dossier local (DGPC_ASR_MODEL_DIR ou le checkpoint Stage 2 du workspace).
ASR_MODEL_ID = os.getenv("DGPC_ASR_MODEL_ID", "").strip()
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")
USE_HF_ID = bool(ASR_MODEL_ID)

MODEL_DIR = _resolve_model_dir()
MODEL_SOURCE = ASR_MODEL_ID if USE_HF_ID else str(MODEL_DIR)
PROCESSOR_ID = os.getenv("DGPC_ASR_PROCESSOR_ID", MODEL_SOURCE)
ASR_LANGUAGE = os.getenv("DGPC_ASR_LANGUAGE", "").strip()


def get_model_status(is_loaded: bool = False) -> dict[str, Any]:
    return {
        "loaded": is_loaded,
        "model_dir": MODEL_SOURCE,
        "model_exists": True if USE_HF_ID else MODEL_DIR.exists(),
        "source": "huggingface" if USE_HF_ID else "local",
        "processor_id": PROCESSOR_ID,
        "language": ASR_LANGUAGE or None,
        "device": DEVICE,
        "dtype": str(TORCH_DTYPE).replace("torch.", ""),
    }


def load_whisper_model():
    """
    Load the fine-tuned Whisper model and return a Hugging Face ASR pipeline.
    """
    if not USE_HF_ID and not MODEL_DIR.exists():
        raise FileNotFoundError(
            "Whisper model directory not found.\n"
            f"Resolved path: {MODEL_DIR}\n"
            "Set DGPC_ASR_MODEL_ID to a Hugging Face repo, DGPC_ASR_MODEL_DIR to a "
            f"local directory, or copy the model files into {LEGACY_MODEL_DIR}."
        )

    print(f"[ASR] Loading fine-tuned Whisper model: {MODEL_SOURCE} ({'HF' if USE_HF_ID else 'local'})")
    print(f"[ASR] Processor: {PROCESSOR_ID}")
    print(f"[ASR] Device: {DEVICE} (dtype: {TORCH_DTYPE})")

    token_kwargs = {"token": HF_TOKEN} if HF_TOKEN else {}
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_SOURCE,
        torch_dtype=TORCH_DTYPE,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        **token_kwargs,
    )
    model = model.to(DEVICE)

    processor = AutoProcessor.from_pretrained(PROCESSOR_ID, **token_kwargs)

    transcriber = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=TORCH_DTYPE,
        device=PIPELINE_DEVICE,
        chunk_length_s=30,
        batch_size=1,
    )

    # Keep the model in transcription mode. No translation.
    transcriber.model.config.forced_decoder_ids = None
    return transcriber


def _generate_kwargs() -> dict[str, str]:
    kwargs = {"task": "transcribe"}
    if ASR_LANGUAGE and ASR_LANGUAGE.lower() not in {"none", "auto", "null"}:
        kwargs["language"] = ASR_LANGUAGE
    return kwargs


def transcribe_audio(file_path: str, pipe=None) -> str:
    """
    Transcribe one emergency call audio file.
    """
    audio_path = Path(file_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    if pipe is None:
        pipe = load_whisper_model()

    print(f"[ASR] Transcribing: {audio_path.name}")
    result = pipe(
        str(audio_path),
        return_timestamps=False,
        generate_kwargs=_generate_kwargs(),
    )

    text = result.get("text", "").strip()
    print(f"[ASR] Transcription complete ({len(text)} characters)")
    return text


if __name__ == "__main__":
    try:
        print("Initializing Whisper model...")
        transcriber = load_whisper_model()
        print("[OK] Model loaded successfully")

        test_audio = BACKEND_DIR / "test_audio.wav"
        if test_audio.exists():
            transcription = transcribe_audio(str(test_audio), pipe=transcriber)
            print(f"\nTranscribed text:\n{transcription}")
        else:
            print("No test audio found. Use transcribe_audio() with an audio file.")

    except Exception as exc:
        print(f"[ERROR] {exc}")
        raise
