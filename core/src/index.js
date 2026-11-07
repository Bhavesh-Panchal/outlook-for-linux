"use strict";

const { validateProduct, MICROSOFT_AUTH_HOSTS, DEFAULT_PERMISSIONS } = require("./product");
const { LINK } = require("./links");

module.exports = {
  // Requires Electron; loaded on first use so pure modules can be unit-tested with plain Node.
  startApp: (descriptor) => require("./app").startApp(descriptor),
  validateProduct,
  MICROSOFT_AUTH_HOSTS,
  DEFAULT_PERMISSIONS,
  LINK,
};
