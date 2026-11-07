"use strict";

const path = require("node:path");

/** Unread count from a page title, or null when the title carries none. */
function parseUnreadFromTitle(title, pattern) {
  if (typeof title !== "string") return null;
  const match = pattern.exec(title);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Badge value from navigator.setAppBadge. undefined means "flag without a
 * number" (-1 here); anything invalid clears.
 */
function normalizeBadge(value) {
  if (value === -1) return -1;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 99999);
}

/**
 * Tracks unread state from several sources. The badge API, once a page has
 * used it, wins over title parsing because it is the page's own statement.
 */
function createUnreadTracker(sources, onChange) {
  const enabled = new Set(sources);
  let badgeSeen = false;
  let current = 0;
  const set = (value) => {
    if (value !== current) {
      current = value;
      onChange(current);
    }
  };
  return {
    fromBadge(value) {
      if (!enabled.has("badge-api")) return;
      badgeSeen = true;
      set(normalizeBadge(value));
    },
    fromTitle(count) {
      if (!enabled.has("title") || badgeSeen || count === null) return;
      set(count);
    },
    get count() {
      return current;
    },
  };
}

/**
 * The URL a launch or second-instance argv asks to open: the first argument
 * using a product scheme, or an https URL. Chromium switches are skipped.
 */
function findLaunchTarget(argv, schemes) {
  const prefixes = schemes.map((s) => `${s.toLowerCase()}:`);
  for (const arg of argv) {
    if (typeof arg !== "string" || arg.startsWith("-")) continue;
    const lower = arg.toLowerCase();
    if (prefixes.some((p) => lower.startsWith(p)) || lower.startsWith("https://")) return arg;
  }
  return null;
}

/** A safe file name: no directories, control characters or leading dots. */
function sanitizeFileName(name) {
  let base = typeof name === "string" ? path.basename(name.replaceAll("\\", "/")) : "";
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[\u0000-\u001f\u007f/]/g, "_").replace(/^\.+/, "").trim();
  return base.length > 0 ? base.slice(0, 200) : "download";
}

/** First free path "name.ext", "name (1).ext", ... in dir. */
function uniqueFilePath(dir, name, exists) {
  const safe = sanitizeFileName(name);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length) || "download";
  for (let i = 0; i < 1000; i++) {
    const candidate = path.join(dir, i === 0 ? `${stem}${ext}` : `${stem} (${i})${ext}`);
    if (!exists(candidate)) return candidate;
  }
  return path.join(dir, `${stem} (${Date.now()})${ext}`);
}

const UA_KEEP = new Set(["Mozilla", "AppleWebKit", "Chrome", "Safari"]);

/**
 * Electron's default user agent names Electron and the app, which some
 * Microsoft pages answer with "browser not supported". Keep only the tokens a
 * Chrome on Linux sends.
 */
function cleanUserAgent(ua) {
  return ua
    .replace(/\s+([A-Za-z][\w.-]*)\/[^\s()]+/g, (token, name) => (UA_KEEP.has(name) ? token : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Saved bounds, or null when they no longer fit any display (monitor
 * unplugged, resolution changed). A window must keep at least 100x50 px
 * of its title area on some display's work area.
 */
function restorableBounds(bounds, workAreas, minSize) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  const width = Math.max(bounds.width, minSize.width);
  const height = Math.max(bounds.height, minSize.height);
  const visible = workAreas.some((a) => {
    const overlapX = Math.min(bounds.x + width, a.x + a.width) - Math.max(bounds.x, a.x);
    // The top 50 px (title bar) must start inside the work area vertically.
    return overlapX >= 100 && bounds.y >= a.y - 10 && bounds.y + 50 <= a.y + a.height;
  });
  return visible ? { x: bounds.x, y: bounds.y, width, height } : null;
}

// Chromium net error codes that mean "no usable network", where waiting and
// retrying helps. ERR_ABORTED (-3) is a cancelled load, not a failure.
// From net/base/net_error_list.h; teams-for-linux #2875 added ERR_TIMED_OUT.
const NETWORK_ERROR_CODES = new Set([
  -7, // TIMED_OUT
  -21, // NETWORK_CHANGED
  -100, // CONNECTION_CLOSED
  -101, // CONNECTION_RESET
  -102, // CONNECTION_REFUSED
  -104, // CONNECTION_FAILED
  -105, // NAME_NOT_RESOLVED
  -106, // INTERNET_DISCONNECTED
  -109, // ADDRESS_UNREACHABLE
  -111, // TUNNEL_CONNECTION_FAILED
  -118, // CONNECTION_TIMED_OUT
  -130, // PROXY_CONNECTION_FAILED
  -137, // NAME_RESOLUTION_FAILED
]);

function isNetworkErrorCode(code) {
  return NETWORK_ERROR_CODES.has(code);
}

/** Retry delay in ms: 2s, 4s, 8s ... capped at 60s. */
function retryDelay(attempt) {
  return Math.min(2000 * 2 ** Math.max(0, attempt), 60000);
}

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/** Console logger with a level and a fixed tag. Never pass URLs with queries. */
function createLogger(level = "info", sink = console) {
  const max = LEVELS[level] ?? LEVELS.info;
  const make = (name) => (...args) => {
    if (LEVELS[name] <= max) sink[name === "debug" ? "debug" : name](...args);
  };
  return { error: make("error"), warn: make("warn"), info: make("info"), debug: make("debug") };
}

/** Origin of a URL for logs: no path, query or fragment. */
function redactUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "null" ? `${url.protocol}…` : `${url.origin}/…`;
  } catch {
    return "<invalid url>";
  }
}

module.exports = {
  parseUnreadFromTitle,
  normalizeBadge,
  createUnreadTracker,
  findLaunchTarget,
  sanitizeFileName,
  uniqueFilePath,
  cleanUserAgent,
  restorableBounds,
  isNetworkErrorCode,
  retryDelay,
  createLogger,
  redactUrl,
};
