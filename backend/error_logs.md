# JARVIS Error & Defect Log

This document tracks system failures, logic flaws, and user-reported bugs encountered during the development of JARVIS v2.0.

## 1. System Integration Errors
- **Arc Browser Launch Failure**: Systems were defaulting to Chrome/Edge even when Arc was requested because Arc (UWP) was not in the system PATH. 
  - *Status*: Resolved via Registry 'App Paths' lookup.
- **Calculator Logic Mismatch**: Requesting "open calculator" failed to trigger the `.exe` because of naming variations between versions (`calc` vs `calculator`).
  - *Status*: Resolved (Switched to `ms-calculator:` UWP protocol).
- **WhatsApp "Search Me" Logic**: User's request to "search" a contact was misinterpreted as sending the word "search" as a message.
  - *Status*: Resolved (Empty message handling added).

## 2. Interaction & UI Defects
- **JSON Bleed**: Internal JSON command blocks were leaking into the chat bubble text.
  - *Status*: Resolved (Implemented bracket-balancing parser).
- **Focus Loss**: Text input cursor disappeared after sending a message, requiring manual clicks.
  - *Status*: Resolved (Frontend force-focus implemented).
- **Symbol Phonation**: TTS was reading out technical symbols/JSON characters during dialogue.
  - *Status*: Improved (Filtering rules added to agent response generation).
- **Streaming Delay**: Voice playback felt out of sync with text generation.
  - *Status*: Resolved (Implemented sentence-level streaming TTS with concurrent generation).
- **Vision Blindness**: Verification failed if window focus was slightly off.
  - *Status*: Resolved (Added OCR-based screenshot verification fallback).
- **Ollama Startup Warnings**: Scary warnings if port 11434 was closed.
  - *Status*: Resolved (Silent health-check logic added).

## 3. Stability & Logic Flaws
- **Infinite Loop Timeouts**: When an OS task failed, JARVIS would endlessly retry the same failed instruction, hitting API time/rate limits.
  - *Status*: Resolved (Hard iteration limit & Anti-Loop gate added in LangGraph).
- **Skill Hallucination**: JARVIS claimed to perform tasks (like creating files or folders) that he had no code-level skill to execute.
  - *Status*: Resolved (Native `create_folder` and `create_file` skills registered and implemented).
- **Action Parroting**: LLM was parroting backend `[CRITICAL]` results back to the user instead of interpreting them.
  - *Status*: Resolved (Shifted execution results to HumanMessage context).

## 4. Pending Infrastructure Tasks
- [ ] Implement local vector memory for persistent long-term recall.
- [ ] Optimize Whisper STT latency (Tiny model / GPU).
