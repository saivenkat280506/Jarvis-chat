# JARVIS v2.0 — Debug & Solution Plan

This document is derived from the problem inventory in `conversation_cases.md`, aligned where applicable with `error_logs.md`. It describes **how to debug** each class of failure and a **sequenced plan** to restore intended flow. **No implementation code** — planning and verification steps only.

---

## 1. Scope & goals

**Primary goal:** Close the gap between *intended behavior* (per conversation cases) and *actual behavior*, with measurable verification for each case ID (V-*, H-*, C-*).

**Secondary goal:** Prevent regression on issues already marked resolved in logs (Arc, WhatsApp send path, JSON bleed, focus, anti-loop, action parroting) by defining regression checks, not by assuming “fixed forever” without tests.

---

## 2. Problem inventory (from conversation cases)

| Area | Case / theme | Symptom | Severity |
|------|----------------|--------|----------|
| Hands | H-02 | Calculator launch fails or is inconsistent (`calc` vs `calculator` / store vs classic). | High (frequent user ask) |
| Hands | H-03 | Folder creation promised or implied without a real skill → hallucination or silent failure. | Critical (trust) |
| Comms | C-01 | “Search for X in WhatsApp” treated as sending the word “search” (or wrong payload). | High |
| Cross-cutting | Skill hallucination | Agent claims file/folder capabilities not backed by `skills_registry.json` / code. | Critical |
| Cross-cutting | JSON bleed | Internal JSON/command text visible in chat. | Medium (UX) — *reported resolved; verify* |
| Cross-cutting | Action parroting | Raw `[CRITICAL]` / backend strings spoken or shown to user. | Medium — *reported resolved; verify* |
| Cross-cutting | Infinite retry | LangGraph retries failed UI actions without bound. | High — *reported mitigated; verify under load* |
| Vision | V-01 / V-02 | Listed functional; low risk unless regressions appear. | Monitor |

---

## 3. Debug methodology (reusable)

Use this order for each red-flag class:

1. **Reproduce with minimal utterance** — Same intent, shorter phrasing (e.g. “search Nishanth WhatsApp” vs full sentence) to see if failure is NLP vs tool wiring.
2. **Separate layers** — Confirm: (a) intent classification, (b) skill/tool selection, (c) parameter extraction, (d) execution, (e) response formatting/TTS.
3. **Log once per layer** — For a single run: what intent was chosen, which skill ran, raw tool result, what was sent to the UI/TTS. Compare to expected pipeline in `conversation_cases.md` §1 roadmap.
4. **Golden utterances** — Keep a small list of fixed test phrases per case ID; after any change, run the list and tick pass/fail.
5. **Negative tests** — Phrases that should *not* trigger send-message when user asked for search-only; phrases that should *not* claim folder creation without skill.

---

## 4. Solution plan by theme

### 4.1 H-03 & skill hallucination (critical path)

**Debug focus**

- Confirm whether `skills_registry.json` (and matching code paths) actually expose `create_folder` / `create_file` (or equivalent) with Desktop path handling and permissions.
- Trace one user request end-to-end: does the planner select a real tool, or does the LLM narrate success without a tool call?

**Plan**

1. **Inventory** — List advertised capabilities in system prompt, registry, and UI copy; mark anything not implemented as “must not claim.”
2. **Implement or gate** — Either add native folder/file skills with clear contracts (paths, errors, success), **or** remove/hide those intents until implemented (capability gating beats silent failure).
3. **Align registry + prompt** — Single source of truth: only listed tools are described to the model as available.
4. **Verification** — H-03: “Create folder `Project Jarvis` on Desktop” → folder exists; no success message if tool did not run; user sees explicit error on failure.

**Exit criteria:** No successful-sounding assistant message for folder/file actions unless the corresponding tool executed and returned success; failed runs produce user-safe explanations, not raw stack traces.

---

### 4.2 H-02 — Calculator / Windows app alias resolution

**Debug focus**

- Reproduce with: “open calculator,” “launch calc,” “open Windows Calculator.” Note which resolution path is used (PATH, Start Menu, alias table).
- Identify whether failure is shell command name, UWP vs Win32 package, or 32/64-bit path.

**Plan**

1. **Centralize app resolution** — One module responsible for “human name → executable / app user model ID,” with logging of the resolved target.
2. **Alias map** — Maintain explicit entries for high-traffic apps (`calculator` → `calc.exe` or the correct UWP/AppID, consistent with how other apps like Arc were fixed).
3. **Fallback order** — e.g. alias → PATH → App Paths registry → Start Menu / known locations (match patterns already used for Arc where appropriate).
4. **Verification** — H-02 passes on a clean session after reboot (no reliance on a previous manual fix).

