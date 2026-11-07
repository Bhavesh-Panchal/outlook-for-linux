# R2: Outlook on the web hosts and flows

Status: **signed-in observation done** (work account, 2026-11-07). Method: the real outlook-for-linux
0.2.3 code run with the user's profile under an Electron observer that recorded hostnames, request
outcomes, frame origins, popups, permission decisions and toolbar button labels only (no paths,
queries, headers or message content). Not REA: REA's browser capture runs its own Chromium, which would
not have the user's Electron sign-in session.

## Result

| Check | Result |
|---|---|
| Page after start | `outlook.cloud.microsoft/mail` (start URL `outlook.office.com/mail/` redirects there) |
| Failed requests (excluding aborted) | none |
| Blocked navigations, popups, iframes | none during 40 s idle |
| Permission denials | none |
| Unread signal | title `(N) …`? Not seen; title was `Mail - <name> - Outlook`. Badge API wrapper installed. Unread count to be confirmed when new mail arrives. |

Hosts contacted (all succeeded): `outlook.cloud.microsoft`, `res.cdn.office.net`,
`res.public.onecdn.static.microsoft` (Segoe UI web fonts), `attachments.office.net`,
`graph.microsoft.com`, `loki.delve.office.com`, `roaming.officeapps.live.com`,
`titles.prod.mos.microsoft.com`, `addin.insights.static.microsoft`, `store-images.s-microsoft.com`,
`na01.safelinks.protection.outlook.com`, `arc.msn.com`, `browser.events.data.microsoft.com`.
All are subresource or fetch requests; none needs to be an app host.

## Missing Copilot buttons: cause and fix

Toolbar labels with the 0.2.3 identity: *Report Message* and *Viva Insights* present;
*Copilot Chat*, *Chat with Copilot* and *Summarize this email* **absent**.

The page saw `navigator.userAgentData.brands` = `Chromium 152, Not?A_Brand 24`. A real Chrome also
reports `Google Chrome`. Re-running with the brand list overridden (DevTools protocol
`Emulation.setUserAgentOverride` with `userAgentMetadata`) showed *Copilot Chat* and
*Chat with Copilot* in the ribbon, and *Summarize this email* on an opened message.

Fix in 0.2.4: `core/src/identity.js` reports the Google Chrome brand by default
(`network.browserBrand`: `chrome` | `chromium`).

Outlook's own shortcuts not taken by the menu: Ctrl+Q (mark as read), Ctrl+R (reply).

## Signed-out observations (earlier)

| Start URL | Result |
|---|---|
| `https://outlook.office.com/mail/` | → `outlook.cloud.microsoft/mail/` → `login.microsoftonline.com/common/oauth2/v2.0/authorize` |
| `…/mail/deeplink/compose?to=…` (from `mailto:`) | → sign-in, then compose |
| `https://outlook.live.com/mail/` | → marketing page |
| `https://outlook.live.com/mail/?nlp=1` | → personal sign-in. Used as the personal default. |

## Still open

- Personal account (outlook.live.com) not observed signed in.
- Unread count source: confirm title or badge API when new mail arrives.
