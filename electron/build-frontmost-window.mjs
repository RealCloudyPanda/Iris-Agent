// The Ask panel's window helper, universal like the speech helper; electron-builder signs it with the app.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FRONTMOST_SOURCE } from "./frontmost-window.mjs";

const resourcesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "resources");
export const frontmostHelperBinary = path.join(resourcesDir, "frontmost-window");

const HOST_ARCH = process.arch === "x64" ? "x86_64" : "arm64";

/** The arches to build: both when the toolchain can, else only the host's (an arm64-only toolchain must not block packaging). */
export function chooseArches(compiles, host = HOST_ARCH) {
  const built = ["arm64", "x86_64"].filter(compiles);
  if (built.length === 2) return built;
  if (!built.includes(host)) throw new Error(`frontmost helper: the ${host} slice did not compile`);
  return [host];
}

export function buildFrontmostHelper({ log = console.log } = {}) {
  mkdirSync(resourcesDir, { recursive: true });
  const slice = arch => `${frontmostHelperBinary}-${arch}`;
  const compiles = (arch) => {
    try {
      execFileSync("swiftc", ["-O", "-target", `${arch}-apple-macos12`, FRONTMOST_SOURCE, "-o", slice(arch)], { stdio: ["ignore", "inherit", "pipe"], timeout: 120_000 });
      return true;
    } catch (error) {
      log(`frontmost helper: ${arch} slice failed (${String(error.stderr ?? error.message).trim().split("\n").at(-1)})`);
      return false;
    }
  };
  const arches = chooseArches(compiles);
  execFileSync("lipo", ["-create", ...arches.map(slice), "-output", frontmostHelperBinary], { stdio: "inherit", timeout: 60_000 });
  for (const arch of ["arm64", "x86_64"]) rmSync(slice(arch), { force: true });
  log(arches.length === 2 ? "frontmost helper: built universal (arm64, x86_64)"
    : `frontmost helper: built ${arches[0]} only; Intel Macs get no previous-window detection (the picker still works)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildFrontmostHelper();
}
