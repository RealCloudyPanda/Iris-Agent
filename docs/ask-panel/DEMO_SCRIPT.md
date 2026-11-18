# Ask panel: demo script

Dev setup on macOS. Dev builds use their own data (`~/.openmausbot-dev`, `OpenMausBot-Dev`; D43), not the installed
app's. The dev window launch itself is still unverified (DECISIONS.md D43).

## Setup

```sh
fnm use 24                      # Node 24; system Node untouched (D39)
corepack pnpm install
corepack pnpm dev:server        # terminal 1: local server, data in ~/.openmausbot-dev
corepack pnpm dev               # terminal 2: Vite renderer at http://127.0.0.1:5199
corepack pnpm dev:desktop       # terminal 3: Electron shell
```

Sign in to ChatGPT for Codex in the app if it asks. Create the demo bot with approvals on (new bots otherwise default
to full access, DECISIONS.md Evidence 3). The server listens on `OMB_PORT`, default 8799 (`server/index.ts:655`). In dev the local-browser trust (`server/dev-server.ts:6`) applies; SPIKES.md §B created its bot through this route:

```sh
curl -s -X POST http://127.0.0.1:8799/api/bots \
  -H 'content-type: application/json' \
  -d '{"name":"Screen Helper","modelSelection":{"instanceId":"codex","model":"gpt-6.1-sol"},"settings":{"approvalMode":"ask"}}'
```

Grant Screen Recording: System Settings, Privacy & Security, Screen & System Audio Recording, enable the Electron
dev app, then restart `dev:desktop`. The panel's "Open Privacy settings" button opens the same pane.

## One-minute script

| Time | Do | Say / show |
|---|---|---|
| 0:00 | Open a window with something to ask about (an error in Terminal, a chart) | "I'm stuck on this." |
| 0:05 | Press Control+Alt+A | Panel appears bottom-centre; the app I was in is remembered |
| 0:10 | Pick "Screen Helper"; press Command+I or tick "Include window" | Picker lists windows, mine preselected, never Iris's own |
| 0:20 | Choose the window | Preview chip appears; nothing has left this Mac yet |
| 0:25 | Type "What is wrong here and how do I fix it?" and Send | Pressing Ask is the consent (D25) |
| 0:30 | Watch "Thinking…" then the streamed reply | Reply comes from the existing bot through Codex |
| 0:45 | Press Esc | Focus returns to the previous app; the turn keeps running |
| 0:50 | Reopen the panel, click "Open chat" | Same answer in the bot's "Quick asks" chat in the full app |
| 0:55 | Ask it to run a command | "Needs you · Open chat": approvals stay in the full app |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Shortcut does nothing; tray, Dock or app menu shows "Ask… (shortcut unavailable)" | Another app holds Control+Alt+A (`electron/ask-shortcut.mjs`) | Use the "Ask…" menu item, or quit the other app and restart Iris |
| Permission notice instead of the window list | Screen Recording not granted | Grant it as above, restart the app |
| "Couldn't reach Iris Agent. Check the app and try again." | Server down or not started | Restart `pnpm dev:server`; check `/api/health` |
| "Couldn't answer. Try again or open the chat." | Turn failed: expired ChatGPT sign-in, rate limit, or another engine error (no dedicated message) | Open the chat for the real error; sign in again in the full app, or wait out the limit |
| "This chat's model can't see images…" | Quick asks thread not on the `codex` instance | Pick a Codex bot or send without the window |
| "Lost the connection; the reply is in the chat." | Event stream dropped after the send | Open the chat |
| "Still answering the last ask." | An ask is running | Wait, or open the chat |
| "This computer's bots moved to My Cloud." | Server returned 409 `moved` | Use the cloud place in the full app |
| No Ask panel at all | Remote desktop access is on (Ask is not installed then, `electron/main.mjs:2941`) | Use a local session |
