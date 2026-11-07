#!/usr/bin/env node
"use strict";

// Release notes for one version, in the layout of teams-for-linux releases:
//   ## [0.2.6](compare link) (date)
//   ### Features / Bug Fixes / ...      from CHANGELOG.md
//   ### Maintenance                      dependency PRs merged since the last release
//   ### Thanks                           everyone whose PR is in this release
//   Install table (collapsed)
//
//   node scripts/release-notes.js <version> [--repo owner/name] [--previous vX.Y.Z]
// Uses the GitHub CLI (gh) for PR data when available; without it, only CHANGELOG.md.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/** The "## <version> (...)" section of a changelog, without its heading. Pure. */
function changelogSection(text, version) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
  if (start === -1) return { date: null, body: "" };
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const date = /\((\d{4}-\d{2}-\d{2})\)/.exec(lines[start])?.[1] ?? null;
  return { date, body: lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim() };
}

/** PRs (number, title, author, isBot) to Maintenance lines and a thanks list. Pure. */
function prSections(prs, owner, body) {
  const bot = (p) => p.isBot || /\[bot\]$|^app\//.test(p.author);
  const mentioned = (n) => new RegExp(`#${n}\\b`).test(body);
  const maintenance = prs
    .filter((p) => bot(p) && !mentioned(p.number))
    .map((p) => {
      const m = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(p.title);
      return m ? `* **${m[2] ?? m[1]}:** ${m[3]} (#${p.number})` : `* ${p.title} (#${p.number})`;
    });
  const other = prs.filter((p) => !bot(p) && !mentioned(p.number)).map((p) => `* ${p.title} (#${p.number}) by @${p.author}`);
  const thanks = [...new Set(prs.filter((p) => p.author.toLowerCase() !== owner.toLowerCase()).map((p) => (bot(p) ? `@app/${p.author.replace(/\[bot\]$|^app\//g, "")}` : `@${p.author}`)))];
  return { maintenance, other, thanks };
}

function installTable(app, version) {
  return `<details>
<summary><b>Install</b>: RPM, DEB, AppImage and tar.gz for x86_64 and arm64</summary>

| Package | x86_64 | arm64 |
|---|---|---|
| Fedora / RHEL (RPM) | \`${app}-${version}.x86_64.rpm\` | \`${app}-${version}.aarch64.rpm\` |
| Debian / Ubuntu (DEB) | \`${app}_${version}_amd64.deb\` | \`${app}_${version}_arm64.deb\` |
| AppImage | \`${app}-${version}.AppImage\` | \`${app}-${version}-arm64.AppImage\` |
| tar.gz | \`${app}-${version}.tar.gz\` | \`${app}-${version}-arm64.tar.gz\` |

\`\`\`bash
sudo dnf install ./${app}-${version}.x86_64.rpm     # Fedora / RHEL
sudo apt install ./${app}_${version}_amd64.deb      # Debian / Ubuntu
sha256sum -c SHA256SUMS --ignore-missing            # verify downloads
\`\`\`

</details>`;
}

function render({ app, repo, version, previous, date, body, maintenance, other, thanks }) {
  const heading = previous
    ? `## [${version}](https://github.com/${repo}/compare/${previous}...v${version}) (${date})`
    : `## ${version} (${date})`;
  const parts = [heading, "", body || "_No user-facing changes._"];
  if (maintenance.length > 0) parts.push("", "### Maintenance", "", ...maintenance);
  if (other.length > 0) parts.push("", "### Other Changes", "", ...other);
  if (thanks.length > 0) {
    const names = thanks.length === 1 ? thanks[0] : `${thanks.slice(0, -1).join(", ")} and ${thanks.at(-1)}`;
    parts.push("", "### Thanks", "", `Big thanks to ${names} for contributing to this release.`);
  }
  parts.push("", installTable(app, version), "", "<sub>Unofficial; not affiliated with or endorsed by Microsoft.</sub>", "");
  return parts.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1];
  };
  const version = args[0];
  if (!version || version.startsWith("-")) {
    console.error("usage: release-notes.js <version> [--repo owner/name] [--previous vX.Y.Z]");
    process.exit(2);
  }
  const root = path.join(__dirname, "..");
  const pkg = require(path.join(root, "package.json"));
  const repo = opt("--repo") ?? new URL(pkg.homepage).pathname.slice(1);
  const owner = repo.split("/")[0];
  const git = (...a) => {
    try {
      return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  const previous = opt("--previous") ?? (git("describe", "--tags", "--abbrev=0", `v${version}^`) || null);
  const { date, body } = changelogSection(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), version);

  let prs = [];
  if (previous) {
    const since = git("log", "-1", "--format=%cI", previous);
    try {
      const json = execFileSync(
        "gh",
        ["pr", "list", "-R", repo, "--state", "merged", "--limit", "200", "--search", `merged:>${since}`, "--json", "number,title,author"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      prs = JSON.parse(json).map((p) => ({ number: p.number, title: p.title, author: p.author.login, isBot: p.author.is_bot === true }));
    } catch {
      // No gh or no network: notes from CHANGELOG.md only.
    }
  }
  const { maintenance, other, thanks } = prSections(prs, owner, body);
  process.stdout.write(
    render({ app: pkg.name, repo, version, previous, date: date ?? new Date().toISOString().slice(0, 10), body, maintenance, other, thanks }),
  );
}

if (require.main === module) main();
module.exports = { changelogSection, prSections, render };
