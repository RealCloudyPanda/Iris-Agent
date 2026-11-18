import test from "node:test";
import assert from "node:assert/strict";
import { createAsk, createAskPrefs, escapeAttribute, imageTag, registerAskIpc } from "./ask-main.mjs";

const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const BOTS = [
  { id: "codex-bot", name: "Coder", modelSelection: { instanceId: "codex" }, tasks: [] },
  { id: "maus", name: "MausBot", modelSelection: { instanceId: "claude" }, defaultBot: {}, tasks: [] },
  { id: "ghost", name: "Hidden", hidden: true },
];

function sse() {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const encoder = new TextEncoder();
  return { body, emit: frame => controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`)), end: () => controller.close() };
}

function harness({ bots = BOTS, saved = {}, uploadOk = true } = {}) {
  const h = { requests: [], updates: [], stream: sse(), store: { data: saved, read: () => h.store.data, write: value => { h.store.data = structuredClone(value); } } };
  let n = 0;
  h.request = async (route, init = {}) => {
    h.requests.push({ route, init });
    if (route === "/api/bots?messages=0") return json({ bots });
    if (route.endsWith("/tasks")) {
      const bot = bots.find(entry => route === `/api/bots/${entry.id}/tasks`);
      return json({ task: { threadId: "thread-1", modelSelection: h.newThreadModel ?? bot.modelSelection, followsBotModel: !h.newThreadModel } });
    }
    if (route.startsWith("/api/attachments")) return uploadOk ? json({ path: "/data/attachments/a\"b.png", mime: "image/png", bytes: 3 }) : new Response("no", { status: 500 });
    if (route === "/api/events?screens=off") return new Response(h.stream.body, { status: 200 });
    if (route.endsWith("/messages")) return json({ ok: true });
    throw new Error(`unexpected ${route}`);
  };
  h.capture = {
    list: async () => ({ windows: [{ id: "window:1:0", name: "Editor", thumbnail: "data:image/png;base64,AA" }] }),
    capture: async id => (id === "window:1:0" ? { png: Buffer.from("PNG"), preview: "data:image/png;base64,BB" } : null),
    openPermissionSettings: () => { h.opened = true; },
  };
  h.ask = createAsk({ request: h.request, prefs: createAskPrefs(h.store), serverKey: () => "srv", capture: h.capture, push: u => h.updates.push(u), makeId: () => `id-${++n}` });
  h.posted = route => h.requests.filter(r => r.route.startsWith(route));
  /** Drives the server side of one ask: hello, echo, a streamed reply, the end. */
  h.answer = async (sendId, ending = { type: "turn.completed", ok: true }) => {
    while (!h.posted("/api/events").length) await settle();
    h.stream.emit({ kind: "hello" });
    while (!h.posted("/api/bots/").some(r => r.route.endsWith("/messages"))) await settle();
    h.stream.emit({ kind: "message", threadId: "thread-1", message: { role: "user", sendId } });
    h.stream.emit({ kind: "runtime", event: { threadId: "thread-1", turnId: "u1", type: "content.delta", streamKind: "assistant_text", itemId: "i1", delta: "Hel" } });
    h.stream.emit({ kind: "runtime", event: { threadId: "thread-1", turnId: "u1", type: "content.delta", streamKind: "assistant_text", itemId: "i1", delta: "lo" } });
    h.stream.emit({ kind: "runtime", event: { threadId: "thread-1", turnId: "u1", ...ending } });
  };
  return h;
}

test("listBots maps bots, hides hidden ones, flags Codex as image-capable, defaults to MausBot", async () => {
  const h = harness();
  assert.deepEqual(await h.ask.listBots(), {
    bots: [{ id: "codex-bot", name: "Coder", imageCapable: true }, { id: "maus", name: "MausBot", imageCapable: false }],
    selected: "maus",
  });
});

test("listBots prefers the last used bot, and falls back to the first without a MausBot", async () => {
  assert.equal((await harness({ saved: { lastBot: "codex-bot" } }).ask.listBots()).selected, "codex-bot");
  assert.equal((await harness({ saved: { lastBot: "gone" }, bots: [BOTS[0]] }).ask.listBots()).selected, "codex-bot");
});

test("send with a capture to an image bot: hello, upload, message with the image tag, streamed reply, done", async () => {
  const h = harness();
  assert.deepEqual(await h.ask.chooseWindow("window:1:0"), { preview: "data:image/png;base64,BB" });
  assert.equal(h.ask.held(), true);
  const sent = h.ask.send({ botId: "codex-bot", text: "What is this?" });
  assert.equal(h.ask.held(), false, "the buffer leaves the holder as soon as the ask starts");
  await h.answer("id-2");
  assert.deepEqual(await sent, { ok: true });

  const [upload] = h.posted("/api/attachments");
  assert.equal(upload.route, "/api/attachments?uploadId=id-1");
  assert.equal(upload.init.headers["content-type"], "image/png");
  assert.equal(Buffer.from(upload.init.body).toString(), "PNG");
  const order = h.requests.map(r => r.route.split("?")[0]);
  assert.ok(order.indexOf("/api/attachments") < order.indexOf("/api/bots/codex-bot/messages"));
  const [message] = h.posted("/api/bots/codex-bot/messages");
  const body = JSON.parse(message.init.body);
  assert.equal(body.threadId, "thread-1");
  assert.equal(body.sendId, "id-2");
  assert.equal(body.text, `What is this?\n\n<attached-image path="/data/attachments/a&quot;b.png" name="window.png" />`);
  assert.deepEqual(h.updates.filter(u => u.type !== "preview"), [
    { type: "status", state: "sending" }, { type: "status", state: "thinking" },
    { type: "reply", text: "Hel" }, { type: "reply", text: "Hello" }, { type: "status", state: "done" },
  ]);
  assert.equal(h.store.data.lastBot, "codex-bot");
  assert.equal(h.store.data.chats["srv\ncodex-bot"], "thread-1");
  assert.deepEqual(h.ask.lastChat(), { botId: "codex-bot", threadId: "thread-1" });
});

test("no capture means no upload", async () => {
  const h = harness();
  const sent = h.ask.send({ botId: "codex-bot", text: "hi" });
  await h.answer("id-1");
  await sent;
  assert.equal(h.posted("/api/attachments").length, 0);
  assert.equal(JSON.parse(h.posted("/api/bots/codex-bot/messages")[0].init.body).text, "hi");
});

test("a capture is never uploaded for a bot that cannot see images: the ask is refused and the capture dropped", async () => {
  const h = harness();
  await h.ask.chooseWindow("window:1:0");
  assert.deepEqual(await h.ask.send({ botId: "maus", text: "hi" }), { ok: false, error: "image-engine" });
  assert.equal(h.ask.held(), false);
  assert.equal(h.posted("/api/attachments").length, 0);
  assert.equal(h.posted("/api/bots/maus/messages").length, 0);
});

test("a Codex bot whose saved Quick asks thread runs on another engine gets no image", async () => {
  const bots = [{ ...BOTS[0], tasks: [{ threadId: "thread-1", modelSelection: { instanceId: "claude" }, followsBotModel: false }] }];
  const h = harness({ bots, saved: { chats: { "srv\ncodex-bot": "thread-1" } } });
  await h.ask.chooseWindow("window:1:0");
  assert.deepEqual(await h.ask.send({ botId: "codex-bot", text: "hi" }), { ok: false, error: "image-engine" });
  assert.equal(h.posted("/api/attachments").length, 0);
  assert.equal(h.posted("/api/bots/codex-bot/messages").length, 0);
});

test("a new Quick asks thread on another engine than its Codex bot gets no image", async () => {
  const h = harness();
  h.newThreadModel = { instanceId: "claude" };
  await h.ask.chooseWindow("window:1:0");
  assert.deepEqual(await h.ask.send({ botId: "codex-bot", text: "hi" }), { ok: false, error: "image-engine" });
  assert.equal(h.posted("/api/attachments").length, 0);
});

test("a thread whose engine is not reported gets no image", async () => {
  const bots = [{ ...BOTS[0], tasks: [{ threadId: "thread-1" }] }];
  const h = harness({ bots, saved: { chats: { "srv\ncodex-bot": "thread-1" } } });
  await h.ask.chooseWindow("window:1:0");
  assert.deepEqual(await h.ask.send({ botId: "codex-bot", text: "hi" }), { ok: false, error: "image-engine" });
});

test("a non-Codex bot whose saved Quick asks thread runs on Codex does get the image", async () => {
  const bots = [{ ...BOTS[1], tasks: [{ threadId: "thread-1", modelSelection: { instanceId: "codex" }, followsBotModel: false }] }];
  const h = harness({ bots, saved: { chats: { "srv\nmaus": "thread-1" } } });
  await h.ask.chooseWindow("window:1:0");
  const sent = h.ask.send({ botId: "maus", text: "hi" });
  await h.answer("id-2");
  assert.deepEqual(await sent, { ok: true });
  assert.equal(h.posted("/api/attachments").length, 1);
  assert.match(JSON.parse(h.posted("/api/bots/maus/messages")[0].init.body).text, /<attached-image path=/);
});

test("clearCapture drops the buffer and tells the panel", async () => {
  const h = harness();
  await h.ask.chooseWindow("window:1:0");
  h.ask.clearCapture();
  assert.equal(h.ask.held(), false);
  assert.deepEqual(h.updates.at(-1), { type: "preview", dataUrl: null });
});

test("a saved Quick asks thread is reused; a second ask while busy is refused", async () => {
  const bots = [{ ...BOTS[0], tasks: [{ threadId: "thread-1", modelSelection: { instanceId: "codex" } }] }];
  const h = harness({ bots, saved: { chats: { "srv\ncodex-bot": "thread-1" } } });
  const first = h.ask.send({ botId: "codex-bot", text: "one" });
  assert.equal(h.ask.busy(), true);
  assert.deepEqual(await h.ask.send({ botId: "codex-bot", text: "two" }), { ok: false, error: "busy" });
  await h.answer("id-1", { type: "request.opened" });
  await first;
  assert.equal(h.posted("/api/bots/codex-bot/tasks").length, 0);
  assert.equal(h.updates.at(-1).state, "needs-you");
  assert.equal(h.ask.busy(), false);
});

test("a failed upload ends the ask with an error and sends nothing", async () => {
  const h = harness({ uploadOk: false });
  await h.ask.chooseWindow("window:1:0");
  assert.deepEqual(await h.ask.send({ botId: "codex-bot", text: "hi" }), { ok: false, error: "upload" });
  assert.equal(h.posted("/api/bots/codex-bot/messages").length, 0);
  assert.deepEqual(h.updates.at(-1), { type: "status", state: "error", error: "upload" });
});

test("escapeAttribute matches the composer's escaping", () => {
  assert.equal(escapeAttribute(`a&"<>\t\r\n`), "a&amp;&quot;&lt;&gt;&#9;&#13;&#10;");
  assert.equal(imageTag("/x.png"), `<attached-image path="/x.png" name="window.png" />`);
});

