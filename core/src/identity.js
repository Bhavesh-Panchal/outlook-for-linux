"use strict";

// Browser identity (User-Agent Client Hints).
//
// Chromium reports the brands "Chromium" and "Not?A_Brand"; Google Chrome adds
// "Google Chrome". Outlook on the web shows Copilot ("Copilot Chat", "Chat with
// Copilot") only when the client reports the Google Chrome brand (observed
// 2026-11-07, docs/evidence/outlook-hosts.md). Electron has no API for the brand
// list, so it is set per webContents through the DevTools protocol, which
// covers both navigator.userAgentData and the Sec-CH-UA request headers.

const BRAND_MODES = Object.freeze(["chrome", "chromium"]);

/** Client hints metadata for Emulation.setUserAgentOverride. Pure, for tests. */
function clientHintsMetadata(mode, chromeVersion, arch = process.arch) {
  const major = chromeVersion.split(".")[0];
  const names = mode === "chrome" ? ["Chromium", "Google Chrome", "Not?A_Brand"] : ["Chromium", "Not?A_Brand"];
  const version = (name, full) => (name === "Not?A_Brand" ? (full ? "24.0.0.0" : "24") : full ? chromeVersion : major);
  return {
    brands: names.map((brand) => ({ brand, version: version(brand, false) })),
    fullVersionList: names.map((brand) => ({ brand, version: version(brand, true) })),
    fullVersion: chromeVersion,
    platform: "Linux",
    platformVersion: "",
    architecture: arch === "arm64" ? "arm" : "x86",
    bitness: arch === "ia32" || arch === "arm" ? "32" : "64",
    model: "",
    mobile: false,
    wow64: false,
  };
}

/**
 * Apply the brand to every web page the app creates (main window, popups).
 * The debugger session is kept attached; opening DevTools still works.
 */
function installBrowserIdentity(app, { mode, userAgent, logger }) {
  if (mode !== "chrome") return;
  const metadata = clientHintsMetadata(mode, process.versions.chrome);
  let warned = false;
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "window" && contents.getType() !== "webview") return;
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
      contents.debugger
        .sendCommand("Emulation.setUserAgentOverride", { userAgent, userAgentMetadata: metadata })
        .catch((error) => {
          if (!warned) logger.warn("[IDENTITY] Could not set client hints", { message: error.message });
          warned = true;
        });
    } catch (error) {
      if (!warned) logger.warn("[IDENTITY] Could not attach to set client hints", { message: error.message });
      warned = true;
    }
  });
}

module.exports = { installBrowserIdentity, clientHintsMetadata, BRAND_MODES };
