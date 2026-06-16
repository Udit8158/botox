import { useEffect, useState } from "react";
import { rpc } from "../../lib/messages";

type Msg = { kind: "ok" | "err"; text: string };

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

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    rpc({ type: "status" })
      .then((d) => {
        setEmail(d.email);
        setLastSynced(d.lastSyncedAt);
      })
      .catch(() => setEmail(null))
      .finally(() => setReady(true));
  }, []);

  async function run(action: string, fn: () => Promise<Msg>) {
    setBusy(action);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const signIn = () =>
    run("signin", async () => {
      const d = await rpc({ type: "signin" });
      setEmail(d.email);
      setLastSynced(d.lastSyncedAt);
      return { kind: "ok", text: "Signed in & synced." };
    });

  const signOut = () =>
    run("signout", async () => {
      await rpc({ type: "signout" });
      setEmail(null);
      return { kind: "ok", text: "Signed out." };
    });

  const sync = () =>
    run("sync", async () => {
      const { total, created, removed } = await rpc({ type: "sync" });
      setLastSynced(Date.now());
      const changes =
        created || removed
          ? ` (+${created} added, −${removed} removed)`
          : " (already up to date)";
      return { kind: "ok", text: `Synced ${total} items${changes}.` };
    });

  return (
    <div className="w-80 bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center gap-2 px-4 pt-4">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <h1 className="text-sm font-semibold tracking-tight">Botox</h1>
      </header>

      <div className="px-4 py-4">
        <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-xs font-medium text-neutral-500">Account</p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {!ready ? "…" : (email ?? "Not signed in")}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {email
              ? "Syncs automatically to your Google Drive."
              : "Connect Google Drive to start syncing."}
          </p>
          {email && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Auto-sync on · last synced {relativeTime(lastSynced)}
            </div>
          )}
        </div>

        {!email ? (
          <button
            type="button"
            onClick={signIn}
            disabled={!ready || busy !== null}
            className="mt-3 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy === "signin" ? "Opening Google…" : "Sign in with Google"}
          </button>
        ) : (
          <button
            type="button"
            onClick={sync}
            disabled={busy !== null}
            className="mt-3 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </button>
        )}

        {msg && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              msg.kind === "ok"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
            }`}
          >
            {msg.text}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => browser.runtime.openOptionsPage()}
            className="rounded-md text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Settings
          </button>
          {email && (
            <button
              type="button"
              onClick={signOut}
              disabled={busy !== null}
              className="rounded-md text-xs font-medium text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
