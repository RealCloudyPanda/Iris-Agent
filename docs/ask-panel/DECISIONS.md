# Ask panel — decision log

Fork of OpenMausBot pinned at upstream `c175749a` (2026-11-18, v0.1.169) on branch `companion`.
Method: grill-with-docs. Every row says whether it is a **user decision**, an **assumption**, or a **fact verified in
source / by a spike** (evidence in [SPIKES.md](SPIKES.md)).

Status legend: **Accepted** (user decided) · **Amended** (accepted, then changed by evidence — see note) ·
**Proposed** (needs the user's yes) · **Deferred** · **Impossible**.

## Rounds 1–2 (accepted before this fork existed)

| ID | Decision | Status |
|---|---|---|
| D01 | Fork OpenMausBot into one integrated Electron app | Accepted |
| D02 | Polished macOS demo first; Windows and Linux later | Accepted |
| D03 | Launch at login, stay in menu bar/tray, recover after sleep/wake; no claim of work during true sleep | Accepted |
| D04 | Capture the previously focused window only when explicitly requested | Accepted |
| D05 | Defining demo: ask about the screen, an existing MausBot bot answers | Accepted |
| D06 | Existing subscriptions only; no new billing or user-supplied API keys | Accepted |
| D07 | No hosted or new database; reuse local persistence | Accepted |
| D08 | "Self-improving" = remembered preferences and corrections, never self-modifying code | Accepted |
| D09 | Global shortcut opens a compact floating chat; Esc closes it | Accepted |
| D10 | Capture the previously focused window, manual picker as fallback | Accepted |
| D11 | Screenshot plus typed question; no local OCR | Accepted |
| D12 | One selected existing bot; its history is preserved | Accepted |
| D13 | Codex/ChatGPT first; Claude only via a verified compliant path | Accepted |
| D14 | Reuse MausBot alerts (approval, question, failure, meaningful finish) | Accepted |
| D15 | Text MVP; native speech output optional later | Accepted |
| D16 | Existing tools act only under existing approval safeguards; no second control engine | Accepted |
| D17 | Preview the screenshot before it is sent | Accepted |
| D18 | Benchmark idle CPU/RAM against stock; no idle capture or inference | Accepted |
| D19 | One local macOS demo with automated tests and a recorded walkthrough | Accepted |

## Round 3 (2026-11-18)

| ID | Decision | Status |
|---|---|---|
| D20 | A new focusable "Ask panel" reusing the Talk panel's look and main-process bridge; push-to-talk unchanged | Accepted |
| D21 | Own shortcut from a fixed list, default ⌃⌥A; if taken, Settings says so and the tray gains "Ask…" | Accepted (conflict-freedom of ⌃⌥A is an **assumption** until tested) |
| D22 | Asks go to a per-bot "Quick asks" conversation, visible in full MausBot | Accepted |
| D23 | Remember the last chosen bot across launches; default to the MausBot bot; switch only between sends | Accepted |
| D24 | Milestone 1 ships the window picker; Milestone 2 adds automatic previous-window detection, picker stays as fallback | Accepted |
| D25 | Preview is an inline chip above the input (click to enlarge, ✕ removes); Send is consent | Accepted |
| D26 | A sent screenshot is an ordinary deletable attachment; Cancel never writes to disk; downscale to a 2000 px long edge before upload | **Amended** — see "Evidence that changes decisions" |
| D27 | No approve buttons in the panel; it shows "Needs you · Open chat"; Esc hides, the turn continues | Accepted |
| D28 | "Include window" disabled with a reason unless the bot's engine is confirmed image-capable (Codex in MVP) | Accepted |
| D29 | Pin one upstream commit; delete `enterprise/`; separate demo data for dev and tests | Accepted (`enterprise/` deletion not done yet; it is its own task) |

## Round 4 (2026-11-18)

| ID | Decision | Status |
|---|---|---|
| D30 | Panel fixed 480 px wide, bottom-centre of the display under the cursor, grows to 360 px tall; not movable or resizable | Accepted |
| D31 | After Esc/Send, re-activate the app recorded at shortcut time; if it is gone, leave focus to macOS (until Milestone 2: macOS default) | Accepted |
| D32 | Panel shows only the current ask and its streamed reply plus "Open chat"; reopening within 10 min shows the last reply | Accepted |
| D33 | "Include window" off by default, ⌘I toggles it; text-only asks always work | Accepted |
| D34 | Picker lists windows only (thumbnail, app, title), never MausBot's own; previous window preselected once detection exists | Accepted |
| D35 | Screen Recording denied → inline message with a button to the Privacy pane; text asks still work | Accepted |
| D36 | While the panel shows a thread's reply, that thread's "finished" banner is suppressed; after Esc, normal banners | Accepted (existing suppression mechanism **not yet read**) |
| D37 | Budget method: stock vs fork, 10 min idle, 5 runs, CPU/RSS/wakeups; pass = CPU within measured noise, no RSS growth before first use, no added timers/listeners; warm shortcut→panel < 150 ms. Numbers fixed only after the baseline | Accepted |
| D38 | Accessibility minimum (VoiceOver labels, keyboard order, focus rings, reduced motion, upstream contrast check); test layers: `node --test` units, Vitest server tests with fake engine, hand-triggered live Codex test, written macOS manual checklist; one GitHub-hosted CI workflow, no provider calls | Accepted |
| D39 | Public fork `RealCloudyPanda/mausbot-companion`, clone at `~/Developer/mausbot-companion`, Node 24 via fnm (system Node untouched) | Accepted, done |
| D40 | No invisible/bidi Unicode in files *we* add or change, enforced by a CI check on the diff; upstream's existing functional uses stay untouched | **Proposed** (from the user's watermark request + "best practices") |

