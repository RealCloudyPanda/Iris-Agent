// `pnpm dev:server`: the harness from a source checkout, whose UI reaches it through Vite's dev proxy in a browser on
// this machine. OMB_DEV_TRUST_LOCAL_BROWSER=0 tries the sign-in a self-hosted server asks a browser for.
import { homedir } from "node:os";
import { devServerDataDir } from "./dev-data-dir.ts";

process.env.OMB_DEV_TRUST_LOCAL_BROWSER ??= "1";
// Before index.ts: server/config.ts reads OMB_DATA_DIR once, at import.
process.env.OMB_DATA_DIR = devServerDataDir(process.env, homedir());
await import("./index.ts");
