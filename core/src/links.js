"use strict";

const { createHostMatcher } = require("./hosts");

const LINK = Object.freeze({
  APP: "app", // product page: load in app windows, trusted for permissions and IPC
  AUTH: "auth", // Microsoft sign-in pages
  CONTENT: "content", // other Microsoft pages the product opens (Office docs, CDN)
  BLANK: "blank", // about:blank popouts written by the opener (compose, print)
  PROTOCOL: "protocol", // a scheme the product handles itself (mailto:, ms-word:)
  EXTERNAL: "external", // anything else that is safe to hand to the desktop
  BLOCKED: "blocked", // file:, javascript:, data:, unparseable
});

// Schemes the desktop may open when the page links to them.
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:", "sip:", "sips:", "callto:", "msteams:"]);

function originOf(value) {
  try {
    const { origin } = new URL(value);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * @param {object} product validated product descriptor
 * @param {{ extraAppOrigins?: string[], allowInsecureHttp?: boolean }} [options]
 * @returns {(url: string) => string} one of LINK
 */
function createLinkClassifier(product, { extraAppOrigins = [], allowInsecureHttp = false } = {}) {
  const isApp = createHostMatcher(product.hosts.app);
  const isAuth = createHostMatcher(product.hosts.auth);
  const isContent = createHostMatcher(product.hosts.content);
  const appOrigins = new Set(extraAppOrigins.map(originOf).filter(Boolean));
  const ownSchemes = new Set(product.protocols.map((p) => `${p.scheme}:`));

  return function classify(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return LINK.BLOCKED;
    }
    if (url.protocol === "about:") return url.pathname === "blank" ? LINK.BLANK : LINK.BLOCKED;
    if (ownSchemes.has(url.protocol)) return LINK.PROTOCOL;
    const webScheme = url.protocol === "https:" || (allowInsecureHttp && url.protocol === "http:");
    if (webScheme) {
      if (appOrigins.has(url.origin) || isApp(url.hostname)) return LINK.APP;
      if (isAuth(url.hostname)) return LINK.AUTH;
      if (isContent(url.hostname)) return LINK.CONTENT;
    }
    return EXTERNAL_SCHEMES.has(url.protocol) ? LINK.EXTERNAL : LINK.BLOCKED;
  };
}

/**
 * What to do with window.open / target=_blank from an app window.
 * @returns {"child"|"external"|"protocol"|"deny"}
 */
function decideWindowOpen(kind) {
  switch (kind) {
    case LINK.APP:
    case LINK.AUTH: // MSAL popup sign-in needs window.opener
    case LINK.CONTENT:
    case LINK.BLANK:
      return "child";
    case LINK.PROTOCOL:
      return "protocol";
    case LINK.EXTERNAL:
      return "external";
    default:
      return "deny";
  }
}

/**
 * Whether an in-place navigation of an app window may proceed.
 * Sign-in can redirect to a tenant's own identity provider (ADFS, Okta, Ping),
 * whose host no list can know, so any https page may load in place. Trust
 * (permissions, IPC) is still granted per host, not per navigation.
 * @returns {"allow"|"protocol"|"external"|"deny"}
 */
function decideNavigation(rawUrl, kind) {
  if (kind === LINK.PROTOCOL) return "protocol";
  if (kind === LINK.BLOCKED) return "deny";
  if (kind === LINK.EXTERNAL) {
    // https pages on unknown hosts are allowed in place (federated sign-in).
    return rawUrl.startsWith("https:") ? "allow" : "external";
  }
  return "allow";
}

module.exports = { LINK, createLinkClassifier, decideWindowOpen, decideNavigation, originOf };
