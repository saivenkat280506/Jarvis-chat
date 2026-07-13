"""
brain/ — JARVIS Intelligence Module
===================================
Exports key components for easy importing.
"""

from brain.router import route_command
from brain.llm_brain import decide_action
from brain.context_manager import get_current_context, resolve_pronouns
from brain.memory import add_to_history, save_memory, get_memory
from brain.responses import get_response
from brain.personality import respond_start, respond_success, respond_fail, respond_background, respond_cancel, respond_processing
from brain.settings import get_settings, toggle_mute, is_muted

__all__ = [
    "route_command",
    "decide_action",
    "get_current_context",
    "resolve_pronouns",
    "add_to_history",
    "save_memory",
    "get_memory",
    "get_response",
    "respond_start",
    "respond_success",
    "respond_fail",
    "respond_background",
    "respond_cancel",
    "respond_processing",
    "get_settings",
    "toggle_mute",
    "is_muted",
]