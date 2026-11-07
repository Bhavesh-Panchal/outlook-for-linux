"use strict";

// The download button works without this script (it opens the latest release).
// With it, the button names and links the exact package for this visitor.
(async () => {
  const button = document.getElementById("download");
  const repo = button.href.replace(/^https:\/\/github\.com\//, "").replace(/\/releases\/latest$/, "");
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (!response.ok) return;
    const release = await response.json();
    const ua = navigator.userAgent.toLowerCase();
    const arm = /aarch64|arm64/.test(ua);
    const debian = /ubuntu|debian|mint/.test(ua);
    const pattern = debian ? (arm ? /_arm64\.deb$/ : /_amd64\.deb$/) : arm ? /\.aarch64\.rpm$/ : /\.x86_64\.rpm$/;
    const asset = release.assets.find((a) => pattern.test(a.name));
    button.textContent = `Download ${release.tag_name}`;
    if (asset) {
      button.href = asset.browser_download_url;
      button.title = asset.name;
    }
  } catch {
    // keep the static link
  }
})();
