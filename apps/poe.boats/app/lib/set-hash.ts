import type { IdolModifier } from "~/schemas/idol";
import type { IdolSet } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";

/**
 * cyrb53 hash function - fast, good distribution, 53-bit hash
 * https://stackoverflow.com/a/52171480
 */
function cyrb53(str: string, seed = 0): string {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return hash.toString(36);
}

function normalizeModifier(mod: IdolModifier) {
    return {
        modId: mod.modId,
        type: mod.type,
        rolledValue: mod.rolledValue,
        tier: mod.tier,
    };
}

function normalizeIdol(invIdol: InventoryIdol) {
    const idol = invIdol.idol;
    return {
        baseType: idol.baseType,
        itemLevel: idol.itemLevel,
        rarity: idol.rarity,
        name: idol.name ?? null,
        implicit: idol.implicit ?? null,
        prefixes: idol.prefixes
            .map(normalizeModifier)
            .sort((a, b) => a.modId.localeCompare(b.modId)),
        suffixes: idol.suffixes
            .map(normalizeModifier)
            .sort((a, b) => a.modId.localeCompare(b.modId)),
    };
}

interface NormalizedPlacement {
    x: number;
    y: number;
    idolIndex: number;
}

/**
 * Computes a content hash for an IdolSet.
 * The hash is based on the meaningful content of the set, excluding:
 * - IDs (they change on import)
 * - Timestamps (createdAt, updatedAt, importedAt)
 * - Set name
 * - usageCount and source (metadata)
 *
 * Two sets with identical content will produce the same hash.
 */
export function computeSetHash(set: IdolSet): string {
    const normalizedIdols = set.inventory.map(normalizeIdol).sort((a, b) => {
        const baseCompare = a.baseType.localeCompare(b.baseType);
        if (baseCompare !== 0) return baseCompare;
        return JSON.stringify(a.prefixes).localeCompare(JSON.stringify(b.prefixes));
    });

    const idolContentToIndex = new Map<string, number>();
    normalizedIdols.forEach((idol, index) => {
        idolContentToIndex.set(JSON.stringify(idol), index);
    });

    const normalizedPlacements: NormalizedPlacement[] = set.placements
        .map((p) => {
            const invIdol = set.inventory.find((i) => i.id === p.inventoryIdolId);
            if (!invIdol) return null;
            const normalizedIdol = normalizeIdol(invIdol);
            const idolIndex = idolContentToIndex.get(JSON.stringify(normalizedIdol)) ?? -1;
            return {
                x: p.position.x,
                y: p.position.y,
                idolIndex,
            };
        })
        .filter((p): p is NormalizedPlacement => p !== null)
        .sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });

    const normalizedMapDevice = {
        slots: set.mapDevice.slots
            .map((s) => ({ slotIndex: s.slotIndex, scarabId: s.scarabId }))
            .sort((a, b) => a.slotIndex - b.slotIndex),
        craftingOptionId: set.mapDevice.craftingOptionId,
    };

    const normalizedUnlocks = [...set.unlockedConditions].sort();

    const contentObject = {
        idols: normalizedIdols,
        placements: normalizedPlacements,
        mapDevice: normalizedMapDevice,
        unlocks: normalizedUnlocks,
    };

    const contentString = JSON.stringify(contentObject);
    return cyrb53(contentString);
}

/**
 * Checks if a set with the same content already exists.
 * Returns the matching set if found, null otherwise.
 */
export function findDuplicateSet(incomingSet: IdolSet, existingSets: IdolSet[]): IdolSet | null {
    const incomingHash = computeSetHash(incomingSet);

    for (const existingSet of existingSets) {
        const existingHash = existingSet.contentHash ?? computeSetHash(existingSet);
        if (incomingHash === existingHash) {
            return existingSet;
        }
    }

    return null;
}
