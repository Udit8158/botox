import {
  SCHEMA_VERSION,
  type SyncDocument,
  type SyncItem,
} from "@botox/shared";
import {
  ConflictError,
  type RemoteBlob,
  type StorageAdapter,
  type WriteResult,
} from "@botox/storage";

/**
 * In-memory storage adapter for local development and testing (`?mock=1`). It
 * mimics Drive's optimistic concurrency (revision check) so the management code
 * path is exercised end-to-end without a real Google sign-in.
 */
export class MockAdapter implements StorageAdapter {
  readonly id = "mock";
  private doc: SyncDocument = sampleDocument();
  private revision = "r1";
  private counter = 1;

  async isAuthenticated(): Promise<boolean> {
    return true;
  }
  async authenticate(): Promise<void> {}
  async signOut(): Promise<void> {}

  async read(): Promise<RemoteBlob> {
    // Return clones so callers can't mutate our store by reference.
    return { document: structuredClone(this.doc), revision: this.revision };
  }

  async write(doc: SyncDocument, expectedRevision: string | null): Promise<WriteResult> {
    if (expectedRevision !== null && expectedRevision !== this.revision) {
      throw new ConflictError();
    }
    this.doc = structuredClone(doc);
    this.revision = `r${++this.counter}`;
    return { revision: this.revision };
  }
}

function bm(
  title: string,
  url: string,
  path: string[],
  index: number,
): SyncItem {
  return {
    id: `${path.join("/")}/${title}`,
    type: "bookmark",
    url,
    title,
    path,
    index,
    addedAt: Date.now() - index * 86_400_000,
    updatedAt: Date.now(),
    deleted: false,
  };
}

function folder(title: string, path: string[], index: number): SyncItem {
  return {
    id: `folder:${path.join("/")}/${title}`,
    type: "folder",
    title,
    path,
    index,
    addedAt: Date.now(),
    updatedAt: Date.now(),
    deleted: false,
  };
}

function sampleDocument(): SyncDocument {
  const items: SyncItem[] = [
    folder("Bookmarks Bar", [], 0),
    folder("Dev", ["Bookmarks Bar"], 0),
    folder("Reading", ["Bookmarks Bar"], 1),
    folder("Frontend", ["Bookmarks Bar", "Dev"], 0),

    bm("GitHub", "https://github.com", ["Bookmarks Bar"], 0),
    bm("Hacker News", "https://news.ycombinator.com", ["Bookmarks Bar"], 1),

    bm("MDN Web Docs", "https://developer.mozilla.org", ["Bookmarks Bar", "Dev"], 0),
    bm("Stack Overflow", "https://stackoverflow.com", ["Bookmarks Bar", "Dev"], 1),
    bm("TypeScript Docs", "https://www.typescriptlang.org/docs", ["Bookmarks Bar", "Dev"], 2),

    bm("React", "https://react.dev", ["Bookmarks Bar", "Dev", "Frontend"], 0),
    bm("Tailwind CSS", "https://tailwindcss.com", ["Bookmarks Bar", "Dev", "Frontend"], 1),
    bm("Vite", "https://vite.dev", ["Bookmarks Bar", "Dev", "Frontend"], 2),

    bm("Paul Graham Essays", "https://paulgraham.com/articles.html", ["Bookmarks Bar", "Reading"], 0),
    bm("Stratechery", "https://stratechery.com", ["Bookmarks Bar", "Reading"], 1),
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: Date.now(),
    deviceId: "mock-device",
    items,
  };
}
