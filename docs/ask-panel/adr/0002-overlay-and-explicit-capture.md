# ADR 0002: A shortcut-opened panel with explicit, previewed capture

Status: Accepted (D04, D09, D10, D17, D20–D28, D30–D35); retention amended by evidence · Date: 2026-11-17, updated 2026-11-18

## Context

A continuously watching assistant costs privacy, energy and portability. The defining demo only needs one question
about the person's current work. Opening a panel can steal focus from the window the person wants to capture, and
Electron cannot say which window was frontmost. A screenshot can contain secrets, and Spike E showed it persists in
several local places and is sent to OpenAI.

## Decision

- A global ask shortcut opens a focusable, sandboxed Ask panel; Esc hides it.
- Capturing a window happens only after the person turns on "Include window"; the capture is shown inline and is sent
  only with Send. Cancel or ✕ discards it without writing to disk.
- Milestone 1 uses a window picker; Milestone 2 adds detection of the previous window by a small native helper, with
  the picker kept as fallback.
- The panel never calls MausBot's server from its page; the main process does, so the owner capability never reaches
  page code.
- The panel never approves anything; approvals stay in the full app.

## Consequences

- Needs tests for focus, permission denial, multiple displays and cancellation on a real Mac.
- No idle capture, OCR, video, new backend or new provider.
- Retention is not "delete the message and it is gone": the image also lives in Codex's own session log and its
  content can enter bot memory (DECISIONS.md, Evidence 1). The privacy document must say so; a retention decision is
  pending.

## Alternatives considered

- Always-on capture or vision loop — rejected for privacy and energy.
- Modal confirm dialog — rejected for an inline chip (D25).
- Sending to every bot — rejected (D12).
