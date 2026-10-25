import { expect, it } from "vite-plus/test";
import {
    compileSourcePreparation,
    type ItemRecord,
    normalizeApiItem,
    type SourcePreparationModel,
    sourcePreparationProfileSchema,
} from "../src/index.ts";

const profile = { kind: "influence-ready-v1" } as const;
const model: SourcePreparationModel = {
    format: 5,
    bases: [
        {
            id: "Metadata/Items/Armours/Shields/ShieldStr17",
            baseType: "Pinnacle Tower Shield",
            itemClass: "Shield",
            scourImplicits: {
                ids: ["IncreasedLifeImplicitShield2"],
                texts: Array.from({ length: 11 }, (_, i) => [`+${20 + i} to maximum Life`]),
            },
        },
        {
            id: "Metadata/Items/Armours/Shields/ShieldInt16",
            baseType: "Titanium Spirit Shield",
            itemClass: "Shield",
            scourImplicits: { ids: [], texts: [[]] },
        },
    ],
};
const textModel = { format: 5 as const, modifiers: [], bases: [] };
const classify = compileSourcePreparation(textModel, model);

function source(base = model.bases[0]!) {
    const record = normalizeApiItem("poe1", "stash", {
        baseType: base.baseType,
        ilvl: 86,
        frameType: 0,
        rarity: "Normal",
        identified: true,
        influences: {},
        implicitMods: base.scourImplicits!.texts[0],
        explicitMods: [],
        properties: [{ name: "Quality", displayMode: 0, values: [["+20%", 1]] }],
        sockets: [{ group: 0, attr: "S" }],
    });
    record.facts.baseId = base.id;
    return record;
}

it("adds only an identity profile and requires model 5 without changing old Scouring results", () => {
    expect(sourcePreparationProfileSchema.parse(profile)).toEqual(profile);
    for (const extra of [{ crafted: false }, { enchanted: false }, { fractureId: "x" }])
        expect(sourcePreparationProfileSchema.safeParse({ ...profile, ...extra }).success).toBe(
            false,
        );
    for (const format of [1, 2, 3, 4] as const) {
        const old = compileSourcePreparation(textModel, { ...model, format });
        expect(old(source(), profile)).toEqual({ status: "unknown" });
        const input = source();
        input.item.rarity = "Rare";
        input.item.frameType = 2;
        input.item.explicitMods = ["Disposable affix"];
        const cleanup = { kind: "scour-v1", crafted: false, enchanted: false } as const;
        expect(classify(input, cleanup)).toEqual(old(input, cleanup));
    }
});

it("proves native identity without changing raw item, rolls, quality, sockets or caller facts", () => {
    for (const base of model.bases)
        for (const texts of base.scourImplicits!.texts) {
            const input = source(base);
            input.item.implicitMods = texts;
            const original = structuredClone(input);
            const result = classify(input, profile);
            expect(result.status).toBe("match");
            if (result.status !== "match") throw new Error("Expected proven native source.");
            expect(result.record.item).toEqual(original.item);
            expect(result.record.facts).toMatchObject({
                baseId: base.id,
                prefixes: 0,
                suffixes: 0,
                modifiers: base.scourImplicits!.ids.map((id) => ({
                    id,
                    side: "implicit",
                    fractured: false,
                    crafted: false,
                })),
                statsComplete: false,
            });
            expect(input).toEqual(original);
        }
});

it("refuses state needing cleanup, any influence and unsupported persistent state", () => {
    const changes: Array<(input: ItemRecord) => void> = [
        (input) => {
            input.item.rarity = "Magic";
            input.item.frameType = 1;
        },
        (input) => {
            input.item.explicitMods = ["An affix"];
        },
        (input) => {
            input.item.craftedMods = ["Prefixes Cannot Be Changed"];
        },
        (input) => {
            input.item.enchantMods = ["An enchantment"];
        },
        (input) => {
            input.item.fracturedMods = ["A fracture"];
        },
        (input) => {
            input.item.influences = { shaper: true };
        },
        (input) => {
            input.item.influences = { unknown: true };
        },
        ...[
            "searing",
            "tangled",
            "fractured",
            "synthesised",
            "corrupted",
            "duplicated",
            "memoryItem",
        ].map((field) => (input: ItemRecord) => {
            input.item[field] = true;
        }),
        (input) => {
            input.item.intangibility = 84;
        },
        (input) => {
            input.item.properties = [{ name: "Intangibility", type: 110, values: [["84%", 0]] }];
        },
    ];
    for (const base of model.bases)
        for (const change of changes) {
            const input = source(base);
            change(input);
            expect(classify(input, profile).status).not.toBe("match");
        }
});

it("keeps malformed, ambiguous and non-native evidence unknown", () => {
    const changes: Array<(input: ItemRecord) => void> = [
        (input) => {
            input.item.frameType = 2;
        },
        (input) => {
            delete input.item.identified;
        },
        (input) => {
            input.item.implicitMods = ["Unknown implicit"];
        },
        (input) => {
            input.item.enchantMods = {};
        },
        (input) => {
            input.item.unknownPersistentFlag = true;
        },
        (input) => {
            input.item.searing = "uncertain";
        },
        (input) => {
            input.facts.prefixes = 1;
        },
        (input) => {
            input.facts.modifiers = [{ id: "unexpected", side: "prefix" }];
        },
        (input) => {
            input.facts.modifiers = [{ id: "unexpected", side: "implicit" }];
        },
        (input) => {
            input.item.intangibility = "unknown";
        },
    ];
    for (const change of changes) {
        const input = source();
        change(input);
        expect(classify(input, profile)).toEqual({ status: "unknown" });
    }
    const unsupported = { ...model.bases[0]!, id: "unsupported-base" };
    expect(
        compileSourcePreparation(textModel, { ...model, bases: [unsupported] })(
            source(unsupported),
            profile,
        ),
    ).toEqual({ status: "no-match" });
    const ambiguous = source();
    delete ambiguous.facts.baseId;
    ambiguous.facts.baseTypeAmbiguous = true;
    expect(
        compileSourcePreparation(textModel, { ...model, bases: [...model.bases, unsupported] })(
            ambiguous,
            profile,
        ),
    ).toEqual({ status: "unknown" });
});
