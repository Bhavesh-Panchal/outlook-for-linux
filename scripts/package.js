#!/usr/bin/env node
"use strict";

// Build Linux packages for one app.
//   node scripts/package.js <outlook-for-linux|onedrive-for-linux> [rpm|deb|AppImage|tar.gz|all ...] [--arch=x64,arm64]
//   (default: rpm for x64)
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
    comment: "Unofficial Microsoft Outlook client for Linux",
    category: "Office;Email;",
    keywords: "mail;email;calendar;outlook;office365;microsoft365;",
    protocols: [{ name: "Email", schemes: ["mailto"] }],
  },
  "onedrive-for-linux": {
    productName: "OneDrive for Linux",
    comment: "Unofficial Microsoft OneDrive client for Linux",
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
// Remaining args: targets (rpm, deb, AppImage, tar.gz, or "all") and --arch=x64,arm64.
const rest = process.argv.slice(3);
const archArg = rest.find((a) => a.startsWith("--arch="));
const archs = (archArg ? archArg.slice("--arch=".length) : "x64").split(",").filter(Boolean);
const ALL_TARGETS = ["rpm", "deb", "AppImage", "tar.gz"];
let targets = rest.filter((a) => !a.startsWith("--"));
if (targets.includes("all")) targets = ALL_TARGETS;
const meta = APPS[appId];
if (!meta || archs.some((a) => !["x64", "arm64"].includes(a)) || targets.some((t) => !ALL_TARGETS.includes(t))) {
  console.error(`usage: package.js <${Object.keys(APPS).join("|")}> [${ALL_TARGETS.join("|")}|all ...] [--arch=x64,arm64]`);
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
    executableName: appId,
    syncDesktopName: true,
    icon: "assets/icons",
    category: meta.category.replace(/;$/, ""),
    synopsis: meta.comment,
    description: appPkg.description,
    maintainer: appPkg.author.email,
    vendor: "ms365-for-linux",
    desktop: {
      entry: {
        Name: meta.productName,
        Comment: appPkg.description,
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
  // Default artifact names, as in teams-for-linux releases: app-1.2.3.AppImage, app-1.2.3-arm64.AppImage,
  // app-1.2.3.x86_64.rpm, app-1.2.3.aarch64.rpm, app_1.2.3_amd64.deb, app_1.2.3_arm64.deb, app-1.2.3.tar.gz ...
  // Writes latest-linux.yml / latest-linux-arm64.yml (electron-updater metadata) next to the packages.
  // Nothing is uploaded from here ("--publish never"); the release workflow uploads.
  publish: appPkg.homepage?.startsWith("https://github.com/")
    ? [{ provider: "github", owner: new URL(appPkg.homepage).pathname.split("/")[1], repo: appId, releaseType: "release" }]
    : null,
};
const configFile = path.join(stage, "electron-builder.json");
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

fs.rmSync(output, { recursive: true, force: true });
run(
  path.join(root, "node_modules", ".bin", "electron-builder"),
  ["--linux", ...(targets.length > 0 ? targets : ["rpm"]), ...archs.map((a) => `--${a}`), "--publish", "never", "--projectDir", stage, "--config", configFile],
  root,
);

const PACKAGE_RE = /\.(rpm|deb|AppImage|tar\.gz)$/;
// AppImages are named after productName ("Outlook for Linux-0.2.4.AppImage"); use the
// package name without spaces, as teams-for-linux does, and fix the update metadata to match.
const prefix = `${meta.productName}-`;
for (const file of fs.readdirSync(output).filter((f) => f.startsWith(prefix) && f.endsWith(".AppImage"))) {
  const renamed = `${appId}-${file.slice(prefix.length)}`;
  fs.renameSync(path.join(output, file), path.join(output, renamed));
  for (const yml of fs.readdirSync(output).filter((f) => /^latest-linux.*\.yml$/.test(f))) {
    const p = path.join(output, yml);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll(file, renamed).replaceAll(file.replaceAll(" ", "-"), renamed));
  }
}
const built = fs.readdirSync(output).filter((f) => PACKAGE_RE.test(f) || /^latest-linux.*\.yml$/.test(f)).sort();
// One SHA256SUMS file, like distribution mirrors: `sha256sum -c SHA256SUMS --ignore-missing`.
const crypto = require("node:crypto");
const sums = built
  .filter((f) => PACKAGE_RE.test(f))
  .map((f) => `${crypto.createHash("sha256").update(fs.readFileSync(path.join(output, f))).digest("hex")}  ${f}`);
fs.writeFileSync(path.join(output, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(`\nBuilt for ${appId} (desktop entry ${desktopName}):\n  ${[...built, "SHA256SUMS"].map((f) => path.join("dist", appId, f)).join("\n  ")}`);
