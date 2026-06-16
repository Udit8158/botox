/**
 * Chromium gives its permanent top-level folders fixed numeric ids but
 * browser/locale-dependent *titles* ("Bookmarks bar" vs "Bookmarks Bar" vs
 * "Bookmarks"). If we keyed folder paths by those titles, the same folder would
 * look different across browsers and nesting would break on sync.
 *
 * So we canonicalize the roots by their stable id before normalizing/applying,
 * making Chrome / Brave / Edge agree on the top-level names.
 */
const CANONICAL_ROOTS: Record<string, string> = {
  "1": "Bookmarks Bar",
  "2": "Other Bookmarks",
  "3": "Mobile Bookmarks",
};

export function canonicalRootTitle(id: string, title: string): string {
  return CANONICAL_ROOTS[id] ?? title;
}

export function canonicalizeRoots<T extends { id: string; title: string }>(
  roots: T[],
): T[] {
  return roots.map((r) => ({ ...r, title: canonicalRootTitle(r.id, r.title) }));
}
