import { GOOGLE_SCOPES } from "@botox/shared";
import type { AuthProvider } from "@botox/storage";

/**
 * Browser-side Google OAuth via Google Identity Services (GIS) token client.
 *
 * This is the web counterpart to the extension's `GoogleAuthProvider`. There is
 * NO backend: the page asks GIS for an access token for the `drive.appdata`
 * scope and talks to the Drive API directly. Tokens are short-lived (~1h) and
 * GIS has no browser refresh token, so we re-request silently (`prompt: ""`),
 * which succeeds without UI while the user's Google session is alive.
 *
 * Cross-surface data sharing works because this OAuth client lives in the SAME
 * Google Cloud project as the extension, so both read the same appDataFolder.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const STORAGE_KEY = "botox.web.session";
/** Refresh a little early so a token never expires mid-request. */
const EXPIRY_SKEW_MS = 60_000;

interface StoredSession {
  accessToken: string;
  expiresAt: number;
  email: string | null;
}

export class WebGoogleAuthProvider implements AuthProvider {
  private client: TokenClient | null = null;
  /** Resolver for the in-flight token request (GIS callbacks aren't promises). */
  private pending: {
    resolve: (t: { accessToken: string; expiresAt: number }) => void;
    reject: (e: Error) => void;
  } | null = null;

  async isAuthenticated(): Promise<boolean> {
    return this.load() !== null;
  }

  async getAccountLabel(): Promise<string | null> {
    return this.load()?.email ?? null;
  }

  async authenticate(): Promise<void> {
    // Interactive: a user gesture is in play (the Sign in button), so GIS may
    // show the account chooser / consent screen the first time.
    const { accessToken, expiresAt } = await this.requestToken("");
    const email = await this.fetchEmail(accessToken);
    this.save({ accessToken, expiresAt, email });
  }

  async signOut(): Promise<void> {
    const session = this.load();
    if (session && window.google) {
      window.google.accounts.oauth2.revoke(session.accessToken);
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  async getAccessToken(): Promise<string> {
    const existing = this.load();
    if (existing && existing.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
      return existing.accessToken;
    }
    // Silent re-request: works without UI while the Google session is alive.
    try {
      const { accessToken, expiresAt } = await this.requestToken("");
      this.save({ accessToken, expiresAt, email: existing?.email ?? null });
      return accessToken;
    } catch {
      throw new Error("Not signed in — please sign in with Google again.");
    }
  }

  // --- internals -----------------------------------------------------------

  private async requestToken(
    prompt: string,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    if (!CLIENT_ID) throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
    const google = await waitForGis();

    if (!this.client) {
      this.client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: GOOGLE_SCOPES.join(" "),
        callback: (resp) => {
          const p = this.pending;
          this.pending = null;
          if (!p) return;
          if (resp.error || !resp.access_token) {
            p.reject(new Error(resp.error ?? "No access token returned"));
            return;
          }
          const expiresIn = Number(resp.expires_in ?? 3600);
          p.resolve({
            accessToken: resp.access_token,
            expiresAt: Date.now() + expiresIn * 1000,
          });
        },
        error_callback: (err) => {
          const p = this.pending;
          this.pending = null;
          p?.reject(new Error(err.message ?? err.type ?? "Authorization failed"));
        },
      });
    }

    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.client!.requestAccessToken({ prompt });
    });
  }

  private async fetchEmail(accessToken: string): Promise<string | null> {
    try {
      const res = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { email?: string };
      return data.email ?? null;
    } catch {
      return null;
    }
  }

  private load(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  private save(session: StoredSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

/** Resolve once the async-loaded GIS script is ready on `window.google`. */
function waitForGis(): Promise<NonNullable<Window["google"]>> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve(window.google);
      } else if (Date.now() - start > 10_000) {
        clearInterval(timer);
        reject(new Error("Google sign-in failed to load. Check your connection."));
      }
    }, 50);
  });
}
