"""ASR module for the configured fine-tuned Whisper model."""

from backend.transcription import get_model_status, load_whisper_model, transcribe_audio


_pipeline = None


def initialize_asr_model():
    """Initialize and load the Whisper model at application startup."""
    global _pipeline
    if _pipeline is None:
        status = get_model_status(is_loaded=False)
        print(f"Loading fine-tuned Whisper model from: {status['model_dir']}")
        _pipeline = load_whisper_model()
        print("[OK] Whisper model loaded successfully")
    return _pipeline


def transcrire_audio_local(file_path: str) -> str:
    """Transcribe a local emergency call audio file."""
    if _pipeline is None:
        raise RuntimeError("ASR model not initialized. Call initialize_asr_model() first.")

    return transcribe_audio(file_path, pipe=_pipeline)


def get_asr_model():
    """Get the loaded ASR pipeline."""
    if _pipeline is None:
        raise RuntimeError("ASR model not initialized. Call initialize_asr_model() first.")
    return _pipeline


def get_asr_status():
    """Return current ASR configuration and load state for health checks."""
    return get_model_status(is_loaded=_pipeline is not None)
