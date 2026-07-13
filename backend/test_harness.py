"""
test_harness.py — Jarvis Module-by-Module Test Runner
======================================================
Tests each Jarvis module individually, verifies functionality,
and produces a detailed report with logs.
"""

import os
import sys
import time
import datetime

# Add backend to path
BACKEND_DIR = os.path.dirname(__file__)
sys.path.insert(0, BACKEND_DIR)

# Logging setup
LOG_FILE = os.path.join(os.path.dirname(__file__), "test_results.log")

def log(msg):
    """Write to log file and print."""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)

def log_section(title):
    log("\n" + "="*60)
    log(f"  {title}")
    log("="*60)

def result(module, test_input, expected, actual, status, error=None):
    """Print and log test result and return boolean."""
    log(f"\n--- TEST RESULT: {module} ---")
    log(f"Test Input:    {test_input}")
    log(f"Expected:      {expected}")
    log(f"Actual:        {actual}")
    log(f"Status:        {status}")
    if error:
        log(f"Error:         {error}")
    return status == "PASS"

def run_test(module_name, test_func, *args, **kwargs):
    """Execute a single test with error handling."""
    log(f"\n>>> Running test for: {module_name}")
    try:
        result_val = test_func(*args, **kwargs)
        return result_val
    except Exception as e:
        log(f"EXCEPTION in {module_name}: {str(e)}")
        return False, str(e)

# ══════════════════════════════════════════════════════════════════════════════
# TEST MODULES
# ══════════════════════════════════════════════════════════════════════════════

def test_responses():
    """Test brain/responses.py - Simple response lookup."""
    log_section("TESTING: brain/responses.py")
    try:
        from brain.responses import get_response
        test_input = "standby"
        expected = "At your service."
        actual = get_response("standby")
        status = "PASS" if actual and "service" in actual.lower() else "FAIL"
        return result("responses.get_response", test_input, expected, actual[:50] if actual else "None", status)
    except Exception as e:
        return result("responses.get_response", "N/A", "function loads", "import failed", "FAIL", str(e))

def test_router():
    """Test brain/router.py - Intent routing."""
    log_section("TESTING: brain/router.py")
    try:
        from brain.router import route_command
        
        # Test 1: YouTube intent
        test_input = "play song on youtube"
        expected = "play_youtube_music"
        intent, params = route_command(test_input)
        status = "PASS" if intent == "play_youtube_music" else "FAIL"
        ok1 = result("router (YouTube)", test_input, expected, intent, status)
        
        # Test 2: Search intent
        test_input = "search for python"
        expected = "search_browser"
        intent2, params2 = route_command(test_input)
        status2 = "PASS" if intent2 == "search_browser" else "FAIL"
        ok2 = result("router (Search)", test_input, expected, intent2, status2)
        
        return ok1 and ok2
    except Exception as e:
        return result("router", "N/A", "module loads", "import failed", "FAIL", str(e))

def test_open_app():
    """Test executor/open_app.py - App launching."""
    log_section("TESTING: executor/open_app.py")
    try:
        from executor.open_app import open_app
        
        # Test generic app (notepad) - may not launch but should not error
        test_input = "notepad"
        expected = "tuple (success, message)"
        success, msg = open_app(test_input)
        actual = f"success={success}, msg={msg[:30]}..."
        status = "PASS" if isinstance(success, bool) and isinstance(msg, str) else "FAIL"
        return result("open_app (generic)", test_input, expected, actual, status)
    except Exception as e:
        return result("open_app", "N/A", "function works", "failed", "FAIL", str(e))

def test_automation_google():
    """Test executor/automation.py - Google search."""
    log_section("TESTING: executor/automation.py (search_google)")
    try:
        from executor.automation import search_google
        
        test_input = "test query"
        expected = "tuple (success, message)"
        success, msg = search_google(test_input)
        actual = f"success={success}, msg={msg[:30]}..."
        status = "PASS" if isinstance(success, bool) and isinstance(msg, str) else "FAIL"
        return result("search_google", test_input, expected, actual, status)
    except Exception as e:
        return result("search_google", "N/A", "function works", "failed", "FAIL", str(e))

def test_automation_youtube():
    """Test executor/automation.py - YouTube."""
    log_section("TESTING: executor/automation.py (play_youtube)")
    try:
        from executor.automation import play_youtube
        
        test_input = "test song"
        expected = "tuple (success, message)"
        success, msg = play_youtube(test_input)
        actual = f"success={success}, msg={msg[:30]}..."
        status = "PASS" if isinstance(success, bool) and isinstance(msg, str) else "FAIL"
        return result("play_youtube", test_input, expected, actual, status)
    except Exception as e:
        return result("play_youtube", "N/A", "function works", "failed", "FAIL", str(e))

def test_automation_ytmusic():
    """Test executor/automation.py - YouTube Music."""
    log_section("TESTING: executor/automation.py (play_yt_music)")
    try:
        from executor.automation import play_yt_music
        
        test_input = "lofi"
        expected = "tuple (success, message)"
        success, msg = play_yt_music(test_input)
        actual = f"success={success}, msg={msg[:30]}..."
        status = "PASS" if isinstance(success, bool) and isinstance(msg, str) else "FAIL"
        return result("play_yt_music", test_input, expected, actual, status)
    except Exception as e:
        return result("play_yt_music", "N/A", "function works", "failed", "FAIL", str(e))

