"use strict";

const { execFile } = require("node:child_process");
const { dialog } = require("electron");

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000 }, (error, stdout) => resolve({ ok: !error, out: String(stdout).trim(), code: error?.code }));
  });
}

/** File-menu item that registers this app as the desktop's mailto: handler. */
function defaultMailClientMenuItem(ctx) {
  const desktopFile = `${ctx.product.id}.desktop`;
  return {
    label: "Set as default mail client",
    click: async () => {
      const set = await run("xdg-mime", ["default", desktopFile, "x-scheme-handler/mailto"]);
      const now = await run("xdg-mime", ["query", "default", "x-scheme-handler/mailto"]);
      const ok = set.ok && now.out === desktopFile;
      if (!ok) ctx.logger.warn("[MAILTO] Could not set default mail client", { code: set.code ?? "mismatch" });
      dialog.showMessageBox(ctx.main.window, {
        type: ok ? "info" : "warning",
        message: ok ? "Outlook for Linux is now the default mail client." : "Could not set the default mail client.",
        detail: ok
          ? "mailto: links will open a new message here."
          : `This needs the installed package (${desktopFile}) and xdg-utils.`,
      });
    },
  };
}

module.exports = { defaultMailClientMenuItem };
