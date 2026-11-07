"use strict";

const { ipcMain } = require("electron");
const { isTrustedSender } = require("./security");

/**
 * Every channel is registered with a scope: "web" (product pages) or "local"
 * (the shell's own HTML). Messages from any other frame are dropped.
 */
function createIpc({ classify, coreRoot, logger }) {
  const rejectedOnce = new Set();
  const accept = (channel, event, scope) => {
    if (isTrustedSender(event.senderFrame?.url, scope, { classify, appRoot: coreRoot })) return true;
    if (!rejectedOnce.has(channel)) {
      rejectedOnce.add(channel);
      logger.warn("[IPC] Rejected message from an untrusted frame", { channel });
    }
    return false;
  };

  return {
    handle(channel, scope, fn) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!accept(channel, event, scope)) throw new Error(`Rejected IPC channel ${channel}`);
        return fn(event, ...args);
      });
    },
    on(channel, scope, fn) {
      ipcMain.on(channel, (event, ...args) => {
        if (accept(channel, event, scope)) fn(event, ...args);
      });
    },
  };
}

module.exports = { createIpc };
