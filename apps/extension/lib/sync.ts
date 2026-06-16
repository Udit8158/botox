import { browser } from "wxt/browser";
import { ConflictError, DriveAdapter } from "@botox/storage";
import {
  bookmarksToItems,
  deriveLocalDoc,
  mergeDocuments,
} from "@botox/sync-core";
import { SCHEMA_VERSION, type SyncDocument, type SyncItem } from "@botox/shared";
import { GoogleAuthProvider } from "./google-auth";
import { applyDocument } from "./apply";
import { canonicalizeRoots } from "./roots";

/**
 * Full two-way sync:
 *   normalize local bookmarks (+ tombstones vs base)
 *   -> merge with remote (three-way)
 *   -> apply merged back into the browser
 *   -> push merged to Drive
 *   -> persist as the new base + revision
 *
 * On a write conflict (another device wrote first) we re-read and re-merge once.
 */

export const auth = new GoogleAuthProvider();
export const drive = new DriveAdapter(auth);

const DEVICE_KEY = "botox.deviceId";
const BASE_KEY = "botox.base";
const REVISION_KEY = "botox.revision";
const LAST_SYNCED_KEY = "botox.lastSyncedAt";

// True while we write to chrome.bookmarks ourselves, so the background's
// bookmark-change listeners can ignore those events and avoid a sync loop.
let applying = false;
export const isApplying = () => applying;

async function applyWithGuard(merged: SyncDocument) {
  applying = true;
  try {
    return await applyDocument(merged);
  } finally {
    // Hold the guard a moment so trailing change events are ignored too.
    setTimeout(() => {
      applying = false;
    }, 1000);
  }
}

export async function getLastSyncedAt(): Promise<number | null> {
  const got = await browser.storage.local.get(LAST_SYNCED_KEY);
  return (got[LAST_SYNCED_KEY] as number | undefined) ?? null;
}

export async function getDeviceId(): Promise<string> {
  const got = await browser.storage.local.get(DEVICE_KEY);
  let id = got[DEVICE_KEY] as string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    await browser.storage.local.set({ [DEVICE_KEY]: id });
  }
  return id;
}

async function loadBase(): Promise<SyncDocument | null> {
  const got = await browser.storage.local.get(BASE_KEY);
  return (got[BASE_KEY] as SyncDocument | undefined) ?? null;
}

async function saveBase(doc: SyncDocument, revision: string): Promise<void> {
  await browser.storage.local.set({ [BASE_KEY]: doc, [REVISION_KEY]: revision });
}

export interface SyncResult {
  total: number; // live (non-deleted) items after sync
  created: number; // bookmarks/folders added locally
  removed: number; // removed locally
}

let syncInFlight: Promise<SyncResult> | null = null;

/** Public entry. Coalesces overlapping calls into a single in-flight sync. */
export function syncNow(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSyncNow().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSyncNow(): Promise<SyncResult> {
  const deviceId = await getDeviceId();

  const runMerge = async (): Promise<SyncResult> => {
    const base = await loadBase();

    const tree = await browser.bookmarks.getTree();
    const roots = canonicalizeRoots(tree[0]?.children ?? []);
    const currentItems = bookmarksToItems(roots);
    const localDoc = deriveLocalDoc(base, currentItems, deviceId);

    const remote = await drive.read();
    const merged = mergeDocuments(base, localDoc, remote.document, deviceId);

    const applied = await applyWithGuard(merged);
    const { revision } = await drive.write(merged, remote.revision);
    await saveBase(merged, revision);
    await browser.storage.local.set({ [LAST_SYNCED_KEY]: Date.now() });

    return {
      total: merged.items.filter((i) => !i.deleted).length,
      created: applied.created,
      removed: applied.removed,
    };
  };

  try {
    return await runMerge();
  } catch (e) {
    // Someone else wrote between our read and write — re-read and merge again.
    if (e instanceof ConflictError) return await runMerge();
    throw e;
  }
}

/**
 * Delete the Drive document and clear this device's sync state. Local bookmarks
 * are left untouched — the next "Sync now" re-establishes a fresh baseline.
 */
export async function resetSync(): Promise<void> {
  await drive.deleteRemote();
  await browser.storage.local.remove([BASE_KEY, REVISION_KEY]);
}

/**
 * Destructive: tombstone every known synced item and push it. This device's
 * bookmarks are removed immediately; every other device clears them on its next
 * Sync now (the deletion propagates instead of coming back).
 */
export async function purgeAll(): Promise<{ removed: number }> {
  const deviceId = await getDeviceId();
  const now = Date.now();

  const remote = await drive.read();
  const base = await loadBase();
  const tree = await browser.bookmarks.getTree();
  const localItems = bookmarksToItems(canonicalizeRoots(tree[0]?.children ?? []));

  // Union of everything we know about, all flipped to tombstones.
  const all = new Map<string, SyncItem>();
  for (const it of [
    ...(remote.document?.items ?? []),
    ...(base?.items ?? []),
    ...localItems,
  ]) {
    all.set(it.id, { ...it, deleted: true, updatedAt: now });
  }

  const doc: SyncDocument = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    deviceId,
    items: [...all.values()],
  };

  const applied = await applyWithGuard(doc); // removes all bookmarks locally
  const { revision } = await drive.write(doc, remote.revision);
  await saveBase(doc, revision);
  await browser.storage.local.set({ [LAST_SYNCED_KEY]: Date.now() });
  return { removed: applied.removed };
}
