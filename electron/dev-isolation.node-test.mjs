import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { applyDevIsolation, defaultServerDataDir, devAppPaths } from "./dev-isolation.mjs";

function fakeApp({ isPackaged }) {
  const calls = [];
  return {
    calls,
    isPackaged,
    getPath(name) {
      calls.push(["getPath", name]);
      return { appData: "/Users/me/Library/Application Support", home: "/Users/me" }[name];
    },
    setPath: (name, value) => calls.push(["setPath", name, value]),
    setAppLogsPath: (value) => calls.push(["setAppLogsPath", value]),
  };
}

test("a dev build gets its own userData and logs folders", () => {
  const app = fakeApp({ isPackaged: false });
  const paths = applyDevIsolation(app, "darwin");
  assert.deepEqual(paths, {
    userData: path.join("/Users/me/Library/Application Support", "OpenMausBot-Dev"),
    logs: path.join("/Users/me", "Library", "Logs", "OpenMausBot-Dev"),
  });
  assert.deepEqual(app.calls.filter(([kind]) => kind !== "getPath"), [
    ["setPath", "userData", paths.userData],
    ["setAppLogsPath", paths.logs],
  ]);
});

test("a dev build never reads userData before overriding it", () => {
  const app = fakeApp({ isPackaged: false });
  applyDevIsolation(app, "darwin");
  assert.deepEqual(app.calls.filter(([kind]) => kind === "getPath").map(([, name]) => name).sort(), ["appData", "home"]);
});

test("off macOS the dev logs live inside the dev userData folder", () => {
  const paths = devAppPaths({ isPackaged: false, appData: "/home/me/.config", home: "/home/me", platform: "linux" });
  assert.equal(paths.logs, path.join("/home/me/.config", "OpenMausBot-Dev", "logs"));
});

test("a packaged build is left exactly as Electron set it up", () => {
  const app = fakeApp({ isPackaged: true });
  assert.equal(applyDevIsolation(app, "darwin"), null);
  assert.deepEqual(app.calls, []);
});

test("the server data folder defaults to ~/.iris-agent when packaged and ~/.openmausbot-dev in dev", () => {
  assert.equal(defaultServerDataDir({ isPackaged: true, home: "/Users/me", env: {} }), path.join("/Users/me", ".iris-agent"));
  assert.equal(defaultServerDataDir({ isPackaged: false, home: "/Users/me", env: {} }), path.join("/Users/me", ".openmausbot-dev"));
});

test("OMB_DATA_DIR wins in both builds, and an empty one falls back to the default", () => {
  for (const isPackaged of [true, false]) {
    assert.equal(defaultServerDataDir({ isPackaged, home: "/Users/me", env: { OMB_DATA_DIR: "/tmp/fixture" } }), "/tmp/fixture");
  }
  assert.equal(defaultServerDataDir({ isPackaged: false, home: "/Users/me", env: { OMB_DATA_DIR: "" } }), path.join("/Users/me", ".openmausbot-dev"));
});
