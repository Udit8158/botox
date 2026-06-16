import { useState } from "react";
import { type FolderNode, samePath } from "../lib/tree";
import { ChevronIcon, FolderIcon } from "./icons";

export function Sidebar({
  root,
  selected,
  onSelect,
}: {
  root: FolderNode;
  selected: string[] | null;
  onSelect: (path: string[] | null) => void;
}) {
  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">
            B
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            Botox
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <button
          onClick={() => onSelect(null)}
          className={rowClass(selected === null)}
        >
          <FolderIcon className="text-zinc-400 dark:text-zinc-500" />
          <span className="flex-1 truncate text-left">All bookmarks</span>
          <Count n={root.totalCount} />
        </button>

        {root.children.map((child) => (
          <FolderRow
            key={child.path.join("/")}
            node={child}
            depth={0}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  );
}

function FolderRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selected: string[] | null;
  onSelect: (path: string[]) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const active = selected !== null && samePath(selected, node.path);

  return (
    <div>
      <div className={rowClass(active)} style={{ paddingLeft: 8 + depth * 14 }}>
        <button
          onClick={() => hasChildren && setOpen((o) => !o)}
          className={`flex h-4 w-4 items-center justify-center text-zinc-400 dark:text-zinc-500 ${
            hasChildren ? "hover:text-zinc-600 dark:hover:text-zinc-300" : "invisible"
          }`}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronIcon className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button
          onClick={() => onSelect(node.path)}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <FolderIcon className="shrink-0 text-amber-500/80" />
          <span className="flex-1 truncate text-left">{node.name}</span>
          <Count n={node.totalCount} />
        </button>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.path.join("/")}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

const rowClass = (active: boolean) =>
  `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
    active
      ? "bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
      : "text-zinc-600 hover:bg-zinc-200/40 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
  }`;

const Count = ({ n }: { n: number }) => (
  <span className="ml-auto shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
    {n}
  </span>
);
