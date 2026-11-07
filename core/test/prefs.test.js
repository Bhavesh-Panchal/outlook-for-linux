"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrefs, sanitize } = require("../src/prefs");
const { loadConfig, redactedConfig } = require("../src/config");
const { validateProduct } = require("../src/product");
const { fixtureDescriptor, fixtureProduct } = require("./fixture");

function memoryState(initial = {}) {
  const data = { ...initial };
  return { get: (k) => data[k], set: (k, v) => (data[k] = v), data };
}

test("prefs: defaults, persistence, change events", () => {
  const state = memoryState();
  const prefs = createPrefs(state);
  assert.equal(prefs.get("theme"), "system");
  const seen = [];
  prefs.onChange((k, v) => seen.push([k, v]));
  prefs.set("theme", "light");
  prefs.set("theme", "light");
  prefs.set("badgeDisabled", true);
  assert.deepEqual(seen, [["theme", "light"], ["badgeDisabled", true]], "no event when unchanged");
  assert.equal(state.data.prefs.theme, "light");
  assert.equal(createPrefs(state).get("theme"), "light", "reloaded from state");
  assert.throws(() => prefs.set("nope", 1), /Unknown preference/);
});

test("prefs: invalid stored values fall back", () => {
  const p = sanitize({ theme: "purple", badgeDisabled: "yes", appIcon: "relative.png" });
  assert.equal(p.theme, "system");
  assert.equal(p.badgeDisabled, false);
  assert.equal(p.appIcon, null);
  assert.equal(sanitize({ appIcon: "/home/u/icon.png" }).appIcon, "/home/u/icon.png");
  assert.equal(sanitize("junk").theme, "system");
});

test("redacted config hides sensitive values and drops profiles", () => {
  const product = fixtureProduct({ options: { "x.secret": { type: "string", default: null, sensitive: true } } });
  const r = loadConfig({ product, argv: ["--url=https://tenant.example.com/", "--x.secret=hunter2"] });
  const shown = redactedConfig(r.flat, r.schema);
  assert.equal(shown.url, "<set, hidden>");
  assert.equal(shown["x.secret"], "<set, hidden>");
  assert.equal(shown["network.proxyServer"], null, "unset sensitive values stay null");
  assert.equal(shown["tray.enabled"], true);
  assert.equal("profiles" in shown, false);
  assert.doesNotMatch(JSON.stringify(shown), /hunter2|tenant\.example/);
});

test("product: menu fields", () => {
  const p = fixtureProduct({ homeLabel: "Inbox", supportUrl: "https://support.example.com/", reservedShortcuts: ["Ctrl+Q"] });
  assert.equal(p.homeLabel, "Inbox");
  assert.deepEqual(p.reservedShortcuts, ["Ctrl+Q"]);
  assert.equal(fixtureProduct().homeLabel, "Test", "defaults to title");
  assert.throws(() => validateProduct(fixtureDescriptor({ supportUrl: "http://x" })), /supportUrl/);
  assert.throws(() => validateProduct(fixtureDescriptor({ reservedShortcuts: [1] })), /reservedShortcuts/);
});
