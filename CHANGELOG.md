# Changelog

## 0.2.5 (2026-11-07)

### Features

* **packages:** release RPM, DEB, AppImage and tar.gz for x86_64 and arm64, with `SHA256SUMS` and update metadata (`latest-linux.yml`, `latest-linux-arm64.yml`)
* **readme:** install table for every distribution and architecture

## 0.2.4 (2026-11-07)

### Bug Fixes

* **copilot:** report the Google Chrome brand in client hints, so Outlook shows *Copilot Chat*, *Chat with Copilot* and *Summarize this email* (`network.browserBrand`, default `chrome`)

### Documentation

* **readme:** troubleshooting entry for missing Copilot features

## 0.2.3 (2026-11-07)

First public release.

### Features

* **accounts:** work (`outlook.office.com`) and personal (`outlook.live.com`) accounts, side by side with profiles
* **mailto:** `mailto:` links open a new message; *Settings › Set as default mail client*
* **tray:** unread count on the tray icon and launcher badge; notifications with mute and off switches
* **menu:** tray and app menu in the style of Teams for Linux: theme (system/light/dark), zoom, app icon, *Quit (Clear Storage)*
* **mqtt:** optional unread-count sensor for Home Assistant
* **icons:** app icon in the Teams for Linux style, with the Linux penguin

### Bug Fixes

* **text:** grayscale antialiasing by default, so text matches Firefox instead of looking bold
* **keyboard:** the menu no longer takes Outlook's Ctrl+Q (*mark as read*) and Ctrl+R (*reply*)
