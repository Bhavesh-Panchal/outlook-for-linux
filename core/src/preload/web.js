"use strict";

// Preload for every app window. Runs sandboxed with contextIsolation, so it
// must stay self-contained (no relative requires). Pages see only the
// functions below; the main process checks the sender frame of every message
// ("web" channels accept product pages, "local" channels the shell's own HTML).

const { contextBridge, ipcRenderer, webFrame } = require("electron");

if (location.protocol === "file:") {
  // The shell's own pages (offline page).
  contextBridge.exposeInMainWorld("ms365Local", Object.freeze({ retry: () => ipcRenderer.send("ms365:offline-retry") }));
} else {
  contextBridge.exposeInMainWorld(
    "ms365Desktop",
    Object.freeze({
      setAppBadge: (value) => ipcRenderer.invoke("ms365:set-badge", value === undefined ? -1 : value),
      notificationClicked: () => ipcRenderer.send("ms365:notification-click"),
      getPagePrefs: () => ipcRenderer.invoke("ms365:get-page-prefs"),
      onPagePrefs: (listener) => {
        if (typeof listener === "function") ipcRenderer.on("ms365:page-prefs", (_event, prefs) => listener(prefs));
      },
    }),
  );
  webFrame.executeJavaScript(`(${installInMainWorld.toString()})();`).catch(() => {});
}

// Runs in the page's world: route the Badging API to the tray, and bring the
// window forward when a page notification is clicked.
function installInMainWorld() {
  const bridge = globalThis.ms365Desktop;
  if (!bridge || globalThis.__ms365DesktopInstalled) return;
  Object.defineProperty(globalThis, "__ms365DesktopInstalled", { value: true });

  const setBadge = (value) => {
    bridge.setAppBadge(value).catch(() => {});
    return Promise.resolve();
  };
  Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: (value) => setBadge(value) });
  Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: () => setBadge(0) });

  const NativeNotification = globalThis.Notification;
  if (typeof NativeNotification === "function") {
    let silent = false;
    bridge.getPagePrefs().then((p) => (silent = p?.silent === true)).catch(() => {});
    bridge.onPagePrefs((p) => (silent = p?.silent === true));
    // Static members (permission, requestPermission) are inherited.
    globalThis.Notification = class Notification extends NativeNotification {
      constructor(title, options) {
        super(title, silent ? { ...(options ?? {}), silent: true } : options);
        this.addEventListener("click", () => bridge.notificationClicked());
      }
    };
  }
}
