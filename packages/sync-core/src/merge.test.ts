import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type SyncDocument, type SyncItem } from "@botox/shared";
import { mergeDocuments } from "./merge.js";

function item(partial: Partial<SyncItem> & Pick<SyncItem, "id">): SyncItem {
  return {
    type: "bookmark",
    url: `https://example.com/${partial.id}`,
    title: partial.id,
    path: ["Bookmarks Bar"],
    index: 0,
    addedAt: 1000,
    updatedAt: 1000,
    deleted: false,
    ...partial,
  };
}

function doc(items: SyncItem[], updatedAt = 1000): SyncDocument {
  return { schemaVersion: SCHEMA_VERSION, updatedAt, deviceId: "test", items };
}

const find = (d: SyncDocument, id: string) => d.items.find((i) => i.id === id);

describe("mergeDocuments", () => {
  it("keeps an item that only exists locally (new bookmark)", () => {
    const base = doc([]);
    const local = doc([item({ id: "a" })]);
    const remote = doc([]);
    const merged = mergeDocuments(base, local, remote, "dev");
    expect(find(merged, "a")).toBeDefined();
  });

  it("keeps an item that only exists remotely (added on another device)", () => {
    const merged = mergeDocuments(doc([]), doc([]), doc([item({ id: "b" })]), "dev");
    expect(find(merged, "b")).toBeDefined();
  });

  it("propagates a local deletion as a winning tombstone", () => {
    const base = doc([item({ id: "a", updatedAt: 1000 })]);
    const local = doc([item({ id: "a", deleted: true, updatedAt: 2000 })]);
    const remote = doc([item({ id: "a", updatedAt: 1000 })]);
    const merged = mergeDocuments(base, local, remote, "dev");
    expect(find(merged, "a")?.deleted).toBe(true);
  });

  it("takes the remote change when only remote changed vs base", () => {
    const base = doc([item({ id: "a", title: "old", updatedAt: 1000 })]);
    const local = doc([item({ id: "a", title: "old", updatedAt: 1000 })]);
    const remote = doc([item({ id: "a", title: "new", updatedAt: 1500 })]);
    const merged = mergeDocuments(base, local, remote, "dev");
    expect(find(merged, "a")?.title).toBe("new");
  });

  it("resolves a true conflict by last-write-wins", () => {
    const base = doc([item({ id: "a", title: "base", updatedAt: 1000 })]);
    const local = doc([item({ id: "a", title: "local", updatedAt: 3000 })]);
    const remote = doc([item({ id: "a", title: "remote", updatedAt: 2000 })]);
    const merged = mergeDocuments(base, local, remote, "dev");
    expect(find(merged, "a")?.title).toBe("local");
  });
});
