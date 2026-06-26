# Dependency risk register

Date: 2026-06-09

This file tracks dependency security items that should not be fixed with blind `npm audit fix --force`.

## Production web

- Status: `npm run audit:prod` passes with no high/critical findings.
- Remaining moderate findings:
  - `postcss` through `next`
  - `uuid` through `exceljs`
- npm's suggested forced fix is breaking/unreliable for this app, so upgrade Next/ExcelJS only through a normal regression-tested dependency PR.

## Production mobile

- Status: `npm run audit:mobile` passes with no high/critical findings.
- Remaining moderate findings:
  - `postcss` through Expo packages
  - `uuid` through Expo/Xcode tooling packages
- npm's suggested forced fix jumps Expo major versions. Treat this as an Expo upgrade project, not a patch.

## Development tooling

- Full root audit reports Vite/Vitest/esbuild risk in development tooling.
- Production Next build is not served by Vite, but local dev machines should avoid exposing dev servers publicly.
- Recommended path: upgrade Vitest/Vite in a focused PR, run `npm run test:unit`, `npm run lint:web`, `npm run typecheck:web`, and `npm run build`.

## Rules

- Do not run `npm audit fix --force` on release branches.
- Prefer package-specific upgrades with build, test, mobile typecheck, and smoke verification.
- Revisit this file before every public beta or production release.
