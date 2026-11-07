"use strict";

// electron-builder afterPack hook: harden the packaged Electron binary with fuses.
// Runs once per architecture, before rpm/deb/AppImage/tar.gz are made from it, so
// every package ships the same hardened binary. See scripts/check-fuses.js.

const path = require("node:path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

// Wanted state of each fuse. Any change here must keep the app working:
// run `npm run smoke` and `node scripts/check-fuses.js` on a packaged build.
const FUSES = Object.freeze({
  // No "ELECTRON_RUN_AS_NODE=1 app script.js": the binary cannot be used as a plain Node.js.
  [FuseV1Options.RunAsNode]: false,
  // No code injection through NODE_OPTIONS / NODE_EXTRA_CA_CERTS style variables.
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  // No --inspect / --inspect-brk debugger on the main process.
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  // Encrypt cookies (the Microsoft sign-in session) with a key from the desktop keyring.
  [FuseV1Options.EnableCookieEncryption]: true,
  // Load the app only from resources/app.asar, never from a loose resources/app folder.
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // Left on: with it off, Electron cannot load the app's own pages (offline page,
  // sign-in and PIN prompts) from app.asar (ERR_FILE_NOT_FOUND, tested 0.3.1).
  // The risk it covers is untrusted file:// pages; the app never navigates to
  // file: URLs (links to them are blocked in core/src/links.js).
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
});

async function afterPack(context) {
  const executable = path.join(context.appOutDir, context.packager.executableName);
  await flipFuses(executable, { version: FuseVersion.V1, resetAdHocDarwinSignature: false, ...FUSES });
  console.log(`  • fuses hardened  file=${path.relative(process.cwd(), executable)}`);
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.FUSES = FUSES;
