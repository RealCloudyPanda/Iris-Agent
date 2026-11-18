import { randomUUID } from "node:crypto";
import { createWindowCapture, windowNumber } from "./ask-capture.mjs";
import { createAskPanel, isAskPanel } from "./ask-panel.mjs";
import { ASK_ACCELERATOR, createAskShortcut } from "./ask-shortcut.mjs";
import { createFrontmostWindow } from "./frontmost-window.mjs";
import { createTalkServer, findMausBot, QUICK_ASKS_TITLE, TalkServerError } from "./talk-server.mjs";

export { isAskPanel };

const JSON_HEADERS = { "content-type": "application/json" };
const BOT_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const WINDOW_ID = /^window:\d{1,20}:\d{1,10}$/;
export const MAX_TEXT = 20_000;

/** Same escaping as src/lib/composer-attachments.ts escapeAttribute. */
export function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("\t", "&#9;").replaceAll("\r", "&#13;").replaceAll("\n", "&#10;");
}

export const imageTag = path => `<attached-image path="${escapeAttribute(path)}" name="window.png" />`;

/** A wire task carries the model its thread runs on (its own pick or its bot's); unknown counts as no. */
export const threadSeesImages = task => task?.modelSelection?.instanceId === "codex";

/** Last bot and each bot's Quick asks thread, per server, in a small JSON file. */
export function createAskPrefs(store, log = () => {}) {
  let data = null;
  const load = () => {
    if (data) return data;
    try { const raw = store.read(); data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}; } catch { data = {}; }
    if (typeof data.chats !== "object" || !data.chats || Array.isArray(data.chats)) data.chats = {};
    return data;
  };
  const save = () => { try { store.write(load()); } catch (error) { log(`ask prefs not saved: ${error?.message ?? error}`); } };
  const key = (server, botId) => `${server}\n${botId}`;
  return {
    lastBot: () => (typeof load().lastBot === "string" ? load().lastBot : null),
    setLastBot(id) { if (load().lastBot !== id) { load().lastBot = id; save(); } },
    thread: (server, botId) => (typeof load().chats[key(server, botId)] === "string" ? load().chats[key(server, botId)] : null),
    setThread(server, botId, threadId) { load().chats[key(server, botId)] = threadId; save(); },
  };
}

/**
 * Picker entries with the owning app's name and the previous window preselected (D34). `owners` is the helper's
 * `[{ windowNumber, appName }]`; a source id's middle part is the CGWindowID on macOS. Falls back to the title.
 */
export function labelWindows(windows, previous, owners = []) {
  const apps = new Map(owners.map(owner => [String(owner.windowNumber), owner.appName]));
  const number = previous?.windowNumber ? String(previous.windowNumber) : null;
  let pick = number ? windows.findIndex(w => windowNumber(w.id) === number) : -1;
  if (pick < 0 && previous?.title) pick = windows.findIndex(w => w.name === previous.title);
  return windows.map((w, i) => ({ ...w, app: apps.get(windowNumber(w.id)) ?? (i === pick ? previous.appName : null) ?? null, preselected: i === pick }));
}

