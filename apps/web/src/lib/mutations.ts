import { computeItemId } from "@botox/sync-core";
import { emptyDocument, type SyncDocument, type SyncItem } from "@botox/shared";
import { ConflictError, type StorageAdapter } from "@botox/storage";
import { samePath, startsWith } from "./tree";

/**
 * Write-back operations for the dashboard. Each is a read-modify-write against
 * the Drive document with optimistic concurrency: read current doc + revision,
 * apply the user's intent, write with that revision; on ConflictError (another
 * device wrote first) re-read and re-apply, a few times.
 *
 * Identity is content-derived (id = hash(url + path + title)), so a rename or
 * move CHANGES the id. We therefore implement those as tombstone-the-old-id +
 * create-a-new-item — mirroring exactly how the extension treats a browser-side
 * edit, which keeps the three-way merge consistent. Deletes are tombstones.
 */

export interface MutationResult {
  document: SyncDocument;
  revision: string | null;
}

type Transform = (items: SyncItem[]) => SyncItem[];

async function mutate(
  adapter: StorageAdapter,
  deviceId: string,
  transform: Transform,
): Promise<MutationResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { document, revision } = await adapter.read();
    const base = document ?? emptyDocument(deviceId);
    const next: SyncDocument = {
      ...base,
      items: transform(base.items),
      updatedAt: Date.now(),
      deviceId,
    };
    try {
      const { revision: newRevision } = await adapter.write(next, revision);
      return { document: next, revision: newRevision };
    } catch (e) {
      if (e instanceof ConflictError) {
        lastError = e;
        continue; // someone else wrote; re-read and re-apply the same intent
      }
      throw e;
    }
  }
  throw lastError ?? new Error("Could not save changes after several attempts.");
}

/** Merge freshly created items into a list, replacing any same-id entry. */
function upsert(items: SyncItem[], created: SyncItem[]): SyncItem[] {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  for (const c of created) byId.set(c.id, c);
  return [...byId.values()];
}

function nextIndex(items: SyncItem[], path: string[]): number {
  let max = -1;
  for (const it of items) {
    if (!it.deleted && samePath(it.path, path) && it.index > max) max = it.index;
  }
  return max + 1;
}

const idOf = (it: SyncItem) =>
  computeItemId({ url: it.url, title: it.title, path: it.path });

/**
 * Move/rename `target` to (`newPath`, `newTitle`). For a folder this cascades to
 * every descendant (their path prefix is rewritten). Each affected item is
 * tombstoned at its old id and recreated at its new id.
 */
function relocate(
  items: SyncItem[],
  target: SyncItem,
  newPath: string[],
  newTitle: string,
): SyncItem[] {
  const now = Date.now();
  const isFolder = target.type === "folder";
  const oldPrefix = isFolder ? [...target.path, target.title] : null;
  const newPrefix = isFolder ? [...newPath, newTitle] : null;
  const movingFolders = !samePath(target.path, newPath);

  const created: SyncItem[] = [];
  const result = items.map((it) => {
    if (it.deleted) return it;

    if (it.id === target.id) {
      const moved: SyncItem = {
        ...it,
        path: newPath,
        title: newTitle,
        updatedAt: now,
        deleted: false,
      };
      if (!isFolder && movingFolders) moved.index = nextIndex(items, newPath);
      if (isFolder && movingFolders) moved.index = nextIndex(items, newPath);
      moved.id = idOf(moved);
      if (moved.id === it.id) return moved; // no real change
      created.push(moved);
      return { ...it, deleted: true, updatedAt: now };
    }

    if (isFolder && oldPrefix && newPrefix && startsWith(it.path, oldPrefix)) {
      const rewritten = [...newPrefix, ...it.path.slice(oldPrefix.length)];
      const moved: SyncItem = { ...it, path: rewritten, updatedAt: now, deleted: false };
      moved.id = idOf(moved);
      if (moved.id === it.id) return moved;
      created.push(moved);
      return { ...it, deleted: true, updatedAt: now };
    }

    return it;
  });

  return upsert(result, created);
}

export function renameItem(
  adapter: StorageAdapter,
  deviceId: string,
  target: SyncItem,
  newTitle: string,
): Promise<MutationResult> {
  return mutate(adapter, deviceId, (items) =>
    relocate(items, target, target.path, newTitle.trim()),
  );
}

export function moveItem(
  adapter: StorageAdapter,
  deviceId: string,
  target: SyncItem,
  newParentPath: string[],
): Promise<MutationResult> {
  return mutate(adapter, deviceId, (items) =>
    relocate(items, target, newParentPath, target.title),
  );
}

/**
 * Tombstone any mix of folders and bookmarks in a SINGLE read-modify-write.
 * Deleting a folder also tombstones everything nested under it. Doing it in one
 * write (rather than one per item) is atomic from the remote's point of view and
 * avoids a cascade of concurrency conflicts.
 *
 * After the deletion, folders left empty *by it* are pruned too — so deleting all
 * the bookmarks in a folder (e.g. via "select all" in the flat view) removes the
 * now-empty folder rather than leaving it behind. Permanent top-level roots
 * (path depth < 2, e.g. "Bookmarks Bar") are never pruned.
 */
export function deleteItems(
  adapter: StorageAdapter,
  deviceId: string,
  targets: SyncItem[],
): Promise<MutationResult> {
  const ids = new Set(targets.map((t) => t.id));
  const folderPrefixes = targets
    .filter((t) => t.type === "folder")
    .map((t) => [...t.path, t.title]);

  return mutate(adapter, deviceId, (items) => {
    const now = Date.now();

    // 1. Tombstone the targets and everything nested under deleted folders.
    const deletedNow: SyncItem[] = [];
    const afterDelete = items.map((it) => {
      if (it.deleted) return it;
      const hit =
        ids.has(it.id) ||
        folderPrefixes.some((prefix) => startsWith(it.path, prefix));
      if (!hit) return it;
      const tomb = { ...it, deleted: true, updatedAt: now };
      deletedNow.push(tomb);
      return tomb;
    });

    // 2. Candidate folders that could now be empty: the ancestor folder paths of
    // everything just deleted (depth >= 2 so roots are excluded).
    const candidates = new Set<string>();
    for (const d of deletedNow) {
      for (let k = 2; k <= d.path.length; k++) {
        candidates.add(JSON.stringify(d.path.slice(0, k)));
      }
    }

    return pruneEmptyFolders(afterDelete, candidates, now);
  });
}

/** Tombstone candidate folders that have no live descendants, bubbling upward. */
function pruneEmptyFolders(
  items: SyncItem[],
  candidates: Set<string>,
  now: number,
): SyncItem[] {
  if (candidates.size === 0) return items;
  let result = items;
  for (let pass = 0; pass < 64; pass++) {
    const live = result.filter((i) => !i.deleted);
    const remove = new Set<string>();
    for (const f of live) {
      if (f.type !== "folder") continue;
      const full = [...f.path, f.title];
      if (full.length < 2) continue; // never prune permanent top-level roots
      if (!candidates.has(JSON.stringify(full))) continue;
      const hasChild = live.some((c) => c.id !== f.id && startsWith(c.path, full));
      if (!hasChild) remove.add(f.id);
    }
    if (remove.size === 0) break;
    result = result.map((it) =>
      remove.has(it.id) ? { ...it, deleted: true, updatedAt: now } : it,
    );
  }
  return result;
}

export function deleteItem(
  adapter: StorageAdapter,
  deviceId: string,
  target: SyncItem,
): Promise<MutationResult> {
  return deleteItems(adapter, deviceId, [target]);
}
