import { expect, it } from "vite-plus/test";
import { type BaseIdentity, compileBaseIdentities } from "../src/base-identity.ts";
import { normalizeApiItem } from "../src/normalize.ts";

const identities: BaseIdentity[] = [
    {
        id: "dex-int",
        baseType: "Two-Toned Boots",
        implicits: [
            ["+8% to Cold and Lightning Resistances"],
            ["+12% to Cold and Lightning Resistances"],
        ],
    },
    {
        id: "str-dex",
        baseType: "Two-Toned Boots",
        implicits: [["+8% to Fire and Cold Resistances"]],
    },
    {
        id: "str-int",
        baseType: "Two-Toned Boots",
        implicits: [["+8% to Fire and Lightning Resistances"]],
    },
];
const raw = {
    baseType: "Two-Toned Boots",
    rarity: "Normal" as const,
    identified: true,
    implicitMods: [{ description: "+8% to Cold and Lightning Resistances" }],
};

it("resolves each canonical variant from complete public implicit descriptions", () => {
    const resolve = compileBaseIdentities(identities);
    for (const identity of identities)
        for (const implicits of identity.implicits!) {
            const record = normalizeApiItem("poe1", "stash", {
                ...raw,
                implicitMods: implicits.map((description) => ({ description })),
            });
            expect(resolve(record).facts.baseId).toBe(identity.id);
            expect(record.facts.baseId).toBeUndefined();
        }
    expect(
        resolve(
            normalizeApiItem("poe1", "stash", {
                ...raw,
                implicitMods: ["+8% to [Cold] and [Lightning] Resistances"],
            }),
        ).facts.baseId,
    ).toBe("dex-int");
});

it.each([
    { implicitMods: undefined },
    { implicitMods: [] },
    { implicitMods: [{ description: "+9% to Cold and Lightning Resistances" }] },
    { implicitMods: [...raw.implicitMods, ...raw.implicitMods] },
    { implicitMods: [{ description: raw.implicitMods[0]!.description, flags: { mutated: true } }] },
    {
        implicitMods: [
            { description: raw.implicitMods[0]!.description, flags: { vestigial: true } },
        ],
    },
    { corrupted: true },
    { synthesised: true },
    { identified: false },
    { rarity: "Unique" },
])("preserves unknown canonical identity for missing or modified evidence %j", (changes) => {
    const record = normalizeApiItem("poe1", "stash", { ...raw, ...changes });
    expect(compileBaseIdentities(identities)(record).facts.baseId).toBeUndefined();
});

it("keeps overlapping or unsupported canonical variants unresolved", () => {
    const record = normalizeApiItem("poe1", "stash", raw);
    for (const extra of [
        { ...identities[0]!, id: "same-text" },
        { id: "unknown", baseType: raw.baseType },
    ])
        expect(compileBaseIdentities([...identities, extra])(record).facts.baseId).toBeUndefined();
    expect(
        compileBaseIdentities(identities)({ ...record, game: "poe2" }).facts.baseId,
    ).toBeUndefined();
});
