"use strict";

// Secret-entry dialog (proxy/HTTP sign-in, smartcard PIN, security key PIN),
// after teams-for-linux app/_shared/securePrompt.js (GPL-3.0-or-later):
// sandboxed, context-isolated local page; display strings go in as query
// parameters; the secret comes back once over IPC and is never logged or stored.

const path = require("node:path");
const { BrowserWindow } = require("electron");

function createPrompter({ ipc, coreRoot, icon }) {
  const pending = new Map(); // webContents id -> { win, resolve, reject }

  const settle = (id, ok, value) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (!entry.win.isDestroyed()) entry.win.close();
    if (ok) entry.resolve(value);
    else entry.reject(new Error("prompt cancelled"));
  };
  ipc.on("ms365:prompt-submit", "local", (event, value) => settle(event.sender.id, true, value));
  ipc.on("ms365:prompt-cancel", "local", (event) => settle(event.sender.id, false));

  /**
   * @param {{ title: string, heading: string, message: string, warning?: string, askUser?: boolean,
   *           user?: string, secretLabel?: string, submitLabel?: string, parent?: BrowserWindow }} opts
   * @returns {Promise<{ user: string, secret: string }>} rejects when cancelled or closed
   */
  return function prompt(opts) {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        width: 440,
        height: 200 + (opts.askUser ? 60 : 0) + (opts.warning ? 30 : 0),
        title: opts.title,
        icon,
        parent: opts.parent && !opts.parent.isDestroyed() ? opts.parent : undefined,
        modal: false,
        alwaysOnTop: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
          preload: path.join(coreRoot, "src", "preload", "web.js"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
      win.setMenu(null);
      const id = win.webContents.id;
      pending.set(id, { win, resolve, reject });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.once("ready-to-show", () => win.show());
      win.on("closed", () => settle(id, false));
      const query = { title: opts.title, heading: opts.heading, message: opts.message };
      for (const key of ["warning", "user", "secretLabel", "submitLabel"]) if (opts[key]) query[key] = opts[key];
      if (opts.askUser) query.askUser = "1";
      win.loadFile(path.join(coreRoot, "static", "prompt.html"), { query }).catch(() => settle(id, false));
    });
  };
}

module.exports = { createPrompter };
