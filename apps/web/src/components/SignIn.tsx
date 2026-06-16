export function SignIn({
  onSignIn,
  busy,
  error,
}: {
  onSignIn: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-semibold text-white">
            B
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Botox Bookmarks
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            View and manage the bookmarks synced to your Google Drive.
          </p>
        </div>

        <button
          onClick={onSignIn}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
        >
          <GoogleMark />
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-zinc-400">
          Your bookmarks stay in your own Google Drive. This dashboard reads them
          directly in your browser — nothing is stored on any server.
        </p>
      </div>
    </div>
  );
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>
);
