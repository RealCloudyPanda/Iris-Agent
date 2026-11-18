# Ask panel: test plan

Layers (D38): `node --test` units for Electron code, Vitest server tests with a fake engine, one hand-triggered live
Codex test, and manual macOS checks. "Verified" means run and passed on this machine or in a unit test that exists
now; "pending" means not run yet.

## Acceptance outcomes

| # | Outcome | Automated | Manual / live | Status |
|---|---|---|---|---|
| 1 | Stock dev build starts, ordinary chat works | `pnpm test:electron`, focused Vitest (SPIKES.md §A) | launch dev window (D43), send a chat | units verified; dev window **pending** |
| 2 | Shortcut opens one panel, Esc closes, conflict reported | `electron/ask-shortcut.node-test.mjs`, `electron/ask-install.node-test.mjs` (one window, tray label) | press Control+Alt+A twice, Esc; hold the key in another app | units verified; manual **pending** |
| 3 | Screenshot is the previous window, not the panel; picker fallback | `electron/ask-capture.node-test.mjs` (own windows dropped), `electron/frontmost-window.node-test.mjs`, `labelWindows` in `ask-install.node-test.mjs` | open from Finder, check preselected window and preview | units verified; manual **pending** |
| 4 | Cancel sends nothing, no file on disk | `ask-main.node-test.mjs` (clearCapture, stale capture discarded, no upload without capture) | cancel, then list `attachments/` | units verified; disk check **pending** |
| 5 | Send attaches image and text to one bot/thread | `ask-main.node-test.mjs` (upload, image tag, Quick asks reuse) | send, open chat | units verified; manual **pending** |
| 6 | Real Codex reads the screenshot | none (no provider calls in CI) | `docs/ask-panel/spikes/spike-b.mjs` | live verified once via server route (SPIKES.md §B); via panel **pending** |
| 7 | Reply streams and appears in full app | `ask-main.node-test.mjs` (streamed reply, done) | "Open chat" lands on the thread | units verified; manual **pending** |
| 8 | Errors are explicit | `ask-main.node-test.mjs` (upload fail, busy, image-engine), `ask-capture.node-test.mjs` (permission) | deny permission, stop server; expired login and rate limit show only `failed` | partly verified; gaps listed in PROTOCOLS_AND_APIS.md |
| 9 | Approvals not bypassable | `ask-main.node-test.mjs` (channels refuse other senders, argument checks) | ask a bot with `approvalMode: "ask"` to run a tool, see "Needs you" | units verified; manual **pending** |
| 10 | Notifications, no duplicates, click opens thread | `electron/desktop-notifications.node-test.mjs` (suppression only for `done`, never approvals) | finish an ask with panel shown, then hidden | units verified; manual **pending** |
| 11 | Repeated open/close leaks nothing | `ask-install.node-test.mjs` (show/hide cycles add no handlers; overtaken opens dropped) | `scripts/bench-ask-idle.mjs` before and after 20 toggles | units verified; measurement **pending** |
| 12 | Sleep/wake, displays, network loss | none | manual checklist | **pending** |
| 13 | Idle CPU/RAM vs stock | `scripts/bench-ask-idle.node-test.mjs` (stats only) | method below | **pending** (no baseline yet) |
| 14 | No credentials or full screenshots in CI logs or demo artifacts | CI has no secrets (`.github/workflows/ask-panel-ci.yml`) | review recording before sharing | config verified; artifacts **pending** |
| 15 | macOS claims tested on macOS | CI `checks` job runs on `macos-latest` (units only) | every manual row above, on this Mac | **pending** |

## Commands

```sh
corepack pnpm lint
node --test "electron/ask-*.node-test.mjs" electron/frontmost-window.node-test.mjs electron/desktop-notifications.node-test.mjs
corepack pnpm exec vitest run server/turn-images server/drivers/codex-images server/routes/threads server/attachments server/request-auth server/host/delete-leftovers
node --test scripts/bench-ask-idle.node-test.mjs scripts/check-invisible-chars.node-test.mjs
```

## Benchmark method (D37)

Tool: `scripts/bench-ask-idle.mjs --pattern <regex> --seconds <n> --interval 5`. It samples
`ps -axo pid=,%cpu=,rss=,command=`, sums %CPU and RSS of matching processes, and prints
`{samples, meanCpu, p95Cpu, meanRssMB, maxRssMB}`.

1. Build stock (`c175749a`) and fork the same way (packaged preferred), same data folder contents, same machine,
   on power, no other heavy apps.
2. Launch, wait 2 minutes, then sample 600 s (D37 says 10 min idle; the script default is 300 s, so pass
   `--seconds 600`). Pattern: the app's executable path, so helpers and the server are included.
3. Repeat 5 times per build, alternating stock and fork.
4. Fork only: run once more after 20 panel open/close cycles to look for RSS growth.
5. Wakeups are not measured by this script; use `top -stats pid,command,idlew -l 10` separately if needed.
6. Pass: fork mean CPU within the stock runs' spread; no RSS growth before first use; no added timers/listeners
   (units above). Warm shortcut-to-panel under 150 ms needs a manual timing. Numbers are set only after the baseline.

## Idle benchmark result (2026-11-18, one run)

Machine: Apple M1, 8 GB, macOS 27.2.1. Dev build (`pnpm dev:desktop` against `pnpm dev:server` and Vite), Ask panel
never opened, 60 s settle, then `node scripts/bench-ask-idle.mjs --pattern "mausbot-companion/node_modules/.pnpm/electron"
--seconds 180 --interval 5` summed over all Electron processes:

| samples | mean CPU % | p95 CPU % | mean RSS MB | max RSS MB |
|---|---|---|---|---|
| 36 | 0.42 | 3.4 | 169.5 | 264.1 |

Limits: one run, dev build (not packaged), no stock baseline on the same build yet, so D37's pass rule
(fork within stock noise) is **not yet decided**. Next: the same command on an upstream checkout at `c175749a`, five runs each.
