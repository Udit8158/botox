# Botox — Cross-Browser Bookmark Sync

> **What this is:** A browser extension that automatically syncs bookmarks across
> browsers and machines using the user's **own Google Drive** as storage — no
> vendor database of user data. Built product-shaped from day one (subscription
> model) but usable as a personal tool from milestone M3.
>
> **Audience for this doc:** the maintainer (Udit) and any future agent/contributor.
> Read this before touching the code.

---

## 1. Problem & goals

Udit switches browsers often and avoids browsers with built-in sync (e.g. Chrome).
Today he manually exports/imports bookmark files when switching — painful.

**Goal:** install an extension, sign in with Google once, and bookmarks sync
automatically across every browser/machine. History and open tabs are optional
extras (gated as Pro). Passwords are explicitly **out of scope** (see §9).

**Non-goals (v1):** history/tabs are optional and Pro-gated; no web dashboard;
no Safari; no passwords.

---

## 2. Core architecture — two planes

- **Data plane = the user's Google Drive.** Bookmarks are stored as a single
  JSON document in Drive's hidden `appDataFolder`. Free to us, private to the
  user, scales for free, and means we hold **no database of user bookmarks**
  (a privacy selling point and a liability we avoid).
- **Control plane = Supabase.** Identity + subscription state + feature
  entitlements only. It never sees bookmark data. This is what lets us charge
  money later (Stripe) without touching the data model.

```
┌─────────────┐   bookmarks (JSON blob)   ┌──────────────────┐
│  Extension  │ ────────────────────────► │  Google Drive    │
│  (MV3, TS)  │ ◄──────────────────────── │  appDataFolder   │
└─────┬───────┘                           └──────────────────┘
      │ identity + "am I Pro?"
      ▼
┌──────────────────┐
│ Supabase         │  ← thin control plane (auth, subscription, feature flags)
│ (auth, Postgres) │     Stripe billing slots in here LATER
└──────────────────┘
```

The extension is the **only user-facing surface in v1**. The backend is
scaffolded but stays thin until billing matters.

---

## 3. Decisions (locked) & rationale

| Decision | Choice | Why |
|---|---|---|
| Storage | Google Drive `appDataFolder` | Free, private, no DB to run/secure; everyone has a Google account; defensible for production (BYOS pattern). |
| Pricing model | **Subscription** (free tier + Pro) | Build the licensing seam now, switch on Stripe later. |
| Stack | **Next.js + Supabase**, extension in React/TS | One language across extension/web/backend; Supabase gives Google auth + Postgres + edge functions. |
| v1 scope | **Extension only** | The extension is the whole product now; web app deferred. |
| Extension framework | **WXT** (Vite + React + TS) | Modern MV3 tooling, cross-browser builds (Chromium now, Firefox later), HMR. |
| UI | Tailwind + shadcn/ui (Radix) | Clean, modern, not chunky. Use the `frontend-design` skill when building UI. |
| Auth | Google OAuth, one login for both jobs | Same "Sign in with Google" authenticates to Supabase AND grants Drive access (`drive.appdata`). Cross-browser via `chrome.identity.launchWebAuthFlow` + PKCE. |

---

## 4. Repo structure (pnpm + Turborepo monorepo)

```
apps/
  extension/        # WXT + React + TS — the v1 product
  web/              # Next.js — landing/dashboard/Stripe (scaffolded, built later)
packages/
  sync-core/        # the sync engine — pure TS, no browser deps, fully unit-tested
  storage/          # StorageAdapter interface + DriveAdapter (+ hidden GistAdapter later)
  shared/           # types, zod schemas, constants
```

**Why packages are separate:** the hard logic (`sync-core`, `storage`) is
framework-agnostic and unit-testable in isolation. Adding Dropbox/iCloud/
self-host later is just a new adapter behind `StorageAdapter`. GitHub/Gist
stays as a hidden power-user adapter — never a user-facing default.

---

## 5. The sync engine (the part that must not lose data)

- **Stable identity:** each bookmark/folder ID = hash of `(url + folder-path + title)`,
  so the same item matches across browsers that all assign different internal IDs.
  Folders are nodes too (no URL).
- **Tombstones for deletes:** deletions set `deleted: true` (with timestamp), never
  hard-removed from the synced doc — so a delete on one machine propagates instead
  of the item reappearing ("zombie bookmark") from another device.
- **Three-way merge** (git-style): keep the **last-synced snapshot** as the base,
  then merge `base ↔ local ↔ remote`. Per item: newest edit wins, deletes win
  correctly, genuine conflicts resolve by timestamp (and are logged).
- **Optimistic concurrency** via Drive ETag/revision: if remote changed during a
  merge, re-pull and re-merge rather than clobber.
