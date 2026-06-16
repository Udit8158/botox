import { useEffect, useRef } from "react";
import type { SyncItem } from "@botox/shared";
import { avatarColor, domainOf, formatDate } from "../lib/format";
import { EditIcon, ExternalIcon, FolderIcon, MoveIcon, TrashIcon } from "./icons";

export function BookmarkTable({
  folders,
  bookmarks,
  selectedIds,
  onToggle,
  onToggleAll,
  onNavigate,
  onRename,
  onMove,
  onDelete,
}: {
  folders: SyncItem[];
  bookmarks: SyncItem[];
  selectedIds: Set<string>;
  onToggle: (item: SyncItem) => void;
  onToggleAll: () => void;
  onNavigate: (path: string[]) => void;
  onRename: (item: SyncItem) => void;
  onMove: (item: SyncItem) => void;
  onDelete: (item: SyncItem) => void;
}) {
  const total = folders.length + bookmarks.length;
  const selectedVisible = [...folders, ...bookmarks].filter((i) =>
    selectedIds.has(i.id),
  ).length;
  const allSelected = total > 0 && selectedVisible === total;
  const someSelected = selectedVisible > 0 && !allSelected;

  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someSelected;
  }, [someSelected]);

  if (total === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
        Nothing here.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur dark:bg-zinc-950/90">
          <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            <th className="w-10 px-4 py-2.5">
              <input
                ref={headRef}
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600 dark:accent-zinc-300"
              />
            </th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Folder</th>
            <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Added</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {folders.map((item) => (
            <Row key={item.id} item={item} selected={selectedIds.has(item.id)} onToggle={onToggle}>
              <td className="px-4 py-2.5">
                <button
                  onClick={() => onNavigate([...item.path, item.title])}
                  className="flex items-center gap-2.5 text-left"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-500 dark:bg-amber-500/10">
                    <FolderIcon />
                  </span>
                  <span className="font-medium text-zinc-800 hover:text-zinc-900 dark:text-zinc-100 dark:hover:text-white">
                    {item.title}
                  </span>
                </button>
              </td>
              <td className="hidden px-4 py-2.5 align-middle text-xs text-zinc-400 md:table-cell dark:text-zinc-500">
                Folder
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2.5 align-middle text-xs text-zinc-500 lg:table-cell dark:text-zinc-400">
                {formatDate(item.addedAt)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Actions>
                  <RowAction label="Rename" onClick={() => onRename(item)}>
                    <EditIcon />
                  </RowAction>
                  <RowAction label="Delete" danger onClick={() => onDelete(item)}>
                    <TrashIcon />
                  </RowAction>
                </Actions>
              </td>
            </Row>
          ))}

          {bookmarks.map((item) => (
            <Row key={item.id} item={item} selected={selectedIds.has(item.id)} onToggle={onToggle}>
              <td className="px-4 py-2.5">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-zinc-600"
                    style={{ background: avatarColor(domainOf(item.url)) }}
                  >
                    {domainOf(item.url).charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-800 group-hover:text-zinc-900 dark:text-zinc-100 dark:group-hover:text-white">
                      {item.title || "(untitled)"}
                    </span>
                    <span className="block truncate text-xs text-zinc-400 dark:text-zinc-500">
                      {domainOf(item.url)}
                    </span>
                  </span>
                </a>
              </td>
              <td className="hidden px-4 py-2.5 align-middle md:table-cell">
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {item.path.join(" / ") || "—"}
                </span>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2.5 align-middle text-xs text-zinc-500 lg:table-cell dark:text-zinc-400">
                {formatDate(item.addedAt)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Actions>
                  <RowAction label="Open" onClick={() => window.open(item.url, "_blank")}>
                    <ExternalIcon />
                  </RowAction>
                  <RowAction label="Rename" onClick={() => onRename(item)}>
                    <EditIcon />
                  </RowAction>
                  <RowAction label="Move" onClick={() => onMove(item)}>
                    <MoveIcon />
                  </RowAction>
                  <RowAction label="Delete" danger onClick={() => onDelete(item)}>
                    <TrashIcon />
                  </RowAction>
                </Actions>
              </td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  item,
  selected,
  onToggle,
  children,
}: {
  item: SyncItem;
  selected: boolean;
  onToggle: (item: SyncItem) => void;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={`group border-b border-zinc-100 dark:border-zinc-800/60 ${
        selected
          ? "bg-zinc-100/70 dark:bg-zinc-800/50"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          aria-label={`Select ${item.title}`}
          checked={selected}
          onChange={() => onToggle(item)}
          className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600 dark:accent-zinc-300"
        />
      </td>
      {children}
    </tr>
  );
}

const Actions = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
    {children}
  </div>
);

function RowAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-200/70 active:bg-zinc-300/70 dark:text-zinc-500 dark:hover:bg-zinc-700/70 ${
        danger
          ? "hover:text-red-600 dark:hover:text-red-400"
          : "hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
