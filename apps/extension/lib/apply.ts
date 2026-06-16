import { browser } from "wxt/browser";
import { computeItemId, planApply } from "@botox/sync-core";
import type { SyncDocument, SyncItem } from "@botox/shared";
import { canonicalizeRoots } from "./roots";

/**
 * Reconcile the browser's bookmarks to match a merged sync document — exactly,
 * including folder structure and intra-folder order.
 *
 * Three phases:
 *   1. remove   — drop duplicate + tombstoned nodes
 *   2. create   — add missing folders (shallowest first) then bookmarks
 *   3. reorder  — for every folder whose child order differs from the document,
 *                 re-append its children in the document's index order. This
 *                 also pulls any mis-parented item into the correct folder.
 *
 * Item ids are content-derived (url + folder path + title), so a rename/move is
 * a remove + create. The browser's permanent top-level folders are canonicalized
 * by id (roots.ts) so Chrome / Brave / Edge agree on names.
 */

// Unambiguous key for a folder path (handles titles containing any character).
const pathKey = (path: string[]) => JSON.stringify(path);

interface BNode {
  id: string;
  title: string;
  url?: string;
  children?: BNode[];
}

interface TreeIndex {
  /** stable id -> browser node id */
  idToBrowserId: Map<string, string>;
  /** stable id -> is this a folder */
  idIsFolder: Map<string, boolean>;
  /** path *into* a folder -> browser folder id */
  folderIdByPath: Map<string, string>;
  /** parent inside-path -> ordered list of child stable ids (current order) */
  childOrder: Map<string, string[]>;
  /** redundant nodes that hash to an id already seen — removed on sync */
  duplicates: { browserId: string; isFolder: boolean }[];
  /** where to put top-level creates that match no existing root */
  defaultParentId: string;
}

async function indexTree(): Promise<TreeIndex> {
  const tree = (await browser.bookmarks.getTree()) as BNode[];
  const idToBrowserId = new Map<string, string>();
  const idIsFolder = new Map<string, boolean>();
  const folderIdByPath = new Map<string, string>();
  const childOrder = new Map<string, string[]>();
  const duplicates: { browserId: string; isFolder: boolean }[] = [];

  // Canonicalize the permanent roots so their browser-specific titles don't
  // break cross-browser nesting.
  const rootChildren = canonicalizeRoots(tree[0]?.children ?? []);

  // Process a list of siblings living at `path` (the folder titles to reach
  // them). `parentKey` identifies the parent folder for child-order tracking.
  const processChildren = (nodes: BNode[], path: string[], parentKey: string) => {
    const order: string[] = [];
    for (const node of nodes) {
      const isFolder = node.url === undefined;
      const sid = isFolder
        ? computeItemId({ title: node.title, path })
        : computeItemId({ url: node.url!, title: node.title, path });

      if (idToBrowserId.has(sid)) {
        // Redundant node (same content seen twice) — mark for removal, skip.
        duplicates.push({ browserId: node.id, isFolder });
        continue;
      }
      idToBrowserId.set(sid, node.id);
      idIsFolder.set(sid, isFolder);
      order.push(sid);

      if (isFolder) {
        const inside = [...path, node.title];
        folderIdByPath.set(pathKey(inside), node.id);
        processChildren(node.children ?? [], inside, pathKey(inside));
      }
    }
    childOrder.set(parentKey, order);
  };

  processChildren(rootChildren, [], pathKey([]));

  const defaultParentId = rootChildren[0]?.id ?? tree[0]?.id ?? "0";
  return {
    idToBrowserId,
    idIsFolder,
    folderIdByPath,
    childOrder,
    duplicates,
    defaultParentId,
  };
}

export interface ApplyResult {
  created: number;
  removed: number;
  reordered: number;
}

export async function applyDocument(merged: SyncDocument): Promise<ApplyResult> {
  const idx = await indexTree();
  const { creates, removeIds } = planApply(merged, idx.idToBrowserId.keys());

  let removed = 0;

  // 1a. Remove duplicate nodes (same content saved twice).
  for (const dup of idx.duplicates) {
    try {
      if (dup.isFolder) await browser.bookmarks.removeTree(dup.browserId);
      else await browser.bookmarks.remove(dup.browserId);
      removed++;
    } catch {
      /* already gone */
    }
  }

  // 1b. Remove tombstoned items. Errors (child gone with its parent) are benign.
  for (const sid of removeIds) {
    const browserId = idx.idToBrowserId.get(sid);
    if (!browserId) continue;
    try {
      if (idx.idIsFolder.get(sid)) await browser.bookmarks.removeTree(browserId);
      else await browser.bookmarks.remove(browserId);
      removed++;
    } catch {
      /* already removed */
    }
  }

  // 2. Create missing items — folders shallowest-first so each parent exists
  // before its children, then bookmarks. Order is fixed up in phase 3.
  const folders = creates
    .filter((i) => i.type === "folder")
    .sort((a, b) => a.path.length - b.path.length);
  const bookmarks = creates.filter((i) => i.type === "bookmark");

  let created = 0;
  for (const folder of folders) {
    const parentId = idx.folderIdByPath.get(pathKey(folder.path)) ?? idx.defaultParentId;
    try {
      const node = await browser.bookmarks.create({ parentId, title: folder.title });
      idx.folderIdByPath.set(pathKey([...folder.path, folder.title]), node.id);
      created++;
    } catch {
      /* ignore */
    }
  }
  for (const mark of bookmarks) {
    const parentId = idx.folderIdByPath.get(pathKey(mark.path)) ?? idx.defaultParentId;
    try {
      await browser.bookmarks.create({ parentId, title: mark.title, url: mark.url });
      created++;
    } catch {
      /* ignore */
    }
  }

  // 3. Enforce structure + order against a fresh view of the tree.
  const reordered = await enforceOrder(merged);

  return { created, removed, reordered };
}

/**
 * Make every folder's children match the document's order. For each parent
 * whose current child order already matches, do nothing; otherwise re-append
 * its children in document order (move with only a parentId appends to the end,
 * so appending in order yields exactly that order — and pulls in any item that
 * was created under the wrong parent).
 */
async function enforceOrder(merged: SyncDocument): Promise<number> {
  const idx = await indexTree(); // fresh: reflects creates/removes

  const desiredByParent = new Map<string, SyncItem[]>();
  for (const item of merged.items) {
    if (item.deleted) continue;
    const key = pathKey(item.path);
    const list = desiredByParent.get(key);
    if (list) list.push(item);
    else desiredByParent.set(key, [item]);
  }

  let reordered = 0;
  for (const [parentKey, items] of desiredByParent) {
    items.sort((a, b) => a.index - b.index);
    const desiredIds = items.map((i) => i.id);
    const currentIds = idx.childOrder.get(parentKey) ?? [];

    if (sameOrder(desiredIds, currentIds)) continue;

    const parentId = idx.folderIdByPath.get(parentKey) ?? idx.defaultParentId;
    for (const item of items) {
      const browserId = idx.idToBrowserId.get(item.id);
      if (!browserId) continue;
      try {
        await browser.bookmarks.move(browserId, { parentId });
        reordered++;
      } catch {
        /* ignore */
      }
    }
  }
  return reordered;
}

function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
