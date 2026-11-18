# Ask panel: architecture

Facts below come from code on `companion`; paths are cited. Upstream parts are described only as far as the Ask
panel uses them.

## Processes

| Process | What it is | Source |
|---|---|---|
| Electron main | Registers the shortcut, owns the panel window, captures windows, talks to the local server | `electron/main.mjs` (`installAsk`, ~line 2941), `electron/ask-main.mjs` |
| Ask panel renderer | `type: "panel"` window, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, page loaded from a `data:` URL; navigation and new windows denied | `electron/ask-panel.mjs` (`createAskPanel`) |
| Ask panel preload | Exposes `window.ask` (9 calls + `onUpdate`) and nothing else | `electron/ask-panel-preload.cjs` |
| Local server | MausBot's Node server: bots, threads, attachments, SSE events. Packaged: spawned by main on `127.0.0.1:<SERVER_PORT>`; dev: `pnpm dev:server` | `electron/main.mjs:2581` (`localServerRequest`), `server/dev-server.ts` |
| `codex app-server` | Codex CLI subprocess the server drives for a bot on the `codex` instance | `server/drivers/codex.ts`, `server/drivers/codex-images.ts` |
| Swift frontmost helper | Short-lived binary: frontmost app (pid, bundle id, name), its front window number and title, and window-number to app-name pairs; also re-activates a pid | `electron/frontmost-window.swift`, `electron/frontmost-window.mjs` (300 ms timeout) |
| macOS TCC | Screen Recording permission gates `desktopCapturer` and window titles | `electron/ask-capture.mjs` (`getMediaAccessStatus("screen")`) |

## Container view

```mermaid
flowchart LR
  user([Person])
  subgraph mac[macOS]
    tcc[[TCC: Screen Recording]]
    helper[Swift frontmost helper]
    subgraph electron[Electron app]
      main[Main process<br/>ask-main.mjs]
      preload[Preload<br/>ask-panel-preload.cjs]
      panel[Ask panel renderer<br/>sandboxed, data: URL]
    end
    server[Local server<br/>127.0.0.1]
    codex[codex app-server]
    disk[(Data folder<br/>attachments/, events/, native/,<br/>providers/codex-own/, workspaces/)]
  end
  openai[(OpenAI)]
  user -- shortcut, typing --> panel
  panel -- IPC ask:* --> preload --> main
  main -- execFile --> helper
  main -- desktopCapturer --> tcc
  main -- "HTTP + SSE<br/>[owner token: packaged only]" --> server
  server -- "JSON-RPC stdio" --> codex
  codex -- "[provider credentials]<br/>[screenshot as data URL]" --> openai
  server --> disk
  codex --> disk
```

Trust and data marks:
- **[screenshot]** lives in main-process memory until Send (`electron/ask-capture.mjs` header comment; `held` in
  `electron/ask-main.mjs`), then is uploaded as a PNG, stored by the server and sent to OpenAI by Codex. The renderer
  only gets a downscaled preview data URL.
- **[owner token]** `desktopMutationToken` is added as a header by `localServerRequest` in packaged builds only
  (`electron/main.mjs:2581`, `electron/desktop-server-auth.cjs`). In dev, main uses plain `fetch` to `DEV_URL`
  (`electron/main.mjs:2941`) and the dev server trusts local browsers (`server/dev-server.ts:6`).
- **[provider credentials]** ChatGPT sign-in stays with the server and Codex under `providers/` in the data folder;
  the panel and main's Ask code never see them.

## Sequence: one ask with a window

```mermaid
sequenceDiagram
  actor P as Person
  participant M as Main (ask-main.mjs)
  participant H as Swift helper
  participant R as Panel renderer
  participant S as Local server
  participant C as codex app-server
  P->>M: Control+Alt+A (ask-shortcut.mjs)
  M->>H: read() frontmost app/window
  H-->>M: previous {pid, windowNumber, title}
  M->>R: show panel, ask:update {type:"shown"}
  R->>M: ask:list-bots
  M->>S: GET /api/bots?messages=0
  R->>M: ask:pick-windows / ask:choose-window(id)
  M->>M: desktopCapturer, downscale to 2000 px, keep PNG in memory
  M-->>R: preview data URL
  P->>R: type question, Send
  R->>M: ask:send {botId, text}
  M->>S: POST /api/bots/:id/tasks (first ask only, "Quick asks")
  M->>S: POST /api/attachments?uploadId=… (image/png)
  S-->>M: {path}
  M->>S: GET /api/events?screens=off (SSE)
  S-->>M: frame kind "hello"
  M->>S: POST /api/bots/:id/messages {text + <attached-image/>, threadId, sendId}
  S->>C: turn/start with image input
  C-->>S: deltas, completion
  S-->>M: runtime frames: content.delta, item.completed, turn.completed
  M-->>R: ask:update status/reply
  R-->>P: streamed reply, "Open chat"
```

Order detail: the SSE stream is opened first and the message is POSTed only after the `hello` frame
(`electron/talk-server.mjs`, `ask()`), so no reply frame is missed.

## Focus and notifications

- Esc or Send hides the panel; focus returns to the recorded pid only when the panel itself hides
  (`installAsk` `onHide`, `electron/ask-main.mjs`).
- `askPanel.suppresses(threadId)` is passed to `installDesktopNotifications` as `suppressed`
  (`electron/main.mjs:2619`); only the `"done"` banner of the displayed thread is held back
  (`electron/desktop-notifications.mjs:73`).
- Remote desktop access disables the Ask panel entirely (`if (!desktopRemoteAccess)`, `electron/main.mjs:2941`).
