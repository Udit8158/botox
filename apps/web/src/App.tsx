import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyDocument, type SyncDocument, type SyncItem } from "@botox/shared";
import { createAdapter, getDeviceId, isMockMode } from "./lib/adapter";
import { deleteItems, moveItem, renameItem } from "./lib/mutations";
import { useTheme } from "./lib/theme";
import { SignIn } from "./components/SignIn";
import { Dashboard } from "./components/Dashboard";

type Phase = "init" | "signin" | "loading" | "ready" | "error";

export function App() {
  const { adapter, accountLabel } = useMemo(() => createAdapter(), []);
  const deviceId = useMemo(() => getDeviceId(), []);
  const mock = isMockMode();
  const { theme, toggle: toggleTheme } = useTheme();

  const [phase, setPhase] = useState<Phase>("init");
  const [doc, setDoc] = useState<SyncDocument | null>(null);
  const [, setRevision] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const { document, revision } = await adapter.read();
      setDoc(document ?? emptyDocument(deviceId));
      setRevision(revision);
      setAccount(await accountLabel());
      setPhase("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sign in|not signed in/i.test(msg)) {
        setPhase("signin");
      } else {
        setError(msg);
        setPhase("error");
      }
    }
  }, [adapter, deviceId, accountLabel]);

  // Decide the initial screen.
  useEffect(() => {
    (async () => {
      if (mock || (await adapter.isAuthenticated())) {
        await load();
      } else {
        setPhase("signin");
      }
    })();
  }, [adapter, mock, load]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await adapter.authenticate();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [adapter, load]);

  const signOut = useCallback(async () => {
    await adapter.signOut();
    setDoc(null);
    setPhase("signin");
  }, [adapter]);

  // Wrap a mutation: run it, fold the new document into state, surface errors.
  const runMutation = useCallback(
    async (fn: () => Promise<{ document: SyncDocument; revision: string | null }>) => {
      setBusy(true);
      setError(null);
      try {
        const { document, revision } = await fn();
        setDoc(document);
        setRevision(revision);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const onRename = useCallback(
    (item: SyncItem, title: string) =>
      runMutation(() => renameItem(adapter, deviceId, item, title)),
    [adapter, deviceId, runMutation],
  );
  const onMove = useCallback(
    (item: SyncItem, path: string[]) =>
      runMutation(() => moveItem(adapter, deviceId, item, path)),
    [adapter, deviceId, runMutation],
  );
  const onDeleteMany = useCallback(
    (items: SyncItem[]) => runMutation(() => deleteItems(adapter, deviceId, items)),
    [adapter, deviceId, runMutation],
  );

  if (phase === "signin") {
    return (
      <SignIn
        onSignIn={signIn}
        busy={busy}
        error={error}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (phase === "init" || phase === "loading" || !doc) {
    return <CenteredMessage title="Loading your bookmarks…" />;
  }

  if (phase === "error") {
    return (
      <CenteredMessage
        title="Couldn’t load your bookmarks"
        detail={error ?? undefined}
        action={{ label: "Try again", onClick: load }}
      />
    );
  }

  return (
    <Dashboard
      doc={doc}
      mock={mock}
      busy={busy}
      error={error}
      account={account}
      theme={theme}
      onToggleTheme={toggleTheme}
      onRefresh={load}
      onSignOut={signOut}
      onRename={onRename}
      onMove={onMove}
      onDeleteMany={onDeleteMany}
    />
  );
}

function CenteredMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 px-6 text-center dark:bg-zinc-950">
      <div className="max-w-md">
        <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">{title}</p>
        {detail && <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{detail}</p>}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 active:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
