import { z } from "zod";

/**
 * Shared types, schemas, and constants for Botox.
 *
 * The synced document is the single source of truth that lives in the user's
 * Google Drive (`appDataFolder`). Everything the sync engine touches is defined
 * here so the extension, the engine, and the storage adapters agree on shapes.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bump when the synced document shape changes in a non-backward-compatible way. */
export const SCHEMA_VERSION = 1 as const;

/** Filename of the synced blob inside Drive's appDataFolder. */
export const SYNC_FILE_NAME = "botox-sync.json";

/** Debounce window (ms) before pushing local bookmark changes. */
export const PUSH_DEBOUNCE_MS = 5_000;

/** How often (minutes) to poll the remote for other devices' changes. */
export const PULL_INTERVAL_MIN = 15;

/** Google OAuth scopes we request. `drive.appdata` is sensitive (needs verification). */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.appdata",
] as const;

// ---------------------------------------------------------------------------
// Synced document
// ---------------------------------------------------------------------------

export const SyncItemTypeSchema = z.enum(["bookmark", "folder"]);
export type SyncItemType = z.infer<typeof SyncItemTypeSchema>;

export const SyncItemSchema = z.object({
  /** Stable cross-browser id = hash(url + path + title). */
  id: z.string(),
  type: SyncItemTypeSchema,
  /** Absent for folders. */
  url: z.string().url().optional(),
  title: z.string(),
  /** Folder names from root to the item's parent, e.g. ["Bookmarks Bar", "Dev"]. */
  path: z.array(z.string()),
  /** Ordering within the parent folder. */
  index: z.number().int().nonnegative(),
  addedAt: z.number().int(),
  updatedAt: z.number().int(),
  /** Tombstone: true means deleted; kept so deletions propagate across devices. */
  deleted: z.boolean().default(false),
});
export type SyncItem = z.infer<typeof SyncItemSchema>;

export const SyncDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  updatedAt: z.number().int(),
  /** Id of the device that last wrote the doc (for diagnostics). */
  deviceId: z.string(),
  items: z.array(SyncItemSchema),
});
export type SyncDocument = z.infer<typeof SyncDocumentSchema>;

export function emptyDocument(deviceId: string): SyncDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: Date.now(),
    deviceId,
    items: [],
  };
}

// ---------------------------------------------------------------------------
// What the user wants synced
// ---------------------------------------------------------------------------

export const SyncTargetsSchema = z.object({
  bookmarks: z.literal(true), // always on
  history: z.boolean().default(false), // Pro
  tabs: z.boolean().default(false), // Pro
});
export type SyncTargets = z.infer<typeof SyncTargetsSchema>;

// ---------------------------------------------------------------------------
// Entitlements (control plane / Supabase) — billing arrives later
// ---------------------------------------------------------------------------

export const PlanSchema = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof PlanSchema>;

export interface Entitlements {
  plan: Plan;
  features: {
    historySync: boolean;
    tabsSync: boolean;
    multipleProfiles: boolean;
    fastSync: boolean;
  };
}

export const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  features: {
    historySync: false,
    tabsSync: false,
    multipleProfiles: false,
    fastSync: false,
  },
};
