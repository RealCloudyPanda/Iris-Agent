# Ask panel: repo map

Fork changes against upstream `c175749a`, from `git diff --stat c175749a..companion` (184 files, +5552, -9505;
37 added, 112 modified, 35 deleted). These numbers predate the docs on this branch.

## By area

| Area | Files | +/- | What changed |
|---|---|---|---|
| `electron/` | 53 | +1666 / -93 | Ask panel modules and tests; `main.mjs` wiring (`installAsk`, notification suppression, dev isolation); `desktop-notifications.mjs` `suppressed` hook; tray/menu "Ask…" item; Iris Agent naming in user-facing strings |
| `server/` | 19 | +90 / -848 | `dev-data-dir.ts` (dev data folder, D43) and `dev-server.ts`; brand strings; `hosted-access.test.ts` and `hosted-models-api.test.ts` deleted; other tests adjusted |
| `src/` | 22 | +3018 / -3020 | locale files (rename to Iris Agent, source hashes) and a few `src/lib` brand strings |
| `docs/` | 18 | +396 / -208 | `docs/ask-panel/` added; `docs/verification/` brand updates, two pages removed |
| `scripts/` | 10 | +253 / -576 | invisible-character check and icon builder added; upstream CI-workflow tests adjusted or removed |
| `build/`, `public/` | 23 | +27 / -63 | Iris Agent icons |
| `.github/` | 21 | +68 / -3715 | 20 upstream workflows deleted; `ask-panel-ci.yml` added (D44) |
| `enterprise/` | 10 | -957 | deleted (D29) |
| root | `README.md`, `package.json`, `electron-builder.yml`, `index.html`, `rail.html`, `vite.config.ts`, `tsconfig.server.json` | | app name, bundle id `dev.realcloudypanda.iris.desktop`, `build:frontmost` script, attribution line |

## Files the fork added

Ask panel (Electron):
- `electron/ask-main.mjs`: privileged half, IPC, install
- `electron/ask-panel.mjs`, `electron/ask-panel-preload.cjs`: window, page and bridge
- `electron/ask-capture.mjs`: window list and capture
- `electron/ask-shortcut.mjs`: Control+Alt+A
- `electron/frontmost-window.mjs`, `electron/frontmost-window.swift`, `electron/build-frontmost-window.mjs`:
  previous-window helper
- tests: `electron/ask-capture.node-test.mjs`, `ask-install.node-test.mjs`, `ask-main.node-test.mjs`,
  `ask-panel.node-test.mjs`, `ask-shortcut.node-test.mjs`, `frontmost-window.node-test.mjs`,
  `system-tray.node-test.mjs`

Dev isolation (D43): `electron/dev-isolation.mjs`, `electron/dev-isolation-boot.mjs`,
`electron/dev-isolation.node-test.mjs`, `server/dev-data-dir.ts`, `server/dev-data-dir.test.ts`

Branding: `electron/iris-dock.mjs`, `electron/panel-theme.mjs` (Ask panel colours), `scripts/build-iris-icons.mjs`, `build/icon.png`,
`build/iris-icon-prompt.txt`

Tooling: `.github/workflows/ask-panel-ci.yml`, `scripts/check-invisible-chars.mjs`,
`scripts/check-invisible-chars.node-test.mjs`; on this branch also `scripts/bench-ask-idle.mjs` and its test

Docs: `docs/ask-panel/` (README, DECISIONS, SPIKES, GLOSSARY, LEARNING_TRACKER, adr/0001, adr/0002,
spikes/mkimg.swift, spikes/spike-b.mjs; on this branch ARCHITECTURE, PROTOCOLS_AND_APIS, PRIVACY_AND_SECURITY,
TEST_PLAN, DEMO_SCRIPT, CI_CD, REPO_MAP)

Reproduce: `git diff --name-status --diff-filter=A c175749a..companion`.
