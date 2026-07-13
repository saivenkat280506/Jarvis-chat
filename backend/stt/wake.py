"""
wake.py — Wake Word Detection System
=====================================
Listens for the keyword phrases and triggers STT.
Supported phrases: "jarvis", "hey jarvis", "wake up jarvis", "wake jarvis"
"""

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
import queue
import time as time_module

# Configuration
MODEL_SIZE = "tiny.en"
SAMPLE_RATE = 16000
CHUNK_DURATION = 2      # Seconds of audio per analysis window
COMPUTE_TYPE = "int8"
# Phrases that trigger wake word detection
WAKE_PHRASES = ["jarvis", "hey jarvis", "wake up jarvis", "wake jarvis"]

# Global model — loaded once, reused
_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)
    return _model


def wait_for_wake_word() -> bool:
    """
    Continuously listens to the microphone (non-blocking, high-latency mode)
    and returns True when any wake phrase is detected.

    Uses a bounded queue so audio callbacks never overflow even when
    Whisper is busy processing the previous chunk.
    """
    model = get_model()

    # Bounded queue: if Whisper is slow the oldest chunks are silently dropped
    audio_queue: queue.Queue = queue.Queue(maxsize=30)

    def audio_callback(indata: np.ndarray, frames: int, cb_time, status):
        # Drain one item to make room if full, then enqueue latest chunk
        if audio_queue.full():
            try:
                audio_queue.get_nowait()
            except queue.Empty:
                pass
        audio_queue.put_nowait(indata.copy())

    print("[Wake] Standby — waiting for wake phrase...")

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=2048,       # Larger block → fewer callbacks → less overflow
            latency="high",       # High-latency mode tolerates slow consumers
            callback=audio_callback,
        ):
            audio_buffer: list[float] = []
            target_samples = SAMPLE_RATE * CHUNK_DURATION

            while True:
                # --- Fill buffer up to one CHUNK_DURATION of audio ---
                while len(audio_buffer) < target_samples:
                    try:
                        chunk = audio_queue.get(timeout=0.2)
                        audio_buffer.extend(chunk.flatten())
                    except queue.Empty:
                        continue

                # --- Transcribe ---
                audio_data = np.array(audio_buffer[:target_samples], dtype=np.float32)
                try:
                    segments, _ = model.transcribe(audio_data, beam_size=1, language="en")
                    text = "".join(s.text for s in segments).lower().strip()
                except Exception as e:
                    print(f"[Wake] Transcription error: {e}")
                    audio_buffer = []
                    continue

                # --- Check for wake phrases ---
                if text and any(phrase in text for phrase in WAKE_PHRASES):
                    print(f"[Wake] Wake phrase detected in: '{text}'")
                    return True

                # Slide window: keep last 1 second for continuity
                audio_buffer = audio_buffer[-SAMPLE_RATE:]

    except Exception as e:
        print(f"[Wake] Stream error: {e}")
        return False


if __name__ == "__main__":
    try:
        while True:
            if wait_for_wake_word():
                print("[System] Wake phrase triggered — ready for command.")
    except KeyboardInterrupt:
        print("\n[System] Shutdown.")
