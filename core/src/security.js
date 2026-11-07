"use strict";

// Permission and IPC trust decisions. The permission rules follow
// teams-for-linux app/security/permissions.js (GPL-3.0-or-later): without a
// handler Electron grants every request, so any page could get
// notifications, devices or clipboard silently.

const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { LINK } = require("./links");

// Chromium already gates these per frame with Permissions Policy, so a
// cross-origin frame inside a trusted page may inherit them.
const FRAME_POLICY_GATED = new Set(["media", "clipboard-read", "clipboard-sanitized-write", "fullscreen"]);
const OPEN_EXTERNAL_SCHEMES = new Set(["mailto:", "tel:"]);
// Granted to the product's own pages without being listed: they expose no
// device, data or user attention.
const BENIGN_FOR_APP = new Set([
  "persistent-storage",
  "background-sync",
  "storage-access",
  "top-level-storage-access",
  "fullscreen",
  "clipboard-sanitized-write",
]);

function schemeOf(url) {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

function isLocalAppFile(url, appRoot) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return false;
    const file = fileURLToPath(parsed);
    return file === appRoot || file.startsWith(appRoot + path.sep);
  } catch {
    return false;
  }
}

/**
 * @param {{ permission: string, requestingUrl?: string, topLevelUrl?: string, isMainFrame?: boolean, externalURL?: string }} request
 * @param {{ classify: (url: string) => string, allowed: Set<string> }} policy
 */
function isPermissionAllowed(request, { classify, allowed }) {
  const { permission, requestingUrl, topLevelUrl, isMainFrame, externalURL } = request;
  const trusted = (url) => typeof url === "string" && classify(url) === LINK.APP;
  if (!allowed.has(permission)) {
    return BENIGN_FOR_APP.has(permission) && trusted(requestingUrl);
  }
  if (permission === "openExternal") {
    return Boolean(isMainFrame) && OPEN_EXTERNAL_SCHEMES.has(schemeOf(externalURL));
  }
  if (trusted(requestingUrl)) return true;
  return FRAME_POLICY_GATED.has(permission) && trusted(topLevelUrl);
}

/**
 * Whether an IPC message may be accepted from a frame.
 * "web" channels accept the product's own pages; "local" channels accept only
 * the shell's own HTML files.
 */
function isTrustedSender(frameUrl, scope, { classify, appRoot }) {
  if (typeof frameUrl !== "string") return false;
  if (scope === "local") return isLocalAppFile(frameUrl, appRoot);
  if (scope === "web") return classify(frameUrl) === LINK.APP;
  return false;
}

module.exports = { isPermissionAllowed, isTrustedSender, isLocalAppFile, FRAME_POLICY_GATED, BENIGN_FOR_APP };
