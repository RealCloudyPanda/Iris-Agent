import test from "node:test";
import assert from "node:assert/strict";
import { createWindowCapture, fitLongEdge, SCREEN_PRIVACY_URL, withoutOwnWindows } from "./ask-capture.mjs";

function image(width, height) {
  return {
    width, height,
    isEmpty: () => width === 0,
    getSize: () => ({ width, height }),
    resize: ({ width: w, height: h }) => image(w, h ?? Math.round((height * w) / width)),
    toPNG: () => Buffer.from(`png ${width}x${height}`),
    toDataURL: () => `data:image/png;base64,${width}x${height}`,
  };
}

test("fitLongEdge keeps the aspect ratio with a 2000 px long edge and never upscales", () => {
  assert.deepEqual(fitLongEdge({ width: 5120, height: 2880 }), { width: 2000, height: 1125 });
  assert.deepEqual(fitLongEdge({ width: 1000, height: 4000 }), { width: 500, height: 2000 });
  assert.deepEqual(fitLongEdge({ width: 1600, height: 900 }), { width: 1600, height: 900 });
  assert.deepEqual(fitLongEdge({ width: 2000, height: 2000 }), { width: 2000, height: 2000 });
});

test("withoutOwnWindows drops this app's windows by window number", () => {
  const sources = [{ id: "window:10:0" }, { id: "window:11:0" }, { id: "window:12:0" }];
  assert.deepEqual(withoutOwnWindows(sources, ["window:11:0", "window:12:1"]).map(s => s.id), ["window:10:0"]);
});

function harness({ status = "granted", platform = "darwin" } = {}) {
  const h = { calls: [], opened: [] };
  h.capture = createWindowCapture({
    platform,
    systemPreferences: { getMediaAccessStatus: kind => { assert.equal(kind, "screen"); return status; } },
    shell: { openExternal: url => { h.opened.push(url); return Promise.resolve(); } },
    screen: { getAllDisplays: () => [{ size: { width: 1440, height: 900 }, scaleFactor: 2 }, { size: { width: 3840, height: 2160 }, scaleFactor: 1 }] },
    BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, getMediaSourceId: () => "window:99:0" }] },
    desktopCapturer: {
      getSources: async options => {
        h.calls.push(options);
        const { width, height } = options.thumbnailSize;
        return [
          { id: "window:1:0", name: "Editor", thumbnail: image(width, Math.round(height / 2)) },
          { id: "window:99:0", name: "MausBot", thumbnail: image(width, height) },
          { id: "window:2:0", name: "Minimised", thumbnail: image(0, 0) },
        ];
      },
    },
  });
  return h;
}

test("without Screen Recording permission nothing is captured and the fixed Privacy URL is offered", async () => {
  const h = harness({ status: "denied" });
  assert.deepEqual(await h.capture.list(), { error: "screen-permission" });
  assert.equal(await h.capture.capture("window:1:0"), null);
  assert.equal(h.calls.length, 0);
  await h.capture.openPermissionSettings();
  assert.deepEqual(h.opened, [SCREEN_PRIVACY_URL]);
  assert.equal(SCREEN_PRIVACY_URL, "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
});

test("list asks for 320x200 thumbnails without icons and leaves out the app's own and empty windows", async () => {
  const h = harness();
  const { windows } = await h.capture.list();
  assert.deepEqual(h.calls[0], { types: ["window"], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: false });
  assert.deepEqual(windows, [{ id: "window:1:0", name: "Editor", thumbnail: "data:image/png;base64,320x100" }]);
});

test("capture grabs at the largest display's pixel size, downscales to 2000 px, and returns PNG bytes plus a preview", async () => {
  const h = harness({ platform: "linux", status: "denied" });
  const shot = await h.capture.capture("window:1:0");
  assert.deepEqual(h.calls[0].thumbnailSize, { width: 3840, height: 2160 });
  assert.equal(shot.png.toString(), "png 2000x563");
  assert.equal(shot.preview, "data:image/png;base64,240x68");
  assert.equal(await h.capture.capture("window:99:0"), null, "its own window cannot be captured");
  assert.equal(await h.capture.capture("window:7:0"), null);
});
