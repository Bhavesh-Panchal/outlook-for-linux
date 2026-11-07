"use strict";

const { validateProduct } = require("../src/product");

function fixtureDescriptor(overrides = {}) {
  return {
    id: "test-app",
    name: "Test App",
    title: "Test",
    description: "Fixture",
    urls: { work: "https://app.example.com/", personal: "https://app.example.net/" },
    hosts: { app: ["app.example.com", "app.example.net"], content: ["*.docs.example.com"] },
    protocols: [{ scheme: "mailto", toUrl: (u) => `https://app.example.com/compose?to=${encodeURIComponent(u.slice(7))}` }],
    icons: { app: "/x/icon.png", tray: "/x/tray.png", trayUnread: "/x/tray-unread.png" },
    ...overrides,
  };
}

const fixtureProduct = (overrides) => validateProduct(fixtureDescriptor(overrides));

module.exports = { fixtureDescriptor, fixtureProduct };