- **Triggers:** `chrome.bookmarks` change events (debounced ~5s) → push; periodic
  `chrome.alarms` (~15 min) → pull other devices' changes; sync on startup; manual
  "Sync now". Instant cross-device push comes later via the backend.

### Synced document shape (draft)

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": 1718500000,
  "deviceId": "<uuid>",
  "items": [
    {
      "id": "<hash(url+path+title)>",
      "type": "bookmark",          // or "folder"
      "url": "https://...",        // null for folders
      "title": "...",
      "path": ["Bookmarks Bar", "Dev"],
      "index": 3,                   // ordering within parent
      "addedAt": 123,
      "updatedAt": 456,
      "deleted": false
    }
  ]
}
```

---

## 6. Control plane / subscription seam (built now, billing later)

- Supabase tables: `users`, `subscriptions` (plan, status, current_period_end).
- Extension calls a single `getEntitlements()` and gates features on the result.
- **Provisional split (tunable):**
  - **Free:** bookmark sync.
  - **Pro:** history sync, open-tabs sync, faster sync interval, multiple sync profiles.
- History/Tabs checkboxes render in v1 but sit behind a Pro flag, so switching on
  Stripe later needs no rearchitecting.

---

## 7. UI surfaces (v1)

- **Popup** (toolbar icon): compact — sync status, "last synced 2m ago", **Sync now**
  button, link to settings.
- **Options page:** Account (Google sign-in state) · Sync status · **What to sync**
  (Bookmarks always-on; History/Tabs as Pro-gated checkboxes) · Plan section
  (placeholder until billing).
- Design direction: clean, modern, lots of whitespace, system-feeling. Not chunky.

---

## 8. Milestones

| Phase | Deliverable |
|---|---|
| **M0 — Foundations** | Monorepo + WXT skeleton loads in Chrome; `StorageAdapter` interface; shared types; Supabase + Google Cloud projects created. |
| **M1 — Drive round-trip** | Google sign-in in extension; read/write JSON blob to `appDataFolder`; manual export/import to prove the data plane. |
| **M2 — Sync engine** | Bookmarks ↔ model normalization; three-way merge + tombstones; apply diffs to `chrome.bookmarks`; **unit-tested merge**; "Sync now" across two profiles. |
| **M3 — Auto-sync** | Event listeners + debounce + alarms + startup sync; ETag concurrency; status UI. **← personal tool fully usable here.** |
| **M4 — Control plane + polish** | Supabase Google auth, entitlements endpoint, Pro gates, polished popup + options UI. |
| **M5 — Ship-ready** | Firefox build, icons/branding, privacy policy, store-listing prep, Google OAuth verification kickoff. |
| **Later** | Stripe billing, web dashboard, extra storage adapters (Dropbox/iCloud/Gist). |

By **M3 there is a real working tool** before any billing machinery exists.

---

## 9. Explicit constraints / gotchas

- **No passwords.** There is no WebExtension API to read saved passwords (by
  design). A "password sync" feature is impossible via an extension — leave it to
  a dedicated password manager. Do not promise it.
- **Google OAuth verification** is required before public launch: `drive.appdata`
  is a *sensitive* scope (privacy policy, branding, demo video, possible review;
  takes weeks). Plan for it at M5.
- **Safari** uses the same APIs but needs an Xcode wrapper — skipped for v1.
- **Firefox MV3** has differences from Chromium; handled via WXT at M5.
- Don't store bookmark data in Supabase — ever. Data plane = Drive only.

---

## 10. External setup the maintainer must provide

1. **Product name:** `botox`.
2. **Google Cloud project** — OAuth consent screen + OAuth client ID, scopes
   `drive.appdata` + `openid` + `email`. (Created under Udit's Google account;
   guided step-by-step at M1. Udit has not done this before.)
3. **Supabase project** (free tier) — project URL + anon key. (Guided at M1.)

Secrets live in `.env` files (gitignored); see `.env.example` in each app.

---

## Sync model (confirmed)

**Merge, not mirror.** Connecting two browsers unions their bookmarks so all
devices converge to the same complete set; thereafter adds/deletes propagate
both ways (tombstones). No destructive overwrite. A future optional "reset all
to this browser" (mirror) button may be added, but the default is always merge.
Item identity is content-derived with URL/title normalization (see `id.ts`) so
the same page never duplicates across browsers; the reconciler also removes
pre-existing duplicate nodes on sync.

## Known future work / cleanup

- **Tombstone garbage collection:** deletions are kept forever as `deleted: true`
  entries so deletions propagate (and don't resurrect from a stale device). The
  doc grows over time. Later: prune tombstones older than ~30–90 days (by which
  point every device has certainly synced past them). Not urgent.
- **Cross-browser roots:** handled for Chromium permanent folders via `roots.ts`
  (canonical names by id 1/2/3). Firefox uses different ids — revisit at M5.
- **OAuth token refresh:** currently implicit-flow tokens (~1h) refreshed via
  silent `launchWebAuthFlow`. At productization, move token exchange to the
  backend for real refresh tokens.

## Status log

- **2026-06-16** — Plan approved. Name = `botox`. Starting M0. M1 to be done
  interactively (maintainer new to Supabase + Google auth).
- **2026-06-16** — **M0 complete.** Monorepo (pnpm + Turborepo) scaffolded;
  `@botox/shared` (types + zod schemas), `@botox/storage` (StorageAdapter +
  DriveAdapter stub), `@botox/sync-core` (stable id hashing + three-way merge,
  5 passing unit tests), and `@botox/extension` (WXT 0.20.26 + React 19 +
  Tailwind v4, popup + options + background) all build and typecheck. Stack
  notes: pinned `@vitejs/plugin-react@^5` via pnpm override (v6 needs Vite 8 in
  a way that broke WXT's resolver); set `jsx`/`allowImportingTsExtensions` in the
  extension tsconfig since WXT 0.20's generated base omits them. Git initialized.
  **Next: M1 (Google Cloud + Supabase setup, then Drive round-trip).**
- **2026-06-16** — **M1 code complete (pending in-browser verification).** Pinned
  extension ID `bikooepehocgalncmfjfijppnnlekjfn` via manifest `key` (dev private
  key in `apps/extension/.secrets/`, gitignored) for a stable OAuth redirect URL
  `https://bikooepehocgalncmfjfijppnnlekjfn.chromiumapp.org/`. Google Cloud
  project `botox` created by maintainer: Drive API enabled, consent screen
  (External, scopes openid/email/drive.appdata, self as test user), Web-app OAuth
  client. Client ID in `apps/extension/.env` (gitignored). Implemented:
  `AuthProvider` interface + `GoogleAuthProvider` (implicit flow via
  `launchWebAuthFlow`, token cache + silent refresh, userinfo email); full
  `DriveAdapter` (appDataFolder find/create/update, headRevisionId revision, soft
  optimistic concurrency); `bookmarksToItems`/`bookmarksToDocument` normalization
  (4 tests); popup wired with Sign in / Push / Pull. Builds + typechecks; 9 tests
  green. **Awaiting maintainer load-unpacked test of the round-trip.**
