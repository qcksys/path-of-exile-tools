/**
 * The `icon` URL on every item is a data-URL-ish wrapper around a base64url
 * JSON blob whose third element carries GGG's internal asset path. That path
 * discriminates the *specific* unique even when the item is unidentified —
 * stable across patches.
 */
export function decodeIconAsset(icon: string | undefined | null): string | null {
  if (!icon) return null;
  const m = icon.match(/\/gen\/image\/([A-Za-z0-9_-]+)/);
  if (!m?.[1]) return null;
  try {
    const decoded = Buffer.from(m[1], "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    if (Array.isArray(parsed) && parsed[2] && typeof parsed[2] === "object") {
      const f = (parsed[2] as { f?: unknown }).f;
      return typeof f === "string" ? f : null;
    }
    return null;
  } catch {
    return null;
  }
}