/** The privileged half of the Ask panel: bots, window capture, upload, and one streamed ask at a time. */
export function createAsk({ request, prefs, serverKey, capture, push, makeId = randomUUID, log = () => {}, previousWindow = () => null, windowOwners = async () => [] }) {
  const server = createTalkServer({ request, prefs: null, serverKey });
  let held = null, asking = null, lastChat = null, showing = null;
  /** Bumped whenever the user lets go of a capture (clear, hide, send, close): a capture finishing later is stale. */
  let generation = 0;

  const drop = () => {
    if (!held) return;
    held = null;
    push({ type: "preview", dataUrl: null });
  };
  const fetchBots = async () => {
    const response = await request("/api/bots?messages=0").catch(() => null);
    const bots = response?.ok ? (await response.json().catch(() => null))?.bots : null;
    if (!Array.isArray(bots)) throw new TalkServerError("server-down");
    return bots.filter(bot => bot && typeof bot.id === "string" && !bot.hidden);
  };
  const ensureThread = async bot => {
    const key = serverKey();
    const saved = prefs.thread(key, bot.id);
    const known = saved ? bot.tasks?.find(task => task.threadId === saved) : undefined;
    if (known) return { chat: { botId: bot.id, threadId: saved }, task: known };
    const made = await request(`/api/bots/${encodeURIComponent(bot.id)}/tasks`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ title: QUICK_ASKS_TITLE, select: false }),
    }).catch(() => null);
    const task = made?.ok ? (await made.json().catch(() => null))?.task : null;
    if (typeof task?.threadId !== "string") throw new TalkServerError("refused");
    prefs.setThread(key, bot.id, task.threadId);
    return { chat: { botId: bot.id, threadId: task.threadId }, task };
  };
  const upload = async png => {
    const response = await request(`/api/attachments?uploadId=${encodeURIComponent(makeId())}`, {
      method: "POST", headers: { "content-type": "image/png" }, body: png,
    }).catch(() => null);
    const path = response?.ok ? (await response.json().catch(() => null))?.path : null;
    if (typeof path !== "string") throw new TalkServerError("upload");
    return path;
  };

  const run = async ({ botId, text }, png, signal) => {
    push({ type: "status", state: "sending" });
    const bot = (await fetchBots()).find(entry => entry.id === botId);
    if (!bot) throw new TalkServerError("no-bot");
    prefs.setLastBot(bot.id);
    const { chat, task } = await ensureThread(bot);
    lastChat = chat;
    showing = chat.threadId;
    // The thread may run on a model of its own; an image goes only to a thread whose engine is known to read images.
    if (png && !threadSeesImages(task)) throw new TalkServerError("image-engine");
    const message = png ? `${text}\n\n${imageTag(await upload(png))}` : text;
    const outcome = await server.ask({
      chat, text: message, sendId: makeId(), signal,
      onUpdate: update => {
        if (update.kind === "thinking") push({ type: "status", state: "thinking" });
        else if (update.kind === "reply") push({ type: "reply", text: update.text });
      },
    });
    push({ type: "status", state: outcome === "failed" ? "error" : outcome, ...(outcome === "failed" ? { error: "failed" } : {}) });
  };

  return {
    async listBots() {
      const bots = await fetchBots();
      const ids = new Set(bots.map(bot => bot.id));
      const remembered = prefs.lastBot();
      const fallback = findMausBot(bots)?.id ?? bots[0]?.id ?? null;
      return {
        bots: bots.map(bot => ({ id: bot.id, name: String(bot.name ?? bot.id), imageCapable: bot.modelSelection?.instanceId === "codex" })),
        selected: remembered && ids.has(remembered) ? remembered : fallback,
      };
    },
    async pickWindows() {
      const listed = await capture.list();
      if (!Array.isArray(listed?.windows)) return listed;
      return { windows: labelWindows(listed.windows, previousWindow(), await windowOwners().catch(() => [])) };
    },
    async chooseWindow(id) {
      const mine = ++generation;
      drop();
      const shot = await capture.capture(id);
      if (mine !== generation) return { error: "stale" };
      if (!shot) return { error: "gone" };
      held = { png: shot.png };
      return { preview: shot.preview };
    },
    clearCapture() { generation += 1; drop(); },
    held: () => held !== null,
    busy: () => asking !== null,
    openPermissionSettings: () => capture.openPermissionSettings(),
    lastChat: () => lastChat,
    /** The thread whose reply the panel shows, until the panel hides (D36). */
    showingThread: () => showing,
    hidden() { showing = null; },
    /** Resolves when the ask ends; a second ask while one runs is refused. The capture is taken (and dropped) now. */
    async send(args) {
      if (asking) {
        push({ type: "status", state: "error", error: "busy" });
        return { ok: false, error: "busy" };
      }
      const controller = new AbortController();
      asking = controller;
      const png = held?.png ?? null;
      generation += 1;
      drop();
      try {
        await run(args, png, controller.signal);
        return { ok: true };
      } catch (error) {
        const code = error instanceof TalkServerError ? error.code : "failed";
        if (!controller.signal.aborted) push({ type: "status", state: "error", error: code });
        log(`ask failed: ${error?.message ?? error}`);
        return { ok: false, error: code };
      } finally {
        if (asking === controller) asking = null;
      }
    },
    close() {
      asking?.abort(new Error("closed"));
      generation += 1;
      held = null;
    },
  };
}

const isText = value => typeof value === "string" && value.trim().length > 0 && value.length <= MAX_TEXT;

