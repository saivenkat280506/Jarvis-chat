import os
import re
import threading
from pathlib import Path

# Load .env and set HF token BEFORE importing pocket_tts
from dotenv import load_dotenv
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

# Set HF token for model download
hf_token = os.getenv("HF_TOKEN", "")
if hf_token:
    os.environ["HF_TOKEN"] = hf_token

import numpy as np
import sounddevice as sd
from pocket_tts import TTSModel

VOICE_PROMPT = Path(__file__).with_name("voices") / "jarvis voice.wav"

_model = None
_voice_state = None
_model_lock = threading.Lock()
_playback_lock = threading.Lock()
_stop_event = threading.Event()
_is_speaking = False
_active_stream = None


def clean_text_for_speech(text: str) -> str:
    """Trim formatting noise so the cloned voice stays natural."""
    # Handle acronyms like J.A.R.V.I.S -> Jarvis
    text = re.sub(r'\bJ\.A\.R\.V\.I\.S\b', 'Jarvis', text, flags=re.IGNORECASE)
    text = re.sub(r'\bJ\.A\.R\.V\.I\.S\.', 'Jarvis', text, flags=re.IGNORECASE)
    text = re.sub(r'\bAI\b', 'AI', text)  # Keep AI as is
    text = re.sub(r'\bURL\b', 'URL', text)
    text = re.sub(r'\bAPI\b', 'API', text)
    text = re.sub(r'\bHTML\b', 'HTML', text)
    text = re.sub(r'\bCSS\b', 'CSS', text)
    text = re.sub(r'\bJSON\b', 'JSON', text)
    
    # Replace common acronym patterns
    text = re.sub(r'\b(\w)\.(\w)\.(\w)\b', r'\1\2\3', text)
    
    text = re.sub(r"\*+", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"^\s*[\-\*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = text.replace("`", "").replace("#", "")
    text = re.sub(r"https?://\S+", "", text)
    if "{" in text and "}" in text:
        text = re.sub(r"\{[^\}]+\}", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _ensure_model_loaded():
    global _model, _voice_state
    if _model is not None and _voice_state is not None:
        return

    with _model_lock:
        if _model is not None and _voice_state is not None:
            return

        if not VOICE_PROMPT.exists():
            raise FileNotFoundError(f"Missing voice prompt at {VOICE_PROMPT}")

        # Load model - HF_TOKEN env var is set before import
        model = TTSModel.load_model()
        
        # Use Jarvis voice prompt for voice cloning
        voice_state = model.get_state_for_audio_prompt(str(VOICE_PROMPT))
        
        _model = model
        _voice_state = voice_state
        print("[TTS] Pocket TTS loaded with Jarvis voice clone!")


def warm_up_tts():
    """Load the model and voice state ahead of the first spoken response."""
    try:
        _ensure_model_loaded()
        print("[TTS] Pocket TTS warmed with Jarvis voice prompt.")
    except Exception as exc:
        print(f"[TTS Warmup Error] {exc}")


def _chunk_to_samples(chunk) -> np.ndarray:
    if hasattr(chunk, "detach"):
        chunk = chunk.detach().cpu().numpy()
    samples = np.asarray(chunk, dtype=np.float32).reshape(-1, 1)
    return np.clip(samples, -1.0, 1.0)


def speak(text: str):
    """Generate low-latency local speech from the Jarvis voice prompt."""
    global _is_speaking, _active_stream

    clean_text = clean_text_for_speech(text)
    if len(clean_text) < 2:
        return

    try:
        _ensure_model_loaded()
    except Exception as exc:
        print(f"[TTS Load Error] {exc}")
        return

    with _playback_lock:
        _stop_event.clear()
        _is_speaking = True

        try:
            device_info = sd.query_devices(kind='output')
            print(f"[TTS] Using device: {device_info['name']} (Sample Rate: {device_info['default_samplerate']}Hz)")
            
            stream = sd.OutputStream(
                samplerate=_model.sample_rate,
                channels=1,
                dtype="float32",
                latency="low",
                blocksize=0,
            )
            _active_stream = stream
            stream.start()

            for audio_chunk in _model.generate_audio_stream(
                model_state=_voice_state,
                text_to_generate=clean_text,
                copy_state=True,
            ):
                if _stop_event.is_set():
                    break
                samples = _chunk_to_samples(audio_chunk)
                stream.write(samples)

            stream.stop()
            stream.close()
        except Exception as exc:
            print(f"[TTS Audio Error] {exc}")
        finally:
            if _active_stream is not None:
                try:
                    _active_stream.close()
                except Exception:
                    pass
            _active_stream = None
            _is_speaking = False
            _stop_event.clear()


def stop_speech():
    """Stop any current Pocket TTS playback as quickly as possible."""
    global _active_stream, _is_speaking

    _stop_event.set()
    try:
        if _active_stream is not None:
            _active_stream.abort()
            _active_stream.close()
    except Exception as exc:
        print(f"[TTS Stop Error] {exc}")
    finally:
        _active_stream = None
        _is_speaking = False


def is_speaking() -> bool:
    return _is_speaking