- **2026-06-16** — **M2 done + hardening.** Three-way merge applied back to the
  browser (`apply.ts` reconciler: create missing, remove tombstoned, dedupe);
  full `syncNow` (normalize → deriveLocalDoc tombstones → merge → apply → push →
  persist base/revision). Hardened identity with URL/title normalization
  (`normalizeUrl`) to stop cosmetic-diff duplicates; canonicalized Chromium root
  folders by id (`roots.ts`) to fix Chrome↔Brave folder-nesting mismatch. Added
  debug viewer (raw Drive JSON + Copy), **Reset Drive data** (delete cloud file +
  local sync state), and **Delete all everywhere** (tombstone-all purge). Fixed
  embedded-options `confirm()` suppression with a two-click confirm + opened
  settings in a full tab. Merge model confirmed: union/converge, last-write-wins
  by timestamp.
- **2026-06-16** — **M3 done (code).** Automatic sync in the background:
  debounced `chrome.bookmarks` change listeners, periodic `chrome.alarms` pull
  (15 min), sync on startup/install, and an initial sync right after sign-in.
  Loop-guard (`isApplying`) so our own apply-writes don't retrigger; overlapping
  syncs coalesce via an in-flight promise. Popup shows "Auto-sync on · last
  synced …". 17 tests green, typecheck + build clean. **The tool is now hands-off
  and daily-drivable.** Next: M4 (Supabase control plane + Pro gating + UI
  polish).
- **2026-06-16** — **Exact structure + order enforcement.** The apply reconciler
  (`apply.ts`) now guarantees the local tree matches the cloud document
  position-for-position. Root cause of the earlier breakage: order was never
  enforced and `create({index})` scrambled folders with interleaved
  subfolders/bookmarks. Fix: dropped `index` from creation; added a third
  `enforceOrder` phase that re-reads the tree and, per folder whose child order
  differs from the document, re-appends children in document `index` order
  (`bookmarks.move` with only a parentId appends to end → appending in order
  yields exact order, and also pulls mis-parented items into the right folder).
  Folders already correct are skipped, so steady-state syncs stay cheap.
  Maintainer verified structure + order now match on a 288-item set.
  **Decision: keep sync timing as-is for now** (15-min pull); a future cheap win
  is revision-based change-detection + conditional write + shorter interval +
  sync-on-focus (noted but deferred).
