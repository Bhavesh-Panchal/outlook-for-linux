"use strict";

// Host matching for product descriptors. Generalized from teams-for-linux
// app/helpers/teamsHosts.js (GPL-3.0-or-later).
//
// Pattern forms:
//   "outlook.office.com"   matches that host only
//   "*.sharepoint.com"     matches exactly one extra label, e.g. "contoso.sharepoint.com",
//                          but not "a.b.sharepoint.com" or "sharepoint.com"
//
// Tenants behind Microsoft Defender for Cloud Apps load pages at
// "<host>.mcas.ms"; that counts as the underlying host.

const MCAS_SUFFIX = ".mcas.ms";
const PATTERN_RE = /^(\*\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function normalizeHostname(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) return null;
  let host = hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.endsWith(MCAS_SUFFIX)) host = host.slice(0, -MCAS_SUFFIX.length);
  return host.length > 0 ? host : null;
}

function assertHostPattern(pattern) {
  if (typeof pattern !== "string" || !PATTERN_RE.test(pattern)) {
    throw new Error(`Invalid host pattern: ${JSON.stringify(pattern)}`);
  }
}

function matchesPattern(host, pattern) {
  if (!pattern.startsWith("*.")) return host === pattern;
  const base = pattern.slice(2);
  if (!host.endsWith("." + base)) return false;
  const label = host.slice(0, -(base.length + 1));
  return label.length > 0 && !label.includes(".");
}

/**
 * @param {string[]} patterns
 * @returns {(hostname: string) => boolean}
 */
function createHostMatcher(patterns) {
  if (!Array.isArray(patterns)) throw new TypeError("Host patterns must be an array");
  patterns.forEach(assertHostPattern);
  const list = [...patterns];
  return (hostname) => {
    const host = normalizeHostname(hostname);
    return host !== null && list.some((pattern) => matchesPattern(host, pattern));
  };
}

module.exports = { createHostMatcher, assertHostPattern, normalizeHostname };
