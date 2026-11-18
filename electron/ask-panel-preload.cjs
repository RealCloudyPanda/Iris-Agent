const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ask", {
  listBots: () => ipcRenderer.invoke("ask:list-bots"),
  pickWindows: () => ipcRenderer.invoke("ask:pick-windows"),
  chooseWindow: id => ipcRenderer.invoke("ask:choose-window", String(id)),
  clearCapture: () => ipcRenderer.invoke("ask:clear-capture"),
  openPermissionSettings: () => ipcRenderer.invoke("ask:open-permission-settings"),
  send: ({ botId, text }) => ipcRenderer.invoke("ask:send", { botId: String(botId), text: String(text) }),
  openChat: () => ipcRenderer.invoke("ask:open-chat"),
  close: () => ipcRenderer.send("ask:close"),
  fit: height => ipcRenderer.send("ask:fit", Number(height)),
  onUpdate: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("ask:update", listener);
    return () => ipcRenderer.removeListener("ask:update", listener);
  },
});