/** IPC for the panel. Every channel refuses any sender but the panel's own page. */
export function registerAskIpc({ ipcMain, owns, ask, panel }) {
  const handled = [], listening = [];
  const handle = (channel, run) => {
    handled.push(channel);
    ipcMain.handle(channel, (event, ...args) => {
      if (!owns(event.sender)) throw new Error("forbidden");
      return run(...args);
    });
  };
  const on = (channel, run) => {
    const listener = (event, ...args) => { if (owns(event.sender)) run(...args); };
    listening.push([channel, listener]);
    ipcMain.on(channel, listener);
  };
  handle("ask:list-bots", () => ask.listBots().catch(() => ({ error: "server-down" })));
  handle("ask:pick-windows", () => ask.pickWindows().catch(() => ({ error: "capture" })));
  handle("ask:choose-window", id => {
    if (typeof id !== "string" || !WINDOW_ID.test(id)) throw new Error("invalid window");
    return ask.chooseWindow(id).catch(() => ({ error: "capture" }));
  });
  handle("ask:clear-capture", () => { ask.clearCapture(); });
  handle("ask:open-permission-settings", () => { void Promise.resolve(ask.openPermissionSettings()).catch(() => {}); });
  handle("ask:send", value => {
    if (!value || typeof value !== "object" || typeof value.botId !== "string" || !BOT_ID.test(value.botId) || !isText(value.text)) throw new Error("invalid ask");
    if (ask.busy()) return { ok: false, error: "busy" };
    void ask.send({ botId: value.botId, text: value.text.trim() });
    return { ok: true };
  });
  handle("ask:open-chat", () => { panel.hide({ returnFocus: false }); panel.openChat(ask.lastChat()); });
  on("ask:close", () => panel.hide());
  on("ask:fit", height => { if (typeof height === "number" && Number.isFinite(height)) panel.fit(height); });
  return () => {
    for (const channel of handled.splice(0)) ipcMain.removeHandler(channel);
    for (const [channel, listener] of listening.splice(0)) ipcMain.removeListener(channel, listener);
  };
}

/**
 * Starts the Ask panel: the shortcut now, the window on first press. `request(route, init)` reaches this computer's
 * server; `store` is a { read, write } JSON file; `openChat(chat|null)` shows the main window on that thread.
 */
export function installAsk({ ipcMain, BrowserWindow, globalShortcut, screen, desktopCapturer, systemPreferences, shell, platform, request, store, serverKey, openChat, log = () => {},
  frontmost = createFrontmostWindow({ platform, log }) }) {
  let ask = null, previous = null;
  const panel = createAskPanel({ BrowserWindow, screen, onHide: ({ returnFocus } = {}) => {
    ask?.clearCapture();
    ask?.hidden();
    // Focus goes back only from the panel itself: a user who already switched apps keeps their choice (D31).
    if (returnFocus && previous) void frontmost.activate(previous.pid).catch(() => {});
  } });
  const capture = createWindowCapture({ desktopCapturer, systemPreferences, shell, screen, BrowserWindow, platform });
  ask = createAsk({ request, prefs: createAskPrefs(store, log), serverKey, capture, push: update => panel.send("ask:update", update), log,
    previousWindow: () => previous, windowOwners: async () => (await frontmost.read())?.windows ?? [] });
  const unregister = registerAskIpc({ ipcMain, owns: panel.owns, ask, panel: { hide: panel.hide, fit: panel.fit, openChat } });
  const show = () => { try { panel.show(); } catch (error) { log(`ask panel failed: ${error?.message ?? error}`); } };
  /** The previous window is read before the panel takes focus; a slow or missing helper just leaves it unknown. */
  const open = async () => {
    previous = (await frontmost.read().catch(() => null))?.previous ?? null;
    show();
  };
  const shortcut = createAskShortcut({ globalShortcut, log, onPress: () => (panel.focused() ? panel.hide() : open()) });
  return {
    state: shortcut.state,
    open,
    /** The tray's "Ask…" item (D21), labelled with the shortcut or why it is missing. */
    trayItem: () => (shortcut.state().registered
      ? { label: "Ask…", accelerator: ASK_ACCELERATOR, registerAccelerator: false, click: () => void open() }
      : { label: "Ask… (shortcut unavailable)", click: () => void open() }),
    /** A thread's desktop banner is held back while the panel shows its reply (D36). */
    suppresses: threadId => panel.visible() && ask.showingThread() === threadId,
    close() {
      shortcut.close();
      ask.close();
      unregister();
      panel.close();
    },
  };
}
