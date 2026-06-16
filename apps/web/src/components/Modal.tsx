import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="botox-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="botox-dialog-in w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function ModalButtons({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}

export const btn = {
  primary:
    "rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 active:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300 dark:disabled:hover:bg-white",
  danger:
    "rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 active:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600",
  ghost:
    "rounded-lg px-3.5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700",
};
