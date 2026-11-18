# Learning tracker

| # | Concept | Where in this repo | Status | Teach-back |
|---|---|---|---|---|
| 1 | Who may call the local server: the owner header is added by Chromium below page JavaScript, so page code cannot read or forge it, and other sessions are blocked | `electron/server-session.mjs`, `electron/desktop-server-auth.cjs`, `server/request-auth.ts` | Introduced 2026-11-18 | **Open question, not yet answered:** the Ask panel (a sandboxed renderer) must send to `/api/bots/:id/messages`. Which process should make that request, and what goes wrong if the panel's page calls `fetch()` itself? |

## Planned order

1. Process and trust boundaries (main, renderer, preload, server, engine subprocess)
2. Electron windows, shortcuts and focus
3. HTTP and Server-Sent Events as this repo uses them (`/api/events`, `talk-server.mjs` `readFrames`)
4. Testing layers: `node --test`, Vitest, live, manual
5. macOS permissions and the native helper
6. Git: fork, upstream, pinned branch, feature branches
7. GitHub Actions for the fork
8. Why no Docker for this feature
9. Unsigned local packaging

## Misconceptions noted

None yet.
