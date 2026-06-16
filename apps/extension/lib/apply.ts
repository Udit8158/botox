import { browser } from "wxt/browser";
import { computeItemId, planApply } from "@botox/sync-core";
import type { SyncDocument } from "@botox/shared";
import { canonicalizeRoots } from "./roots";

/**
 * Reconcile the browser's bookmarks to match a merged sync document.
 *
 * Because item ids are derived from content (url + folder path + title), a
 * rename or move appears as a remove + a create — so we only ever need to
 * create missing items and remove tombstoned ones, never patch in place.
 *
 * The browser's permanent top-level folders are canonicalized by id (see
 * roots.ts) so Chrome / Brave / Edge agree on names and nesting stays intact.
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
  /** stable id -> browser node id (first/canonical occurrence) */
  idToBrowserId: Map<string, string>;
  /** stable id -> is this a folder */
  idIsFolder: Map<string, boolean>;
  /** path *into* a folder -> browser folder id */
  folderIdByPath: Map<string, string>;
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
  const duplicates: { browserId: string; isFolder: boolean }[] = [];

  // Canonicalize the permanent roots so their (browser-specific) titles don't
  // break cross-browser nesting.
  const rootChildren = canonicalizeRoots(tree[0]?.children ?? []);

  const walk = (node: BNode, path: string[]) => {
    if (node.url !== undefined) {
      const sid = computeItemId({ url: node.url, title: node.title, path });
      if (idToBrowserId.has(sid)) {
        duplicates.push({ browserId: node.id, isFolder: false });
        return;
      }
      idToBrowserId.set(sid, node.id);
      idIsFolder.set(sid, false);
    } else {
      const sid = computeItemId({ title: node.title, path });
      if (idToBrowserId.has(sid)) {
        // Redundant folder: remove the whole subtree, don't index its contents.
        duplicates.push({ browserId: node.id, isFolder: true });
        return;
      }
      idToBrowserId.set(sid, node.id);
      idIsFolder.set(sid, true);
      const inside = [...path, node.title];
      folderIdByPath.set(pathKey(inside), node.id);
      for (const child of node.children ?? []) walk(child, inside);
    }
  };
  for (const child of rootChildren) walk(child, []);

  const defaultParentId = rootChildren[0]?.id ?? tree[0]?.id ?? "0";
  return { idToBrowserId, idIsFolder, folderIdByPath, duplicates, defaultParentId };
}

export interface ApplyResult {
  created: number;
  removed: number;
}

export async function applyDocument(merged: SyncDocument): Promise<ApplyResult> {
  const idx = await indexTree();
  const { creates, removeIds } = planApply(merged, idx.idToBrowserId.keys());

  let removed = 0;

  // Clean up any pre-existing duplicate nodes (same content saved twice).
  for (const dup of idx.duplicates) {
    try {
      if (dup.isFolder) await browser.bookmarks.removeTree(dup.browserId);
      else await browser.bookmarks.remove(dup.browserId);
      removed++;
    } catch {
      /* already gone */
    }
  }

  // Removals next. Errors (e.g. a child already gone with its parent) are
  // benign — swallow them.
  for (const sid of removeIds) {
    const browserId = idx.idToBrowserId.get(sid);
    if (!browserId) continue;
    try {
      if (idx.idIsFolder.get(sid)) {
        await browser.bookmarks.removeTree(browserId);
      } else {
        await browser.bookmarks.remove(browserId);
      }
      removed++;
    } catch {
      /* already removed */
    }
  }

  // Folders shallowest-first so a parent exists before its children, then
  // bookmarks (whose folders now all exist).
  const folders = creates
    .filter((i) => i.type === "folder")
    .sort((a, b) => a.path.length - b.path.length);
  const bookmarks = creates.filter((i) => i.type === "bookmark");

  let created = 0;
  for (const folder of folders) {
    const parentId = idx.folderIdByPath.get(pathKey(folder.path)) ?? idx.defaultParentId;
    try {
      const node = await browser.bookmarks.create({
        parentId,
        title: folder.title,
        index: folder.index,
      });
      idx.folderIdByPath.set(pathKey([...folder.path, folder.title]), node.id);
      created++;
    } catch {
      /* ignore */
    }
  }
  for (const mark of bookmarks) {
    const parentId = idx.folderIdByPath.get(pathKey(mark.path)) ?? idx.defaultParentId;
    try {
      await browser.bookmarks.create({
        parentId,
        title: mark.title,
        url: mark.url,
        index: mark.index,
      });
      created++;
    } catch {
      /* ignore */
    }
  }

  return { created, removed };
}
