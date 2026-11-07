#!/usr/bin/env node
"use strict";
// Compose apps/<app>/assets/icon.svg from assets-src/<app>.tile.svg and the teams-for-linux
// penguin, in the teams-for-linux "T+P" layout. See assets-src/README.md.
const fs = require("node:fs");
const path = require("node:path");
const app = process.argv[2];
const root = path.join(__dirname, "..");
const tile = fs.readFileSync(path.join(root, "assets-src", `${app}.tile.svg`), "utf8").trim();
const penguinSvg = fs.readFileSync(path.join(root, "assets-src", "penguin-t4l.svg"), "utf8");
const penguin = penguinSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
${tile}
<g transform="translate(24 16)">${penguin}</g>
</svg>
`;
fs.writeFileSync(path.join(root, "assets", "icon.svg"), svg);
console.log(`wrote assets/icon.svg`);
