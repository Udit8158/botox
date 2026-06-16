import { SYNC_FILE_NAME, SyncDocumentSchema, type SyncDocument } from "@botox/shared";
import { ConflictError } from "./index.js";
import type { AuthProvider, RemoteBlob, StorageAdapter, WriteResult } from "./index.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

interface DriveFileRef {
  id: string;
  /** headRevisionId — used as our opaque concurrency token. */
  revision: string | null;
}

/**
 * Google Drive `appDataFolder` adapter. Stores the whole sync document as a
 * single JSON file in the app's private, hidden Drive folder. Auth is delegated
 * to an injected {@link AuthProvider}; everything here is plain fetch.
 */
export class DriveAdapter implements StorageAdapter {
  readonly id = "gdrive";

  constructor(private readonly auth: AuthProvider) {}

  isAuthenticated(): Promise<boolean> {
    return this.auth.isAuthenticated();
  }
  authenticate(): Promise<void> {
    return this.auth.authenticate();
  }
  signOut(): Promise<void> {
    return this.auth.signOut();
  }

  private async authHeader(): Promise<{ Authorization: string }> {
    return { Authorization: `Bearer ${await this.auth.getAccessToken()}` };
  }

  /** Locate botox-sync.json in appDataFolder, or null if it doesn't exist yet. */
  private async findFile(): Promise<DriveFileRef | null> {
    const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
    const url =
      `${DRIVE_API}/files?spaces=appDataFolder&q=${q}` +
      `&fields=${encodeURIComponent("files(id,headRevisionId)")}`;
    const res = await fetch(url, { headers: await this.authHeader() });
    if (!res.ok) throw await driveError("list files", res);
    const data = (await res.json()) as {
      files?: { id: string; headRevisionId?: string }[];
    };
    const file = data.files?.[0];
    return file ? { id: file.id, revision: file.headRevisionId ?? null } : null;
  }

  async read(): Promise<RemoteBlob> {
    const file = await this.findFile();
    if (!file) return { document: null, revision: null };

    const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
      headers: await this.authHeader(),
    });
    if (!res.ok) throw await driveError("download file", res);

    const json = (await res.json()) as unknown;
    const document: SyncDocument = SyncDocumentSchema.parse(json);
    return { document, revision: file.revision };
  }

  async write(doc: SyncDocument, expectedRevision: string | null): Promise<WriteResult> {
    const existing = await this.findFile();

    // Soft optimistic concurrency: if the caller synced against a known
    // revision but the remote moved on, bail so they can re-read and re-merge.
    if (expectedRevision !== null && existing?.revision !== expectedRevision) {
      throw new ConflictError();
    }

    const body = JSON.stringify(doc);
    const ref = existing
      ? await this.updateFile(existing.id, body)
      : await this.createFile(body);
    return { revision: ref.revision ?? "" };
  }

  /** Delete the synced file entirely (used by "Reset sync"). No-op if absent. */
  async deleteRemote(): Promise<void> {
    const file = await this.findFile();
    if (!file) return;
    const res = await fetch(`${DRIVE_API}/files/${file.id}`, {
      method: "DELETE",
      headers: await this.authHeader(),
    });
    if (!res.ok && res.status !== 404) throw await driveError("delete file", res);
  }

  private async createFile(body: string): Promise<DriveFileRef> {
    const boundary = "botox-" + Math.random().toString(36).slice(2);
    const metadata = { name: SYNC_FILE_NAME, parents: ["appDataFolder"] };
    const multipart =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      "Content-Type: application/json\r\n\r\n" +
      `${body}\r\n` +
      `--${boundary}--`;

    const res = await fetch(
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=headRevisionId`,
      {
        method: "POST",
        headers: {
          ...(await this.authHeader()),
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    );
    if (!res.ok) throw await driveError("create file", res);
    const data = (await res.json()) as { headRevisionId?: string };
    return { id: "", revision: data.headRevisionId ?? null };
  }

  private async updateFile(id: string, body: string): Promise<DriveFileRef> {
    const res = await fetch(
      `${DRIVE_UPLOAD}/files/${id}?uploadType=media&fields=headRevisionId`,
      {
        method: "PATCH",
        headers: {
          ...(await this.authHeader()),
          "Content-Type": "application/json",
        },
        body,
      },
    );
    if (!res.ok) throw await driveError("update file", res);
    const data = (await res.json()) as { headRevisionId?: string };
    return { id, revision: data.headRevisionId ?? null };
  }
}

async function driveError(action: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  return new Error(`Drive ${action} failed (${res.status}): ${detail}`);
}
