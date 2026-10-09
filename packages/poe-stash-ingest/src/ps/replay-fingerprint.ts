import { createHash } from "node:crypto";
import type { Item, PublicStashChange, PublicStashPage } from "@poe-tools/api-client";

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, child]) => [key, canonical(child)]),
        );
    return value;
}

export function fingerprintHash(value: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(canonical(value)))
        .digest("hex");
}

function modifiers(values: Item["explicitMods"]) {
    return (values ?? [])
        .map((mod) => ({
            text: typeof mod === "string" ? mod : mod.description,
            flags:
                typeof mod === "string"
                    ? []
                    : Object.entries(mod.flags ?? {})
                          .filter(([, enabled]) => enabled)
                          .map(([flag]) => flag)
                          .sort(),
        }))
        .sort((a, b) => {
            const left = JSON.stringify(a);
            const right = JSON.stringify(b);
            return left < right ? -1 : left > right ? 1 : 0;
        });
}

function listingFields(item: Item) {
    return {
        id: item.id ?? null,
        name: item.name,
        baseType: item.baseType,
        typeLine: item.typeLine,
        identified: item.identified,
        rarity:
            item.rarity ??
            ["Normal", "Magic", "Rare", "Unique", "Gem", "Currency", "DivinationCard"][
                item.frameType ?? -1
            ] ??
            null,
        level: item.itemLevel ?? item.ilvl ?? null,
        stackSize: item.stackSize ?? 1,
        note: item.note ?? null,
        forumNote: item.forum_note ?? null,
        corrupted: item.corrupted ?? false,
        replica: item.replica ?? false,
        foilVariation: item.foilVariation ?? null,
        explicitMods: modifiers(item.explicitMods),
        implicitMods: modifiers(item.implicitMods),
        craftedMods: modifiers(item.craftedMods),
        fracturedMods: modifiers(item.fracturedMods),
        enchantMods: modifiers(item.enchantMods),
    };
}

export function selectedStashHash(stash: PublicStashChange): string {
    return fingerprintHash({
        version: "listing-v1",
        id: stash.id,
        public: stash.public,
        accountName: stash.accountName ?? null,
        league: stash.league ?? null,
        stash: stash.stash ?? null,
        items: (stash.items ?? []).map(listingFields).map(fingerprintHash).sort(),
    });
}

export function sampleFingerprints(page: PublicStashPage) {
    return {
        version: "listing-v1" as const,
        stashes: page.stashes.map((stash) => ({
            idHash: fingerprintHash(stash.id),
            selectedHash: selectedStashHash(stash),
            fullHash: fingerprintHash(stash),
        })),
    };
}

export type SampleFingerprints = ReturnType<typeof sampleFingerprints>;

export function fingerprintComparison(expected: SampleFingerprints) {
    const seen = new Set<string>();
    const full = new Set<string>();
    const selected = new Set<string>();
    const originals = new Set(expected.stashes.map((stash) => stash.idHash));
    return {
        add(page: PublicStashPage) {
            for (const stash of sampleFingerprints(page).stashes) {
                seen.add(stash.idHash);
                if (!originals.has(stash.idHash)) continue;
                full.add(`${stash.idHash}:${stash.fullHash}`);
                selected.add(`${stash.idHash}:${stash.selectedHash}`);
            }
        },
        result() {
            let fullMatched = 0;
            let selectedMatched = 0;
            let missing = 0;
            for (const stash of expected.stashes) {
                if (!seen.has(stash.idHash)) missing++;
                if (full.has(`${stash.idHash}:${stash.fullHash}`)) fullMatched++;
                if (selected.has(`${stash.idHash}:${stash.selectedHash}`)) selectedMatched++;
            }
            return {
                expected: expected.stashes.length,
                fullMatched,
                selectedMatched,
                selectedChanged: expected.stashes.length - missing - selectedMatched,
                missing,
                extraStashes: [...seen].filter((id) => !originals.has(id)).length,
            };
        },
    };
}
