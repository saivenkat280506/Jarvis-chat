"""
hybrid_tts.py — Hybrid Voice Controller
=======================================
Routes speech to Pocket TTS with Jarvis voice clone.
"""
import asyncio
import os
import re

# Global state for single execution enforcement
_is_speaking = False
_current_response_id = None

def clean_text_for_speech(text: str) -> str:
    """Trim formatting noise so the cloned voice stays natural."""
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

async def speak_hybrid(text: str, is_smart: bool = False, response_id: str = None):
    """
    Ensures TTS runs exactly once per response.
    Uses Pocket TTS with Jarvis voice clone.
    """
    global _is_speaking, _current_response_id
    
    # BLOCK EMPTY / PARTIAL CALLS
    clean_text = clean_text_for_speech(text.strip()) if text else ""
    if not clean_text or len(clean_text) < 5 or clean_text in ["...", "."]:
        print(f"[Hybrid TTS] Blocked: Invalid response length or content.")
        return

    # TTS ENTRY GUARD
    if _is_speaking:
        print("[Hybrid TTS] Blocked: Already speaking.")
        return

    if response_id and response_id == _current_response_id:
        print(f"[Hybrid TTS] Blocked: Duplicate response ID {response_id}")
        return

    from brain.settings import is_muted
    if is_muted():
        return

    try:
        _is_speaking = True
        _current_response_id = response_id
        
        print(f"[Hybrid TTS] Speaking: {clean_text[:50]}...")
        
        # Use Pocket TTS with Jarvis voice
        from tts.pocket_tts import speak as pocket_speak
        await asyncio.to_thread(pocket_speak, clean_text)
                
    except Exception as e:
        print(f"[Hybrid TTS] Execution failed: {e}")
        # Fallback to Edge TTS if Pocket TTS fails
        try:
            import tempfile
            from edge_tts import Communicate
            import pygame
            
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
                temp_mp3 = tmp_file.name

            communicate = Communicate(clean_text, "en-US-GuyNeural")
            await communicate.save(temp_mp3)
            
            if not pygame.mixer.get_init():
                pygame.mixer.pre_init(44100, -16, 2, 512)
                pygame.mixer.init()
            
            pygame.mixer.music.load(temp_mp3)
            pygame.mixer.music.play()
            
            while pygame.mixer.music.get_busy():
                await asyncio.sleep(0.05)
                
            pygame.mixer.music.unload()
            
            try:
                if os.path.exists(temp_mp3):
                    os.remove(temp_mp3)
            except Exception:
                pass
        except Exception as fallback_error:
            print(f"[Hybrid TTS] Fallback also failed: {fallback_error}")
    finally:
        _is_speaking = False
