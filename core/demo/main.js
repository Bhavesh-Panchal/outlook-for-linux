"use strict";

// Demo product for developing and smoke-testing the core without a Microsoft
// account. Run: npm run demo   (or MS365_SMOKE=1 npm run demo)

const path = require("node:path");
const { startApp } = require("../src");

const assets = path.join(__dirname, "assets");

startApp({
  id: "ms365-core-demo",
  name: "MS365 Core Demo",
  title: "Core Demo",
  description: "Exercises the ms365-for-linux core shell against example.com",
  version: "0.1.0",
  urls: { work: "https://example.com/", personal: "https://example.org/" },
  hosts: { app: ["example.com", "example.org"], content: [] },
  icons: {
    app: path.join(assets, "icon.png"),
    tray: path.join(assets, "tray.png"),
    trayUnread: path.join(assets, "tray-unread.png"),
  },
});
