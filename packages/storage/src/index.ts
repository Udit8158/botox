import type { SyncDocument } from "@botox/shared";

/**
 * Storage abstraction. The whole product is built against this interface so the
 * sync engine never knows or cares where the blob lives. The first (and v1)
 * implementation is Google Drive; Dropbox / iCloud / self-hosted / Gist can be
 * added later as additional adapters without touching the engine.
 */

/**
 * Supplies OAuth access tokens to a storage adapter. Implemented in the
 * extension (browser.identity), kept out of this package so the adapters stay
 * framework-agnostic and unit-testable with a fake provider.
 */
export interface AuthProvider {
  isAuthenticated(): Promise<boolean>;
  /** Run the interactive sign-in flow and persist credentials. */
  authenticate(): Promise<void>;
  signOut(): Promise<void>;
  /** A valid access token, refreshing silently if needed. Throws if signed out. */
  getAccessToken(): Promise<string>;
  /** Best-effort identifier of the signed-in user (email), if known. */
  getAccountLabel(): Promise<string | null>;
}

export interface RemoteBlob {
  /** Parsed document, or null if no synced file exists remotely yet. */
  document: SyncDocument | null;
  /**
   * Opaque revision token (Drive ETag / headRevisionId) used for optimistic
   * concurrency. null when there is no remote file yet.
   */
  revision: string | null;
}

export interface WriteResult {
  revision: string;
}

export interface StorageAdapter {
  /** Stable adapter id, e.g. "gdrive", "gist". */
  readonly id: string;

  isAuthenticated(): Promise<boolean>;
  /** Kick off the OAuth flow and persist credentials. */
  authenticate(): Promise<void>;
  signOut(): Promise<void>;

  /** Fetch the current remote document (or null) plus its revision. */
  read(): Promise<RemoteBlob>;

  /**
   * Write the document using optimistic concurrency. `expectedRevision` must
   * match the current remote revision (null when creating the file for the
   * first time). If the remote moved on, this throws {@link ConflictError} and
   * the caller should re-read and re-merge.
   */
  write(doc: SyncDocument, expectedRevision: string | null): Promise<WriteResult>;
}

/** Thrown by `write()` when the remote revision no longer matches. */
export class ConflictError extends Error {
  constructor(message = "Remote revision changed; re-read and re-merge") {
    super(message);
    this.name = "ConflictError";
  }
}

export { DriveAdapter } from "./drive-adapter.js";
