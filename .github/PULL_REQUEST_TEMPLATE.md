<!--
Thanks for contributing! Please include:
  1. The issue this PR resolves, as `closes #NNN`.
  2. What changed and how you tested it.
Delete sections that don't apply.
-->

## Summary

<!-- What does this PR change and why? -->

closes #NNN

## Testing

- [ ] `npm run check` (lint + unit tests, required)
- [ ] `npm run smoke`
- [ ] Ran the app (`npm start`) and exercised the changed path
- [ ] Built and installed the RPM (`npm run package:rpm`)

## Checklist

- [ ] No new personal data in logs (no URL queries, email addresses, tokens)
- [ ] New IPC channels are registered through `core/src/ipc.js` with a sender scope
- [ ] Changes to `core/` noted below (they are ported to OneDrive for Linux too)

## Notes for reviewers