function ipcHarness() {
  const handlers = new Map(), listeners = new Map();
  const ipcMain = { handle: (c, fn) => handlers.set(c, fn), on: (c, fn) => listeners.set(c, fn) };
  const own = { id: "panel" }, other = { id: "main-window" };
  const calls = [];
  const ask = {
    listBots: async () => ({ bots: [], selected: null }), pickWindows: async () => ({ windows: [] }),
    chooseWindow: async id => { calls.push(["choose", id]); return { preview: "p" }; }, clearCapture: () => calls.push(["clear"]),
    openPermissionSettings: () => calls.push(["settings"]), busy: () => false, send: async args => { calls.push(["send", args]); }, lastChat: () => null,
  };
  const panel = { hide: () => calls.push(["hide"]), fit: h => calls.push(["fit", h]), openChat: chat => calls.push(["open", chat]) };
  registerAskIpc({ ipcMain, owns: sender => sender === own, ask, panel });
  return { handlers, listeners, own, other, calls, ask };
}

test("every channel refuses senders other than the panel", async () => {
  const h = ipcHarness();
  for (const [channel, fn] of h.handlers) assert.throws(() => fn({ sender: h.other }, "window:1:0"), /forbidden/, channel);
  for (const fn of h.listeners.values()) fn({ sender: h.other }, 100);
  assert.deepEqual(h.calls, []);
});

