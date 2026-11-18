import { app } from "electron";
import { fileURLToPath } from "node:url";

if (process.platform === "darwin" && !app.isPackaged) {
  app.whenReady().then(() => app.dock?.setIcon(fileURLToPath(new URL("../build/icon.png", import.meta.url))));
}
