"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadConfig, profileDataDir } = require("../src/config");
const { fixtureProduct } = require("./fixture");

const product = fixtureProduct({
  options: { "mqtt.enabled": { type: "boolean", default: false, describe: "x" } },
});

test("config: defaults with no files", () => {
  const r = loadConfig({ product });
  assert.equal(r.profile, "default");
  assert.equal(r.account, "work");
  assert.equal(r.startUrl, "https://app.example.com/");
  assert.equal(r.config.window.closeToTray, true);
  assert.equal(r.config.mqtt.enabled, false, "product options are part of the schema");
  assert.deepEqual(r.warnings, []);
});

test("config: user overrides system, CLI overrides both, nested JSON maps to dotted keys", () => {
  const r = loadConfig({
    product,
    systemConfigText: JSON.stringify({ tray: { enabled: false }, notifications: { enabled: false } }),
    userConfigText: JSON.stringify({ tray: { enabled: true }, "logging.level": "debug" }),
    argv: ["--notifications.enabled", "--window.frame=false", "--ozone-platform=wayland", "outlook://x"],
  });
  assert.equal(r.flat["tray.enabled"], true);
  assert.equal(r.flat["logging.level"], "debug");
  assert.equal(r.flat["notifications.enabled"], true);
  assert.equal(r.flat["window.frame"], false);
  assert.deepEqual(r.warnings, []);
});

test("config: font antialiasing defaults to grayscale and validates values", () => {
  assert.equal(loadConfig({ product }).flat["appearance.fontAntialiasing"], "grayscale");
  assert.equal(loadConfig({ product, argv: ["--appearance.fontAntialiasing=system"] }).flat["appearance.fontAntialiasing"], "system");
  const bad = loadConfig({ product, argv: ["--appearance.fontAntialiasing=bold"] });
  assert.equal(bad.flat["appearance.fontAntialiasing"], "grayscale");
  assert.equal(bad.warnings.length, 1);
});

test("config: --no-flag form", () => {
  const r = loadConfig({ product, argv: ["--no-tray.enabled"] });
  assert.equal(r.flat["tray.enabled"], false);
});

test("config: invalid sources and values produce warnings without values", () => {
  const r = loadConfig({
    product,
    systemConfigText: "{ not json",
    userConfigText: JSON.stringify({ secret: "token-123", window: { menubar: "sometimes" }, tray: { enabled: "yes" } }),
    argv: ["--window.startMinimized=maybe"],
  });
  const text = r.warnings.join("\n");
  assert.match(text, /system config is not valid JSON/);
  assert.match(text, /Unknown option "secret"/);
  assert.match(text, /"window\.menubar".*wrong type or value/);
  assert.match(text, /"tray\.enabled".*wrong type/);
  assert.match(text, /--window\.startMinimized/);
  assert.doesNotMatch(text, /token-123|sometimes/, "values never appear in warnings");
  assert.equal(r.flat["window.menubar"], "auto");
});

test("config: profiles apply their block and pick the account", () => {
  const userConfigText = JSON.stringify({
    window: { startMinimized: true },
    profiles: { personal: { account: "personal", window: { startMinimized: false } } },
  });
  const work = loadConfig({ product, userConfigText });
  assert.equal(work.startUrl, "https://app.example.com/");
  assert.equal(work.flat["window.startMinimized"], true);

  const personal = loadConfig({ product, userConfigText, argv: ["--profile=personal"] });
  assert.equal(personal.profile, "personal");
  assert.equal(personal.account, "personal");
  assert.equal(personal.startUrl, "https://app.example.net/");
  assert.equal(personal.flat["window.startMinimized"], false);
});

test("config: bad profile name and bad account fall back", () => {
  const r = loadConfig({ product, argv: ["--profile=../etc", "--account=gov"] });
  assert.equal(r.profile, "default");
  assert.equal(r.account, "work");
  assert.equal(r.warnings.length, 2);
});

test("config: url override must be https", () => {
  assert.equal(loadConfig({ product, argv: ["--url=https://outlook.office365.us/mail/"] }).startUrl, "https://outlook.office365.us/mail/");
  const insecure = loadConfig({ product, argv: ["--url=http://x.example.com/"] });
  assert.equal(insecure.startUrl, "https://app.example.com/");
  assert.match(insecure.warnings[0], /must use https/);
});

test("config: product options cannot shadow core options", () => {
  assert.throws(
    () => loadConfig({ product: fixtureProduct({ options: { "tray.enabled": { type: "boolean", default: true } } }) }),
    /collides/,
  );
});

test("profile data dirs", () => {
  assert.equal(profileDataDir("/home/u/.config/x", "default", path.join), "/home/u/.config/x");
  assert.equal(profileDataDir("/home/u/.config/x", "personal", path.join), "/home/u/.config/x/profiles/personal");
});
