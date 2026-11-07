"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const util = require("../src/util");
const { isPermissionAllowed, isTrustedSender } = require("../src/security");
const { createLinkClassifier } = require("../src/links");
const { fixtureProduct } = require("./fixture");

const classify = createLinkClassifier(fixtureProduct());

test("unread: title parsing", () => {
  const p = /^\((\d+)\)/;
  assert.equal(util.parseUnreadFromTitle("(12) Mail - Outlook", p), 12);
  assert.equal(util.parseUnreadFromTitle("Mail - Outlook", p), null);
  assert.equal(util.parseUnreadFromTitle(undefined, p), null);
});

test("unread: badge API wins over title once used", () => {
  const seen = [];
  const t = util.createUnreadTracker(["badge-api", "title"], (n) => seen.push(n));
  t.fromTitle(3);
  t.fromBadge(5);
  t.fromTitle(9);
  t.fromBadge(undefined);
  t.fromBadge(-1);
  t.fromBadge("junk");
  assert.deepEqual(seen, [3, 5, 0, -1, 0]);
});

test("unread: disabled sources are ignored", () => {
  const seen = [];
  const t = util.createUnreadTracker(["title"], (n) => seen.push(n));
  t.fromBadge(4);
  t.fromTitle(2);
  assert.deepEqual(seen, [2]);
});

test("launch target from argv", () => {
  assert.equal(util.findLaunchTarget(["--ozone-platform=x11", "mailto:a@b.c"], ["mailto"]), "mailto:a@b.c");
  assert.equal(util.findLaunchTarget(["/opt/app/main.js", "https://x/"], ["mailto"]), "https://x/");
  assert.equal(util.findLaunchTarget(["MAILTO:x@y"], ["mailto"]), "MAILTO:x@y");
  assert.equal(util.findLaunchTarget(["--profile=work", "file:///x"], ["mailto"]), null);
});

test("download file names are safe and unique", () => {
  assert.equal(util.sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(util.sanitizeFileName("..\\..\\win.ini"), "win.ini");
  assert.equal(util.sanitizeFileName(".bashrc"), "bashrc");
  assert.equal(util.sanitizeFileName("a\u0007b.txt"), "a_b.txt");
  assert.equal(util.sanitizeFileName(""), "download");
  const taken = new Set(["/d/report.pdf", "/d/report (1).pdf"]);
  assert.equal(util.uniqueFilePath("/d", "report.pdf", (p) => taken.has(p)), path.join("/d", "report (2).pdf"));
  assert.equal(util.uniqueFilePath("/d", "notes", () => false), path.join("/d", "notes"));
});

test("user agent drops Electron and app tokens", () => {
  const ua =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) outlook-for-linux/0.1.0 Chrome/146.0.7680.0 Electron/44.10.2 Safari/537.36";
  assert.equal(
    util.cleanUserAgent(ua),
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.0 Safari/537.36",
  );
});

test("window bounds restore only when visible", () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  const min = { width: 640, height: 480 };
  assert.deepEqual(util.restorableBounds({ x: 100, y: 100, width: 800, height: 600 }, areas, min), { x: 100, y: 100, width: 800, height: 600 });
  assert.equal(util.restorableBounds({ x: 3000, y: 100, width: 800, height: 600 }, areas, min), null, "monitor gone");
  assert.equal(util.restorableBounds({ x: 100, y: 1070, width: 800, height: 600 }, areas, min), null, "title bar off screen");
  assert.deepEqual(util.restorableBounds({ x: 0, y: 0, width: 1, height: 1 }, areas, min), { x: 0, y: 0, width: 640, height: 480 });
  assert.equal(util.restorableBounds(undefined, areas, min), null);
});

test("network errors and retry delay", () => {
  assert.equal(util.isNetworkErrorCode(-106), true);
  assert.equal(util.isNetworkErrorCode(-7), true);
  assert.equal(util.isNetworkErrorCode(-3), false, "aborted load is not offline");
  assert.deepEqual([0, 1, 2, 10].map(util.retryDelay), [2000, 4000, 8000, 60000]);
});

test("redactUrl keeps only the origin", () => {
  assert.equal(util.redactUrl("https://outlook.office.com/mail/inbox?token=abc#x"), "https://outlook.office.com/…");
  assert.equal(util.redactUrl("nope"), "<invalid url>");
});

test("logger respects level", () => {
  const out = [];
  const sink = { error: (m) => out.push(["error", m]), warn: (m) => out.push(["warn", m]), info: (m) => out.push(["info", m]), debug: (m) => out.push(["debug", m]) };
  const log = util.createLogger("warn", sink);
  log.error("e");
  log.warn("w");
  log.info("i");
  log.debug("d");
  assert.deepEqual(out, [["error", "e"], ["warn", "w"]]);
});

test("permissions: trusted pages get listed and benign permissions only", () => {
  const policy = { classify, allowed: new Set(["notifications", "openExternal", "media"]) };
  const app = "https://app.example.com/mail";
  assert.equal(isPermissionAllowed({ permission: "notifications", requestingUrl: app }, policy), true);
  assert.equal(isPermissionAllowed({ permission: "persistent-storage", requestingUrl: app }, policy), true, "benign");
  assert.equal(isPermissionAllowed({ permission: "geolocation", requestingUrl: app }, policy), false, "not listed");
  assert.equal(isPermissionAllowed({ permission: "notifications", requestingUrl: "https://evil.example.org/" }, policy), false);
  assert.equal(isPermissionAllowed({ permission: "persistent-storage", requestingUrl: "https://evil.example.org/" }, policy), false);
  assert.equal(
    isPermissionAllowed({ permission: "notifications", requestingUrl: "https://login.microsoftonline.com/" }, policy),
    false,
    "sign-in pages are not trusted for permissions",
  );
});

test("permissions: frame-gated permissions inherit from a trusted top level", () => {
  const policy = { classify, allowed: new Set(["media", "notifications"]) };
  const frame = { requestingUrl: "https://embed.example.org/", topLevelUrl: "https://app.example.com/" };
  assert.equal(isPermissionAllowed({ permission: "media", ...frame }, policy), true);
  assert.equal(isPermissionAllowed({ permission: "notifications", ...frame }, policy), false);
});

test("permissions: openExternal only for mailto/tel from the main frame", () => {
  const policy = { classify, allowed: new Set(["openExternal"]) };
  assert.equal(isPermissionAllowed({ permission: "openExternal", isMainFrame: true, externalURL: "mailto:a@b" }, policy), true);
  assert.equal(isPermissionAllowed({ permission: "openExternal", isMainFrame: false, externalURL: "mailto:a@b" }, policy), false);
  assert.equal(isPermissionAllowed({ permission: "openExternal", isMainFrame: true, externalURL: "ssh://host" }, policy), false);
});

test("IPC sender trust", () => {
  const ctx = { classify, appRoot: "/opt/app/core" };
  assert.equal(isTrustedSender("https://app.example.com/x", "web", ctx), true);
  assert.equal(isTrustedSender("https://evil.example.org/", "web", ctx), false);
  assert.equal(isTrustedSender("file:///opt/app/core/static/offline.html", "local", ctx), true);
  assert.equal(isTrustedSender("file:///opt/app/core-evil/x.html", "local", ctx), false, "prefix of another dir");
  assert.equal(isTrustedSender("file:///tmp/x.html", "local", ctx), false);
  assert.equal(isTrustedSender("https://app.example.com/", "local", ctx), false);
  assert.equal(isTrustedSender("file:///opt/app/core/static/offline.html", "web", ctx), false);
  assert.equal(isTrustedSender(undefined, "web", ctx), false);
});
