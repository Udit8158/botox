import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type SyncDocument, type SyncItem } from "@botox/shared";
import { deriveLocalDoc, planApply } from "./sync-ops.js";

function item(p: Partial<SyncItem> & Pick<SyncItem, "id">): SyncItem {
  return {
    type: "bookmark",
    url: `https://example.com/${p.id}`,
    title: p.id,
    path: [],
    index: 0,
    addedAt: 1,
    updatedAt: 1,
    deleted: false,
    ...p,
  };
}
function doc(items: SyncItem[]): SyncDocument {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: 1, deviceId: "t", items };
}

describe("deriveLocalDoc", () => {
  it("tombstones a base item that is gone locally", () => {
    const base = doc([item({ id: "a" }), item({ id: "b" })]);
    const current = [item({ id: "a" })]; // b deleted locally
    const local = deriveLocalDoc(base, current, "t", 999);
    const b = local.items.find((i) => i.id === "b");
    expect(b?.deleted).toBe(true);
    expect(b?.updatedAt).toBe(999);
  });

  it("carries forward existing tombstones", () => {
    const base = doc([item({ id: "a", deleted: true, updatedAt: 5 })]);
    const local = deriveLocalDoc(base, [], "t", 999);
    expect(local.items.find((i) => i.id === "a")?.deleted).toBe(true);
  });

  it("keeps brand-new local items (no base)", () => {
    const local = deriveLocalDoc(null, [item({ id: "x" })], "t");
    expect(local.items.map((i) => i.id)).toEqual(["x"]);
  });
});

describe("planApply", () => {
  it("creates desired items missing locally and removes tombstoned ones", () => {
    const merged = doc([
      item({ id: "keep" }),
      item({ id: "new" }),
      item({ id: "gone", deleted: true }),
    ]);
    const existing = ["keep", "gone"];
    const plan = planApply(merged, existing);
    expect(plan.creates.map((i) => i.id)).toEqual(["new"]);
    expect(plan.removeIds).toEqual(["gone"]);
  });
});
