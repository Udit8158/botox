import type { SyncDocument, SyncItem } from "@botox/shared";

/**
 * View models derived from a SyncDocument: a folder tree for the sidebar and a
 * flat list of bookmarks for the table. Tombstoned items (`deleted: true`) are
 * dropped — they exist only so deletions propagate across devices.
 */

export interface FolderNode {
  /** Display name (last path segment). Empty string for the synthetic root. */
  name: string;
  /** Full path *to and including* this folder, e.g. ["Bookmarks Bar", "Dev"]. */
  path: string[];
  children: FolderNode[];
  /** Bookmarks directly inside this folder. */
  directCount: number;
  /** Bookmarks in this folder and all descendants. */
  totalCount: number;
}

const keyOf = (path: string[]) => JSON.stringify(path);

/** True if `path` is equal to or nested under `prefix`. */
export function startsWith(path: string[], prefix: string[]): boolean {
  if (path.length < prefix.length) return false;
  return prefix.every((p, i) => path[i] === p);
}

export const samePath = (a: string[], b: string[]) => keyOf(a) === keyOf(b);

export function liveBookmarks(doc: SyncDocument): SyncItem[] {
  return doc.items.filter((i) => !i.deleted && i.type === "bookmark");
}

/** Folder items that live directly inside `parent` (sorted by title). */
export function subfoldersOf(doc: SyncDocument, parent: string[]): SyncItem[] {
  return doc.items
    .filter((i) => !i.deleted && i.type === "folder" && samePath(i.path, parent))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function buildFolderTree(doc: SyncDocument): FolderNode {
  const live = doc.items.filter((i) => !i.deleted);

  // Every folder full-path that should exist, including intermediate ancestors.
  const folderKeys = new Set<string>();
  const addAncestors = (full: string[]) => {
    for (let i = 1; i <= full.length; i++) folderKeys.add(keyOf(full.slice(0, i)));
  };
  for (const it of live) {
    if (it.type === "folder") addAncestors([...it.path, it.title]);
    addAncestors(it.path); // container of any item (covers bookmarks in folders)
  }

  // Direct bookmark counts keyed by container path.
  const directCount = new Map<string, number>();
  for (const it of live) {
    if (it.type !== "bookmark") continue;
    const k = keyOf(it.path);
    directCount.set(k, (directCount.get(k) ?? 0) + 1);
  }

  const root: FolderNode = {
    name: "",
    path: [],
    children: [],
    directCount: directCount.get(keyOf([])) ?? 0,
    totalCount: 0,
  };
  const nodes = new Map<string, FolderNode>([[keyOf([]), root]]);

  const paths = [...folderKeys]
    .map((s) => JSON.parse(s) as string[])
    .sort((a, b) => a.length - b.length);

  for (const path of paths) {
    if (path.length === 0) continue;
    const key = keyOf(path);
    if (nodes.has(key)) continue;
    const node: FolderNode = {
      name: path[path.length - 1]!,
      path,
      children: [],
      directCount: directCount.get(key) ?? 0,
      totalCount: 0,
    };
    nodes.set(key, node);
    const parent = nodes.get(keyOf(path.slice(0, -1)));
    (parent ?? root).children.push(node);
  }

  const computeTotals = (n: FolderNode): number => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    let total = n.directCount;
    for (const c of n.children) total += computeTotals(c);
    n.totalCount = total;
    return total;
  };
  computeTotals(root);

  return root;
}

/** Flatten the tree to a list of selectable folders (depth-first, for menus). */
export function flattenFolders(root: FolderNode): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (n: FolderNode) => {
    if (n.path.length > 0) out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}
