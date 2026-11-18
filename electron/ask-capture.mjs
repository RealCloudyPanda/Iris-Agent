/** Window capture for the Ask panel. Pixels stay in this process's memory; nothing here touches the disk (D26). */
export const MAX_LONG_EDGE = 2000;
export const SCREEN_PRIVACY_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
const THUMB = Object.freeze({ width: 320, height: 200 });
const PREVIEW_WIDTH = 240;

/** The size that keeps the aspect ratio with the long edge at most `max`; never upscales. */
export function fitLongEdge({ width, height }, max = MAX_LONG_EDGE) {
  const long = Math.max(width, height);
  if (!(long > max)) return { width, height };
  const scale = max / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** "window:<number>:<n>" → "<number>"; source ids and getMediaSourceId() agree on the middle part. */
export const windowNumber = id => String(id ?? "").split(":")[1] ?? "";

export function withoutOwnWindows(sources, ownIds) {
  const own = new Set(ownIds.map(windowNumber).filter(Boolean));
  return sources.filter(source => !own.has(windowNumber(source.id)));
}

export function createWindowCapture({ desktopCapturer, systemPreferences, shell, screen, BrowserWindow, platform = process.platform }) {
  const permitted = () => platform !== "darwin" || systemPreferences.getMediaAccessStatus("screen") === "granted";
  const ownIds = () => BrowserWindow.getAllWindows().filter(win => !win.isDestroyed()).map(win => win.getMediaSourceId());
  const fullSize = () => {
    let width = 0, height = 0;
    for (const display of screen.getAllDisplays()) {
      width = Math.max(width, Math.round(display.size.width * display.scaleFactor));
      height = Math.max(height, Math.round(display.size.height * display.scaleFactor));
    }
    return { width: width || 2560, height: height || 1600 };
  };
  const sources = thumbnailSize => desktopCapturer.getSources({ types: ["window"], thumbnailSize, fetchWindowIcons: false })
    .then(list => withoutOwnWindows(list, ownIds()));

  return {
    async list() {
      if (!permitted()) return { error: "screen-permission" };
      const list = await sources(THUMB);
      return { windows: list.filter(source => !source.thumbnail.isEmpty()).map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() })) };
    },
    /** `{ png, preview }` for one window, or null when it is gone or not allowed. */
    async capture(id) {
      if (!permitted()) return null;
      const source = (await sources(fullSize())).find(entry => entry.id === id);
      if (!source || source.thumbnail.isEmpty()) return null;
      let image = source.thumbnail;
      const size = image.getSize(), fit = fitLongEdge(size);
      if (fit.width !== size.width) image = image.resize({ ...fit, quality: "best" });
      const preview = image.resize({ width: Math.min(PREVIEW_WIDTH, fit.width), quality: "good" }).toDataURL();
      return { png: image.toPNG(), preview };
    },
    openPermissionSettings: () => shell.openExternal(SCREEN_PRIVACY_URL),
  };
}
