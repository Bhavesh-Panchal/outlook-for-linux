#!/usr/bin/env node
"use strict";

// Smoke test: launch an app's main script in Electron against a local test
// page and check the shell end to end (preload bridge, sandbox, isolation,
// unread from title and from the Badging API, IPC sender checks).
// No network or Microsoft account needed.
//
// Usage: node scripts/smoke.js [main-script]   (default: packages/core/demo/main.js)

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const mainScript = path.resolve(root, process.argv[2] ?? "packages/core/demo/main.js");
const electron = require(path.join(root, "node_modules", "electron"));

const page = `<!doctype html><html><head><meta charset="utf-8"><title>(3) Smoke page</title></head>
<body><h1>smoke</h1></body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page);
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ms365-smoke-"));
  // A .js path runs under the dev Electron; anything else is a packaged executable.
  const packaged = !mainScript.endsWith(".js");
  const args = [`--url=http://127.0.0.1:${port}/`, "--network.allowInsecureHttp=true"];
  const child = spawn(
    packaged ? mainScript : electron,
    packaged ? args : [mainScript, ...args],
    { env: { ...process.env, MS365_SMOKE: "1", MS365_USER_DATA_DIR: userData }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const killer = setTimeout(() => child.kill("SIGKILL"), 90000);

  child.on("exit", (code) => {
    clearTimeout(killer);
    server.close();
    fs.rmSync(userData, { recursive: true, force: true });
    const line = output.split("\n").find((l) => l.startsWith("MS365_SMOKE "));
    if (!line) {
      console.error(`No smoke result (exit ${code}). Output:\n${output}`);
      process.exit(1);
    }
    const result = JSON.parse(line.slice("MS365_SMOKE ".length));
    console.log(JSON.stringify(result, null, 2));
    const warnings = output.split("\n").filter((l) => /\[(CONFIG|IPC|PERMISSIONS)\]/.test(l));
    if (warnings.length > 0) console.log(`Shell warnings:\n  ${warnings.join("\n  ")}`);
    console.log(result.ok ? "SMOKE PASS" : "SMOKE FAIL");
    process.exit(result.ok ? 0 : 1);
  });
});
