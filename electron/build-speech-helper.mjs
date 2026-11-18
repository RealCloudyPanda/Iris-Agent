// A real app bundle: macOS TCC reads the executable's bundle Info.plist and kills a loose binary that lacks one.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(electronDir);
const resourcesDir = path.join(electronDir, "resources");

export const speechHelperBundle = path.join(resourcesDir, "Iris Agent Speech.app");
export const speechHelperBinary = path.join(speechHelperBundle, "Contents", "MacOS", "speech-helper");

export function buildSpeechHelper() {
  const contents = path.join(speechHelperBundle, "Contents");
  mkdirSync(path.join(contents, "MacOS"), { recursive: true });
  copyFileSync(path.join(resourcesDir, "speech-helper-Info.plist"), path.join(contents, "Info.plist"));
  // Universal, since the helper rides in both arm64 and x64 apps and bare `swiftc` builds host-arch only. macos12 = LSMinimumSystemVersion.
  // A toolchain without the other arch's SDK slice (common on Apple silicon CLT installs) still gets a host-arch helper.
  const hostArch = process.arch === "arm64" ? "arm64" : "x86_64";
  const slices = ["arm64", "x86_64"].flatMap((arch) => {
    const slice = `${speechHelperBinary}-${arch}`;
    try {
      execFileSync(
        "swiftc",
        ["-O", "-target", `${arch}-apple-macos12`, path.join(resourcesDir, "speech-helper.swift"), "-o", slice],
        { stdio: "inherit", timeout: 120_000 },
      );
    } catch (error) {
      if (arch === hostArch) throw error;
      console.warn(`speech helper: ${arch} slice could not be built here; building ${hostArch} only`);
      return [];
    }
    return [slice];
  });
  execFileSync("lipo", ["-create", ...slices, "-output", speechHelperBinary], {
    stdio: "inherit",
    timeout: 60_000,
  });
  for (const slice of slices) rmSync(slice, { force: true });
  const archs = execFileSync("lipo", ["-archs", speechHelperBinary], { timeout: 60_000 }).toString();
  if (!archs.includes(hostArch) || (slices.length === 2 && !archs.includes("x86_64"))) {
    throw new Error(`speech helper is missing a built slice: ${archs.trim()}`);
  }
  // Ad-hoc signed for dev with the release's audio entitlement; electron-builder replaces it when signing.
  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--options",
      "runtime",
      "--entitlements",
      path.join(projectDir, "build", "entitlements.mac.plist"),
      speechHelperBundle,
    ],
    { stdio: "inherit", timeout: 30_000 },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildSpeechHelper();
}
