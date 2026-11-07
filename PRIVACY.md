# Privacy & Data Protection

Outlook for Linux is an unofficial, community-maintained desktop **wrapper around Outlook on the web**. In short:

- The application has **no accounts of its own** and **sends no personal data to the maintainer**. What it
  needs locally (your Microsoft sign-in session, settings and logs) is stored **only on your device**, under
  `~/.config/outlook-for-linux/`.
- The maintainer **runs no servers and no backend**; there is nowhere for your data to be sent.
- **No telemetry, analytics, tracking or advertising** is added by this application.
- The app talks only to Microsoft's services that Outlook on the web itself uses, plus an MQTT broker **only if
  you configure one** (`mqtt.*` options, Outlook only).
- Processing of your mail and files is the responsibility of **Microsoft** and of **the organisation that owns your
  Microsoft 365 environment**, not this project.
- *Quit (Clear Storage)* in the tray menu deletes the locally stored session and cache for the current profile.
- The complete source is public and auditable, licensed **GPL-3.0-or-later**, provided "as is", without warranty.

This is a factual, technical description, **not legal advice**. See also [SECURITY.md](SECURITY.md).
