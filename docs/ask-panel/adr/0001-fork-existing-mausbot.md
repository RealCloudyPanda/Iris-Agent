# ADR 0001: Extend a MausBot fork rather than build a second agent runtime

Status: Accepted (D01), confirmed by Spike B · Date: 2026-11-17, updated 2026-11-18

## Context

The requested product overlaps heavily with OpenMausBot: bots, engine sign-ins, conversations, notifications, memory,
tools and approvals. A separate app would need its own authorized way into MausBot's local server, which in packaged
builds deliberately trusts only its own Electron window (owner header added by Chromium, `electron/server-session.mjs`).

Verified since: upstream already has a global shortcut, a floating panel, a "Quick asks" conversation and a streamed
reply tracker (`electron/talk-*.mjs`), plus an image path that reaches Codex (`server/drivers/codex-images.ts`).
Spike B sent a real screenshot through those unmodified routes to a ChatGPT-backed Codex bot and got a correct answer.

## Decision

Fork OpenMausBot, pin one upstream commit, and add the Ask panel inside the existing app as new modules with small hooks
into existing files. Keep feature docs under `docs/ask-panel/` so upstream syncs rarely conflict.

## Consequences

- No second server, database, credential store or engine integration.
- Upstream is large (about 8.7k files) and merges daily; we sync deliberately, not continuously.
- `electron/main.mjs` is held under a line-count limit by a test, so feature code must live in its own files.
- `enterprise/` is not Apache-2.0; D29 removes it from the fork.

## Alternatives considered

1. A separate companion app talking to installed MausBot — rejected: it would need to break or duplicate the owner
   capability.
2. A separate agent runtime — rejected: duplicates orchestration, sign-ins and history.

## Revisit if

Upstream offers an extension point for desktop surfaces, or accepts the Ask panel upstream.
