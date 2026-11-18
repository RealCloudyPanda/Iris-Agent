# Feasibility spikes — evidence

Machine: Apple M1, 8 GB, macOS 27.2.1. Node 24.22.3 (fnm), pnpm 10.33.0 (corepack, as pinned by `packageManager`).
Upstream commit `c175749a`. Every result below was run on this machine on 2026-11-18 unless marked "not run".

Evidence kinds: **unit** (mocked), **integration** (real server, fake engine), **live** (real provider, real account),
**manual** (a person on macOS).

## A — Stock build on this Mac: PARTIAL PASS

| Step | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0, 30 s |
| Lint | `pnpm lint` | exit 0, 2 s |
| Typecheck | `pnpm typecheck` | exit 0, 51 s |
| Electron unit tests | `pnpm test:electron` | 2192 tests: 2179 pass, 13 skipped, 0 fail, 100 s |
| Focused server tests | `pnpm exec vitest run server/turn-images server/drivers/codex-images server/routes/threads server/attachments server/request-auth` | 9 files, 160 tests pass, 36 s |
| Headless server, isolated | `OMB_DATA_DIR=<scratch> OMB_PORT=19980 node --experimental-strip-types server/dev-server.ts` | boots; `/api/health` 200; doctor 9 checks, 0 problems |
| Dev Electron window | — | **not run**: shares userData with the installed app (DECISIONS.md, Evidence 2) |

Not run: the full `pnpm test` (it includes broker and packaged-server suites), packaging.

## B — Real subscription-backed image turn: PASS (live)

Route under test is MausBot's own, unmodified: `POST /api/bots` → `POST /api/attachments` (raw PNG) →
`GET /api/events` (SSE) → `POST /api/bots/:id/messages` with an `<attached-image …/>` tag.
Engine: `codex` instance, `access: subscription`, codex-cli 0.169.0, model `gpt-6.1-sol`, signed in with ChatGPT.

The image ([spikes/mkimg.swift](spikes/mkimg.swift)) shows a fake build error and a ticket code generated at random
for this run (`MAUS-5128EA-9352`). The question did **not** contain the code.

```
175 ms   create bot 201
187 ms   upload 201 {"mime":"image/png","bytes":37488}
245 ms   send 202
4344 ms  first assistant text delta
4804 ms  turn.completed ok=true
events:  turn.started 1, session.started 1, content.delta 3, item.completed 1, thread.token-usage.updated 1, turn.completed 1
reply:   Ticket: MAUS-5128EA-9352
         Error: ENOENT: no such file or directory, open 'config/app.json'
```

Reproduce: [spikes/spike-b.mjs](spikes/spike-b.mjs). Uses one Codex turn of the ChatGPT plan.
Caveat: the bot was created with full access because `approvalMode` was sent at the top level instead of in
`settings`; the turn ran no tools. The script now sends `settings.approvalMode: "ask"`.

## C — Previous-window capture: NOT STARTED

Known from source: Electron can list windows (`desktopCapturer`) but cannot say which was frontmost; upstream already
compiles a Swift helper (`electron/speech-helper.swift` via `pnpm build:speech`), which is the pattern to follow.
Hypothesis to test: a `desktopCapturer` window source id carries the macOS window number, so the helper's answer can
be matched to a source.

## D — Security and lifecycle: PARTIAL

- Stopping the isolated server left no `dev-server.ts` or `codex app-server` process and no listener on 19980.
- The dev server trusts local browsers as the owner (`OMB_DEV_TRUST_LOCAL_BROWSER=1`), so renderer-isolation claims
  need a packaged build. Not run.

## E — Where the screenshot goes: TRACED (one turn)

| Place | What | Durable? |
|---|---|---|
| `attachments/<uuid>.png` (mode 0600) | the PNG | yes |
| `providers/codex-own/<hash>/codex/sessions/…/rollout-*.jsonl` | the PNG as base64, written by Codex itself | yes |
| `events/<thread>.ndjson`, `native/<thread>.ndjson` | text the model read from it (MausBot's native log omits inline image bytes, per `withoutInlineImages`) | yes |
| `workspaces/<bot>/memory/log/<date>.md`, `memory-journal/<bot>.ndjson` | text the model read from it | yes |
| OpenAI | the image as a data URL in `turn/start` | outside our control |

Codex used MausBot's own provider folder for this bot, not `~/.codex`. Not yet checked: what thread or message
deletion removes from each place.
