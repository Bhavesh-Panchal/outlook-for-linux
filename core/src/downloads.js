"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Notification, app, shell } = require("electron");
const { uniqueFilePath } = require("./util");

function notify(ctx, title, body, onClick) {
  if (!ctx.flat["notifications.enabled"] || ctx.prefs?.get("notificationsDisabled") || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ctx.product.icons.app, silent: ctx.prefs?.get("soundDisabled") === true });
  if (onClick) n.on("click", onClick);
  n.show();
}

/**
 * Saves downloads into the configured folder (or asks), shows progress on the
 * window/launcher, and announces the result.
 */
function installDownloads(ses, ctx, getWindow) {
  const { flat, logger } = ctx;
  const active = new Set();
  const reserved = new Set(); // paths chosen but not yet on disk

  const updateProgress = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (active.size === 0) return win.setProgressBar(-1);
    let received = 0;
    let total = 0;
    for (const item of active) {
      received += item.getReceivedBytes();
      total += item.getTotalBytes();
    }
    const knownTotals = [...active].every((item) => item.getTotalBytes() > 0);
    win.setProgressBar(knownTotals && total > 0 ? received / total : 2, { mode: knownTotals ? "normal" : "indeterminate" });
  };

  ses.on("will-download", (_event, item) => {
    let chosen = null;
    if (!flat["downloads.ask"]) {
      const dir = flat["downloads.directory"] ?? app.getPath("downloads");
      try {
        fs.mkdirSync(dir, { recursive: true });
        chosen = uniqueFilePath(dir, item.getFilename(), (p) => reserved.has(p) || fs.existsSync(p));
        reserved.add(chosen);
        item.setSavePath(chosen);
      } catch (error) {
        logger.warn("[DOWNLOADS] Download folder is not usable; asking instead", { code: error.code });
      }
    }
    active.add(item);
    updateProgress();
    item.on("updated", updateProgress);
    item.once("done", (_e, result) => {
      active.delete(item);
      if (chosen) reserved.delete(chosen);
      updateProgress();
      const file = item.getSavePath();
      if (result === "completed") {
        notify(ctx, "Download complete", path.basename(file), () => shell.showItemInFolder(file));
        if (flat["downloads.openFolderWhenDone"]) shell.showItemInFolder(file);
      } else if (result === "interrupted") {
        notify(ctx, "Download failed", path.basename(file || item.getFilename()));
      }
      logger.info("[DOWNLOADS] Download finished", { result });
    });
  });
}

module.exports = { installDownloads };
