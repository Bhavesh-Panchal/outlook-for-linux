"use strict";

// Update notice. The app is installed by a package manager (RPM/DEB) or as an
// AppImage, so it does not update itself: it checks the project's latest GitHub
// release and offers to open the download page. One request per check, to
// api.github.com only; nothing about the user is sent.

const { Notification, dialog, net, shell } = require("electron");

const UPDATE_OPTIONS = Object.freeze({
  "updates.check": { type: "boolean", default: true, describe: "Check GitHub for a newer release (once at startup, then daily)" },
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** Compare "1.2.3" style versions; pre-release suffixes sort before the release. Pure. */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ""] = String(v).replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** "owner/repo" from a github.com homepage, or null. Pure. */
function githubRepo(homepage) {
  try {
    const url = new URL(homepage);
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return url.hostname === "github.com" && owner && repo ? `${owner}/${repo}` : null;
  } catch {
    return null;
  }
}

function createUpdateChecker(ctx, getWindow) {
  const { product, logger, state } = ctx;
  const repo = githubRepo(product.homepage);
  let checking = false;

  async function latestRelease() {
    const response = await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `${product.id}/${product.version}` },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const json = await response.json();
    return { version: String(json.tag_name ?? "").replace(/^v/, ""), url: json.html_url };
  }

  async function check({ manual = false } = {}) {
    if (!repo || checking) return;
    checking = true;
    try {
      const latest = await latestRelease();
      state.set("updates", { lastCheck: Date.now(), latest: latest.version });
      const newer = compareVersions(latest.version, product.version) > 0;
      logger.info("[UPDATES] Checked", { current: product.version, latest: latest.version, newer });
      if (newer) return announce(latest, manual);
      if (manual) {
        dialog.showMessageBox(getWindow(), { type: "info", message: "You have the latest version.", detail: `${product.name} ${product.version}` });
      }
    } catch (error) {
      logger.warn("[UPDATES] Check failed", { message: error.message });
      if (manual) dialog.showMessageBox(getWindow(), { type: "warning", message: "Could not check for updates.", detail: error.message });
    } finally {
      checking = false;
    }
  }

  async function announce(latest, manual) {
    const skipped = state.get("updates")?.skipped;
    if (!manual && skipped === latest.version) return;
    if (!manual && Notification.isSupported() && !ctx.prefs?.get("notificationsDisabled")) {
      const n = new Notification({ title: `${product.name} ${latest.version} is available`, body: "Click to open the download page.", icon: product.icons.app });
      n.on("click", () => shell.openExternal(latest.url));
      n.show();
      return;
    }
    const { response } = await dialog.showMessageBox(getWindow(), {
      type: "info",
      buttons: ["Download", "Skip this version", "Later"],
      defaultId: 0,
      cancelId: 2,
      message: `${product.name} ${latest.version} is available`,
      detail: `You have ${product.version}. Download the package for your system from the release page.`,
    });
    if (response === 0) shell.openExternal(latest.url);
    if (response === 1) state.set("updates", { ...(state.get("updates") ?? {}), skipped: latest.version });
  }

  return {
    available: repo !== null,
    check,
    start() {
      if (!repo || !ctx.flat["updates.check"]) return;
      const last = state.get("updates")?.lastCheck ?? 0;
      const first = Math.max(30000, last + DAY_MS - Date.now());
      setTimeout(() => {
        check();
        setInterval(check, DAY_MS).unref();
      }, Math.min(first, DAY_MS)).unref();
    },
  };
}

module.exports = { UPDATE_OPTIONS, compareVersions, githubRepo, createUpdateChecker };
