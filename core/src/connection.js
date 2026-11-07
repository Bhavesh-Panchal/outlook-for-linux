"use strict";

const path = require("node:path");
const { net, powerMonitor } = require("electron");
const { isNetworkErrorCode, retryDelay } = require("./util");

/**
 * When the main frame fails with a network error, show a local offline page
 * and retry with backoff, on resume, and when the user presses Retry.
 * A loaded page is never reloaded just because the network blipped: the web
 * apps keep working from cache (teams-for-linux #2611).
 */
function createConnectionMonitor(ctx, win) {
  const offlinePage = path.join(ctx.coreRoot, "static", "offline.html");
  let offline = false;
  let target = null;
  let attempt = 0;
  let timer = null;

  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clear();
    timer = setTimeout(retryNow, retryDelay(attempt++));
  };

  function retryNow() {
    if (!offline || win.isDestroyed()) return;
    clear();
    if (!net.isOnline()) return schedule();
    ctx.logger.info("[CONNECTION] Retrying", { attempt });
    win.loadURL(target ?? ctx.startUrl).catch(() => {});
  }

  const contents = win.webContents;
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || !isNetworkErrorCode(code) || url.startsWith("file:")) return;
    if (!offline) ctx.logger.warn("[CONNECTION] Network error; showing offline page", { code });
    offline = true;
    target = url;
    win.loadFile(offlinePage, { query: { title: ctx.product.title } }).catch(() => {});
    schedule();
  });
  contents.on("did-navigate", (_event, url) => {
    if (url.startsWith("file:")) return;
    if (offline) ctx.logger.info("[CONNECTION] Back online");
    offline = false;
    attempt = 0;
    clear();
  });
  powerMonitor.on("resume", () => {
    if (offline) {
      attempt = 0;
      retryNow();
    }
  });

  return {
    retryNow() {
      attempt = 0;
      retryNow();
    },
    get offline() {
      return offline;
    },
  };
}

module.exports = { createConnectionMonitor };