def test_automation_whatsapp():
    """Test executor/automation.py - WhatsApp Desktop."""
    log_section("TESTING: executor/automation.py (open_whatsapp)")
    try:
        from executor.automation import open_whatsapp
        
        test_input = "N/A"
        expected = "tuple (success, message)"
        success, msg = open_whatsapp()
        actual = f"success={success}, msg={msg[:50]}..."
        status = "PASS" if isinstance(success, bool) and isinstance(msg, str) else "FAIL"
        return result("open_whatsapp", test_input, expected, actual, status)
    except Exception as e:
        return result("open_whatsapp", "N/A", "function works", "failed", "FAIL", str(e))

def test_tts():
    """Test tts/tts.py - Text-to-Speech (dry run only)."""
    log_section("TESTING: tts/tts.py")
    try:
        from tts.tts import speak
        
        # Test 1: Check if piper executable exists
        from tts import tts
        test_input = "test"
        expected = "speaks or returns early if no model"
        
        # Don't actually speak - just verify the function can be called
        # We check if the module loaded and has the speak function
        actual = "speak function exists" if callable(speak) else "speak not callable"
        status = "PASS" if actual == "speak function exists" else "FAIL"
        return result("tts.speak", test_input, expected, actual, status)
    except FileNotFoundError as e:
        # This is expected if piper is not installed - mark as SKIP
        return result("tts.speak", "N/A", "piper installed", "file not found", "SKIP", str(e))
    except Exception as e:
        return result("tts.speak", "N/A", "function works", "failed", "FAIL", str(e))

def test_stt():
    """Test stt/stt.py - Speech-to-Text (import test only)."""
    log_section("TESTING: stt/stt.py")
    try:
        from stt.stt import listen_stream
        
        test_input = "N/A"
        expected = "generator function"
        actual = "listen_stream is callable" if callable(listen_stream) else "not callable"
        status = "PASS" if actual == "listen_stream is callable" else "FAIL"
        return result("stt.listen_stream", test_input, expected, actual, status)
    except Exception as e:
        return result("stt.listen_stream", "N/A", "imports correctly", "failed", "FAIL", str(e))

def test_wake():
    """Test stt/wake.py - Wake word detection (import test only)."""
    log_section("TESTING: stt/wake.py")
    try:
        from stt.wake import wait_for_wake_word
        
        test_input = "N/A"
        expected = "function exists"
        actual = "wait_for_wake_word is callable" if callable(wait_for_wake_word) else "not callable"
        status = "PASS" if actual == "wait_for_wake_word is callable" else "FAIL"
        return result("stt.wake.wait_for_wake_word", test_input, expected, actual, status)
    except Exception as e:
        return result("stt.wake", "N/A", "imports correctly", "failed", "FAIL", str(e))

def test_error_handler():
    """Test executor/error_handler.py."""
    log_section("TESTING: executor/error_handler.py")
    try:
        from executor.error_handler import log_error
        
        test_input = "test error"
        expected = "success"
        try:
            log_error(test_input, ValueError("Test Triggered Error"))
            actual = "success"
            status = "PASS"
        except Exception as e:
            actual = f"error: {e}"
            status = "FAIL"
        return result("error_handler.log_error", test_input, expected, actual, status)
    except ImportError:
        return result("error_handler", "N/A", "module exists", "not found", "SKIP")
    except Exception as e:
        return result("error_handler", "N/A", "works", "failed", "FAIL", str(e))

# ══════════════════════════════════════════════════════════════════════════════
# MAIN TEST RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def main():
    """Run all module tests sequentially."""
    log("\n" + "="*60)
    log("  JARVIS MODULE TEST HARNESS")
    log(f"  Started: {datetime.datetime.now()}")
    log("="*60)
    
    # Clear previous log
    with open(LOG_FILE, "w") as f:
        f.write("")
    
    # Test order
    tests = [
        ("1. responses.py", test_responses),
        ("2. router.py", test_router),
        ("3. open_app.py", test_open_app),
        ("4. automation.py (Google)", test_automation_google),
        ("5. automation.py (YouTube)", test_automation_youtube),
        ("6. automation.py (YT Music)", test_automation_ytmusic),
        ("7. automation.py (WhatsApp)", test_automation_whatsapp),
        ("8. tts.py", test_tts),
        ("9. stt.py", test_stt),
        ("10. wake.py", test_wake),
        ("11. error_handler.py", test_error_handler),
    ]
    
    results = []
    passed = 0
    failed = 0
    skipped = 0
    
    for name, test_func in tests:
        log_section(f"Running: {name}")
        try:
            ok = test_func()  # This now returns True/False or "PASS"/"SKIP"
            
            # Determine status
            if ok == "PASS" or ok == True:
                results.append((name, "PASS", ""))
                passed += 1
            elif ok == "SKIP":
                results.append((name, "SKIP", "Not applicable"))
                skipped += 1
            else:
                results.append((name, "FAIL", "Test returned False"))
                failed += 1
        except Exception as e:
            results.append((name, "FAIL", f"Exception: {str(e)}"))
            failed += 1
            log(f"CRITICAL ERROR in {name}: {e}")
    
    # Final Summary
    log_section("FINAL TEST SUMMARY")
    log(f"Total Tests: {len(tests)}")
    log(f"Passed:      {passed}")
    log(f"Failed:      {failed}")
    log(f"Skipped:     {skipped}")
    
    log("\n--- DETAILED RESULTS ---")
    for name, status, msg in results:
        log(f"{name:30} | {status:6} | {msg}")
    
    # Urgent fixes
    if failed > 0:
        log("\n!!! URGENT FIXES NEEDED !!!")
        for name, status, msg in results:
            if status == "FAIL":
                log(f"- {name}: {msg}")
    
    log(f"\nTest completed at: {datetime.datetime.now()}")
    log(f"Log saved to: {LOG_FILE}")
    
    return passed, failed, skipped

if __name__ == "__main__":
    main()