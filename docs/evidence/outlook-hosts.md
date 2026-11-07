# R2 (in progress): Outlook on the web hosts and flows

Status: **provisional**. These are signed-out observations from the outlook-for-linux
shell on 2026-11-07, logged with Electron `did-navigate` tracing (not REA). The
signed-in REA capture (`capture-electron-scenario` / browser scenario) with your
accounts is still pending and will replace this file.

## Observed

| Start URL | Redirects (main frame) | Result |
|---|---|---|
| `https://outlook.office.com/mail/` | `outlook.cloud.microsoft/mail/` → `login.microsoftonline.com/common/oauth2/v2.0/authorize` | Work sign-in page |
| `https://outlook.office.com/mail/deeplink/compose?to=…&subject=…` (from `mailto:`) | → `login.microsoftonline.com/…/authorize` | Work sign-in page, compose after login (to verify signed-in) |
| `https://outlook.live.com/mail/` | → `www.microsoft.com/en-us/microsoft-365/outlook/…` | Marketing page, not sign-in |
| `https://outlook.live.com/mail/?nlp=1` | → `login.microsoftonline.com/…/authorize` | Personal sign-in page. Used as the personal default. |

Other notes:

- `outlook.office.com` now redirects to `outlook.cloud.microsoft`; both are in `hosts.app`.
- A frame or worker from `res.public.onecdn.static.microsoft` asked for `background-sync`
  and was denied (not an app host). No visible effect while signed out; check when signed in.

## To confirm signed in

- Unread signal: does the page call `navigator.setAppBadge`, or put `(N)` in the title?
- Notification API use for new mail and reminders.
- Compose deep link opens a draft with to/subject/body filled in.
- Hosts for attachments, previews and "open in Word/Excel" (expected `*.sharepoint.com`,
  `*.officeapps.live.com`, `attachments.office.net`).
- Popup windows used by sign-in (MSAL) and by "open in new window".
