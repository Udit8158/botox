import {
  SCHEMA_VERSION,
  type SyncDocument,
  type SyncItem,
} from "@botox/shared";
import { computeItemId } from "./id.js";

/**
 * Minimal shape of a browser bookmark node (matches the relevant fields of
 * `browser.bookmarks.BookmarkTreeNode`). Kept local so sync-core has no
 * dependency on any browser API and stays unit-testable.
 */
export interface RawBookmarkNode {
  title: string;
  url?: string;
  dateAdded?: number;
  children?: RawBookmarkNode[];
}

/**
 * Flatten a browser bookmark tree into stable, sortable {@link SyncItem}s.
 *
 * Pass the *children of the root* (e.g. `tree[0].children` from getTree) — the
 * synthetic root node has no meaningful title and is skipped. Top-level folders
 * like "Bookmarks Bar" become folder items with an empty path; their contents
 * carry the folder name in their `path`.
 */
export function bookmarksToItems(
  roots: RawBookmarkNode[],
  now: number = Date.now(),
): SyncItem[] {
  const out: SyncItem[] = [];

  const walk = (node: RawBookmarkNode, path: string[], index: number) => {
    const at = node.dateAdded ?? now;
    if (node.url !== undefined) {
      out.push({
        id: computeItemId({ url: node.url, title: node.title, path }),
        type: "bookmark",
        url: node.url,
        title: node.title,
        path,
        index,
        addedAt: at,
        updatedAt: at,
        deleted: false,
      });
    } else {
      out.push({
        id: computeItemId({ title: node.title, path }),
        type: "folder",
        title: node.title,
        path,
        index,
        addedAt: at,
        updatedAt: at,
        deleted: false,
      });
      const childPath = [...path, node.title];
      node.children?.forEach((child, i) => walk(child, childPath, i));
    }
  };

  roots.forEach((node, i) => walk(node, [], i));
  return out;
}

export function bookmarksToDocument(
  roots: RawBookmarkNode[],
  deviceId: string,
  now: number = Date.now(),
): SyncDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    deviceId,
    items: bookmarksToItems(roots, now),
  };
}
