"use strict";

// Corporate network support, after teams-for-linux login/, clientCertificate/ and
// certificate/ (GPL-3.0-or-later):
// - HTTP Basic/NTLM/Negotiate and proxy sign-in: a dialog, or auth.basic.user plus
//   auth.basic.passwordCommand (first try only)
// - smartcard / PKCS#11 PIN dialog for client certificates
// - client certificate choice by issuer or subject
// - extra trusted certificate authorities by fingerprint (TLS-inspecting proxies)
// Secrets are never logged; logs name the auth scheme and whether it is a proxy.

const { execFile } = require("node:child_process");

const AUTH_OPTIONS = Object.freeze({
  "auth.basic.user": { type: "string", default: null, describe: "User name for HTTP/proxy sign-in (used with auth.basic.passwordCommand)" },
  "auth.basic.passwordCommand": {
    type: "string",
    default: null,
    sensitive: true,
    describe: "Shell command whose first output line is the HTTP/proxy password, e.g. \"pass show work/proxy\". Tried once per host",
  },
  "auth.clientCertificate.issuer": { type: "string", default: null, describe: "Pick the client certificate whose issuer name contains this text" },
  "auth.clientCertificate.subject": { type: "string", default: null, describe: "Pick the client certificate whose subject name contains this text" },
  "auth.clientCertificate.pinDialog": { type: "boolean", default: true, describe: "Ask for the PIN when a smartcard or security token holds the client certificate" },
  "auth.customCAFingerprints": {
    type: "array",
    default: [],
    describe: "Extra trusted certificate authorities, as \"sha256/<base64>\" fingerprints. The log names the fingerprint to add when a CA is rejected",
  },
});

const MAX_ATTEMPTS = 3;
const ERR_CERT_AUTHORITY_INVALID = -202;
const VERIFY_ACCEPT = 0;
const VERIFY_CHROMIUM = -3;

/** Key for counting sign-in attempts. Pure. */
function loginKey(authInfo) {
  return `${authInfo.isProxy ? "proxy" : "server"}|${authInfo.host}:${authInfo.port}|${authInfo.scheme}`;
}

/** Pick a client certificate by configured issuer/subject text; null means "let Chromium choose". Pure. */
function chooseCertificate(list, { issuer, subject }) {
  if (!issuer && !subject) return null;
  const has = (name, needle) => !needle || (name ?? "").toLowerCase().includes(needle.toLowerCase());
  return list.find((c) => has(c.issuerName, issuer) && has(c.subjectName, subject)) ?? null;
}

/** Certificates of a validated chain, leaf first. Pure. */
function chainOf(cert) {
  const chain = [];
  for (let current = cert; current && !chain.includes(current); current = current.issuerCert) chain.push(current);
  return chain;
}

/** Certificate verify decision for the CA allowlist. Pure. */
function verifyDecision(request, fingerprints, now = Date.now() / 1000) {
  if (request.verificationResult === "OK") return { result: VERIFY_CHROMIUM, reason: "ok" };
  const authorityProblem =
    request.errorCode === ERR_CERT_AUTHORITY_INVALID || String(request.verificationResult ?? "").includes("CERT_AUTHORITY_INVALID");
  if (!authorityProblem) return { result: VERIFY_CHROMIUM, reason: "other-error" };
  const chain = chainOf(request.validatedCertificate ?? request.certificate);
  if (!chain.some((c) => fingerprints.includes(c.fingerprint))) {
    return { result: VERIFY_CHROMIUM, reason: "not-allowlisted", fingerprint: chain.at(-1)?.fingerprint ?? null };
  }
  const current = chain.every((c) => (c.validStart ?? 0) <= now && now <= (c.validExpiry ?? Infinity));
  return current ? { result: VERIFY_ACCEPT, reason: "allowlisted" } : { result: VERIFY_CHROMIUM, reason: "expired" };
}

function runPasswordCommand(command) {
  return new Promise((resolve, reject) => {
    // The command comes from the user's own config; shell features are expected.
    execFile("/bin/sh", ["-c", command], { timeout: 15000, maxBuffer: 64 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error(`password command failed (${error.code ?? "error"})`));
      const line = String(stdout).split(/\r?\n/)[0];
      line ? resolve(line) : reject(new Error("password command printed nothing"));
    });
  });
}

/**
 * @param {object} ctx app context (flat, logger, product)
 * @param {{ app: Electron.App, session: Electron.Session, prompt: Function, getWindow: () => Electron.BrowserWindow }} deps
 */
