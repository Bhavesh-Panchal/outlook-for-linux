# Outlook for Linux

![CI](https://github.com/Bhavesh-Panchal/outlook-for-linux/actions/workflows/ci.yml/badge.svg)
![Release](https://img.shields.io/github/v/release/Bhavesh-Panchal/outlook-for-linux?style=flat&label=release)
![Downloads](https://img.shields.io/github/downloads/Bhavesh-Panchal/outlook-for-linux/total.svg?style=flat)
![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg?style=flat)
![Platform](https://img.shields.io/badge/platform-Linux-informational.svg?style=flat)
![Electron](https://img.shields.io/badge/Electron-44-47848f.svg?style=flat&logo=electron&logoColor=white)

<img src="assets/icons/256x256.png" width="112" align="right" alt="Outlook for Linux icon">

**Unofficial Microsoft Outlook client for Linux**: a desktop app that wraps Outlook on the web with Linux integration.

✅ **System notifications for new mail**  
✅ **Tray icon with unread count**  
✅ **`mailto:` links open a new message**  
✅ **Work and personal accounts side by side**  
✅ **Light, dark or system theme**  

> [!NOTE]
> This is an independent project, not affiliated with or endorsed by Microsoft. Features are limited to what Outlook on the web offers.

## Installation

Download from [Releases](https://github.com/Bhavesh-Panchal/outlook-for-linux/releases/latest). Every release has packages for **x86_64** and **arm64**:

| Distribution | Package | Install |
|---|---|---|
| Fedora, RHEL, openSUSE | `.rpm` (`x86_64`, `aarch64`) | `sudo dnf install ./outlook-for-linux-*.x86_64.rpm` |
| Debian, Ubuntu, Mint | `.deb` (`amd64`, `arm64`) | `sudo apt install ./outlook-for-linux_*_amd64.deb` |
| Any distribution | `.AppImage` | `chmod +x outlook-for-linux-*.AppImage && ./outlook-for-linux-*.AppImage` |
| Any distribution | `.tar.gz` | extract, then run `./outlook-for-linux` |

Verify a download with `sha256sum -c SHA256SUMS --ignore-missing`. Flatpak and Snap are planned.

> [!TIP]
> For AppImages, [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) adds menu entries and handles updates.

## Quick Start

1. **Install** using a method above.
2. **Launch** *Outlook for Linux* from your application menu, or run `outlook-for-linux` in a terminal.
3. **Sign in** with your work or personal Microsoft account.
4. **Configure** (optional) by creating `~/.config/outlook-for-linux/config.json`. See [Configuration](#configuration).

## Features

- **Accounts:** work or school (`outlook.office.com`) and personal (`outlook.live.com`); run both at once with [profiles](#multiple-accounts-profiles).
- **Default mail client:** `mailto:` links open a new message with to, cc, bcc, subject and body filled in. *Settings › Set as default mail client* registers the app with your desktop.
- **Unread count** on the tray icon and launcher badge. *Notifications › Disable Badge Count* hides it.
- **Notifications** for new mail and reminders, with options to mute sound or turn them off.
- **Downloads** of attachments with progress and a notification when done.
- **MQTT / Home Assistant (optional):** publish the unread count as a sensor (`mqtt.*` options).
- **Keyboard:** Outlook's own shortcuts keep working; the app does not take Ctrl+Q (*mark as read*) or Ctrl+R (*reply*).

### Tray and app menu

Right-click the tray icon, or use the *Outlook for Linux* menu in the window:

Open · New mail · Return to Inbox · Refresh (F5) · Hide (Ctrl+H) · Debug › · Settings › · **Theme** › (Follow system / Light / Dark) · App Icon › · Zoom › · Notifications › · About · Help › · Quit (Clear Storage) · Quit

## Configuration

Settings are read from, in increasing priority:

1. `/etc/outlook-for-linux/config.json`: system-wide, for administrators
2. `~/.config/outlook-for-linux/config.json`: your settings
3. Command-line options, e.g. `outlook-for-linux --window.startMinimized`

Example `~/.config/outlook-for-linux/config.json`:

```json
{
  "account": "work",
  "window": {
    "startMinimized": true
  },
  "notifications": {
    "enabled": true
  },
  "downloads": {
    "directory": "/home/you/Downloads/Mail"
  },
  "mqtt": {
    "enabled": false,
    "brokerUrl": "mqtt://homeassistant.local:1883",
    "homeAssistant": true
  }
}
```

*Settings → Show Active Configuration* in the app lists every option with its current value (sensitive values hidden).

| Option | Default | Description |
|---|---|---|
| `account` | – | Account type to open: one of the product's url keys (e.g. work, personal) |
| `url` | – | Start URL override, e.g. a sovereign-cloud tenant |
| `window.frame` | `true` | Use the native window frame |
| `window.menubar` | `"auto"` | Menu bar visibility (`auto`, `visible`, `hidden`) |
| `window.startMinimized` | `false` | Start hidden in the tray |
| `window.closeToTray` | `true` | Closing the window hides it to the tray |
| `tray.enabled` | `true` | Show a tray icon |
| `notifications.enabled` | `true` | Allow desktop notifications |
| `downloads.directory` | – | Download folder (default: XDG Downloads) |
| `downloads.ask` | `false` | Ask where to save each download |
| `downloads.openFolderWhenDone` | `false` | Show the file in the file manager when a download finishes |
| `spellcheck.languages` | `[]` | Spell-check languages, e.g. ["en-US", "de-DE"] |
| `appearance.customCSSFile` | – | Absolute path of a CSS file injected into the app |
| `appearance.fontAntialiasing` | `"grayscale"` | Text antialiasing: grayscale (like Firefox; thinner, no colour fringes) or system (fontconfig subpixel setting) (`grayscale`, `system`) |
| `network.proxyServer` | – | Chromium --proxy-server value |
| `network.authServerAllowlist` | – | Hosts allowed for Kerberos/NTLM (Chromium --auth-server-allowlist) |
| `network.allowInsecureHttp` | `false` | Treat http:// app hosts as trusted (testing only) |
| `network.userAgent` | – | User agent override |
| `network.browserBrand` | `"chrome"` | Browser brand reported to the web app. "chrome" enables features Microsoft shows only to Chrome (e.g. Copilot in Outlook) (`chrome`, `chromium`) |
| `performance.disableGpu` | `false` | Disable hardware acceleration |
| `logging.level` | `"info"` | Console log level (`error`, `warn`, `info`, `debug`) |
| `auth.basic.user` | – | User name for HTTP/proxy sign-in (used with auth.basic.passwordCommand) |
| `auth.basic.passwordCommand` | – | Shell command whose first output line is the HTTP/proxy password, e.g. "pass show work/proxy". Tried once per host |
| `auth.clientCertificate.issuer` | – | Pick the client certificate whose issuer name contains this text |
| `auth.clientCertificate.subject` | – | Pick the client certificate whose subject name contains this text |
| `auth.clientCertificate.pinDialog` | `true` | Ask for the PIN when a smartcard or security token holds the client certificate |
| `auth.customCAFingerprints` | `[]` | Extra trusted certificate authorities, as "sha256/<base64>" fingerprints. The log names the fingerprint to add when a CA is rejected |
| `updates.check` | `true` | Check GitHub for a newer release (once at startup, then daily) |
| `shortcuts.global` | `{}` | System-wide shortcuts: action name to accelerator, e.g. {"toggle": "Ctrl+Alt+O"}. On Wayland the desktop asks once to allow them |
| `dbus.enabled` | `false` | Offer a D-Bus control interface on the session bus (Run, ListActions, GetUnreadCount, UnreadChanged) |
| `mqtt.enabled` | `false` | Publish the unread count to an MQTT broker |
| `mqtt.brokerUrl` | – | Broker URL, e.g. mqtt://host:1883 or mqtts://host:8883 |
| `mqtt.username` | – | Broker user name |
| `mqtt.password` | – | Broker password (stored in plain text in the config file) |
| `mqtt.clientId` | `"outlook-for-linux"` | MQTT client id; also names the Home Assistant entity |
| `mqtt.topicPrefix` | `"outlook"` | Topic prefix: <prefix>/unread and <prefix>/connected |
| `mqtt.homeAssistant` | `false` | Publish Home Assistant MQTT discovery config |
| `mqtt.discoveryPrefix` | `"homeassistant"` | Home Assistant discovery prefix |

### Corporate networks

| Need | Setting |
|---|---|
| Proxy | `"network": { "proxyServer": "http://proxy.corp:3128" }` |
| Proxy or site asks for a user name and password | A sign-in dialog appears. To skip it: `"auth": { "basic": { "user": "me", "passwordCommand": "pass show work/proxy" } }` (first output line is the password; tried once per host) |
| Kerberos / NTLM single sign-on | `"network": { "authServerAllowlist": "*.corp.example.com" }` |
| TLS-inspecting proxy with a company CA | `"auth": { "customCAFingerprints": ["sha256/…"] }`. When a CA is rejected, the log prints the exact fingerprint to add. |
| Smartcard / PKCS#11 client certificate | A PIN dialog appears (`auth.clientCertificate.pinDialog`, on by default). Choose between several certificates with `auth.clientCertificate.issuer` or `.subject`. |

Secrets typed into these dialogs or produced by `passwordCommand` are never logged or stored.

### Shortcuts and remote control

The same actions (`show`, `hide`, `toggle`, `reload`, `home`, `quit`, `newMail`) work three ways:

```bash
# 1. System-wide shortcuts (config.json). On Wayland the desktop asks once to allow them.
{ "shortcuts": { "global": { "toggle": "Ctrl+Alt+O", "newMail": "Ctrl+Alt+M" } } }

# 2. Command line: controls the running app (per profile)
outlook-for-linux --action=toggle

# 3. D-Bus (opt-in: "dbus": { "enabled": true })
busctl --user call io.github.ms365_for_linux.outlook_for_linux /io/github/ms365_for_linux/outlook_for_linux io.github.ms365_for_linux.Control Run s toggle
busctl --user call io.github.ms365_for_linux.outlook_for_linux /io/github/ms365_for_linux/outlook_for_linux io.github.ms365_for_linux.Control GetUnreadCount
```

D-Bus also emits an `UnreadChanged(i count)` signal, handy for status bars such as Waybar or Polybar.

### Updates

The app checks GitHub once a day for a newer release and shows a notification; *Help › Check for Updates…* checks now.
It never installs anything itself. Turn it off with `"updates": { "check": false }`.

### Multiple accounts (profiles)

Each profile has its own sign-in, window and data, so work and personal accounts can run side by side:

```bash
outlook-for-linux --profile=personal --account=personal
```

Per-profile settings go under `"profiles"` in `config.json`:

```json
{ "profiles": { "personal": { "account": "personal", "window": { "startMinimized": false } } } }
```

## Troubleshooting

| Problem | Try |
|---|---|
| Something also fails in a browser | Open https://outlook.office.com in Firefox or Chrome. If it fails there too, it is a Microsoft issue; report it to Microsoft. |
| Copilot or other Microsoft features missing | The app reports itself as Google Chrome (`network.browserBrand: "chrome"`, the default), because Microsoft shows some features only to Chrome. Your organisation must also have them enabled. |
| Text looks bolder than in Firefox | Default is grayscale text (`appearance.fontAntialiasing: "grayscale"`). Set `"system"` to follow your desktop setting. |
| Old icon in the menu or tray after an update | KDE: `rm ~/.cache/icon-cache.kcache && systemctl --user restart plasma-plasmashell.service`, or log out and back in. |
| Blank or flickering window | Start with `--performance.disableGpu`. |
| Signed out, or stuck at sign-in | Tray › *Quit (Clear Storage)*, then start again and sign in. |
| Corporate proxy | `--network.proxyServer=http://proxy:3128`, and for Kerberos/NTLM `--network.authServerAllowlist=*.example.com`. |

## Security & Sandboxing

Unlike many web-app wrappers, Outlook for Linux keeps Electron's security features **enabled**:

- `contextIsolation` and `sandbox` are on for every window; pages cannot reach Node.js.
- Permissions (notifications, clipboard, media) are granted only to Outlook's own pages; sign-in and other sites get none.
- Every message from a page to the app is checked against the page that sent it.
- Links to other sites open in your default browser; `file:`, `javascript:` and `data:` links are blocked.
- Logs never contain URLs with query strings, account names or MQTT credentials.
- The binary is hardened with Electron fuses (no `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect` or remote debugging), and sign-in cookies are encrypted with your desktop keyring.

See [SECURITY.md](SECURITY.md) to report a vulnerability, and [PRIVACY.md](PRIVACY.md) for what data the app handles.

## Building from source

Requires Node.js 22+, and `rpm-build` for RPMs (`sudo dnf install rpm-build`).

```bash
git clone https://github.com/Bhavesh-Panchal/outlook-for-linux.git
cd outlook-for-linux
npm install
npm start            # run from source
npm run check        # lint + unit tests
npm run smoke        # launch against a local test page and check the shell
npm run package:rpm  # dist/outlook-for-linux/outlook-for-linux-<version>.x86_64.rpm
npm run package:all  # every format for x86_64 and arm64
```

| Path | Contents |
|---|---|
| `src/` | Outlook-specific code: product description, `mailto:` handling (`mailto.js`), MQTT (`mqtt.js`), default mail client (`desktop.js`) |
| `core/` | Shared desktop shell (window, menus, tray, security, config), also used by [OneDrive for Linux](https://github.com/Bhavesh-Panchal/onedrive-for-linux) |
| `assets/`, `assets-src/` | Icons and their sources |
| `scripts/` | Packaging, smoke test, icon generation |

## Related projects

- [OneDrive for Linux](https://github.com/Bhavesh-Panchal/onedrive-for-linux): the same desktop shell for OneDrive
- [Teams for Linux](https://github.com/IsmaelMartinez/teams-for-linux): the project this one is modelled on

## Project Activity

<p align="center">
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/pulse"><img alt="Commits per month" src="https://img.shields.io/github/commit-activity/m/Bhavesh-Panchal/outlook-for-linux?style=for-the-badge&label=commits%2Fmonth&color=1d5fd6&labelColor=1f2937"></a>
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/Bhavesh-Panchal/outlook-for-linux?style=for-the-badge&label=last%20commit&color=1d5fd6&labelColor=1f2937"></a>
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/Bhavesh-Panchal/outlook-for-linux/total?style=for-the-badge&label=downloads&color=1d5fd6&labelColor=1f2937"></a>
  <br>
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/Bhavesh-Panchal/outlook-for-linux?style=for-the-badge&label=open%20issues&color=f59e0b&labelColor=1f2937"></a>
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/issues?q=is%3Aissue+is%3Aclosed"><img alt="Closed issues" src="https://img.shields.io/github/issues-closed/Bhavesh-Panchal/outlook-for-linux?style=for-the-badge&label=closed&color=22c55e&labelColor=1f2937"></a>
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/pulls"><img alt="Pull requests" src="https://img.shields.io/github/issues-pr/Bhavesh-Panchal/outlook-for-linux?style=for-the-badge&label=pull%20requests&color=a855f7&labelColor=1f2937"></a>
  <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Bhavesh-Panchal/outlook-for-linux?style=for-the-badge&label=stars&color=eab308&labelColor=1f2937"></a>
</p>

<table align="center">
  <tr>
    <th>Star history</th>
    <th>Contributors</th>
  </tr>
  <tr>
    <td>
      <a href="https://star-history.com/#Bhavesh-Panchal/outlook-for-linux&Date">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Bhavesh-Panchal/outlook-for-linux&type=Date&theme=dark">
          <img alt="Star history" width="420" src="https://api.star-history.com/svg?repos=Bhavesh-Panchal/outlook-for-linux&type=Date">
        </picture>
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/Bhavesh-Panchal/outlook-for-linux/graphs/contributors"><img alt="Contributors" src="https://contrib.rocks/image?repo=Bhavesh-Panchal/outlook-for-linux&max=24&columns=6"></a>
      <br><sub>Thanks to everyone who has contributed.</sub>
    </td>
  </tr>
</table>

## Support

- 🐛 **Bugs and feature requests:** [open an issue](https://github.com/Bhavesh-Panchal/outlook-for-linux/issues/new/choose)
- 🔒 **Security issues:** see [SECURITY.md](SECURITY.md); please do not open a public issue
- 🤝 **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

**GPL-3.0-or-later**: see [LICENSE](LICENSE). Third-party notices are in [NOTICE.md](NOTICE.md).

Microsoft, Outlook and OneDrive are trademarks of Microsoft Corporation.

---

<p align="center">
  Made with ❤️ for the Linux community by <a href="https://github.com/Bhavesh-Panchal">Bhavesh Panchal</a>
  <br>
  <sub>If Outlook for Linux helps you, please ⭐ star the repository and share it with your team.</sub>
</p>
