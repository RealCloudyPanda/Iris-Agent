# Ask panel: privacy and security

Evidence kinds as in [SPIKES.md](SPIKES.md): **code** (read in source), **unit**, **live**, **manual**.

## Screen Recording (macOS TCC)

- Capture runs only if `systemPreferences.getMediaAccessStatus("screen") === "granted"` on macOS
  (`electron/ask-capture.mjs`, `permitted()`); otherwise `pickWindows` returns `{ error: "screen-permission" }` and
  the panel shows a button that opens `x-apple.systempreferences:…Privacy_ScreenCapture` (D35). Text asks still work.
- Capture only happens when the person turns on "Include window" and picks a window (D33); there is no idle or
  background capture. The app's own windows are left out of the picker (`withoutOwnWindows`).
- The Swift helper reads `CGWindowListCopyWindowInfo` (`electron/frontmost-window.swift`); its result stays in main's
  memory (`electron/frontmost-window.mjs` header).

## Screenshot lifecycle

| Stage | Where | Evidence |
|---|---|---|
| Capture | main-process memory only, PNG downscaled to a 2000 px long edge; renderer gets a 240 px preview | code: `electron/ask-capture.mjs` |
| Cancel / clear / hide / close | buffer dropped, nothing written; a capture finishing after the person let go is discarded | code + unit: `electron/ask-main.mjs` (`generation`), `electron/ask-main.node-test.mjs` |
| Send to a non-Codex thread | refused before upload (`image-engine`) | unit: `electron/ask-main.node-test.mjs` |
| Send | `attachments/<uuid>.png` (mode 0600) in the data folder | live: SPIKES.md §E |
| Codex turn | base64 copy in `providers/codex-own/<hash>/codex/sessions/…/rollout-*.jsonl`, written by Codex | live: SPIKES.md §E |
| Model reads it | text derived from it in `events/<thread>.ndjson`, `native/<thread>.ndjson` (inline image bytes removed by `withoutInlineImages`, `server/drivers/codex-images.ts`), and possibly the bot's `memory/log/<date>.md` and `memory-journal/<bot>.ndjson` | live: SPIKES.md §E |
| Provider | sent to OpenAI as a data URL in `turn/start` | live: SPIKES.md §E; outside our control |

## D41: what deleting the conversation removes

Deleting a thread (`DELETE /api/bots/:id/tasks/:threadId`, `server/routes/tasks.ts:411`) runs
`deleteTasks` (`server/routes/tasks.ts:104`) and `store.deleteTasks` (`server/store.ts:2236`). Evidence is **code**
plus upstream unit tests (`server/host/delete-leftovers.test.ts`); **not verified** by a live delete on this machine.

| Copy | Removed? | Evidence |
|---|---|---|
| Message rows, thread state, follow-ups, notification log in SQLite | yes | `server/message-db.ts:651-662` |
| `events/<thread>.ndjson`, `native/<thread>.ndjson`, message files | yes | `server/store.ts:865-878` (`deleteThreadRecord`) |
| `attachments/<uuid>.png` named in the thread's messages | yes, unless another conversation, a picture, a routine or a pending turn still names it | `server/host/delete-leftovers.ts:224-259`, test lines 87-133 |
| Codex rollout under `providers/codex-own/*/codex/sessions` (and `~/.codex`, `CODEX_HOME`) | yes, unless a remaining conversation resumes the same session | `server/host/delete-leftovers.ts:170-188, 261-275`, test lines 153-192 |
| `box-uploads/<bot>/<thread>` | yes | `server/host/delete-leftovers.ts:277-280` |
| Bot daily memory log `workspaces/<bot>/memory/log/<date>.md` and `memory-journal/<bot>.ndjson` | **no**; memory layers are removed only when the bot is deleted | `server/host/delete-leftovers.ts:1-4, 282-291` |
| Copy at OpenAI | not controllable from the app | none |

The cleanup runs after the delete commits (`defer`, `flush`, `server/host/delete-leftovers.ts:293-323`), and failures
are logged as warnings, not raised.

## D42: excluding Quick asks from memory

There is **no per-conversation setting**. The only switch is per bot: `memoryEnabled` (PATCH accepted at
`server/routes/bot-patch.ts:320-326`). When it is `false`, the memory write and log routes refuse with
"Memory is disabled for this bot." (`server/index.ts:12978-12979`), turn journaling is skipped
(`server/index.ts:7893`) and recall is off (`server/index.ts:1158`). The daily log is written by the model through
`POST /api/internal/memory/log` (`server/index.ts:12998`, tool text in `server/drivers/agents-catalog.ts:549`).
Workaround with existing settings: use a dedicated Ask bot with `memoryEnabled: false`.

## Approvals cannot be bypassed from the panel

- The panel has no approve, reject or answer channel; the IPC list is fixed in `registerAskIpc`
  (`electron/ask-main.mjs`) and the preload (`electron/ask-panel-preload.cjs`).
- A waiting approval (`request.opened`) or option card ends the panel's ask as `needs-you` with "Open chat" (D27).
- The message goes through the ordinary `POST /api/bots/:id/messages`, so the bot's own `approvalMode` applies.
  New bots default to full access unless `settings.approvalMode` is sent (DECISIONS.md Evidence 3); the demo bot is
  created with `"ask"`.

## Renderer isolation and auth

- Panel window: `sandbox`, `contextIsolation`, no Node, `data:` page, `will-navigate` prevented, window opens denied
  (`electron/ask-panel.mjs`); preload exposes only `window.ask` (unit: `electron/ask-panel.node-test.mjs`).
- Every IPC handler refuses senders other than the panel (unit: `electron/ask-main.node-test.mjs`).
- **Packaged:** main adds the desktop owner token header (`electron/main.mjs:2581`, `electron/desktop-server-auth.cjs`).
- **Dev:** main uses plain `fetch` to `DEV_URL` (`electron/main.mjs:2941`), and `pnpm dev:server` sets
  `OMB_DEV_TRUST_LOCAL_BROWSER=1` (`server/dev-server.ts:6`), so any local browser acts as the owner. Claims about
  renderer isolation from the server need a packaged build (not run).
- Dev data is separate from the installed app (D43): `OpenMausBot-Dev` userData and `~/.openmausbot-dev`.

## Credentials

Provider sign-in stays with the server and Codex under the data folder's `providers/`. The Ask code never reads it.
CI has no secrets and makes no provider calls (`.github/workflows/ask-panel-ci.yml`).
