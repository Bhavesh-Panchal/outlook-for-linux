"use strict";

const { Tray, nativeImage } = require("electron");

function createTray(ctx, main, menu) {
  const { product } = ctx;
  let normal = nativeImage.createFromPath(product.icons.tray);
  let unreadIcon = nativeImage.createFromPath(product.icons.trayUnread);
  let count = 0;
  const tray = new Tray(normal);
  tray.setToolTip(product.title);
  tray.setContextMenu(menu);
  tray.on("click", () => main.toggle());

  const render = () => {
    tray.setImage(count !== 0 ? unreadIcon : normal);
    if (count > 0) tray.setToolTip(`${product.title} (${count} unread)`);
    else if (count === -1) tray.setToolTip(`${product.title} (unread)`);
    else tray.setToolTip(product.title);
  };

  return {
    /** @param {number} value -1 means "unread, count unknown" */
    setUnread(value) {
      count = value;
      render();
    },
    setMenu: (next) => tray.setContextMenu(next),
    /** Custom icon path, or null for the product icons. */
    setIcon(file) {
      const custom = file ? nativeImage.createFromPath(file) : null;
      const usable = custom && !custom.isEmpty() ? custom.resize({ width: 64, height: 64 }) : null;
      normal = usable ?? nativeImage.createFromPath(product.icons.tray);
      unreadIcon = usable ?? nativeImage.createFromPath(product.icons.trayUnread);
      render();
    },
    destroy: () => tray.destroy(),
  };
}

module.exports = { createTray };
