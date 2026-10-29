import ascendancyNotables from "~/data/ascendancy-notables-poe1.json";

/** The signature kind ingest gives identified Forbidden Flame and Flesh: the allocated notable. */
export const FORBIDDEN_JEWEL_KIND = "forbidden-jewel";
export const FORBIDDEN_FLAME = "Forbidden Flame";
export const FORBIDDEN_FLESH = "Forbidden Flesh";
export const FORBIDDEN_JEWELS = [FORBIDDEN_FLAME, FORBIDDEN_FLESH] as const;

export function isForbiddenJewel(name: string | null | undefined) {
    return name === FORBIDDEN_FLAME || name === FORBIDDEN_FLESH;
}

/** Each class, in the passive tree's order, with its ascendancies. */
export const ASCENDANCY_CLASSES: Record<string, string[]> = ascendancyNotables.classes;

const notables: Record<string, string> = ascendancyNotables.notables;
const classes = new Map(
    Object.entries(ASCENDANCY_CLASSES).flatMap(([className, ascendancies]) =>
        ascendancies.map((ascendancy) => [ascendancy, className] as const),
    ),
);

/** A notable's class and ascendancy; undefined for notables no longer on the passive tree. */
export function ascendancyOfNotable(notable: string) {
    const ascendancy = Object.hasOwn(notables, notable) ? notables[notable] : undefined;
    const className = ascendancy && classes.get(ascendancy);
    return ascendancy && className ? { className, ascendancy } : undefined;
}

type ForbiddenMarket = {
    name: string | null;
    identified: boolean;
    corrupted: boolean;
    signatureKind: string;
    signatureValue: string;
};

/** A notable's Forbidden Flame and Forbidden Flesh markets, either of which may be unlisted. */
export type ForbiddenJewelPair<Row> = {
    notable: string;
    corrupted: boolean;
    flame?: Row;
    flesh?: Row;
};

export type ForbiddenJewelClass<Row> = {
    className: string;
    ascendancies: { ascendancy: string; pairs: ForbiddenJewelPair<Row>[] }[];
};

const OTHER = { className: "Other", ascendancy: "Other notables" };
const UNIDENTIFIED = { className: "Unidentified", ascendancy: "Unidentified" };

/**
 * Forbidden jewel markets paired by notable and corruption, grouped by class and ascendancy in
 * the passive tree's order; notables no longer on the tree, then unidentified jewels, come last.
 * Pairs keep the order of their first market in `rows`.
 */
export function forbiddenJewelClasses<Row extends ForbiddenMarket>(
    rows: Row[],
): ForbiddenJewelClass<Row>[] {
    const pairs = new Map<string, ForbiddenJewelPair<Row> & { group: typeof OTHER }>();
    for (const row of rows) {
        if (!isForbiddenJewel(row.name)) continue;
        const notable =
            row.identified && row.signatureKind === FORBIDDEN_JEWEL_KIND ? row.signatureValue : "";
        const key = JSON.stringify([notable, row.identified, row.corrupted]);
        let pair = pairs.get(key);
        if (!pair) {
            const group = notable ? (ascendancyOfNotable(notable) ?? OTHER) : UNIDENTIFIED;
            pair = {
                notable: notable || (row.identified ? "Unknown notable" : "Unidentified"),
                corrupted: row.corrupted,
                group,
            };
            pairs.set(key, pair);
        }
        pair[row.name === FORBIDDEN_FLAME ? "flame" : "flesh"] ??= row;
    }
    const order = [
        ...Object.entries(ASCENDANCY_CLASSES),
        [OTHER.className, [OTHER.ascendancy]] as const,
        [UNIDENTIFIED.className, [UNIDENTIFIED.ascendancy]] as const,
    ];
    return order.flatMap(([className, ascendancies]) => {
        const listed = ascendancies.flatMap((ascendancy) => {
            const found = [...pairs.values()]
                .filter(
                    ({ group }) => group.className === className && group.ascendancy === ascendancy,
                )
                .map(({ group: _, ...pair }) => pair);
            return found.length ? [{ ascendancy, pairs: found }] : [];
        });
        return listed.length ? [{ className, ascendancies: listed }] : [];
    });
}

/** A market's variant group on the item page: a Forbidden jewel's class and ascendancy. */
export function forbiddenJewelGroup(market: { signatureKind: string; signatureValue: string }) {
    if (market.signatureKind !== FORBIDDEN_JEWEL_KIND) return undefined;
    const found = ascendancyOfNotable(market.signatureValue);
    return found ? `${found.className} · ${found.ascendancy}` : "Other notables";
}
