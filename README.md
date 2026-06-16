# Botox

Cross-browser bookmark sync that uses **your own Google Drive** as storage — no
vendor database of your bookmarks. Install the extension, sign in with Google
once, and your bookmarks follow you across browsers and machines.

> Full design and roadmap: [`docs/PLAN.md`](docs/PLAN.md). Read it before contributing.

## Monorepo layout

```
apps/
  extension/        # WXT + React + TS — the v1 product
  web/              # Next.js — landing/dashboard/Stripe (later)
packages/
  sync-core/        # storage-agnostic sync engine (three-way merge, tombstones)
  storage/          # StorageAdapter interface + DriveAdapter
  shared/           # types, zod schemas, constants
```

## Develop

```bash
pnpm install
pnpm ext:dev      # run the extension in dev (loads a browser)
pnpm ext:build    # production build of the extension
pnpm test         # run unit tests (sync-core)
pnpm typecheck    # type-check all packages
```

## Status

M0 (foundations) in progress. See the status log at the bottom of `docs/PLAN.md`.
