"""
stt.py — Real-time Streaming Speech-to-Text
============================================
After wake word, streams PARTIAL transcriptions back via a callback
so the main loop can broadcast them live to the frontend.

Design:
  - listen_stream(partial_cb=None)
  - partial_cb(text: str) called as each new word/segment arrives
  - Stops automatically after SILENCE_LIMIT seconds of silence
  - Returns the full final transcription string (accumulated)
"""

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
import queue
import time

# ── Configuration ────────────────────────────────────────────────────────────
MODEL_SIZE    = "tiny.en"
SAMPLE_RATE   = 16000
CHUNK_WINDOW  = 3       # Seconds of audio to transcribe per window
SILENCE_LIMIT = 6.0     # Seconds of silence before stopping
COMPUTE_TYPE  = "int8"
AMPLITUDE_THRESHOLD = 0.01   # RMS below this = silence (tune if needed)

# ── Shared Model (loaded once) ────────────────────────────────────────────────
_model: WhisperModel | None = None

def _get_model() -> WhisperModel | None:
    global _model
    if _model is None:
        try:
            _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)
            print("[STT] Local Whisper model loaded.")
        except Exception as e:
            print(f"[STT] Could not load Whisper model: {e}")
    return _model


def listen_stream(partial_cb=None) -> str:
    """
    Captures microphone audio until 6-7 seconds of silence.

    Args:
        partial_cb: Optional callable(text: str) invoked for every new
                    transcription chunk so the UI can update in real time.

    Returns:
        The complete transcribed string.
    """
    model = _get_model()
    if model is None:
        return ""

    audio_queue: queue.Queue = queue.Queue(maxsize=200)
    audio_buffer: list[float] = []

    def audio_callback(indata: np.ndarray, frames: int, cb_time, status):
        if audio_queue.full():
            try:
                audio_queue.get_nowait()
            except queue.Empty:
                pass
        audio_queue.put_nowait(indata.copy())

    print("[STT] Active listening started...")

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=2048,
            latency="high",
            callback=audio_callback,
        ):
            last_stable_text = ""
            last_voice_time  = time.time()
            target_samples   = int(SAMPLE_RATE * CHUNK_WINDOW)

            while True:
                # ── Drain the audio queue into buffer ─────────────────────────
                while not audio_queue.empty():
                    try:
                        chunk = audio_queue.get_nowait()
                        audio_buffer.extend(chunk.flatten())
                    except queue.Empty:
                        break

                # ── Silence-based exit: nothing spoken yet ─────────────────────
                elapsed_silence = time.time() - last_voice_time
                if len(audio_buffer) < SAMPLE_RATE * 0.5:
                    if elapsed_silence > SILENCE_LIMIT and last_stable_text:
                        print("[STT] Silence timeout (sparse buffer). Done.")
                        break
                    time.sleep(0.08)
                    continue

                # ── Only transcribe once we have a full window ─────────────────
                if len(audio_buffer) < target_samples:
                    time.sleep(0.08)
                    continue

                audio_data = np.array(audio_buffer[-target_samples:], dtype=np.float32)

                # ── RMS-based silence detection (fast, no Whisper call) ────────
                rms = float(np.sqrt(np.mean(audio_data ** 2)))
                if rms < AMPLITUDE_THRESHOLD:
                    if elapsed_silence > SILENCE_LIMIT and last_stable_text:
                        print("[STT] Silence timeout (low RMS). Done.")
                        break
                    time.sleep(0.08)
                    continue

                # ── Whisper transcription ──────────────────────────────────────
                try:
                    segments, _ = model.transcribe(
                        audio_data,
                        beam_size=1,
                        language="en",
                        vad_filter=True,
                        vad_parameters=dict(min_silence_duration_ms=400),
                    )
                    current_text = "".join(s.text for s in segments).strip()
                except Exception as e:
                    print(f"[STT] Transcribe error: {e}")
                    break

                # ── Emit new text delta ────────────────────────────────────────
                if current_text and current_text != last_stable_text:
                    last_voice_time = time.time()

                    # Calculate what's new since last update
                    if current_text.startswith(last_stable_text):
                        delta = current_text[len(last_stable_text):]
                    else:
                        delta = current_text  # Full refresh (Whisper re-wrote)

                    if delta.strip() and partial_cb:
                        try:
                            partial_cb(current_text)   # Send full accumulated text
                        except Exception:
                            pass

                    last_stable_text = current_text

                elif last_stable_text:
                    # Stable text — check silence
                    if elapsed_silence > SILENCE_LIMIT:
                        print("[STT] Silence timeout (stable). Done.")
                        break

                time.sleep(0.08)

    except KeyboardInterrupt:
        print("\n[STT] Interrupted.")
    except Exception as e:
        print(f"[STT] Critical error: {e}")

    print(f"[STT] Final transcript: {last_stable_text!r}")
    return last_stable_text


if __name__ == "__main__":
    def on_partial(text):
        print(f"\r[Partial] {text}   ", end="", flush=True)

    try:
        result = listen_stream(partial_cb=on_partial)
        print(f"\n[Final] {result}")
    except KeyboardInterrupt:
        pass