## Evidence that changes decisions

1. **D26 — the screenshot is stored in more places than "an attachment".** Spike E traced one image turn
   (SPIKES.md §E): the PNG lands in `attachments/<uuid>.png`, **and** its full base64 is kept in Codex's own session log
   under the data folder (`providers/codex-own/<hash>/codex/sessions/…/rollout-*.jsonl`), **and** text the model read
   from it reaches the conversation's event log, the native log, the bot's daily memory log and the memory journal.
   It was also sent to OpenAI. Deleting the message is therefore not known to erase the screenshot. Needs a Round 5
   decision; the privacy doc must say this plainly.
2. **D29 — a dev Electron build is not isolated from the installed app.** `~/Library/Application Support/openmausbot`
   (dev) and `…/OpenMausBot` (installed) are the **same directory** (same inode; macOS volumes are case-insensitive),
   so a dev window would share `credentials.bin`, window state and the single-instance lock with the real app.
   The server is isolated by `OMB_DATA_DIR`, the Electron shell is not. Dev Electron must not be launched until an
   isolation method is verified.
3. **D16 / acceptance test 9 — new bots default to full access.** In a fresh data folder the default MausBot bot is
   `approvalMode: "full"`, and a bot created through `POST /api/bots` takes the saved template (full) unless
   `settings.approvalMode` is given. The demo bot must be set to `ask` explicitly, and the approval test must use it.
4. **Dev-mode auth is weaker than packaged.** The dev server logs
   `OMB_DEV_TRUST_LOCAL_BROWSER=1: browsers on this machine act as the owner (development only)`, and the owner header is
   only added when packaged (`electron/desktop-server-auth.cjs`). Any claim that the panel cannot reach the server
   from its renderer must be proven against a packaged build.

## Requirements status

- **Resolved:** D01–D39.
- **Unresolved (Round 5):** screenshot retention given Evidence 1; dev Electron isolation method; error-state wording;
  demo script; Milestone 1 task order; D40.
- **Deferred:** Claude engine, native speech, voice input, Windows, Linux, per-app exclusions.
- **Impossible:** none found. Claude stays deferred by choice: Anthropic's compliance page does not prevent a user
  signing in to the unmodified Claude Code binary, but D13 puts Codex first.

## Sources

- Upstream: https://github.com/milind-soni/OpenMausBot at `c175749a`
- OpenAI, Sign in with ChatGPT for open-source apps: https://developers.openai.com/siwc/token-sharing-open-source
- Anthropic, Claude Code legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
