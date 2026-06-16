import { browser } from "wxt/browser";
import { GOOGLE_SCOPES } from "@botox/shared";
import type { AuthProvider } from "@botox/storage";

/**
 * Google OAuth via the implicit flow + `browser.identity.launchWebAuthFlow`.
 *
 * We use the implicit (`response_type=token`) flow because it needs no client
 * secret and works the same in every Chromium browser (and Firefox). Tokens are
 * short-lived (~1h); we refresh silently with `prompt=none`, falling back to an
 * interactive prompt if that fails. At productization the token exchange can
 * move to the backend for proper refresh tokens.
 */

const CLIENT_ID = import.meta.env.WXT_GOOGLE_CLIENT_ID as string;
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const STORAGE_KEY = "botox.google.token";
/** Refresh a bit early so a token never expires mid-request. */
const EXPIRY_SKEW_MS = 60_000;

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  email: string | null;
}

export class GoogleAuthProvider implements AuthProvider {
  async isAuthenticated(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async getAccountLabel(): Promise<string | null> {
    return (await this.load())?.email ?? null;
  }

  async authenticate(): Promise<void> {
    const { accessToken, expiresAt } = await this.runFlow(true);
    const email = await this.fetchEmail(accessToken);
    await this.save({ accessToken, expiresAt, email });
  }

  async signOut(): Promise<void> {
    await browser.storage.local.remove(STORAGE_KEY);
  }

  async getAccessToken(): Promise<string> {
    const existing = await this.load();
    if (existing && existing.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
      return existing.accessToken;
    }
    // Try to refresh silently first.
    try {
      const { accessToken, expiresAt } = await this.runFlow(false);
      await this.save({ accessToken, expiresAt, email: existing?.email ?? null });
      return accessToken;
    } catch {
      throw new Error("Not signed in — please sign in with Google again.");
    }
  }

  // --- internals -----------------------------------------------------------

  private async runFlow(
    interactive: boolean,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    if (!CLIENT_ID) throw new Error("Missing WXT_GOOGLE_CLIENT_ID");

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "token",
      redirect_uri: browser.identity.getRedirectURL(),
      scope: GOOGLE_SCOPES.join(" "),
      include_granted_scopes: "true",
      prompt: interactive ? "consent" : "none",
    });

    const redirect = await browser.identity.launchWebAuthFlow({
      url: `${AUTH_ENDPOINT}?${params.toString()}`,
      interactive,
    });
    if (!redirect) throw new Error("Authorization was cancelled.");

    const fragment = new URL(redirect).hash.slice(1);
    const result = new URLSearchParams(fragment);

    const error = result.get("error");
    if (error) throw new Error(`Google sign-in failed: ${error}`);

    const accessToken = result.get("access_token");
    if (!accessToken) throw new Error("No access token returned by Google.");

    const expiresIn = Number(result.get("expires_in") ?? "3600");
    return { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
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

  private async load(): Promise<StoredToken | null> {
    const got = await browser.storage.local.get(STORAGE_KEY);
    return (got[STORAGE_KEY] as StoredToken | undefined) ?? null;
  }

  private async save(token: StoredToken): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEY]: token });
  }
}
