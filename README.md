# Outlook for Linux

Unofficial desktop client for Outlook on the web, for Linux. Not affiliated with or endorsed by Microsoft.

<img src="assets/icons/256x256.png" width="96" alt="">

## Features

- Work (`outlook.office.com`) and personal (`outlook.live.com`) accounts, side by side with profiles
- `mailto:` links open a new message; File menu: *Set as default mail client*
- Tray icon with unread count, desktop notifications
- Optional MQTT / Home Assistant unread sensor (`mqtt.*` options)
- Tray and app menu in the style of teams-for-linux: theme (system/light/dark), zoom, notifications, app icon, *Quit (Clear Storage)*
- Sandboxed, context-isolated pages; permissions only for Microsoft's own pages
- Offline page with automatic retry

## Install (Fedora)

Download the RPM from Releases, then:

```bash
sudo dnf install ./outlook-for-linux-*.x86_64.rpm
```

## Build from source

Requires Node.js 22+ and `rpm-build`.

```bash
npm install
npm run check        # lint + unit tests
npm run smoke        # launches the app against a local test page
npm run package:rpm  # dist/outlook-for-linux/outlook-for-linux-<version>.x86_64.rpm
```

## Configuration

`~/.config/outlook-for-linux/config.json` (user) and `/etc/outlook-for-linux/config.json` (system). Every option can also be given on
the command line, e.g. `outlook-for-linux --profile=personal --account=personal`. *Settings → Show Active Configuration* lists
the current values.

## Source

This repository is generated from the ms365-for-linux monorepo, which holds both this app and its sibling.
The shared shell is in `core/`. Parts of it are derived from
[teams-for-linux](https://github.com/IsmaelMartinez/teams-for-linux); see `NOTICE.md`.

## License

GPL-3.0-or-later. See `LICENSE`.
