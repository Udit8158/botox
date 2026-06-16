import { describe, expect, it } from "vitest";
import { bookmarksToItems, type RawBookmarkNode } from "./normalize.js";

const tree: RawBookmarkNode[] = [
  {
    title: "Bookmarks Bar",
    children: [
      { title: "Anthropic", url: "https://anthropic.com" },
      {
        title: "Dev",
        children: [{ title: "WXT", url: "https://wxt.dev" }],
      },
    ],
  },
];

describe("bookmarksToItems", () => {
  const items = bookmarksToItems(tree, 1000);

  it("emits folders and bookmarks", () => {
    expect(items).toHaveLength(4); // Bookmarks Bar, Anthropic, Dev, WXT
    expect(items.filter((i) => i.type === "folder")).toHaveLength(2);
  });

  it("records the folder path of nested items", () => {
    const wxt = items.find((i) => i.url === "https://wxt.dev");
    expect(wxt?.path).toEqual(["Bookmarks Bar", "Dev"]);
  });

  it("gives top-level folders an empty path", () => {
    const bar = items.find((i) => i.title === "Bookmarks Bar");
    expect(bar?.path).toEqual([]);
    expect(bar?.type).toBe("folder");
  });

  it("assigns stable, distinct ids", () => {
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
    // Deterministic across runs.
    expect(bookmarksToItems(tree, 1000)[0]!.id).toBe(items[0]!.id);
  });
});
