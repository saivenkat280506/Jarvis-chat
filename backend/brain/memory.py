"""
memory.py — Simple Short-Term Memory
===================================
Stores recent interactions to provide context.
"""

import json
import os

# Use backend directory for consistent path
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEMORY_FILE = os.path.join(_BASE_DIR, "..", "jarvis_memory.json")

def _load_memory():
    mem_path = os.path.normpath(MEMORY_FILE)
    if os.path.exists(mem_path):
        try:
            with open(mem_path, "r") as f:
                return json.load(f)
        except:
            pass
    return {"history": [], "last_contact": None, "last_song": None}

def save_memory(key, value):
    """Saves a value to memory."""
    mem = _load_memory()
    mem[key] = value
    mem_path = os.path.normpath(MEMORY_FILE)
    with open(mem_path, "w") as f:
        json.dump(mem, f)

def get_memory(key):
    """Retrieves a value from memory."""
    mem = _load_memory()
    return mem.get(key)

def add_to_history(command):
    """Keeps track of last 5 commands."""
    mem = _load_memory()
    history = mem.get("history", [])
    history.append(command)
    if len(history) > 5:
        history = history[-5:]
    mem["history"] = history
    mem_path = os.path.normpath(MEMORY_FILE)
    with open(mem_path, "w") as f:
        json.dump(mem, f)
