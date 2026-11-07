#!/usr/bin/env node
"use strict";

// Verify a packaged build is hardened. Fails (exit 1) if any check does not hold.
//   node scripts/check-fuses.js dist/<app>/linux-unpacked/<app>
// 1. Every fuse is in the state scripts/afterpack.js asks for.
// 2. The binary refuses the attacks those fuses block:
//    ELECTRON_RUN_AS_NODE, NODE_OPTIONS injection, --inspect.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { getCurrentFuseWire, FuseState, FuseV1Options } = require("@electron/fuses");
const { FUSES } = require("./afterpack");

const binary = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(binary)) {
  console.error("usage: check-fuses.js <packaged executable>");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

function run(args, env, ms = 12000) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), ms);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => (s.destroy(), resolve(true)));
    s.on("error", () => resolve(false));
  });

async function main() {
  const wire = await getCurrentFuseWire(binary);
  for (const [option, wanted] of Object.entries(FUSES)) {
    const state = wire[option];
    const ok = state === (wanted ? FuseState.ENABLE : FuseState.DISABLE);
    check(`fuse ${FuseV1Options[Number(option)] ?? option} ${wanted ? "on" : "off"}`, ok, ok ? "" : `found ${state}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fuse-check-"));
  const marker = path.join(tmp, "pwned");
  const payload = path.join(tmp, "payload.js");
  fs.writeFileSync(payload, `require("fs").writeFileSync(${JSON.stringify(marker)}, "x"); process.exit(0);`);
  const appEnv = { MS365_USER_DATA_DIR: path.join(tmp, "profile"), ELECTRON_ENABLE_LOGGING: "" };

  await run([payload], { ...appEnv, ELECTRON_RUN_AS_NODE: "1" });
  check("ELECTRON_RUN_AS_NODE cannot run a script", !fs.existsSync(marker));
  fs.rmSync(marker, { force: true });

  await run(["--updates.check=false"], { ...appEnv, NODE_OPTIONS: `--require ${payload}` }, 8000);
  check("NODE_OPTIONS cannot inject code", !fs.existsSync(marker));

  const port = 9000 + Math.floor(Math.random() * 500);
  const inspected = run([`--inspect=127.0.0.1:${port}`, "--updates.check=false"], appEnv, 9000);
  await new Promise((r) => setTimeout(r, 5000));
  check("--inspect opens no debugger port", !(await portOpen(port)));
  await inspected;

  const rport = port + 1;
  const remote = run([`--remote-debugging-port=${rport}`, "--updates.check=false"], appEnv, 9000);
  await new Promise((r) => setTimeout(r, 5000));
  check("--remote-debugging-port opens no DevTools port", !(await portOpen(rport)));
  await remote;

  fs.rmSync(tmp, { recursive: true, force: true });
  for (const r of results) console.log(`${r.ok ? "✔" : "✘"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? "HARDENING PASS" : `HARDENING FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
