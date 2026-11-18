import test from "node:test";
import assert from "node:assert/strict";
import { createFrontmostWindow, parseFrontmost } from "./frontmost-window.mjs";

const OUT = JSON.stringify({ pid: 42, bundleId: "com.example.editor", appName: "Editor", windowNumber: 7, title: "notes.txt", windows: [{ windowNumber: 7, appName: "Editor" }, { windowNumber: "x" }] });

function fakeExec(reply) {
  const calls = [];
  const execFile = (file, args, options, done) => { calls.push([file, args]); reply(args, done); };
  return { calls, execFile };
}

test("parseFrontmost keeps checked fields and drops the rest", () => {
  assert.deepEqual(parseFrontmost(OUT), {
    previous: { pid: 42, bundleId: "com.example.editor", appName: "Editor", windowNumber: 7, title: "notes.txt" },
    windows: [{ windowNumber: 7, appName: "Editor" }],
  });
  assert.equal(parseFrontmost("nope"), null);
  assert.deepEqual(parseFrontmost(JSON.stringify({ windows: [] })), { previous: null, windows: [] });
});

test("read and activate run the helper on macOS", async () => {
  const exec = fakeExec((args, done) => done(null, args.length ? "" : OUT));
  const front = createFrontmostWindow({ platform: "darwin", execFile: exec.execFile, binary: () => "/helper", ownPid: 1 });
  assert.equal((await front.read()).previous.pid, 42);
  assert.equal(await front.activate(42), true);
  assert.deepEqual(exec.calls.at(-1), ["/helper", ["--activate", "42"]]);
});

test("Iris itself in front is no previous window; activating Iris or a bad pid does nothing", async () => {
  const exec = fakeExec((args, done) => done(null, OUT));
  const front = createFrontmostWindow({ platform: "darwin", execFile: exec.execFile, binary: () => "/helper", ownPid: 42 });
  assert.equal((await front.read()).previous, null);
  assert.equal(await front.activate(42), false);
  assert.equal(await front.activate(-1), false);
});

test("a slow, failing or missing helper, or another platform, gives null", async () => {
  const slow = createFrontmostWindow({ platform: "darwin", execFile: fakeExec(() => {}).execFile, binary: () => "/helper", timeoutMs: 20 });
  assert.equal(await slow.read(), null);
  const failing = createFrontmostWindow({ platform: "darwin", execFile: fakeExec((args, done) => done(new Error("gone"))).execFile, binary: () => "/helper" });
  assert.equal(await failing.read(), null);
  assert.equal(await failing.activate(7), false, "an app that no longer runs is left alone");
  assert.equal(await createFrontmostWindow({ platform: "darwin", binary: () => null }).read(), null);
  const exec = fakeExec((args, done) => done(null, OUT));
  assert.equal(await createFrontmostWindow({ platform: "win32", execFile: exec.execFile, binary: () => "/helper" }).read(), null);
  assert.equal(exec.calls.length, 0);
});
