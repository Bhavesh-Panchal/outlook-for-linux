# Icon sources

- `penguin-t4l.svg`: the penguin from the teams-for-linux logo (`app/assets/icons/T4L Logo 2024.zip`,
  file `P.svg`, GPL-3.0-or-later, teams-for-linux contributors). Their source notes say it is
  derived from Wikimedia's "Tux_bw"; Tux was created by Larry Ewing (lewing@isc.tamu.edu) with The GIMP.
- `<app>.tile.svg` fragments are original artwork for this project.

`node scripts/compose-icon.js <app>` writes `apps/<app>/assets/icon.svg` in the teams-for-linux
layout (50×50 tile top-left, penguin offset by 24,16 on a 64×64 canvas), then
`scripts/build-icons.sh apps/<app>/assets` renders the PNGs.