test("arguments are validated", async () => {
  const h = ipcHarness();
  const call = (channel, ...args) => h.handlers.get(channel)({ sender: h.own }, ...args);
  assert.throws(() => call("ask:choose-window", "screen:1:0"), /invalid/);
  assert.throws(() => call("ask:choose-window", 5), /invalid/);
  assert.throws(() => call("ask:send", { botId: "b", text: "  " }), /invalid/);
  assert.throws(() => call("ask:send", { botId: "b/../x", text: "hi" }), /invalid/);
  assert.throws(() => call("ask:send", { botId: "b", text: "x".repeat(20_001) }), /invalid/);
  assert.throws(() => call("ask:send", null), /invalid/);
  assert.deepEqual(call("ask:send", { botId: "b", text: " hi " }), { ok: true });
  await call("ask:choose-window", "window:42:0");
  h.listeners.get("ask:fit")({ sender: h.own }, "tall");
  h.listeners.get("ask:fit")({ sender: h.own }, 200);
  h.listeners.get("ask:close")({ sender: h.own });
  assert.deepEqual(h.calls, [["send", { botId: "b", text: "hi" }], ["choose", "window:42:0"], ["fit", 200], ["hide"]]);
  h.ask.busy = () => true;
  assert.deepEqual(call("ask:send", { botId: "b", text: "hi" }), { ok: false, error: "busy" });
});

