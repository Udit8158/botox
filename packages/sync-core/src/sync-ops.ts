import {
  SCHEMA_VERSION,
  type SyncDocument,
  type SyncItem,
} from "@botox/shared";

/**
 * Derive this device's document *with tombstones* from the freshly-normalized
 * current bookmarks plus the last-synced base.
 *
 * Normalizing the live browser tree only yields items that currently exist, so
 * a local deletion shows up as "missing". To make deletions propagate we
 * compare against the base: any base item that's gone now becomes a tombstone.
 * Existing tombstones in the base are carried forward so they don't resurrect.
 */
export function deriveLocalDoc(
  base: SyncDocument | null,
  currentItems: SyncItem[],
  deviceId: string,
  now: number = Date.now(),
): SyncDocument {
  const currentIds = new Set(currentItems.map((i) => i.id));
  const items: SyncItem[] = [...currentItems];

  for (const b of base?.items ?? []) {
    if (currentIds.has(b.id)) continue;
    if (b.deleted) {
      items.push(b); // keep the tombstone alive
    } else {
      items.push({ ...b, deleted: true, updatedAt: now }); // newly deleted locally
    }
  }

  return { schemaVersion: SCHEMA_VERSION, updatedAt: now, deviceId, items };
}

export interface ApplyPlan {
  /** Items that must be created in the browser (folders + bookmarks). */
  creates: SyncItem[];
  /** Stable ids of items present locally that should be removed (tombstoned). */
  removeIds: string[];
}

/**
 * Decide what to change in the browser to make it match the merged document.
 * Pure set math over stable ids — the imperative chrome.bookmarks work lives in
 * the extension. Because ids are content-derived, a rename/move naturally shows
 * up as one remove + one create.
 */
export function planApply(
  merged: SyncDocument,
  existingIds: Iterable<string>,
): ApplyPlan {
  const existing = new Set(existingIds);
  const desired = merged.items.filter((i) => !i.deleted);
  const desiredIds = new Set(desired.map((i) => i.id));

  const creates = desired.filter((i) => !existing.has(i.id));
  const removeIds = [...existing].filter((id) => !desiredIds.has(id));
  return { creates, removeIds };
}