function installEnterpriseAuth(ctx, { app, session, prompt, getWindow }) {
  const { flat, logger } = ctx;

  // --- HTTP and proxy sign-in -------------------------------------------------
  const attempts = new Map();
  const commandTried = new Set();
  app.on("login", (event, _contents, _details, authInfo, callback) => {
    event.preventDefault();
    const key = loginKey(authInfo);
    const count = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, count);
    const where = authInfo.isProxy ? "proxy" : "server";
    if (count > MAX_ATTEMPTS) {
      logger.warn("[AUTH] Giving up after repeated sign-in failures", { where, scheme: authInfo.scheme });
      callback();
      return;
    }
    const user = flat["auth.basic.user"];
    const command = flat["auth.basic.passwordCommand"];
    const ask = () =>
      prompt({
        title: authInfo.isProxy ? "Proxy sign-in" : "Sign in",
        heading: authInfo.isProxy ? "The proxy needs a user name and password" : "This site needs a user name and password",
        message: `${authInfo.host}${authInfo.realm ? ` (${authInfo.realm})` : ""}`,
        warning: count > 1 ? "The previous user name or password was not accepted." : "",
        askUser: true,
        user: user ?? "",
        submitLabel: "Sign in",
        parent: getWindow(),
      }).then(
        (v) => callback(v.user, v.secret),
        () => callback(),
      );
    if (user && command && !commandTried.has(key)) {
      commandTried.add(key);
      runPasswordCommand(command).then(
        (password) => callback(user, password),
        (error) => {
          logger.warn("[AUTH] auth.basic.passwordCommand did not give a password; asking instead", { reason: error.message });
          ask();
        },
      );
      return;
    }
    ask();
  });

  // --- Client certificates ---------------------------------------------------
  const wanted = { issuer: flat["auth.clientCertificate.issuer"], subject: flat["auth.clientCertificate.subject"] };
  if (wanted.issuer || wanted.subject) {
    app.on("select-client-certificate", (event, _contents, _url, list, callback) => {
      const chosen = chooseCertificate(list, wanted);
      if (!chosen) {
        logger.warn("[CLIENT-CERT] No certificate matches auth.clientCertificate; using the default choice", { available: list.length });
        return;
      }
      event.preventDefault();
      callback(chosen);
    });
  }
  if (process.platform === "linux" && flat["auth.clientCertificate.pinDialog"] && typeof app.setClientCertRequestPasswordHandler === "function") {
    const pinAttempts = new Map();
    app.setClientCertRequestPasswordHandler(async ({ hostname, tokenName, isRetry }) => {
      const n = pinAttempts.get(tokenName) ?? 0;
      if (n >= MAX_ATTEMPTS) throw new Error("PIN attempt limit reached; restart to try again");
      pinAttempts.set(tokenName, n + 1);
      const { secret } = await prompt({
        title: "Smartcard PIN",
        heading: "Enter the PIN for your smartcard",
        message: `${hostname} asks for a client certificate on "${tokenName}".`,
        warning: isRetry ? "The previous PIN was wrong. Repeated wrong PINs can lock the card." : "",
        secretLabel: "PIN",
        submitLabel: "Unlock",
        parent: getWindow(),
      });
      return secret;
    });
  }

  // --- Extra trusted certificate authorities ---------------------------------
  const fingerprints = flat["auth.customCAFingerprints"];
  if (fingerprints.length === 0) {
    // Nothing is trusted extra; just tell the user what to add if a company CA is in the way.
    const hinted = new Set();
    app.on("certificate-error", (_event, _contents, _url, error, certificate) => {
      if (!String(error).includes("CERT_AUTHORITY_INVALID")) return;
      const fingerprint = chainOf(certificate).at(-1)?.fingerprint;
      if (!fingerprint || hinted.has(fingerprint)) return;
      hinted.add(fingerprint);
      logger.warn("[CERT] Untrusted certificate authority. If it is your organisation's, add its fingerprint to auth.customCAFingerprints", { fingerprint });
    });
  }
  if (fingerprints.length > 0) {
    const warned = new Set();
    const verify = (request, callback) => {
      const decision = verifyDecision(request, fingerprints);
      if (decision.reason === "not-allowlisted" && !warned.has(decision.fingerprint)) {
        warned.add(decision.fingerprint);
        logger.warn("[CERT] Untrusted certificate authority. To trust it, add its fingerprint to auth.customCAFingerprints", {
          fingerprint: decision.fingerprint,
        });
      }
      if (decision.reason === "expired") logger.warn("[CERT] Allowlisted authority presented an out-of-date certificate");
      callback(decision.result);
    };
    session.setCertificateVerifyProc(verify);
    app.on("session-created", (s) => s.setCertificateVerifyProc(verify));
    logger.info("[CERT] Custom CA allowlist active", { count: fingerprints.length });
  }
}

module.exports = { AUTH_OPTIONS, installEnterpriseAuth, loginKey, chooseCertificate, chainOf, verifyDecision };
