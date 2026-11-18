import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { dockMenuWithAsk, installAsk, labelWindows } from "./ask-main.mjs";
import { ASK_ACCELERATOR } from "./ask-shortcut.mjs";

const settle = async () => { for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const PREVIOUS = { pid: 42, bundleId: "com.example.editor", appName: "Editor", windowNumber: 7, title: "notes.txt" };

function world({ taken = false, previous = PREVIOUS, dock = null } = {}) {
  const made = [], activated = [], keys = new Map();
  class FakeWindow {
    static getAllWindows() { return made; }
    constructor(options) {
      Object.assign(this, { options, visible: false, focused: false, destroyed: false, events: new EventEmitter() });
      this.webContents = Object.assign(new EventEmitter(), { send() {}, setWindowOpenHandler() {} });
      made.push(this);
    }
    on(...a) { this.events.on(...a); }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setBounds() {}
    loadURL() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isFocused() { return this.focused; }
    show() { this.visible = true; }
    focus() { this.focused = true; }
    hide() { this.visible = false; this.focused = false; }
    destroy() { this.destroyed = true; }
  }
  const handlers = new Map(), listeners = new Map();
  const ipcMain = {
    handle(channel, fn) { assert.ok(!handlers.has(channel), `second handler for ${channel}`); handlers.set(channel, fn); },
    removeHandler: channel => handlers.delete(channel),
    on(channel, fn) { listeners.set(channel, [...(listeners.get(channel) ?? []), fn]); },
    removeListener(channel, fn) { listeners.set(channel, (listeners.get(channel) ?? []).filter(entry => entry !== fn)); if (!listeners.get(channel).length) listeners.delete(channel); },
  };
  const globalShortcut = { register: (key, fn) => { if (taken) return false; keys.set(key, fn); return true; }, unregister: key => keys.delete(key) };
  const screen = { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) };
  const frontmost = {
    read: async () => ({ previous, windows: [{ windowNumber: 7, appName: "Editor" }, { windowNumber: 9, appName: "Mail" }] }),
    activate: async pid => { activated.push(pid); return true; },
  };
  const installed = installAsk({ ipcMain, BrowserWindow: FakeWindow, globalShortcut, screen, desktopCapturer: {}, systemPreferences: {}, shell: {}, platform: "darwin",
    request: async () => { throw new Error("no server"); }, store: { read: () => ({}), write() {} }, serverKey: () => "srv", openChat: () => {}, frontmost, dock, Menu: { buildFromTemplate: items => ({ items }) } });
  const press = async () => { keys.get(ASK_ACCELERATOR)(); await settle(); };
  const win = () => made[0];
  const from = () => ({ sender: win().webContents });
  return { installed, made, handlers, listeners, keys, activated, press, win, from };
}

test("repeated show/hide cycles make one window and add no handlers; close removes them and the shortcut", async () => {
  const w = world();
  const channels = [...w.handlers.keys()].sort(), counts = [...w.listeners].map(([c, l]) => [c, l.length]);
  for (let i = 0; i < 3; i += 1) {
    await w.press();
    assert.equal(w.win().visible, true);
    await w.press();
    assert.equal(w.win().visible, false);
  }
  assert.equal(w.made.length, 1);
  assert.deepEqual([...w.handlers.keys()].sort(), channels);
  assert.deepEqual([...w.listeners].map(([c, l]) => [c, l.length]), counts);
  w.installed.close();
  assert.equal(w.handlers.size, 0);
  assert.equal(w.listeners.size, 0);
  assert.equal(w.keys.size, 0);
  assert.equal(w.win().destroyed, true);
});

test("Esc from the focused panel returns focus to the app in front at shortcut time", async () => {
  const w = world();
  await w.press();
  w.listeners.get("ask:close")[0](w.from());
  await settle();
  assert.deepEqual(w.activated, [42]);
});

test("no focus return when the user already switched apps, when opening the chat, or without a previous app", async () => {
  const w = world();
  await w.press();
  w.win().focused = false;
  w.listeners.get("ask:close")[0](w.from());
  await w.press();
  await w.handlers.get("ask:open-chat")(w.from());
  await settle();
  assert.deepEqual(w.activated, []);
  const none = world({ previous: null });
  await none.press();
  none.listeners.get("ask:close")[0](none.from());
  await settle();
  assert.deepEqual(none.activated, []);
});

test("the tray item names the shortcut, or says it is unavailable, and opens the panel", async () => {
  const w = world();
  assert.deepEqual({ ...w.installed.trayItem(), click: undefined }, { id: "ask-panel", label: "Ask…", accelerator: ASK_ACCELERATOR, registerAccelerator: false, click: undefined });
  w.installed.trayItem().click();
  await settle();
  assert.equal(w.win().visible, true);
  assert.equal(world({ taken: true }).installed.trayItem().label, "Ask… (shortcut unavailable)");
});

test("suppresses only while the panel is visible", async () => {
  const w = world();
  assert.equal(w.installed.suppresses("t1"), false);
  await w.press();
  assert.equal(w.installed.suppresses("t1"), false, "no ask yet");
});

test("labelWindows names each window's app and preselects the previous window by number, else by title", () => {
  const windows = [{ id: "window:9:0", name: "Inbox" }, { id: "window:7:0", name: "notes.txt" }, { id: "window:5:0", name: "x" }];
  const owners = [{ windowNumber: 7, appName: "Editor" }, { windowNumber: 9, appName: "Mail" }];
  assert.deepEqual(labelWindows(windows, PREVIOUS, owners).map(w => [w.app, w.preselected]), [["Mail", false], ["Editor", true], [null, false]]);
  const byTitle = labelWindows([{ id: "window:1:0", name: "notes.txt" }], { ...PREVIOUS, windowNumber: null }, []);
  assert.deepEqual(byTitle.map(w => [w.app, w.preselected]), [["Editor", true]]);
  assert.deepEqual(labelWindows(windows, null, []).map(w => w.preselected), [false, false, false]);
});

test("the Dock menu gains the Ask item first and keeps its other items", async () => {
  const other = { id: "other", label: "New window" };
  let menu = { items: [other] };
  const w = world({ dock: { getMenu: () => menu, setMenu: next => { menu = next; } } });
  assert.deepEqual(menu.items.map(item => item.label), ["Ask…", "New window"]);
  menu.items[0].click();
  await settle();
  assert.equal(w.win().visible, true);
  assert.deepEqual(dockMenuWithAsk(menu, { id: "ask-panel", label: "Ask… (shortcut unavailable)" }).map(item => item.label), ["Ask… (shortcut unavailable)", "New window"]);
  assert.deepEqual(dockMenuWithAsk(null, other), [other]);
});
