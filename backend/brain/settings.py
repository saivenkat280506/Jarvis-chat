import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

def get_settings():
    if not os.path.exists(SETTINGS_FILE):
        return {"muted": False}
    try:
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    except:
        return {"muted": False}

def save_settings(settings):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f)

def is_muted():
    return get_settings().get("muted", False)

def toggle_mute():
    settings = get_settings()
    settings["muted"] = not settings.get("muted", False)
    save_settings(settings)
    return settings["muted"]