function deferredCapture(h) {
  const pending = [];
  h.capture.capture = () => new Promise(resolve => pending.push(() => resolve({ png: Buffer.from("LATE"), preview: "data:image/png;base64,LL" })));
  return () => pending.shift()();
}

for (const [what, letGo] of [
  ["clear", h => h.ask.clearCapture()],
  ["close", h => h.ask.close()],
]) {
  test(`a capture still running when the user lets go (${what}) is discarded and never uploaded`, async () => {
    const h = harness();
    const finish = deferredCapture(h);
    const choosing = h.ask.chooseWindow("window:1:0");
    letGo(h);
    finish();
    assert.deepEqual(await choosing, { error: "stale" });
    assert.equal(h.ask.held(), false);
  });
}

test("a capture still running when the user sends is not attached to that ask or the next one", async () => {
  const h = harness();
  const finish = deferredCapture(h);
  const choosing = h.ask.chooseWindow("window:1:0");
  const sent = h.ask.send({ botId: "codex-bot", text: "first" });
  finish();
  assert.deepEqual(await choosing, { error: "stale" });
  assert.equal(h.ask.held(), false);
  await h.answer("id-1");
  await sent;
  assert.equal(h.posted("/api/attachments").length, 0);
});

test("only the latest of two overlapping captures is kept", async () => {
  const h = harness();
  const finish = deferredCapture(h);
  const first = h.ask.chooseWindow("window:1:0");
  const second = h.ask.chooseWindow("window:1:0");
  finish();
  finish();
  assert.deepEqual(await first, { error: "stale" });
  assert.deepEqual(await second, { preview: "data:image/png;base64,LL" });
  assert.equal(h.ask.held(), true);
});
