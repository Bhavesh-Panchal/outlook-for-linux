"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHostMatcher, assertHostPattern } = require("../src/hosts");
const { LINK, createLinkClassifier, decideWindowOpen, decideNavigation } = require("../src/links");
const { validateProduct } = require("../src/product");
const { fixtureDescriptor, fixtureProduct } = require("./fixture");

test("host matcher: exact patterns match only that host", () => {
  const m = createHostMatcher(["outlook.office.com"]);
  assert.equal(m("outlook.office.com"), true);
  assert.equal(m("OUTLOOK.office.com."), true);
  assert.equal(m("evil.outlook.office.com"), false);
  assert.equal(m("outlook.office.com.evil.com"), false);
  assert.equal(m(""), false);
  assert.equal(m(undefined), false);
});

test("host matcher: wildcard allows exactly one label", () => {
  const m = createHostMatcher(["*.sharepoint.com"]);
  assert.equal(m("contoso-my.sharepoint.com"), true);
  assert.equal(m("sharepoint.com"), false);
  assert.equal(m("a.b.sharepoint.com"), false);
  assert.equal(m("evilsharepoint.com"), false);
});

test("host matcher: Defender for Cloud Apps suffix counts as the host", () => {
  const m = createHostMatcher(["outlook.office.com"]);
  assert.equal(m("outlook.office.com.mcas.ms"), true);
  assert.equal(m("evil.com.mcas.ms"), false);
});

test("host patterns are validated", () => {
  for (const bad of ["", "*", "*.com.", "http://x.com", "a..b", "**.x.com", "x.com/path", 5]) {
    assert.throws(() => assertHostPattern(bad), /Invalid host pattern/, String(bad));
  }
  assert.doesNotThrow(() => assertHostPattern("*.x-y.example.com"));
});

test("links: classification by host and scheme", () => {
  const classify = createLinkClassifier(fixtureProduct());
  assert.equal(classify("https://app.example.com/mail"), LINK.APP);
  assert.equal(classify("https://login.microsoftonline.com/common"), LINK.AUTH);
  assert.equal(classify("https://tenant.docs.example.com/doc"), LINK.CONTENT);
  assert.equal(classify("about:blank"), LINK.BLANK);
  assert.equal(classify("mailto:a@b.c"), LINK.PROTOCOL);
  assert.equal(classify("https://news.example.org/"), LINK.EXTERNAL);
  assert.equal(classify("http://app.example.com/"), LINK.EXTERNAL, "http is never trusted by default");
  assert.equal(classify("tel:+100"), LINK.EXTERNAL);
  for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "about:srcdoc", "not a url"]) {
    assert.equal(classify(bad), LINK.BLOCKED, bad);
  }
});

test("links: configured start URL origin is trusted; insecure http only when allowed", () => {
  const classify = createLinkClassifier(fixtureProduct(), {
    extraAppOrigins: ["https://outlook.office365.us/mail/"],
    allowInsecureHttp: true,
  });
  assert.equal(classify("https://outlook.office365.us/owa"), LINK.APP);
  assert.equal(classify("https://other.office365.us/"), LINK.EXTERNAL);
  assert.equal(classify("http://app.example.com/"), LINK.APP);
});

test("links: window.open and navigation decisions", () => {
  assert.equal(decideWindowOpen(LINK.APP), "child");
  assert.equal(decideWindowOpen(LINK.AUTH), "child");
  assert.equal(decideWindowOpen(LINK.BLANK), "child");
  assert.equal(decideWindowOpen(LINK.CONTENT), "child");
  assert.equal(decideWindowOpen(LINK.EXTERNAL), "external");
  assert.equal(decideWindowOpen(LINK.PROTOCOL), "protocol");
  assert.equal(decideWindowOpen(LINK.BLOCKED), "deny");

  assert.equal(decideNavigation("https://adfs.contoso.com/adfs/ls", LINK.EXTERNAL), "allow", "federated sign-in stays in place");
  assert.equal(decideNavigation("http://example.org/", LINK.EXTERNAL), "external");
  assert.equal(decideNavigation("tel:1", LINK.EXTERNAL), "external");
  assert.equal(decideNavigation("file:///x", LINK.BLOCKED), "deny");
  assert.equal(decideNavigation("mailto:a@b", LINK.PROTOCOL), "protocol");
});

test("product: valid descriptor is normalized and frozen", () => {
  const p = fixtureProduct();
  assert.equal(p.defaultAccount, "work");
  assert.ok(p.hosts.auth.includes("login.microsoftonline.com"));
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.hosts.app));
  assert.deepEqual(p.unread.sources, ["badge-api", "title"]);
  assert.ok(p.permissions.includes("notifications"));
});

test("product: every problem is reported", () => {
  const bad = fixtureDescriptor({
    id: "Bad Id",
    urls: { work: "http://insecure.example.com/" },
    hosts: { app: ["not a host"] },
    protocols: [{ scheme: "1x" }],
    icons: { app: "relative.png" },
    unread: { sources: ["dom"] },
  });
  assert.throws(
    () => validateProduct(bad),
    (error) => {
      for (const part of ["id must", "urls.work must be an https URL", "hosts.app: Invalid host pattern", "protocols[0].scheme", "protocols[0].toUrl", "icons.app", "icons.tray", "unread.sources"]) {
        assert.match(error.message, new RegExp(part.replace(/[[\]().]/g, "\\$&")));
      }
      return true;
    },
  );
});

test("product: routeLink must be a function", () => {
  assert.throws(() => validateProduct(fixtureDescriptor({ routeLink: "external" })), /routeLink must be a function/);
  assert.equal(typeof fixtureProduct({ routeLink: () => null }).routeLink, "function");
});

test("product: start URL must be an app host", () => {
  assert.throws(
    () => validateProduct(fixtureDescriptor({ urls: { work: "https://elsewhere.example.org/" } })),
    /urls\.work host must be listed in hosts\.app/,
  );
});
