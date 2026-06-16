import { describe, expect, it } from "vitest";
import { computeItemId, normalizeUrl } from "./id.js";

describe("normalizeUrl", () => {
  it("treats trailing slash, host case, and fragments as the same url", () => {
    expect(normalizeUrl("https://Example.com/")).toBe(normalizeUrl("https://example.com"));
    expect(normalizeUrl("https://example.com/page#section")).toBe(
      normalizeUrl("https://example.com/page"),
    );
  });

  it("keeps distinct paths and queries distinct", () => {
    expect(normalizeUrl("https://example.com/a")).not.toBe(
      normalizeUrl("https://example.com/b"),
    );
    expect(normalizeUrl("https://example.com/?q=1")).not.toBe(
      normalizeUrl("https://example.com/?q=2"),
    );
  });
});

describe("computeItemId dedup", () => {
  it("gives the same id to the same bookmark saved with cosmetic url/title diffs", () => {
    const a = computeItemId({ url: "https://example.com/", title: "Example", path: ["Bar"] });
    const b = computeItemId({ url: "https://EXAMPLE.com", title: " Example ", path: ["Bar"] });
    expect(a).toBe(b);
  });

  it("distinguishes the same url in different folders", () => {
    const a = computeItemId({ url: "https://example.com", title: "X", path: ["Bar"] });
    const b = computeItemId({ url: "https://example.com", title: "X", path: ["Other"] });
    expect(a).not.toBe(b);
  });
});
