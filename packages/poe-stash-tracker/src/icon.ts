/**
 * The `icon` URL on every item is a data-URL-ish wrapper around a base64url
 * JSON blob that encodes how the sprite was generated. The third element of
 * that array carries the GGG-internal asset path under key `f`, e.g.
 * `2DItems/Jewels/PuzzlePieceJewel_GreatTangle` (Forbidden Flesh).
 *
 * That path discriminates the *specific* unique even when the item is
 * unidentified (name/typeLine/baseType all collapse to "Cobalt Jewel" etc.).
 * It is stable across patches — GGG does not rename asset paths.
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
