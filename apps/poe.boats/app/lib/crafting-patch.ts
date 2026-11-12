/**
 * Whether a client build is PoE 1 3.30.0 or later. That patch changed recombination, Orbs of
 * Annulment and the sources of Incursion modifiers; older catalogs keep the 3.29 rules.
 */
export function isPoe1From330({ game, patch }: { game: string; patch: string }) {
    const [major = 0, minor = 0] = patch.split(".").map(Number);
    return game === "poe1" && (major > 3 || (major === 3 && minor >= 30));
}
