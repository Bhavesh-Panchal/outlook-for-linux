"use strict";

// Configuration for every product. Sources, lowest to highest precedence:
//   schema defaults < /etc/<id>/config.json < <userData>/config.json
//   < "profiles.<name>" block of the merged files < command line (--key=value)
// Warnings name keys and sources only, never values (values can be URLs or
// account names).

const CORE_OPTIONS = Object.freeze({
  account: { type: "string", default: null, describe: "Account type to open: one of the product's url keys (e.g. work, personal)" },
  url: { type: "string", default: null, sensitive: true, describe: "Start URL override, e.g. a sovereign-cloud tenant" },
  "window.frame": { type: "boolean", default: true, describe: "Use the native window frame" },
  "window.menubar": { type: "string", default: "auto", enum: ["auto", "visible", "hidden"], describe: "Menu bar visibility" },
  "window.startMinimized": { type: "boolean", default: false, describe: "Start hidden in the tray" },
  "window.closeToTray": { type: "boolean", default: true, describe: "Closing the window hides it to the tray" },
  "tray.enabled": { type: "boolean", default: true, describe: "Show a tray icon" },
  "notifications.enabled": { type: "boolean", default: true, describe: "Allow desktop notifications" },
  "downloads.directory": { type: "string", default: null, describe: "Download folder (default: XDG Downloads)" },
  "downloads.ask": { type: "boolean", default: false, describe: "Ask where to save each download" },
  "downloads.openFolderWhenDone": { type: "boolean", default: false, describe: "Show the file in the file manager when a download finishes" },
  "spellcheck.languages": { type: "array", default: [], describe: "Spell-check languages, e.g. [\"en-US\", \"de-DE\"]" },
  "appearance.customCSSFile": { type: "string", default: null, describe: "Absolute path of a CSS file injected into the app" },
  "appearance.fontAntialiasing": {
    type: "string",
    default: "grayscale",
    enum: ["grayscale", "system"],
    describe: "Text antialiasing: grayscale (like Firefox; thinner, no colour fringes) or system (fontconfig subpixel setting)",
  },
  "network.proxyServer": { type: "string", default: null, sensitive: true, describe: "Chromium --proxy-server value" },
  "network.authServerAllowlist": { type: "string", default: null, describe: "Hosts allowed for Kerberos/NTLM (Chromium --auth-server-allowlist)" },
  "network.allowInsecureHttp": { type: "boolean", default: false, describe: "Treat http:// app hosts as trusted (testing only)" },
  "network.userAgent": { type: "string", default: null, describe: "User agent override" },
  "network.browserBrand": {
    type: "string",
    default: "chrome",
    enum: ["chrome", "chromium"],
    describe: "Browser brand reported to the web app. \"chrome\" enables features Microsoft shows only to Chrome (e.g. Copilot in Outlook)",
  },
  "performance.disableGpu": { type: "boolean", default: false, describe: "Disable hardware acceleration" },
  "logging.level": { type: "string", default: "info", enum: ["error", "warn", "info", "debug"], describe: "Console log level" },
  profiles: { type: "object", default: {}, describe: "Per-profile overrides, keyed by profile name" },
});

const PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const DEFAULT_PROFILE = "default";

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isPlainObject(value) {
  return typeOf(value) === "object";
}

function buildSchema(productOptions = {}) {
  const schema = { ...CORE_OPTIONS };
  for (const [key, spec] of Object.entries(productOptions)) {
    if (key in schema) throw new Error(`Product option ${key} collides with a core option`);
    schema[key] = spec;
  }
  return Object.freeze(schema);
}

/** Flatten a parsed JSON object to dotted schema keys. */
function flatten(obj, schema, source, warnings, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (path in schema) {
      out[path] = value;
    } else if (isPlainObject(value) && Object.keys(schema).some((k) => k.startsWith(path + "."))) {
      Object.assign(out, flatten(value, schema, source, warnings, path));
    } else {
      warnings.push(`Unknown option "${path}" in ${source} (ignored)`);
    }
  }
  return out;
}

function coerceCliValue(raw, spec) {
  switch (spec.type) {
    case "boolean":
      if (raw === true || raw === "true") return true;
      if (raw === false || raw === "false") return false;
      return undefined;
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "array":
    case "object":
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    default:
      return typeof raw === "string" ? raw : undefined;
  }
}

function validateValue(path, value, spec) {
  if (value === null && spec.default === null) return true;
  if (typeOf(value) !== spec.type) return false;
  if (spec.enum && !spec.enum.includes(value)) return false;
  if (spec.type === "array" && !value.every((v) => typeof v === "string")) return false;
  return true;
}

