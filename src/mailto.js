"use strict";

// mailto: links (RFC 6068) to an Outlook on the web compose URL.
// The compose deep link format (/mail/deeplink/compose, /mail/0/deeplink/compose
// on outlook.live.com) is provisional until R2 confirms it
// (docs/evidence/outlook-hosts.md).

const MAX_FIELD = 8000;
const FIELDS = ["to", "cc", "bcc", "subject", "body"];

// RFC 6068 uses percent-encoding only; "+" is a literal plus, unlike forms.
function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function cleanText(value, { multiline }) {
  let text = value.replace(CONTROL, "");
  if (!multiline) text = text.replace(/[\r\n]+/g, " ");
  return text.slice(0, MAX_FIELD);
}

function splitAddresses(value) {
  return value
    .split(/[,;]/)
    .map((a) => cleanText(a, { multiline: false }).trim())
    .filter((a) => a.length > 0 && a.length <= 320);
}

/**
 * @param {string} url a mailto: URL
 * @returns {{ to: string[], cc: string[], bcc: string[], subject: string, body: string }}
 */
function parseMailto(url) {
  if (typeof url !== "string" || !/^mailto:/i.test(url)) throw new Error("Not a mailto: URL");
  const rest = url.slice("mailto:".length);
  const q = rest.indexOf("?");
  const pathPart = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? "" : rest.slice(q + 1);

  const out = { to: splitAddresses(decode(pathPart)), cc: [], bcc: [], subject: "", body: "" };
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decode(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    const value = decode(eq === -1 ? "" : pair.slice(eq + 1));
    if (key === "to" || key === "cc" || key === "bcc") out[key].push(...splitAddresses(value));
    else if (key === "subject") out.subject = cleanText(value, { multiline: false });
    else if (key === "body") out.body = cleanText(value.replace(/\r?\n/g, "\r\n"), { multiline: true });
  }
  return out;
}

/** Compose page path for the start URL's host. */
function composeBase(startUrl) {
  const { origin, hostname } = new URL(startUrl);
  return hostname === "outlook.live.com" ? `${origin}/mail/0/deeplink/compose` : `${origin}/mail/deeplink/compose`;
}

/**
 * @param {string} startUrl the profile's Outlook start URL
 * @param {Partial<ReturnType<typeof parseMailto>>} fields
 */
function composeUrl(startUrl, fields = {}) {
  const params = [];
  for (const key of FIELDS) {
    const value = fields[key];
    const text = Array.isArray(value) ? value.join(",") : value;
    if (text) params.push(`${key}=${encodeURIComponent(text)}`);
  }
  return params.length > 0 ? `${composeBase(startUrl)}?${params.join("&")}` : composeBase(startUrl);
}

module.exports = { parseMailto, composeUrl };
