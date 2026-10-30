// biome-ignore-all lint/style/useNamingConvention: Keys are in-game unique, curse and defence names.
import type { Item } from "@poe-tools/api-client";
import { isUniqueItem } from "#src/shared/capture.ts";
import { explicitModLines } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor, ModSignature } from "#src/shared/mod-extractors/types.ts";

type Split = (lines: string[]) => string | undefined;

/** The first capture of `pattern` across the mod lines, optionally relabelled. */
function capture(pattern: RegExp, label: (value: string) => string = (value) => value): Split {
    return (lines) => {
        for (const line of lines) {
            const value = line.match(pattern)?.[1];
            if (value) return label(value);
        }
        return undefined;
    };
}

const count = (unit: string) => (value: string) => `${value} ${unit}${value === "1" ? "" : "s"}`;

const abyssalSockets = capture(/Has (\d+) Abyssal Sockets?/, count("Jewel"));

const IMPRESENCE_CURSES: Record<string, string> = {
    Despair: "Chaos",
    Frostbite: "Cold",
    Vulnerability: "Physical",
    Flammability: "Fire",
    Conductivity: "Lightning",
};

// Longer defence names come first so "Armour" does not match "Armour and Evasion".
const ATZIRI_DEFENCES: Record<string, string> = {
    "Armour, Evasion and Energy Shield": "Armour/Evasion/ES",
    "Armour and Evasion": "Armour/Evasion",
    "Armour and Energy Shield": "Armour/ES",
    "Evasion and Energy Shield": "Evasion/ES",
    Armour: "Armour",
    "Evasion Rating": "Evasion",
    "Energy Shield": "ES",
};
const atziriDefence = capture(
    new RegExp(`% increased (${Object.keys(ATZIRI_DEFENCES).join("|")})`),
    (defence) => ATZIRI_DEFENCES[defence]!,
);

/** "+5 to maximum Mana" → "Mana", "6% increased Fire Damage" → "Fire Damage". */
const lightOfMeaningStat = capture(
    /^Passive Skills in Radius also grant [+-]?[\d.]+%? (?:to |increased )?(?:maximum )?(.+)$/,
    (stat) => stat[0]!.toUpperCase() + stat.slice(1),
);

/** "+5 to Strength" and "+40 to maximum Life" → "Life / Strength", whatever order they are listed in. */
const splitPersonalityStats: Split = (lines) => {
    const stats = lines
        .filter((line) => !line.startsWith("This Jewel's Socket has"))
        .map((line) => line.match(/^[+-]?[\d.]+%? (?:to |increased )?(?:maximum )?(.+)$/)?.[1])
        .filter((stat) => stat !== undefined)
        .map((stat) => stat[0]!.toUpperCase() + stat.slice(1))
        .sort();
    return stats.length > 0 ? stats.join(" / ") : undefined;
};

/**
 * Uniques whose rolled mods make separately priced markets, keyed by unique name. The list and
 * the variant labels follow poe.ninja's `variant` splits (checked 2026-10-27 in Allflame), plus
 * Split Personality, The Light of Meaning, Sublime Vision and Thread of Hope, which poe.ninja does not split, and
 * The Dark Monarch; the `foulborn` extractor adds these labels to Foulborn copies.
 */
export const UNIQUE_MOD_SPLITS: Record<string, Split> = {
    // Hybrid energy shield versions that roll life instead of flat energy shield trade apart.
    "Atziri's Splendour": (lines) => {
        const defence = atziriDefence(lines);
        if (!defence) return undefined;
        const life = lines.some((line) => line.includes("to maximum Life"));
        return life && defence.endsWith("ES") && defence !== "ES" ? `${defence}/Life` : defence;
    },
    "Bubonic Trail": abyssalSockets,
    "Doryani's Invitation": capture(/of (Physical|Lightning|Cold|Fire) Damage Leeched as Life/),
    Impresence: capture(
        new RegExp(`(${Object.keys(IMPRESENCE_CURSES).join("|")}) has no Reservation`),
        (curse) => IMPRESENCE_CURSES[curse]!,
    ),
    Lightpoacher: abyssalSockets,
    // Foulborn copies mutate the flask mod to count from the rightmost flask.
    Mageblood: capture(
        /(?:Left|Right)most (\d+) Magic Utility Flasks? constantly apply/,
        count("Flask"),
    ),
    "Ralakesh's Impatience": capture(/Count as having maximum number of (\w+) Charges/),
    "Shroud of the Lightless": abyssalSockets,
    // Two rolled stats; every pair is its own market.
    "Split Personality": splitPersonalityStats,
    // Every aura but the one it rolled is disabled.
    "Sublime Vision": capture(/^Aura Skills other than (.+) are Disabled$/),
    // One of 16 minion types is doubled and the only minions allowed.
    "The Dark Monarch": capture(/Maximum number of (.+?) is Doubled/),
    "The First Crest": capture(/Aureus Coins are converted to (.+?) upon defeating/),
    "The Light of Meaning": lightOfMeaningStat,
    "Thread of Hope": capture(/Only affects Passives in (.+ Ring)/),
    Tombfist: abyssalSockets,
    "Volkuur's Guidance": capture(/Your (Fire|Cold|Lightning) Damage can Poison/),
    Voices: capture(/Adds (\d+) Small Passive Skills? which grant nothing/, count("passive")),
    "Yriel's Fostering": capture(
        /Projectiles from Attacks (?:inflict )?(Bleeding|Poison|Maim) on Hit/,
    ),
};

function splitOf(item: Item) {
    const name = item.name.replace(/^Foulborn /, "");
    return Object.hasOwn(UNIQUE_MOD_SPLITS, name) ? UNIQUE_MOD_SPLITS[name] : undefined;
}

/** The variant label of a listed unique or its Foulborn copy, read from explicit and mutated mods. */
export function uniqueModSplit(item: Item): string | undefined {
    return splitOf(item)?.([...explicitModLines(item), ...(item.mutatedMods ?? [])]);
}

export const uniqueModSplitExtractor: ModExtractor = {
    kind: "unique-mod-split",
    value: (signature) => String(signature.variant),
    matches(item: Item): boolean {
        return isUniqueItem(item) && item.identified && splitOf(item) !== undefined;
    },
    extract(item: Item): ModSignature | null {
        const variant = uniqueModSplit(item);
        return variant ? { kind: "unique-mod-split", variant } : null;
    },
};
