import { expect, it } from "vite-plus/test";
import {
    compileModifierTextModel,
    type ItemFacts,
    itemQuerySchema,
    matchItem,
    normalizeApiItem,
} from "../src/index.ts";

const allResistances = { id: "AllResistances6", side: "suffix" as const };
const heat = (facts: Partial<ItemFacts> = {}) =>
    normalizeApiItem(
        "poe1",
        "stash",
        {
            baseType: "Heat-attuned Tower Shield",
            rarity: "Magic",
            identified: true,
            implicitMods: ["Scorch Enemies when you Block their Damage"],
        },
        { prefixes: 0, suffixes: 1, modifiers: [allResistances], ...facts },
    );
const query = (id: string, side?: "prefix" | "suffix" | "implicit", maximum?: number) =>
    itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "and",
                filters: [{ kind: "mod", ids: [id], side, count: { min: 1, max: maximum } }],
            },
        ],
    });

it("rejects the captured resistance suffix as Strength only with an explicit suffix query", () => {
    const modifiers = [
        {
            ...allResistances,
            name: "of the Span",
            groups: ["AllResistances"],
            crafted: false,
            text: "+(17-18)% to all Elemental Resistances",
        },
        {
            id: "Strength7",
            side: "suffix" as const,
            name: "of the Leviathan",
            groups: ["Strength"],
            crafted: false,
            text: "+(38-42) to Strength",
        },
        {
            id: "StormBlade",
            side: "prefix" as const,
            name: "Anomalous",
            groups: ["StormBlade"],
            crafted: false,
            text: "",
            unsupported: true,
        },
    ];
    const source = normalizeApiItem("poe1", "stash", {
        ...heat().item,
        name: "",
        typeLine: "Heat-attuned Tower Shield of the Span",
        influences: { shaper: true },
        explicitMods: [{ description: "+17% to all Elemental Resistances" }],
        extended: { suffixes: 1 },
    });
    const record = compileModifierTextModel({
        format: 3,
        modifiers,
        bases: [{ baseType: source.item.baseType, modifiers: modifiers.map(({ id }) => ({ id })) }],
    })(source);
    expect(record.facts).toMatchObject({
        prefixes: 0,
        suffixes: 1,
        modifiersComplete: false,
        modifiers: [allResistances],
    });
    expect(matchItem(record, query("Strength7", "suffix"))).toBe("no-match");
    expect(matchItem(record, query("Strength7"))).toBe("unknown");
    expect(matchItem(record, query("AllResistances6", "suffix"))).toBe("match");
    expect(matchItem(record, query("AllResistances6", "suffix", 1))).toBe("match");
    expect(record.item).toBe(source.item);
    expect(record.facts.modifiersComplete).toBe(false);
});

it("does not require implicit identities to close a fully resolved explicit side", () => {
    const record = heat({ modifiers: [allResistances, { side: "implicit" }] });
    expect(matchItem(record, query("Strength7", "suffix"))).toBe("no-match");
    expect(matchItem(record, query("Strength7"))).toBe("unknown");
    expect(matchItem(record, query("StrengthImplicit", "implicit"))).toBe("unknown");
});

it("also closes known prefix counts and a known empty explicit side", () => {
    const record = heat({
        prefixes: 1,
        suffixes: 0,
        modifiers: [{ id: "LocalEnergyShield10", side: "prefix" }],
    });
    expect(matchItem(record, query("LocalEnergyShield9", "prefix"))).toBe("no-match");
    expect(matchItem(record, query("LocalEnergyShield10", "prefix", 1))).toBe("match");
    expect(matchItem(record, query("Strength7", "suffix"))).toBe("no-match");
});

it.each([
    { name: "missing count", facts: { suffixes: undefined } },
    { name: "unaccounted suffix slot", facts: { suffixes: 2 } },
    { name: "count below represented suffixes", facts: { suffixes: 0 } },
    {
        name: "unresolved identity",
        facts: { modifiers: [{ side: "suffix" as const, name: "of the Span" }] },
    },
    {
        name: "ambiguous identity",
        facts: {
            modifiers: [
                {
                    side: "suffix" as const,
                    possibleIds: ["AllResistances6", "AllResistancesAlias"],
                },
            ],
        },
    },
    {
        name: "duplicate identity",
        facts: { suffixes: 2, modifiers: [allResistances, allResistances] },
    },
    {
        name: "conflicting identity sides",
        facts: { modifiers: [allResistances, { ...allResistances, side: "prefix" as const }] },
    },
    { name: "unknown side", facts: { modifiers: [allResistances, { id: "unresolved-side" }] } },
] satisfies { name: string; facts: Partial<ItemFacts> }[])("keeps $name unknown", ({ facts }) => {
    expect(matchItem(heat(facts), query("Strength7", "suffix"))).toBe("unknown");
});

it.each([false, undefined])("requires explicit identification, received %s", (identified) => {
    const record = heat();
    record.item.identified = identified;
    expect(matchItem(record, query("Strength7", "suffix"))).toBe("unknown");
});

it("does not close a side when resolved and source counts disagree", () => {
    const record = heat();
    record.item.extended = { suffixes: 2 };
    expect(matchItem(record, query("Strength7", "suffix"))).toBe("unknown");
});

it("retains the existing complete-modifier semantics for unsided and implicit queries", () => {
    const record = heat({ modifiersComplete: true });
    expect(matchItem(record, query("Strength7"))).toBe("no-match");
    expect(matchItem(record, query("StrengthImplicit", "implicit"))).toBe("no-match");
});
