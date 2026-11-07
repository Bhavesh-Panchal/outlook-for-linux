"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loginKey, chooseCertificate, chainOf, verifyDecision } = require("../src/enterprise");
const { compareVersions, githubRepo } = require("../src/updates");
const { dbusNames, actionFromArgv, shortcutBindings } = require("../src/control");
const { loadConfig } = require("../src/config");
const { fixtureProduct } = require("./fixture");

test("auth: login attempts are keyed per proxy/server, host and scheme", () => {
  assert.equal(loginKey({ isProxy: true, host: "proxy.corp", port: 3128, scheme: "ntlm" }), "proxy|proxy.corp:3128|ntlm");
  assert.notEqual(loginKey({ isProxy: false, host: "a", port: 443, scheme: "basic" }), loginKey({ isProxy: true, host: "a", port: 443, scheme: "basic" }));
});

test("auth: client certificate choice", () => {
  const list = [
    { issuerName: "Contoso Root CA", subjectName: "alice" },
    { issuerName: "Fabrikam Issuing CA 2", subjectName: "Alice Smith" },
  ];
  assert.equal(chooseCertificate(list, {}), null, "no preference: Chromium decides");
  assert.equal(chooseCertificate(list, { issuer: "fabrikam" }), list[1]);
  assert.equal(chooseCertificate(list, { issuer: "contoso", subject: "ALICE" }), list[0]);
  assert.equal(chooseCertificate(list, { issuer: "nobody" }), null);
});

test("cert: CA allowlist decisions", () => {
  const root = { fingerprint: "sha256/ROOT", validStart: 0, validExpiry: 4e9 };
  root.issuerCert = root;
  const leaf = { fingerprint: "sha256/LEAF", validStart: 0, validExpiry: 4e9, issuerCert: root };
  assert.deepEqual(chainOf(leaf).map((c) => c.fingerprint), ["sha256/LEAF", "sha256/ROOT"]);
  const bad = { verificationResult: "net::ERR_CERT_AUTHORITY_INVALID", errorCode: -202, validatedCertificate: leaf };
  assert.equal(verifyDecision({ verificationResult: "OK" }, []).result, -3);
  assert.equal(verifyDecision(bad, ["sha256/ROOT"]).result, 0, "allowlisted CA accepted");
  assert.deepEqual(verifyDecision(bad, ["sha256/OTHER"]), { result: -3, reason: "not-allowlisted", fingerprint: "sha256/ROOT" });
  assert.equal(verifyDecision({ ...bad, errorCode: -201, verificationResult: "net::ERR_CERT_DATE_INVALID" }, ["sha256/ROOT"]).reason, "other-error", "only authority errors are overridden");
  const expired = { ...leaf, validExpiry: 10 };
  assert.equal(verifyDecision({ ...bad, validatedCertificate: expired }, ["sha256/ROOT"], 100).reason, "expired");
});

test("updates: version comparison and repo parsing", () => {
  assert.equal(compareVersions("0.2.10", "0.2.9"), 1);
  assert.equal(compareVersions("v1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.1"), -1);
  assert.equal(githubRepo("https://github.com/Bhavesh-Panchal/outlook-for-linux"), "Bhavesh-Panchal/outlook-for-linux");
  assert.equal(githubRepo("https://example.com/a/b"), null);
  assert.equal(githubRepo(null), null);
});

test("control: names, argv actions and shortcut validation", () => {
  assert.deepEqual(dbusNames("outlook-for-linux"), {
    busName: "io.github.ms365_for_linux.outlook_for_linux",
    objectPath: "/io/github/ms365_for_linux/outlook_for_linux",
    interfaceName: "io.github.ms365_for_linux.Control",
  });
  assert.equal(actionFromArgv(["--profile=work", "--action=toggle"]), "toggle");
  assert.equal(actionFromArgv(["--action=../x"]), null);
  assert.equal(actionFromArgv(["mailto:a@b"]), null);
  const actions = new Map([["toggle", {}], ["newMail", {}]]);
  const r = shortcutBindings({ toggle: "Ctrl+Alt+O", newMail: "", nope: "Ctrl+X" }, actions);
  assert.deepEqual(r.bindings, [{ action: "toggle", accelerator: "Ctrl+Alt+O" }]);
  assert.equal(r.problems.length, 2);
});

test("config: new option groups load from nested JSON and hide secrets", () => {
  const r = loadConfig({
    product: fixtureProduct(),
    userConfigText: JSON.stringify({ shortcuts: { global: { toggle: "Ctrl+Alt+O" } }, auth: { basic: { user: "u", passwordCommand: "pass x" } }, dbus: { enabled: true } }),
  });
  assert.deepEqual(r.flat["shortcuts.global"], { toggle: "Ctrl+Alt+O" });
  assert.equal(r.flat["auth.basic.passwordCommand"], "pass x");
  assert.equal(r.schema["auth.basic.passwordCommand"].sensitive, true);
  assert.equal(r.flat["dbus.enabled"], true);
  assert.equal(r.flat["updates.check"], true);
  assert.deepEqual(r.warnings, []);
});
