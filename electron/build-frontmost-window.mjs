// The Ask panel's window helper, universal like the speech helper; electron-builder signs it with the app.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FRONTMOST_SOURCE } from "./frontmost-window.mjs";

const resourcesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "resources");
export const frontmostHelperBinary = path.join(resourcesDir, "frontmost-window");

export function buildFrontmostHelper() {
  mkdirSync(resourcesDir, { recursive: true });
  const slices = ["arm64", "x86_64"].map((arch) => {
    const slice = `${frontmostHelperBinary}-${arch}`;
    execFileSync("swiftc", ["-O", "-target", `${arch}-apple-macos12`, FRONTMOST_SOURCE, "-o", slice], { stdio: "inherit", timeout: 120_000 });
    return slice;
  });
  execFileSync("lipo", ["-create", ...slices, "-output", frontmostHelperBinary], { stdio: "inherit", timeout: 60_000 });
  for (const slice of slices) rmSync(slice, { force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildFrontmostHelper();
}
