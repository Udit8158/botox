/**
 * Storage-agnostic sync engine for Botox.
 *
 * M0: identity + three-way merge are implemented and unit-tested. M2 adds
 * bookmark<->document normalization and applying merge results back to the
 * browser via chrome.bookmarks.
 */
export { computeItemId } from "./id.js";
export type { IdInput } from "./id.js";
export { mergeDocuments } from "./merge.js";
export { bookmarksToItems, bookmarksToDocument } from "./normalize.js";
export type { RawBookmarkNode } from "./normalize.js";
export { deriveLocalDoc, planApply } from "./sync-ops.js";
export type { ApplyPlan } from "./sync-ops.js";
