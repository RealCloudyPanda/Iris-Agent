# Ask panel: CI/CD

One workflow: `.github/workflows/ask-panel-ci.yml` (D44). Upstream workflows with self-hosted runners and release
secrets were removed. Triggers: every `push` and `pull_request`. Permissions: `contents: read`. No secrets, no
provider calls. Actions are pinned by commit SHA; checkout uses `persist-credentials: false`.

## Jobs

| Job | Runner | Steps |
|---|---|---|
| `checks` | `macos-latest`, 45 min | full-history checkout; Node 24; `corepack enable`; pnpm cache; `pnpm install --frozen-lockfile`; invisible-character test and diff check against the PR base; `pnpm lint`; `pnpm typecheck`; `pnpm test:electron`; focused Vitest: `server/turn-images server/drivers/codex-images server/routes/threads server/attachments server/request-auth` |
| `cross-platform` | matrix `ubuntu-latest`, `windows-latest`, 45 min, `fail-fast: false` | install, lint, typecheck, `node --test "electron/ask-*.node-test.mjs" electron/dev-isolation.node-test.mjs` |

There is no CD: nothing is packaged, signed, notarized or released by CI.

## What CI cannot prove

- Real macOS behaviour: global shortcut registration, panel focus and return, Screen Recording prompts, window
  capture pixels, the Swift helper's answers (all mocked in units).
- A real Codex turn reading an image (live only, SPIKES.md §B).
- Packaged-build auth and renderer isolation from the server (needs a packaged build, not built).
- Idle CPU/RAM budget (D37; `scripts/bench-ask-idle.mjs` runs on a real machine).
- Sleep/wake, display changes, network loss.
- That the workflow passes on GitHub at all: it has not yet run there (D44).
- `scripts/bench-ask-idle.node-test.mjs` and `server/host/delete-leftovers*.test.ts` are not in the workflow's
  focused lists; `pnpm test:electron` covers only `electron/*.node-test.mjs`.
