/**
 * Stable, cross-browser item identity.
 *
 * Browsers each assign their own internal bookmark ids, so we derive a stable
 * id from the item's content: url + folder path + title. The same bookmark in
 * Chrome and Firefox therefore hashes to the same id and merges correctly.
 */

/** FNV-1a 32-bit hash, rendered as 8 hex chars. Deterministic, no deps. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (FNV prime), kept in 32-bit space
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface IdInput {
  url?: string;
  title: string;
  path: string[];
}

/**
 * Canonicalize a URL so the *same* bookmark saved in different browsers maps to
 * one id. Browsers differ on trailing slashes, host casing, default ports, and
 * fragments, so we normalize those away before hashing — otherwise the same
 * page would look like a new bookmark and get added as a duplicate.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    // Drop a lone trailing slash ("example.com/" === "example.com").
    if (s.endsWith("/") && !s.endsWith("://")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export function computeItemId(item: IdInput): string {
  const url = item.url ? normalizeUrl(item.url) : "";
  const key = [url, item.path.join(" "), item.title.trim()].join(" ");
  return fnv1a(key);
}
