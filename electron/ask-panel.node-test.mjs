import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { ASK_PANEL, askPanelBounds, askPanelHtml, createAskPanel, isAskPanel } from "./ask-panel.mjs";

test("bounds: 480 wide, bottom-centre, height clamped to 360", () => {
  const area = { x: 100, y: 0, width: 1440, height: 900 };
  assert.deepEqual(askPanelBounds(area, 200), { x: 580, y: 676, width: 480, height: 200 });
  assert.equal(askPanelBounds(area, 2000).height, ASK_PANEL.maxHeight);
  assert.equal(askPanelBounds(area, 1).height, ASK_PANEL.minHeight);
});

test("the page has a strict CSP, no remote loads, and renders reply text as text", () => {
  const html = askPanelHtml();
  assert.match(html, /default-src 'none'; img-src data:;/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /innerHTML/);
  assert.match(html, /reply\.textContent=u\.text/);
});

test("the preload exposes only the narrow api", () => {
  const preload = readFileSync(new URL("./ask-panel-preload.cjs", import.meta.url), "utf8");
  const names = [...preload.matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
  assert.deepEqual(names, ["listBots", "pickWindows", "chooseWindow", "clearCapture", "openPermissionSettings", "send", "openChat", "close", "fit", "onUpdate"]);
  assert.doesNotMatch(preload, /exposeInMainWorld\("ask", ipcRenderer\)|token|https?:/i);
});

function fakes() {
  const made = [];
  class FakeWindow {
    constructor(options) {
      Object.assign(this, { options, visible: false, focused: false, destroyed: false, events: new EventEmitter(), bounds: null });
      this.webContents = Object.assign(new EventEmitter(), { sent: [], setWindowOpenHandler: fn => { this.openHandler = fn; } });
      this.webContents.send = (...m) => this.webContents.sent.push(m);
      made.push(this);
    }
    on(...a) { this.events.on(...a); }
    setAlwaysOnTop(...a) { this.top = a; }
    setVisibleOnAllWorkspaces(...a) { this.workspaces = a; }
    setBounds(b) { this.bounds = b; }
    loadURL(url) { this.url = url; return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isFocused() { return this.focused; }
    show() { this.visible = true; }
    focus() { this.focused = true; }
    hide() { this.visible = false; this.focused = false; }
    destroy() { this.destroyed = true; }
  }
  const screen = { getCursorScreenPoint: () => ({ x: 5, y: 5 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }) };
  return { made, FakeWindow, screen };
}

test("the window is made lazily, locked down, focusable, and hidden (not destroyed) on toggle", () => {
  const { made, FakeWindow, screen } = fakes();
  let hidden = 0;
  const panel = createAskPanel({ BrowserWindow: FakeWindow, screen, onHide: () => { hidden += 1; } });
  assert.equal(made.length, 0);
  panel.toggle();
  const [win] = made;
  assert.equal(isAskPanel(win), true);
  assert.equal(win.options.focusable, true);
  assert.equal(win.options.movable, false);
  assert.equal(win.options.resizable, false);
  assert.deepEqual([win.options.webPreferences.contextIsolation, win.options.webPreferences.sandbox, win.options.webPreferences.nodeIntegration], [true, true, false]);
  assert.match(win.options.webPreferences.preload, /ask-panel-preload\.cjs$/);
  assert.match(win.url, /^data:text\/html/);
  assert.deepEqual(win.openHandler(), { action: "deny" });
  const nav = { prevented: false, preventDefault() { this.prevented = true; } };
  win.webContents.emit("will-navigate", nav);
  assert.equal(nav.prevented, true);
  assert.equal(win.visible, true);
  assert.equal(panel.owns(win.webContents), true);
  assert.equal(panel.owns({}), false);
  panel.fit(500);
  assert.equal(win.bounds.height, 360);
  panel.toggle();
  assert.equal(win.visible, false);
  assert.equal(hidden, 1);
  panel.toggle();
  assert.equal(made.length, 1, "shown again, not remade");
  panel.close();
  assert.equal(win.destroyed, true);
});

test("the page drops a window preview that arrives after the user let go", () => {
  const html = askPanelHtml();
  assert.match(html, /const mine=\+\+pick;const r=await api\.chooseWindow\(id\);if\(mine!==pick\|\|!inc\.checked\|\|r\?\.error==="stale"\)return;/);
  for (const letGo of ['if(!inc.checked){pick++;', 'pick++;const r=await api.send(', '"click",async()=>{pick++;', "const hide=()=>{pick++;"]) assert.ok(html.includes(letGo), letGo);
});