---

### 4.3 C-01 — WhatsApp search vs send intent

**Debug focus**

- Inspect intent labels and examples: is “search for X” mapped to `send_message` or a dedicated `search_contact` / navigation flow?
- Check whether “search” is passed as message body due to tokenizer/prompt ambiguity.

**Plan**

1. **Intent taxonomy** — Distinct intents: `whatsapp_search_contact`, `whatsapp_send_message`, optionally `whatsapp_open_chat`. No shared ambiguous handler that defaults to “type in chat.”
2. **Training / prompt examples** — Add few-shots or structured rules: “search” + name → search UI path; “send” / “say” / “tell” → compose message path.
3. **Parameter extraction** — Separate slots: `contact_name`, `message_body`, `action_type`. Reject or clarify if `action_type` conflicts with wording.
4. **Verification** — C-01: WhatsApp opens search field, query is contact name, **no** message sent. C-02 remains: send “hi” to John still works.

**Note:** `error_logs.md` mentions empty-message handling for a related issue; C-01 still needs explicit search-vs-send coverage in intent tests.

---

### 4.4 JSON bleed & UI sanitization

**Debug focus**

- Capture a response that leaked JSON; verify whether leak is from model output, middleware, or frontend rendering.

**Plan**

1. **Regression tests** — Fixed inputs that previously leaked; assert chat bubble contains no raw `{`…`}` tool blocks or internal schemas.
2. **Bracket-balancing / strip pass** — If already implemented, document invariants and add tests for edge cases (nested braces, code blocks).

**Exit criteria:** No internal command representation visible in user-facing chat or TTS (see also TTS filtering in `error_logs.md`).

---

### 4.5 Action parroting & human-readable outcomes

**Debug focus**

- Confirm execution results land in `HumanMessage` / tool-result channel, not as raw text for the model to repeat verbatim to the user.

**Plan**

1. **Contract for tool results** — Structured fields: `user_message`, `internal_detail`, `severity`. UI and summarization only use `user_message`.
2. **Verification** — Inject a `[CRITICAL]` backend result; assistant reply must paraphrase or guide next steps without echoing internal tags.

---

### 4.6 Infinite loop / retry storms

**Debug focus**

- Stress-test failed UI actions: confirm iteration cap and “anti-loop gate” trigger; ensure user gets a single clear failure outcome.

**Plan**

1. **Confirm limits** — Document max retries, backoff, and when the graph exits to a “give up + explain” node.
2. **Verification** — Simulate repeated failure (wrong window title); run must terminate within bounded steps and not exhaust API quota.

---

### 4.7 Vision (V-01, V-02)

**Plan**

- Light monitoring: occasional regression runs for “what’s open” / “what’s on screen” after changes to capture pipeline or OCR dependencies.

---

## 5. Sequenced rollout (recommended order)

| Phase | Focus | Rationale |
|-------|--------|-----------|
| **P0** | H-03 + hallucination gating | Restores trust; blocks worst user-facing failure mode |
| **P1** | C-01 WhatsApp search vs send | High-impact mis-route; narrow intent surface |
| **P2** | H-02 calculator / app aliases | Frequent friction; localized fix |
| **P3** | Regression harness for JSON bleed, parroting, loops | Protect fixes already claimed in `error_logs.md` |
| **P4** | Vision spot-checks | Lower risk unless capture stack changes |

---

## 6. Acceptance checklist (case IDs)

- **H-03:** Folder appears on Desktop when requested; no false success; errors are safe and clear.
- **H-02:** Calculator opens reliably via natural phrasing.
- **C-01:** Search-only requests never send accidental message content.
- **C-02:** Send message still works (no regression).
- **Cross:** No JSON in chat; no raw `[CRITICAL]` to user; bounded retries on failed automation.

---

## 7. Risks & dependencies

- **WhatsApp UI changes** — Desktop layout updates can break pywinauto selectors; plan may need periodic selector audits.
- **UWP vs Win32** — App resolution for Calculator and others must match how Windows exposes each build (Store vs classic).
- **Prompt vs code** — Fixing hallucination purely in prompt without registry alignment will relapse; registry and prompts must stay synchronized.

---

## 8. What this file does *not* include

- No source code, pseudocode, or patch snippets — only debugging steps, sequencing, and verification targets aligned with `conversation_cases.md`.
