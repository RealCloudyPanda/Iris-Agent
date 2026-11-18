# Ask panel: protocols and APIs

Only what the code uses. Sources: `electron/ask-main.mjs` (`registerAskIpc`), `electron/ask-panel-preload.cjs`,
`electron/talk-server.mjs`, `electron/ask-panel.mjs`.

## IPC (renderer to main)

Every channel checks `owns(event.sender)` (the panel's own `webContents`) and throws `forbidden` otherwise.

| Preload call | Channel | Kind | Argument check | Returns |
|---|---|---|---|---|
| `listBots()` | `ask:list-bots` | invoke | none | `{ bots: [{id, name, imageCapable}], selected }` or `{ error: "server-down" }` |
| `pickWindows()` | `ask:pick-windows` | invoke | none | `{ windows: [{id, name, thumbnail, app, preselected}] }`, `{ error: "screen-permission" }` or `{ error: "capture" }` |
| `chooseWindow(id)` | `ask:choose-window` | invoke | `^window:\d{1,20}:\d{1,10}$` | `{ preview }` or `{ error: "stale" \| "gone" \| "capture" }` |
| `clearCapture()` | `ask:clear-capture` | invoke | none | nothing |
| `openPermissionSettings()` | `ask:open-permission-settings` | invoke | none | opens `SCREEN_PRIVACY_URL` (`electron/ask-capture.mjs`) |
| `send({botId, text})` | `ask:send` | invoke | botId `^[A-Za-z0-9_.:-]{1,200}$`; text non-blank, at most 20 000 chars | `{ ok: true }` (accepted) or `{ ok: false, error: "busy" }` |
| `openChat()` | `ask:open-chat` | invoke | none | hides panel, opens `openmausbot://thread/<id>?bot=<id>` in the main window |
| `close()` | `ask:close` | send | none | hides panel (returns focus) |
| `fit(height)` | `ask:fit` | send | finite number | resizes, clamped to 360 px (`ASK_PANEL`) |

## IPC (main to renderer): `ask:update`

| `type` | Fields | Sent when |
|---|---|---|
| `shown` | none | panel loaded or re-shown (`electron/ask-panel.mjs`) |
| `preview` | `dataUrl: null` | the held capture is dropped |
| `status` | `state`: `sending` \| `thinking` \| `needs-you` \| `done` \| `error`; `error` code when `state` is `error` | ask progress |
| `reply` | `text` | streamed reply text so far |

## HTTP routes used by main

| Route | Purpose |
|---|---|
| `GET /api/bots?messages=0` | list bots (hidden ones dropped), check the Quick asks thread still exists |
| `POST /api/bots/:id/tasks` `{title: "Quick asks", select: false}` | create the per-bot Quick asks thread once (D22) |
| `POST /api/attachments?uploadId=<uuid>` body raw PNG, `content-type: image/png` | upload; response `{ path }` |
| `GET /api/events?screens=off` | SSE stream of frames |
| `POST /api/bots/:id/messages` `{text, threadId, sendId}` | the ask; an image is referenced by `<attached-image path="…" name="window.png" />` appended to the text |

A 409 with `{ code: "moved" }` maps to `moved`; any other non-OK maps to `refused` (`refusal()` in
`electron/talk-server.mjs`). The server turns the image into a Codex `{ type: "image", url: "data:…" }` input
(`server/drivers/codex-images.ts`).

## SSE frames read (`createReplyTracker`, `electron/talk-server.mjs`)

| Frame `kind` | Inner type | Effect |
|---|---|---|
| `hello` | none | first frame; triggers the POST of the message |
| `runtime` | `content.delta` with `streamKind: "assistant_text"` | appends to the reply |
| `runtime` | `item.completed` with `itemType: "assistant_text"` | replaces the reply with final text |
| `runtime` | `request.opened` | `needs-you` (an approval or question waits in the full app) |
| `runtime` | `turn.completed` | `done`, or `failed` when `ok` is false and there is no text |
| `message` | `kind: "text"` | shows text |
| `message` | `kind: "options"` with a waiting card | `needs-you` |

Frames are filtered by `threadId` and the turn started by this `sendId`.

## Error codes shown in the panel (`ERRORS` in `electron/ask-panel.mjs`)

| Code | Origin | Text shown |
|---|---|---|
| `image-engine` | thread model is not `codex` | This chat's model can't see images. Send without the window or pick a Codex bot. |
| `busy` | second ask while one runs | Still answering the last ask. |
| `server-down` | bot list or events unreachable | Couldn't reach Iris Agent. Check the app and try again. |
| `starting` | server still starting (talk server only) | Iris Agent is starting. |
| `refused` | non-OK create-thread or message | The server refused the ask. |
| `moved` | 409 `moved` | This computer's bots moved to My Cloud. |
| `lost` | SSE ended after the send | Lost the connection; the reply is in the chat. |
| `upload` | attachment upload failed | The screenshot could not be uploaded. |
| `no-bot` | chosen bot is gone | That bot is gone. |
| `failed` | turn failed, or capture/list failure | Couldn't answer. Try again or open the chat. |

`screen-permission` is not an error string: it shows the permission notice with a button to System Settings.
Sign-in expired, rate limit and oversized image have **no dedicated code**: they arrive as a failed turn
(`failed`) and the details are in the full chat. Not verified live.
