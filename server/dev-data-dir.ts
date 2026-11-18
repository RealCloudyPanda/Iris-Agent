import { join } from "node:path";

/** `pnpm dev:server`'s data folder: OMB_DATA_DIR when set, else ~/.openmausbot-dev, apart from the installed app's ~/.openmausbot. */
export function devServerDataDir(env: NodeJS.ProcessEnv, home: string): string {
  return env.OMB_DATA_DIR || join(home, ".openmausbot-dev");
}
