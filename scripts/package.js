#!/usr/bin/env node
"use strict";

// Build Linux packages for one app.
//   node scripts/package.js <outlook-for-linux|onedrive-for-linux> [targets...]   (default target: rpm)
//
// electron-builder does not follow npm workspace symlinks reliably, so the app
// is staged in build/<app>/ with the core copied in (npm --install-links) and
// only production dependencies, then packaged from there. Output: dist/<app>/.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const APPS = {
  "outlook-for-linux": {
    productName: "Outlook for Linux",
    comment: "Unofficial Outlook on the web client",
    category: "Office;Email;",
    keywords: "mail;email;calendar;outlook;office365;microsoft365;",
    protocols: [{ name: "Email", schemes: ["mailto"] }],
  },
  "onedrive-for-linux": {
    productName: "OneDrive for Linux",
    comment: "Unofficial OneDrive on the web client (no file sync)",
    category: "Network;FileTransfer;",
    keywords: "onedrive;cloud;files;sharepoint;office365;microsoft365;",
    protocols: [
      {
        name: "Office document links",
        schemes: ["ms-word", "ms-excel", "ms-powerpoint", "ms-visio", "ms-access", "ms-project", "ms-publisher", "ms-infopath"],
      },
    ],
  },
};

const appId = process.argv[2];
const targets = process.argv.slice(3);
const meta = APPS[appId];
if (!meta) {
  console.error(`usage: package.js <${Object.keys(APPS).join("|")}> [targets...]`);
  process.exit(2);
}

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" } });

const rootPkg = require(path.join(root, "package.json"));
// Two layouts: the monorepo (apps/<id>, packages/core) and a standalone app repo
// exported by scripts/export-app.js (app at the root, core in core/).
const standalone = !fs.existsSync(path.join(root, "apps"));
const coreDir = standalone ? path.join(root, "core") : path.join(root, "packages", "core");
const corePkg = require(path.join(coreDir, "package.json"));
const appDir = standalone ? root : path.join(root, "apps", appId);
const appPkg = require(path.join(appDir, "package.json"));
if (standalone && appPkg.name !== appId) {
  console.error(`This repository is ${appPkg.name}; cannot package ${appId}`);
  process.exit(2);
}
const stage = path.join(root, "build", appId);
const output = path.join(root, "dist", appId);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const dir of ["src", "assets"]) fs.cpSync(path.join(appDir, dir), path.join(stage, dir), { recursive: true });
fs.cpSync(coreDir, path.join(stage, "vendor", "core"), {
  recursive: true,
  filter: (src) => !/[/\\](test|demo|node_modules)([/\\]|$)/.test(path.relative(coreDir, src)),
});
fs.copyFileSync(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));

const stagedPkg = {
  name: appId,
  productName: meta.productName,
  version: appPkg.version,
  description: appPkg.description,
  license: appPkg.license,
  homepage: appPkg.homepage,
  author: appPkg.author,
  main: appPkg.main,
  // Electron uses this as the Wayland app_id / X11 WM_CLASS, linking windows to the desktop entry.
  desktopName: `${appId}.desktop`,
  dependencies: { ...appPkg.dependencies, [corePkg.name]: "file:vendor/core" },
};
fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(stagedPkg, null, 2));
run("npm", ["install", "--omit=dev", "--install-links", "--no-package-lock"], stage);

const desktopName = `${appId}.desktop`;
const config = {
  appId: `io.github.ms365_for_linux.${appId.replaceAll("-", "_")}`,
  productName: meta.productName,
  executableName: appId,
  electronVersion: rootPkg.devDependencies.electron.replace(/^[^\d]*/, ""),
  directories: { output, buildResources: "assets" },
  files: ["src/**", "assets/**", "node_modules/**", "package.json", "LICENSE"],
  asar: true,
  protocols: meta.protocols,
  linux: {
    target: targets.length > 0 ? targets : ["rpm"],
    executableName: appId,
    syncDesktopName: true,
    icon: "assets/icons",
    category: meta.category.replace(/;$/, ""),
    synopsis: meta.comment,
    description: `${appPkg.description}. Unofficial; not affiliated with Microsoft.`,
    maintainer: appPkg.author.email,
    vendor: "ms365-for-linux",
    desktop: {
      entry: {
        Name: meta.productName,
        Comment: meta.comment,
        Categories: meta.category,
        Keywords: meta.keywords,
        StartupWMClass: appId,
        StartupNotify: "true",
      },
    },
  },
  rpm: {
    packageName: appId,
    depends: ["gtk3", "libnotify", "nss", "libXScrnSaver", "(libXtst or libXtst6)", "xdg-utils", "at-spi2-core", "(libuuid or libuuid1)"],
    fpm: ["--rpm-rpmbuild-define=_build_id_links none", "--rpm-digest=sha256"],
  },
  deb: {
    depends: ["libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils", "libatspi2.0-0", "libuuid1", "libsecret-1-0", "libgbm1"],
  },
  publish: null,
};
const configFile = path.join(stage, "electron-builder.json");
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

fs.rmSync(output, { recursive: true, force: true });
run(path.join(root, "node_modules", ".bin", "electron-builder"), ["--linux", "--x64", "--projectDir", stage, "--config", configFile], root);

const built = fs.readdirSync(output).filter((f) => /\.(rpm|deb|AppImage|tar\.gz)$/.test(f));
console.log(`\nBuilt for ${appId} (desktop entry ${desktopName}):\n  ${built.map((f) => path.join("dist", appId, f)).join("\n  ")}`);
