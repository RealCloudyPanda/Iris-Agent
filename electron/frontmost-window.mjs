// The previous window for the Ask panel (D24, D31, D34): which app and window were in front when the shortcut was
// pressed, and the app owning each window. macOS only, through a small Swift helper; elsewhere everything is null.
// The result lives in memory only.
import { execFile as nodeExecFile } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FRONTMOST_TIMEOUT_MS = 300;
export const FRONTMOST_SOURCE = fileURLToPath(new URL("./frontmost-window.swift", import.meta.url));
const HELPER = "frontmost-window";

const str = value => (typeof value === "string" && value ? value.slice(0, 512) : null);
const int = value => (Number.isSafeInteger(value) && value > 0 ? value : null);

/** The helper's JSON, checked field by field; anything malformed is null. */
export function parseFrontmost(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  const windows = Array.isArray(data.windows)
    ? data.windows.map(w => ({ windowNumber: int(w?.windowNumber), appName: str(w?.appName) })).filter(w => w.windowNumber)
    : [];
  const pid = int(data.pid);
  return {
    previous: pid ? { pid, bundleId: str(data.bundleId), appName: str(data.appName), windowNumber: int(data.windowNumber), title: str(data.title) } : null,
    windows,
  };
}

/** Packaged: Resources/frontmost-window. Dev: compiled on demand into a cache dir when swiftc exists, else null. */
export function helperBinary({ resourcesPath = process.resourcesPath, cacheDir = path.join(os.tmpdir(), "iris-frontmost-window"), execFile = nodeExecFile, exists = existsSync, log = () => {} } = {}) {
  const packaged = resourcesPath ? path.join(resourcesPath, HELPER) : null;
  if (packaged && exists(packaged)) return Promise.resolve(packaged);
  const out = path.join(cacheDir, HELPER);
  try {
    if (exists(out) && statSync(out).mtimeMs >= statSync(FRONTMOST_SOURCE).mtimeMs) return Promise.resolve(out);
    mkdirSync(cacheDir, { recursive: true });
  } catch { return Promise.resolve(null); }
  return new Promise(resolve => execFile("swiftc", ["-O", FRONTMOST_SOURCE, "-o", out], { timeout: 120_000 }, error => {
    if (error) log(`frontmost helper not built: ${error.message}`);
    resolve(error ? null : out);
  }));
}

export function createFrontmostWindow({ platform = process.platform, execFile = nodeExecFile, binary = () => helperBinary({ execFile }), ownPid = process.pid, timeoutMs = FRONTMOST_TIMEOUT_MS, log = () => {} } = {}) {
  let found = null;
  const helper = () => (platform === "darwin" ? (found ??= Promise.resolve().then(binary).catch(() => null)) : Promise.resolve(null));
  if (platform === "darwin") void helper();
  const run = async (args, timeout) => {
    const file = await helper();
    if (!file) return null;
    return new Promise(resolve => execFile(file, args, { timeout, maxBuffer: 1 << 20 }, (error, stdout) => resolve(error ? null : String(stdout))));
  };
  const read = async () => {
    // A helper still compiling (dev) or hanging must not hold the panel back.
    const timer = new Promise(resolve => setTimeout(resolve, timeoutMs, null));
    const raw = await Promise.race([run([], timeoutMs), timer]);
    return raw === null ? null : parseFrontmost(raw);
  };
  return {
    /** `{ previous, windows }` or null; `previous` is null when Iris itself is in front. */
    async read() {
      const result = await read().catch(() => null);
      if (result?.previous?.pid === ownPid) result.previous = null;
      return result;
    },
    /** Re-activates the app with this pid if it still runs. */
    async activate(pid) {
      if (!int(pid) || pid === ownPid) return false;
      const out = await run(["--activate", String(pid)], 2_000).catch(() => null);
      if (out === null) log(`could not return focus to ${pid}`);
      return out !== null;
    },
  };
}
