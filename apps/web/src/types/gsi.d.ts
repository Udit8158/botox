/**
 * Minimal typings for the Google Identity Services (GIS) OAuth2 token client.
 * Loaded from https://accounts.google.com/gsi/client (see index.html). We only
 * type the surface we use: the token client for browser-side access tokens.
 */
export {};

declare global {
  interface TokenResponse {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }

  interface TokenClient {
    requestAccessToken: (overrides?: { prompt?: string }) => void;
  }

  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}