function applySource(target, flat, schema, source, warnings) {
  for (const [path, value] of Object.entries(flat)) {
    const spec = schema[path];
    if (!validateValue(path, value, spec)) {
      warnings.push(`Option "${path}" in ${source} has the wrong type or value (expected ${spec.enum ? spec.enum.join("|") : spec.type}; ignored)`);
      continue;
    }
    target[path] = value;
  }
}

/** Parse --key=value, --flag and --no-flag for schema keys; other args are ignored. */
function parseArgv(argv, schema, warnings) {
  const flat = {};
  let profile = null;
  for (const arg of argv) {
    if (typeof arg !== "string" || !arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    let key = eq === -1 ? body : body.slice(0, eq);
    let raw = eq === -1 ? true : body.slice(eq + 1);
    if (key === "profile") {
      profile = raw;
      continue;
    }
    if (eq === -1 && key.startsWith("no-") && schema[key.slice(3)]?.type === "boolean") {
      key = key.slice(3);
      raw = false;
    }
    const spec = schema[key];
    if (!spec || key === "profiles") continue; // Chromium switch or not ours
    const value = coerceCliValue(raw, spec);
    if (value === undefined) {
      warnings.push(`Command-line option "--${key}" has an invalid value (ignored)`);
      continue;
    }
    flat[key] = value;
  }
  return { flat, profile };
}

function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = value;
  }
  return out;
}

function parseJsonSource(text, source, warnings) {
  if (text == null) return {};
  try {
    const parsed = JSON.parse(text);
    if (isPlainObject(parsed)) return parsed;
    warnings.push(`${source} must contain a JSON object (ignored)`);
  } catch (error) {
    warnings.push(`${source} is not valid JSON (ignored): ${error.message.replace(/\s+in JSON.*$/, "")}`);
  }
  return {};
}

/**
 * @param {{ product: object, systemConfigText?: string|null, userConfigText?: string|null, argv?: string[] }} input
 * @returns {{ config: object, flat: object, profile: string, account: string, startUrl: string, warnings: string[], schema: object }}
 */
function loadConfig({ product, systemConfigText = null, userConfigText = null, argv = [] }) {
  const schema = buildSchema(product.options);
  const warnings = [];
  const flat = Object.fromEntries(Object.entries(schema).map(([k, spec]) => [k, spec.default]));

  const system = flatten(parseJsonSource(systemConfigText, "system config", warnings), schema, "system config", warnings);
  const user = flatten(parseJsonSource(userConfigText, "user config", warnings), schema, "user config", warnings);
  applySource(flat, system, schema, "system config", warnings);
  applySource(flat, user, schema, "user config", warnings);

  const cli = parseArgv(argv, schema, warnings);
  let profile = DEFAULT_PROFILE;
  if (cli.profile !== null) {
    if (typeof cli.profile === "string" && PROFILE_RE.test(cli.profile)) profile = cli.profile;
    else warnings.push("Command-line option \"--profile\" must match [a-z0-9][a-z0-9_-]{0,31} (using default profile)");
  }

  const profileBlock = flat.profiles?.[profile];
  if (profileBlock !== undefined) {
    if (isPlainObject(profileBlock)) {
      const source = `profiles.${profile}`;
      const scoped = flatten(profileBlock, schema, source, warnings);
      delete scoped.profiles;
      applySource(flat, scoped, schema, source, warnings);
    } else {
      warnings.push(`profiles.${profile} must be an object (ignored)`);
    }
  }
  applySource(flat, cli.flat, schema, "command line", warnings);

  let account = flat.account ?? product.defaultAccount;
  if (!(account in product.urls)) {
    warnings.push(`Option "account" must be one of ${Object.keys(product.urls).join("|")} (using ${product.defaultAccount})`);
    account = product.defaultAccount;
  }

  let startUrl = product.urls[account];
  if (flat.url !== null) {
    try {
      const parsed = new URL(flat.url);
      if (parsed.protocol === "https:" || (flat["network.allowInsecureHttp"] && parsed.protocol === "http:")) startUrl = parsed.href;
      else warnings.push("Option \"url\" must use https (using product default)");
    } catch {
      warnings.push("Option \"url\" is not a valid URL (using product default)");
    }
  }

  return { config: unflatten(flat), flat, profile, account, startUrl, warnings, schema };
}

/** userData directory for a profile. */
function profileDataDir(baseDir, profile, join) {
  return profile === DEFAULT_PROFILE ? baseDir : join(baseDir, "profiles", profile);
}

/** Effective config for display: sensitive values hidden, profiles block omitted. */
function redactedConfig(flat, schema) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key === "profiles") continue;
    out[key] = schema[key]?.sensitive && value !== null ? "<set, hidden>" : value;
  }
  return out;
}

module.exports = { loadConfig, buildSchema, profileDataDir, redactedConfig, CORE_OPTIONS, DEFAULT_PROFILE };
