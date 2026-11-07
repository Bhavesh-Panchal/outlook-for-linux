# Contributing

Thanks for helping improve Outlook for Linux.

## Before opening an issue

- Check whether the problem also happens on https://outlook.office.com in a normal browser. If it does, it is a Microsoft issue.
- Search [existing issues](https://github.com/Bhavesh-Panchal/outlook-for-linux/issues).
- Run the app from a terminal (`outlook-for-linux`) and include relevant log lines. Remove anything personal.

## Development

```bash
npm install
npm start            # run from source
npm run check        # ESLint + unit tests (node:test); must pass
npm run smoke        # end-to-end check against a local page
```

Code style: `const`/`let` (no `var`), async/await, `#private` fields, no PII in logs
(no URLs with queries, email addresses, tokens). New IPC channels must be registered through `core/src/ipc.js`
with a sender scope.

## Where changes go

`core/` is shared with [OneDrive for Linux](https://github.com/Bhavesh-Panchal/onedrive-for-linux). This repository is generated from
a monorepo that holds both apps, so a pull request that touches `core/` will be ported to both apps by the
maintainer. App-specific changes (`src/`, `assets/`) can be merged here directly.

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, e.g. `fix(tray): …`.

## License

By contributing you agree that your contributions are licensed under GPL-3.0-or-later.
