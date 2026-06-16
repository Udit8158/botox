import { useEffect, useMemo, useState } from "react";
import type { SyncDocument, SyncItem } from "@botox/shared";
import {
  buildFolderTree,
  flattenFolders,
  liveBookmarks,
  samePath,
  subfoldersOf,
} from "../lib/tree";
import { domainOf } from "../lib/format";
import { Sidebar } from "./Sidebar";
import { BookmarkTable } from "./BookmarkTable";
import { SearchIcon, TrashIcon } from "./icons";
import { Modal, ModalButtons, btn } from "./Modal";

type SortKey = "title" | "added-desc" | "added-asc";
type Dialog =
  | { kind: "rename"; item: SyncItem }
  | { kind: "move"; item: SyncItem }
  | { kind: "delete"; items: SyncItem[] }
  | null;

export function Dashboard(props: {
  doc: SyncDocument;
  mock: boolean;
  busy: boolean;
  error: string | null;
  account: string | null;
  onRefresh: () => void;
  onSignOut: () => void;
  onRename: (item: SyncItem, title: string) => void;
  onMove: (item: SyncItem, path: string[]) => void;
  onDeleteMany: (items: SyncItem[]) => void;
}) {
  const { doc, mock, busy, error, account } = props;
  const [selected, setSelected] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [picked, setPicked] = useState<Map<string, SyncItem>>(new Map());

  const tree = useMemo(() => buildFolderTree(doc), [doc]);
  const folderPaths = useMemo(() => flattenFolders(tree).map((f) => f.path), [tree]);
  const searching = query.trim().length > 0;

  // Subfolders are shown as rows only when browsing a folder (not while searching).
  const childFolders = useMemo(
    () => (selected && !searching ? subfoldersOf(doc, selected) : []),
    [doc, selected, searching],
  );

  const rows = useMemo(() => {
    let items = liveBookmarks(doc);
    if (selected && !searching) items = items.filter((i) => samePath(i.path, selected));
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          domainOf(i.url).toLowerCase().includes(q),
      );
    }
    return [...items].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "added-asc") return a.addedAt - b.addedAt;
      return b.addedAt - a.addedAt;
    });
  }, [doc, selected, searching, query, sort]);

  // Selection only ever holds currently-visible items; reset it when the view
  // changes (folder switch, search) or the document updates after a write.
  useEffect(() => {
    setPicked(new Map());
  }, [selected, query, doc]);

  const visible = useMemo(() => [...childFolders, ...rows], [childFolders, rows]);

  const toggle = (item: SyncItem) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };
  const toggleAll = () => {
    setPicked((prev) => {
      if (visible.every((i) => prev.has(i.id))) return new Map();
      return new Map(visible.map((i) => [i.id, i] as const));
    });
  };

  const pickedItems = [...picked.values()];

  return (
    <div className="flex h-full bg-white text-zinc-800">
      <Sidebar root={tree} selected={selected} onSelect={setSelected} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-zinc-900">
              {selected ? selected[selected.length - 1] : "All bookmarks"}
            </h1>
            <p className="text-xs text-zinc-400">
              {childFolders.length > 0 && `${childFolders.length} folders · `}
              {rows.length} {rows.length === 1 ? "bookmark" : "bookmarks"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={props.onRefresh}
              disabled={busy}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              {busy ? "Working…" : "Refresh"}
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              {account && (
                <span className="max-w-[160px] truncate text-xs text-zinc-400">
                  {account}
                </span>
              )}
              <button
                onClick={props.onSignOut}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {mock && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-xs text-amber-700">
            Sample data (mock mode) — changes are in-memory only.
          </div>
        )}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-1.5 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Toolbar — swaps to a bulk-action bar when items are selected. */}
        {picked.size > 0 ? (
          <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-2.5">
            <span className="text-sm font-medium text-zinc-700">
              {picked.size} selected
            </span>
            <button
              onClick={() => setDialog({ kind: "delete", items: pickedItems })}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              <TrashIcon /> Delete selected
            </button>
            <button
              onClick={() => setPicked(new Map())}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-200/70"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-2.5">
            <div className="relative max-w-md flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bookmarks…"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-9 pr-3 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 outline-none"
            >
              <option value="title">Sort: Name</option>
              <option value="added-desc">Sort: Newest</option>
              <option value="added-asc">Sort: Oldest</option>
            </select>
          </div>
        )}

        <BookmarkTable
          folders={childFolders}
          bookmarks={rows}
          selectedIds={new Set(picked.keys())}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onNavigate={setSelected}
          onRename={(item) => setDialog({ kind: "rename", item })}
          onMove={(item) => setDialog({ kind: "move", item })}
          onDelete={(item) => setDialog({ kind: "delete", items: [item] })}
        />
      </div>

      {dialog?.kind === "rename" && (
        <RenameDialog
          item={dialog.item}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(title) => {
            props.onRename(dialog.item, title);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveDialog
          item={dialog.item}
          folders={folderPaths}
          onClose={() => setDialog(null)}
          onSubmit={(path) => {
            props.onMove(dialog.item, path);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteDialog
          items={dialog.items}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            props.onDeleteMany(dialog.items);
            setPicked(new Map());
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function RenameDialog({
  item,
  busy,
  onClose,
  onSubmit,
}: {
  item: SyncItem;
  busy: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [value, setValue] = useState(item.title);
  const valid = value.trim().length > 0 && value.trim() !== item.title;
  const noun = item.type === "folder" ? "folder" : "bookmark";
  return (
    <Modal title={`Rename ${noun}`} onClose={onClose}>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && valid && onSubmit(value.trim())}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
      />
      <ModalButtons>
        <button className={btn.ghost} onClick={onClose}>
          Cancel
        </button>
        <button
          className={btn.primary}
          disabled={!valid || busy}
          onClick={() => onSubmit(value.trim())}
        >
          Save
        </button>
      </ModalButtons>
    </Modal>
  );
}

function MoveDialog({
  item,
  folders,
  onClose,
  onSubmit,
}: {
  item: SyncItem;
  folders: string[][];
  onClose: () => void;
  onSubmit: (path: string[]) => void;
}) {
  const options = [[] as string[], ...folders];
  const [value, setValue] = useState(JSON.stringify(item.path));
  const target = JSON.parse(value) as string[];
  const unchanged = samePath(target, item.path);
  return (
    <Modal title="Move bookmark" onClose={onClose}>
      <p className="mb-2 text-xs text-zinc-500">
        Choose a destination folder for “{item.title}”.
      </p>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
      >
        {options.map((p) => (
          <option key={JSON.stringify(p)} value={JSON.stringify(p)}>
            {p.length === 0 ? "(top level)" : p.join(" / ")}
          </option>
        ))}
      </select>
      <ModalButtons>
        <button className={btn.ghost} onClick={onClose}>
          Cancel
        </button>
        <button className={btn.primary} disabled={unchanged} onClick={() => onSubmit(target)}>
          Move
        </button>
      </ModalButtons>
    </Modal>
  );
}

function DeleteDialog({
  items,
  onClose,
  onConfirm,
}: {
  items: SyncItem[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const folders = items.filter((i) => i.type === "folder").length;
  const bookmarks = items.length - folders;
  const single = items.length === 1;

  const summary = single
    ? `“${items[0]!.title}”`
    : [
        folders && `${folders} folder${folders > 1 ? "s" : ""}`,
        bookmarks && `${bookmarks} bookmark${bookmarks > 1 ? "s" : ""}`,
      ]
        .filter(Boolean)
        .join(" and ");

  return (
    <Modal title={single ? `Delete ${items[0]!.type}` : "Delete items"} onClose={onClose}>
      <p className="text-sm text-zinc-600">
        Delete {summary}? This removes {single ? "it" : "them"} from every synced
        browser.
        {folders > 0 && " Folders are deleted along with everything inside them."}
      </p>
      <ModalButtons>
        <button className={btn.ghost} onClick={onClose}>
          Cancel
        </button>
        <button className={btn.danger} onClick={onConfirm}>
          Delete
        </button>
      </ModalButtons>
    </Modal>
  );
}
