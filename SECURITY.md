# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x | :white_check_mark: |
| older | :x: |

Only the latest release receives security fixes. Please upgrade before reporting.

## Reporting a Vulnerability

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Use [GitHub's private vulnerability reporting](https://github.com/Bhavesh-Panchal/outlook-for-linux/security/advisories/new) instead.
3. Include a description, steps to reproduce, and the possible impact.
4. You can expect a first response within 7 days. We will agree on a fix and disclosure timeline with you.

Problems in Outlook on the web itself (they also happen in a normal browser) should be reported to
Microsoft at <https://msrc.microsoft.com/report>.

## Security design

- Every window runs with `contextIsolation`, `sandbox` and no Node.js integration.
- Device and notification permissions are granted only to Outlook's own hosts.
- IPC messages are accepted only from the frames they are meant for.
- Logs never include URL queries, account names, tokens or MQTT credentials.

See also [PRIVACY.md](PRIVACY.md).
