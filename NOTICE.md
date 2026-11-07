# Notice

ms365-for-linux is free software under the GNU General Public License,
version 3 or (at your option) any later version. See `LICENSE`.

Parts of `packages/core` are derived from
[teams-for-linux](https://github.com/IsmaelMartinez/teams-for-linux)
(GPL-3.0-or-later, Ismael Martinez and contributors):

- `src/hosts.js`: host matching and the Defender for Cloud Apps (`.mcas.ms`) rule,
  from `app/helpers/teamsHosts.js`
- `src/security.js`: permission decision rules, from `app/security/permissions.js`
- `src/connection.js` and `src/util.js` (network error codes): offline handling,
  from `app/connectionManager/index.js` and `app/config/defaults.js`

Outlook, OneDrive and Microsoft 365 are trademarks of Microsoft Corporation.
This project is unofficial and is not affiliated with or endorsed by Microsoft.
The app icons follow the teams-for-linux logo layout. The penguin
(`assets-src/penguin-t4l.svg`) is taken from the teams-for-linux logo
(`T4L Logo 2024.zip`, `P.svg`, GPL-3.0-or-later); per its source notes it is derived
from Wikimedia's Tux_bw. Tux was created by Larry Ewing (lewing@isc.tamu.edu) with
The GIMP. The envelope and cloud tiles are original artwork for this project.
