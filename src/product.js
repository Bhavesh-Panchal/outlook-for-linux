"use strict";

const path = require("node:path");
const { parseMailto, composeUrl } = require("./mailto");
const { MQTT_OPTIONS, startMqtt } = require("./mqtt");
const { defaultMailClientMenuItem } = require("./desktop");
const pkg = require("../package.json");

const assets = path.join(__dirname, "..", "assets");

// Host lists are provisional until R2 (docs/evidence/outlook-hosts.md).
module.exports = {
  id: "outlook-for-linux",
  name: "Outlook for Linux",
  title: "Outlook",
  description: "Unofficial Outlook on the web desktop client for Linux",
  version: pkg.version,
  homepage: pkg.homepage,
  bugs: pkg.bugs?.url,
  urls: {
    work: "https://outlook.office.com/mail/",
    // nlp=1: signed-out users get the sign-in page instead of the marketing page (observed 2026-11-07).
    personal: "https://outlook.live.com/mail/?nlp=1",
  },
  defaultAccount: "work",
  hosts: {
    app: ["outlook.office.com", "outlook.office365.com", "outlook.cloud.microsoft", "outlook.live.com"],
    content: ["*.cdn.office.net", "attachments.office.net", "*.officeapps.live.com", "*.sharepoint.com", "*.svc.ms"],
  },
  protocols: [
    {
      scheme: "mailto",
      toUrl: (url, ctx) => composeUrl(ctx.startUrl, parseMailto(url)),
    },
  ],
  unread: { sources: ["badge-api", "title"], titlePattern: /^\((\d+)\)/ },
  permissions: ["notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "openExternal"],
  icons: {
    app: path.join(assets, "icon.png"),
    tray: path.join(assets, "tray.png"),
    trayUnread: path.join(assets, "tray-unread.png"),
  },
  options: { ...MQTT_OPTIONS },
  setup(ctx) {
    startMqtt(ctx, ctx.onUnread);
    return {
      // Like "Join Meeting" in teams-for-linux: the main action of the app.
      // No accelerator: Outlook's own Ctrl+N opens compose in place.
      productItems: [{ label: "New mail", click: () => (ctx.main.show(), ctx.main.load(composeUrl(ctx.startUrl))) }],
      menuItems: [defaultMailClientMenuItem(ctx)],
    };
  },
  homeLabel: "Inbox",
  supportUrl: "https://support.microsoft.com/outlook",
  // Outlook on the web uses Ctrl+Q for "mark as read"; the menu must not take it.
  reservedShortcuts: ["Ctrl+Q"],
};
