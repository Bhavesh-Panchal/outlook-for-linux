"use strict";

const { assertHostPattern, createHostMatcher } = require("./hosts");

// Microsoft sign-in hosts shared by every product. Provisional until the
// R2/R3 browser observations confirm them (docs/evidence).
const MICROSOFT_AUTH_HOSTS = Object.freeze([
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
  "login.windows.net",
  "account.live.com",
  "account.microsoft.com",
  "device.login.microsoftonline.com",
  "autologon.microsoftazuread-sso.com",
]);

const DEFAULT_PERMISSIONS = Object.freeze([
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
  "openExternal",
]);

const UNREAD_SOURCES = new Set(["badge-api", "title"]);
const ID_RE = /^[a-z][a-z0-9-]{1,62}$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value) && !(value instanceof RegExp)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate a product descriptor and fill defaults. Throws listing every problem.
 * @param {object} d
 */
function validateProduct(d) {
  const errors = [];
  const check = (ok, message) => {
    if (!ok) errors.push(message);
  };
  if (!d || typeof d !== "object") throw new Error("Product descriptor must be an object");

  check(typeof d.id === "string" && ID_RE.test(d.id), "id must be lower-case kebab-case");
  for (const key of ["name", "title", "description"]) {
    check(typeof d[key] === "string" && d[key].trim().length > 0, `${key} must be a non-empty string`);
  }

  const urls = d.urls && typeof d.urls === "object" ? d.urls : {};
  const accounts = Object.keys(urls);
  check(accounts.length > 0, "urls must name at least one account type");
  for (const [account, url] of Object.entries(urls)) check(isHttpsUrl(url), `urls.${account} must be an https URL`);
  const defaultAccount = d.defaultAccount ?? accounts[0];
  check(accounts.includes(defaultAccount), "defaultAccount must be one of the urls keys");

  const hosts = {
    app: d.hosts?.app ?? [],
    auth: [...MICROSOFT_AUTH_HOSTS, ...(d.hosts?.auth ?? [])],
    content: d.hosts?.content ?? [],
  };
  check(Array.isArray(hosts.app) && hosts.app.length > 0, "hosts.app must be a non-empty array");
  for (const [group, list] of Object.entries(hosts)) {
    if (!Array.isArray(list)) {
      errors.push(`hosts.${group} must be an array`);
      continue;
    }
    for (const pattern of list) {
      try {
        assertHostPattern(pattern);
      } catch (error) {
        errors.push(`hosts.${group}: ${error.message}`);
      }
    }
  }
  let isAppHost = null;
  try {
    isAppHost = createHostMatcher(hosts.app);
  } catch {
    // pattern errors already reported above
  }
  for (const [account, url] of Object.entries(urls)) {
    // The start page must itself be an app host, or nothing would be trusted.
    if (isAppHost && isHttpsUrl(url)) {
      check(isAppHost(new URL(url).hostname), `urls.${account} host must be listed in hosts.app`);
    }
  }

  const protocols = d.protocols ?? [];
  check(Array.isArray(protocols), "protocols must be an array");
  for (const [i, p] of (Array.isArray(protocols) ? protocols : []).entries()) {
    check(p && SCHEME_RE.test(p.scheme ?? ""), `protocols[${i}].scheme is invalid`);
    check(typeof p?.toUrl === "function", `protocols[${i}].toUrl must be a function`);
  }

  const unread = {
    sources: d.unread?.sources ?? ["badge-api", "title"],
    titlePattern: d.unread?.titlePattern ?? /^\((\d+)\)/,
  };
  check(Array.isArray(unread.sources) && unread.sources.every((s) => UNREAD_SOURCES.has(s)),
    `unread.sources may only contain ${[...UNREAD_SOURCES].join(", ")}`);
  check(unread.titlePattern instanceof RegExp, "unread.titlePattern must be a RegExp");

  const permissions = d.permissions ?? DEFAULT_PERMISSIONS;
  check(Array.isArray(permissions) && permissions.every((p) => typeof p === "string"), "permissions must be strings");

  const icons = d.icons ?? {};
  for (const key of ["app", "tray", "trayUnread"]) {
    check(typeof icons[key] === "string" && icons[key].startsWith("/"), `icons.${key} must be an absolute path`);
  }

  check(d.setup === undefined || typeof d.setup === "function", "setup must be a function");
  check(d.routeLink === undefined || typeof d.routeLink === "function", "routeLink must be a function");
  check(d.options === undefined || (d.options && typeof d.options === "object"), "options must be an object");
  for (const key of ["homepage", "bugs", "supportUrl"]) {
    check(d[key] === undefined || isHttpsUrl(d[key]), `${key} must be an https URL`);
  }
  check(d.homeLabel === undefined || (typeof d.homeLabel === "string" && d.homeLabel.trim().length > 0), "homeLabel must be a non-empty string");
  check(
    d.reservedShortcuts === undefined || (Array.isArray(d.reservedShortcuts) && d.reservedShortcuts.every((s) => typeof s === "string")),
    "reservedShortcuts must be an array of accelerator strings",
  );

  if (errors.length > 0) {
    throw new Error(`Invalid product descriptor${d.id ? ` "${d.id}"` : ""}:\n - ${errors.join("\n - ")}`);
  }

  return deepFreeze({
    id: d.id,
    name: d.name,
    title: d.title,
    description: d.description,
    version: d.version ?? "0.0.0",
    homepage: d.homepage ?? null,
    bugs: d.bugs ?? null,
    supportUrl: d.supportUrl ?? null,
    homeLabel: d.homeLabel ?? d.title,
    reservedShortcuts: [...(d.reservedShortcuts ?? [])],
    urls: { ...urls },
    defaultAccount,
    hosts: { app: [...hosts.app], auth: [...hosts.auth], content: [...hosts.content] },
    protocols: protocols.map((p) => ({ scheme: p.scheme, toUrl: p.toUrl })),
    unread,
    permissions: [...permissions],
    icons: { ...icons },
    options: { ...(d.options ?? {}) },
    setup: d.setup ?? null,
    routeLink: d.routeLink ?? null,
  });
}

module.exports = { validateProduct, MICROSOFT_AUTH_HOSTS, DEFAULT_PERMISSIONS };
