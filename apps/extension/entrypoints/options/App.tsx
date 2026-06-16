import { useEffect, useRef, useState } from "react";
import { rpc } from "../../lib/messages";

function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function ToggleRow({
  label,
  description,
  checked,
}: {
  label: string;
  description: string;
  checked: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-400">{description}</p>
      </div>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function AccountSection() {
  const [email, setEmail] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc({ type: "status" })
      .then((d) => {
        setEmail(d.email);
        setLastSynced(d.lastSyncedAt);
      })
      .catch(() => setEmail(null))
      .finally(() => setReady(true));
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await rpc({ type: "signin" });
      setEmail(d.email);
      setLastSynced(d.lastSyncedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await rpc({ type: "signout" });
      setEmail(null);
      setLastSynced(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Account">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {!ready ? "…" : (email ?? "Not connected")}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {email
              ? "Syncs automatically to your Google Drive."
              : "Sign in with Google to use your Drive as storage."}
          </p>
          {email && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Auto-sync on · last synced {relativeTime(lastSynced)}
            </div>
          )}
        </div>
        {email ? (
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            {busy ? "…" : "Sign out"}
          </button>
        ) : (
          <button
            type="button"
            onClick={signIn}
            disabled={!ready || busy}
            className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Opening Google…" : "Sign in"}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
    </Section>
  );
}

function DriveState() {
  const [json, setJson] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Two-click confirmation (native confirm() is suppressed in embedded options).
  const [armed, setArmed] = useState<"reset" | "purge" | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const arm = (action: "reset" | "purge") => {
    setArmed(action);
    clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(null), 4000);
  };

  const copy = async () => {
    if (!json) return;
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const reset = async () => {
    if (armed !== "reset") {
      arm("reset");
      return;
    }
    setArmed(null);
    setBusy(true);
    setError(null);
    try {
      await rpc({ type: "reset" });
      setJson(null);
      setSummary("Drive data reset. Run Sync now to start fresh.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (armed !== "purge") {
      arm("purge");
      return;
    }
    setArmed(null);
    setBusy(true);
    setError(null);
    try {
      const { removed } = await rpc({ type: "purge" });
      setJson(null);
      setSummary(`Deleted ${removed} bookmarks here. Other devices clear on next Sync now.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const { revision, document } = await rpc({ type: "dump" });
      if (!document) {
        setSummary("No synced file in Drive yet.");
        setJson(null);
      } else {
        const live = document.items.filter((i) => !i.deleted).length;
        const tombstones = document.items.length - live;
        setSummary(
          `${live} live items · ${tombstones} tombstones · revision ${revision ?? "—"} · updated ${new Date(document.updatedAt).toLocaleString()}`,
        );
        setJson(JSON.stringify(document, null, 2));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Drive state (debug)">
      <p className="text-xs text-neutral-400">
        The raw JSON stored in your Drive’s hidden app folder.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="whitespace-nowrap rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          {busy ? "Loading…" : "Load from Drive"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="whitespace-nowrap rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 active:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          {armed === "reset" ? "Click to confirm" : "Reset Drive data"}
        </button>
        <button
          type="button"
          onClick={purge}
          disabled={busy}
          className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
        >
          {armed === "purge" ? "Click to confirm" : "Delete all everywhere"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      {summary && (
        <p className="mt-3 text-xs font-medium text-neutral-500">{summary}</p>
      )}
      {json && (
        <div className="relative mt-2">
          <button
            type="button"
            onClick={copy}
            className="absolute right-2 top-2 rounded-md border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-[11px] font-medium text-neutral-200 backdrop-blur transition hover:bg-neutral-700"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] leading-relaxed text-neutral-200 dark:bg-black">
            {json}
          </pre>
        </div>
      )}
    </Section>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-10">
        <header className="mb-8 flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <h1 className="text-lg font-semibold tracking-tight">Botox</h1>
          <span className="ml-auto text-xs text-neutral-400">Settings</span>
        </header>

        <div className="space-y-4">
          <AccountSection />

          <Section title="What syncs">
            <ToggleRow
              label="Bookmarks"
              description="Keep bookmarks identical across all your browsers."
              checked
            />
          </Section>

          <DriveState />
        </div>

        <p className="mt-8 text-center text-xs text-neutral-400">
          Botox v0 · your bookmarks stay in your own Google Drive
        </p>
      </div>
    </div>
  );
}
