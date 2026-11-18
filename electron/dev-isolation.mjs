import path from "node:path";

export const DEV_APP_DIR_NAME = "OpenMausBot-Dev";
export const DEV_DATA_DIR_NAME = ".openmausbot-dev";

/** Where a dev build keeps its Electron state, or null for a packaged build (which keeps Electron's defaults). */
export function devAppPaths({ isPackaged, appData, home, platform }) {
  if (isPackaged) return null;
  const userData = path.join(appData, DEV_APP_DIR_NAME);
  // Electron 43 on macOS logs to ~/Library/Logs/<name>; "openmausbot" and "OpenMausBot" are one folder on a case-insensitive disk.
  const logs = platform === "darwin" ? path.join(home, "Library", "Logs", DEV_APP_DIR_NAME) : path.join(userData, "logs");
  return { userData, logs };
}

/** Must run before any app.getPath("userData") and before app.requestSingleInstanceLock(): both bind to the folder. */
export function applyDevIsolation(app, platform = process.platform) {
  if (app.isPackaged) return null;
  const paths = devAppPaths({ isPackaged: app.isPackaged, appData: app.getPath("appData"), home: app.getPath("home"), platform });
  if (!paths) return null;
  app.setPath("userData", paths.userData);
  app.setAppLogsPath(paths.logs);
  return paths;
}

// An empty OMB_DATA_DIR falls back too; server/config.ts would not, so the child gets this path.
export function defaultServerDataDir({ isPackaged, home, env }) {
  return env.OMB_DATA_DIR || path.join(home, isPackaged ? ".openmausbot" : DEV_DATA_DIR_NAME);
}
