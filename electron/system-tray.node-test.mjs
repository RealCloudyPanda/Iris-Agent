import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { createSystemTray } from "./system-tray.mjs";

function tray(ask) {
  let made;
  class Tray extends EventEmitter {
    constructor() { super(); made = this; }
    setToolTip() {}
    setContextMenu(menu) { this.menu = menu; }
    isDestroyed() { return false; }
  }
  const created = createSystemTray({ Tray, Menu: { buildFromTemplate: items => items }, nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    iconPath: "icon.png", getWindow: () => null, onQuit: () => {}, ask });
  return { created, labels: () => made.menu.map(item => item.label ?? item.type), menu: () => made.menu };
}

test("without an Ask panel the menu is unchanged", () => {
  assert.deepEqual(tray().labels(), ["Open Iris", "separator", "Quit Iris"]);
});

test("the Ask item appears once the panel exists, and opens it", () => {
  let item = null, opened = 0;
  const t = tray(() => item);
  assert.equal(t.labels().length, 3);
  item = { label: "Ask… (shortcut unavailable)", click: () => { opened += 1; } };
  t.created.relabel();
  assert.deepEqual(t.labels(), ["Open Iris", "Ask… (shortcut unavailable)", "separator", "Quit Iris"]);
  t.menu()[1].click();
  assert.equal(opened, 1);
});
