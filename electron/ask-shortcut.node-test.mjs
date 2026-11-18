import test from "node:test";
import assert from "node:assert/strict";
import { ASK_ACCELERATOR, createAskShortcut } from "./ask-shortcut.mjs";

function fakeShortcut(result) {
  const keys = new Map();
  return {
    keys,
    register(accelerator, fn) {
      if (result instanceof Error) throw result;
      if (result) keys.set(accelerator, fn);
      return result;
    },
    unregister(accelerator) { keys.delete(accelerator); },
  };
}

test("registers Control+Alt+A and presses reach onPress", () => {
  const globalShortcut = fakeShortcut(true);
  let pressed = 0;
  const shortcut = createAskShortcut({ globalShortcut, onPress: () => { pressed += 1; } });
  assert.deepEqual(shortcut.state(), { accelerator: "Control+Alt+A", registered: true, taken: false });
  globalShortcut.keys.get(ASK_ACCELERATOR)();
  assert.equal(pressed, 1);
});

test("a key another app holds is reported as taken and logged", () => {
  const log = [];
  const shortcut = createAskShortcut({ globalShortcut: fakeShortcut(false), onPress() {}, log: line => log.push(line) });
  assert.deepEqual(shortcut.state(), { accelerator: ASK_ACCELERATOR, registered: false, taken: true });
  assert.match(log.join("\n"), /taken/);
});

test("a throwing register counts as taken", () => {
  const shortcut = createAskShortcut({ globalShortcut: fakeShortcut(new Error("boom")), onPress() {} });
  assert.equal(shortcut.state().taken, true);
});

test("close unregisters once", () => {
  const globalShortcut = fakeShortcut(true);
  const shortcut = createAskShortcut({ globalShortcut, onPress() {} });
  shortcut.close();
  shortcut.close();
  assert.equal(globalShortcut.keys.size, 0);
  assert.equal(shortcut.state().registered, false);
});
