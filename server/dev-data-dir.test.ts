import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { devServerDataDir } from "./dev-data-dir.ts";

const DEV_SERVER = fileURLToPath(new URL("./dev-server.ts", import.meta.url));
const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** Runs dev-server.ts with its `./index.ts` swapped for a stub that prints OMB_DATA_DIR, so no server starts. */
function dataDirSeenByServer(env: Record<string, string | undefined>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "omb-dev-data-dir-")));
  temporary.push(dir);
  const hooks = join(dir, "hooks.mjs");
  writeFileSync(hooks, `export async function resolve(specifier, context, next) {
  if (specifier === "./index.ts" && context.parentURL?.endsWith("/dev-server.ts")) {
    return { url: "data:text/javascript,console.log(JSON.stringify(process.env.OMB_DATA_DIR))", shortCircuit: true };
  }
  return next(specifier, context);
}`);
  const register = join(dir, "register.mjs");
  writeFileSync(register, `import { register } from "node:module"; register(${JSON.stringify(`file://${hooks}`)});`);
  const childEnv: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: dir, USERPROFILE: dir };
  for (const [key, value] of Object.entries(env)) if (value !== undefined) childEnv[key] = value;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import", register, DEV_SERVER], { env: childEnv, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return { home: dir, seen: JSON.parse(result.stdout.trim()) as string };
}

describe("pnpm dev:server data folder", () => {
  it("defaults to ~/.openmausbot-dev, never the installed app's ~/.openmausbot", () => {
    expect(devServerDataDir({}, "/Users/me")).toBe(join("/Users/me", ".openmausbot-dev"));
    expect(devServerDataDir({ OMB_DATA_DIR: "" }, "/Users/me")).toBe(join("/Users/me", ".openmausbot-dev"));
  });

  it("keeps an explicit OMB_DATA_DIR", () => {
    expect(devServerDataDir({ OMB_DATA_DIR: "/tmp/fixture" }, "/Users/me")).toBe("/tmp/fixture");
  });

  it("is set before the server modules load", () => {
    const { home, seen } = dataDirSeenByServer({});
    expect(seen).toBe(join(home, ".openmausbot-dev"));
    expect(dataDirSeenByServer({ OMB_DATA_DIR: "/tmp/omb-explicit-fixture" }).seen).toBe("/tmp/omb-explicit-fixture");
  });
});
