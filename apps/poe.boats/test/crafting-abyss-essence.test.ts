import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { engine as poe1 } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(([, entry]) => entry.name === "Golden Hoop")![0];
const essence = catalog.crafting.poe2Essences.find(
    (entry) => entry.name === "Essence of the Abyss",
)!;
const method = { kind: "essence" as const, id: essence.id };
const currency = (suffix: string) => ({
    kind: "currency" as const,
    id: `Metadata/Items/Currency/${suffix}`,
});
const bone = currency("AbyssalBenchTicketJewellery");
const omen = (suffix: string) => currency(suffix).id;
const markId = (side: string) =>
    essence.rules[0]!.outcomes.find((entry) => engine.mod(entry.mod).generation_type === side)!.mod;

function marked(side = "prefix", full = false, level = 86, fractured = false) {
    let item = engine.addStartingMod(
        engine.createItem(base, level),
        markId(side),
        seededRandom(1),
        "essence",
    );
    while (item.mods.length < (full ? 6 : 2))
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
    item.mods[0]!.fractured = fractured;
    return item;
}

describe("PoE 2 Essence of the Abyss", () => {
    it.each([
        "prefix",
        "suffix",
    ])("retains a replaced %s Mark when the bone floor leaves no reveal choices", (side) => {
        const sceptre = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Rattling Sceptre",
        )![0];
        const item = engine.addStartingMod(
            engine.createItem(sceptre, 1),
            markId(side),
            seededRandom(1),
            "essence",
        );
        const high = currency("AbyssalBenchTicketWeaponHigh");
        const result = engine.apply(item, high, seededRandom(1));
        expect(result.item.reveal).toMatchObject({ mark: markId(side), choices: [] });
        expect(engine.mod(result.item.reveal!.mod).generation_type).toBe(side);
        expect(engine.revealPool(result.item)).toEqual([]);
        expect(result.cost).toEqual(engine.costs(high));
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
    });
    it("uses the extracted class rules, weighted Marks and keyword definition", () => {
        expect(engine.essenceSupported(essence.id)).toBe(true);
        expect(poe1.essenceSupported(essence.id)).toBe(false);
        expect(catalog.crafting.keywords.MarkofAbyssalLord!.definition).toContain(
            "always removes that modifier",
        );
        expect(essence.rules[0]!.outcomes).toEqual([
            { mod: "EssenceAbyssPrefix", weight: 50 },
            { mod: "EssenceAbyssSuffix", weight: 50 },
        ]);
        for (const itemClass of essence.rules[0]!.itemClasses) {
            const entry = Object.entries(catalog.bases).find(
                ([id, entry]) =>
                    entry.item_class === itemClass &&
                    !entry.corrupted &&
                    entry.rarities.includes("rare") &&
                    engine.pool({ ...engine.createItem(id), rarity: "rare" }).length > 0,
            );
            if (!entry) continue;
            const empty = { ...engine.createItem(entry[0]), rarity: "rare" as const };
            const item = engine.addStartingMod(empty, engine.pool(empty)[0]!.id, seededRandom(1));
            const result = engine.apply(item, method, seededRandom(42));
            expect(result.item.mods).toHaveLength(1);
            expect(engine.isAbyssalMark(result.item.mods[0]!.id)).toBe(true);
            expect(result.item.mods[0]!.crafted).toBe(true);
            expect(result.cost.map((entry) => entry.id)).toEqual([essence.id]);
        }
    });

    it("calculates both Mark outcomes and respects Crystallisation removal on a full item", () => {
        let item: CraftingItem = { ...engine.createItem(base), rarity: "rare" };
        while (item.mods.length < 6)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        for (const side of ["prefix", "suffix"]) {
            const target = engine.validateTarget({ groups: [{ mods: [markId(side)] }] });
            expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(0.5);
            const directed = {
                ...method,
                omens: [
                    omen(
                        side === "prefix"
                            ? "OmenOnPerfectEssencePrefix"
                            : "OmenOnPerfectEssenceSuffix",
                    ),
                ],
            };
            expect(calculateExact(engine, item, directed, target).probability).toBeCloseTo(1);
            const result = engine.apply(item, directed, seededRandom(42)).item;
            for (const entry of item.mods.filter(
                (entry) => engine.mod(entry.id).generation_type !== side,
            ))
                expect(result.mods).toContainEqual(entry);
        }
    });

    it.each([
        ["prefix", false, false],
        ["suffix", false, false],
        ["prefix", true, false],
        ["suffix", true, false],
        ["prefix", false, true],
        ["suffix", false, true],
        ["prefix", true, true],
        ["suffix", true, true],
    ] as const)("replaces only the %s Mark (full: %s, fractured: %s), preserving all other rolls and item properties", (side, full, fractured) => {
        const item = { ...marked(side, full, 86, fractured), quality: 20 };
        const before = structuredClone(item);
        const opposite = omen(
            side === "prefix" ? "OmenOnAbyssAddSuffixes" : "OmenOnAbyssAddPrefixes",
        );
        const result = engine.apply(item, { ...bone, omens: [opposite] }, seededRandom(42));
        expect(item).toEqual(before);
        expect(result.item.mods).toHaveLength(item.mods.length);
        expect(result.item.mods[0]!.id).toBe(side === "prefix" ? "VeiledPrefix" : "VeiledSuffix");
        expect(result.item.mods[0]).toMatchObject({ fractured: false, crafted: false });
        expect(result.item.mods.slice(1)).toEqual(item.mods.slice(1));
        expect(result.item.implicits).toEqual(item.implicits);
        expect(result.item.quality).toBe(20);
        expect(result.item.reveal).toMatchObject({
            source: bone.id,
            mark: markId(side),
            choices: [],
            omens: [],
        });
        expect(result.cost.map((entry) => entry.id)).toEqual([bone.id]);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        const target = engine.validateTarget({
            groups: item.mods.slice(1).map((entry) => ({ mods: [entry.id] })),
            unrevealedCount: { min: 1, max: 1 },
        });
        expect(
            calculateExact(engine, item, { ...bone, omens: [opposite] }, target).probability,
        ).toBe(1);
    });

    it.each([
        false,
        true,
    ])("combines the modeled item-level floor with the extracted bone floor (fractured: %s)", (fractured) => {
        for (const level of [1, 49, 86, 100]) {
            const item = marked("prefix", false, level, fractured);
            const result = engine.apply(item, bone, seededRandom(1)).item;
            const unmarked = { ...result, reveal: { ...result.reveal!, mark: undefined } };
            expect(engine.revealMinimumLevel(result)).toBe(Math.floor(level * 0.4));
            expect(engine.revealPool(result)).toEqual(
                engine
                    .revealPool(unmarked)
                    .filter((entry) => entry.mod.required_level >= Math.floor(level * 0.4)),
            );
            expect(engine.revealPool(result).length).toBeGreaterThan(0);
        }
        const ancient = engine.apply(
            marked("prefix", false, 86, fractured),
            currency("AbyssalBenchTicketJewelleryHigh"),
            seededRandom(1),
        ).item;
        expect(engine.revealMinimumLevel(ancient)).toBe(40);
        expect(engine.revealPool(ancient).every((entry) => entry.mod.required_level >= 40)).toBe(
            true,
        );
    });

    it.each([
        false,
        true,
    ])("keeps the floor and Lich guarantee through Echoes, then frees the crafted slot (fractured: %s)", (fractured) => {
        const lich = omen("OmenOnAbyssGuarenteeLichTypeMod1");
        const echoes = omen("OmenOnAbyssRerollOptions");
        const hidden = engine.apply(
            marked("suffix", false, 86, fractured),
            { ...bone, omens: [lich, omen("OmenOnAbyssAddPrefixes")] },
            seededRandom(2),
        ).item;
        expect(hidden.reveal!.omens).toEqual([lich]);
        const prepared = engine.prepareReveal(
            hidden,
            { kind: "reveal", preferred: [], omens: [echoes] },
            seededRandom(42),
        );
        expect(prepared.cost.map((entry) => entry.id)).toEqual([echoes]);
        const rerolled = engine.rerollReveal(prepared.item, seededRandom(43));
        for (const item of [prepared.item, rerolled]) {
            expect(item.reveal!.mark).toBe(markId("suffix"));
            expect(item.reveal!.choices.every((id) => engine.mod(id).required_level >= 34)).toBe(
                true,
            );
            expect(
                item.reveal!.choices.some((id) =>
                    engine.mod(id).implicit_tags.includes("ulaman_mod"),
                ),
            ).toBe(true);
            expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        }
        const result = engine.chooseRevealed(
            rerolled,
            rerolled.reveal!.choices[0]!,
            seededRandom(2),
        );
        expect(result.reveal).toBeUndefined();
        expect(result.mods.some((entry) => entry.crafted)).toBe(false);
        expect(result.mods.some((entry) => entry.fractured)).toBe(false);
        expect(result.mods.some((entry) => engine.isDesecrated(entry))).toBe(true);
        expect(
            engine
                .apply(result, method, seededRandom(1))
                .item.mods.some((entry) => engine.isAbyssalMark(entry.id)),
        ).toBe(true);
        const text = exportCraftingItemText(engine, result);
        expect(importCraftingItemText(engine, text)[0]!.item.mods).toEqual(result.mods);
    });

    it("preserves an unrelated fracture while replacing an unfractured Mark", () => {
        const item = marked("suffix", true);
        item.mods[1]!.fractured = true;
        const result = engine.apply(item, bone, seededRandom(42)).item;
        expect(result.mods.slice(1)).toEqual(item.mods.slice(1));
        const revealed = engine.apply(
            result,
            { kind: "reveal", preferred: [] },
            seededRandom(42),
        ).item;
        expect(revealed.mods.slice(1)).toEqual(item.mods.slice(1));
        expect(revealed.mods[0]!.fractured).toBe(false);
    });

    it("keeps fractured Marks under Putrefaction's separate protection rules", () => {
        const item = marked("prefix", true, 86, true);
        const putrefaction = omen("OmenOnAbyssVeilAllAndCorrupt");
        const result = engine.apply(item, { ...bone, omens: [putrefaction] }, seededRandom(42));
        expect(result.item.mods[0]).toEqual(item.mods[0]);
        expect(result.item.putrefied).toBe(true);
        expect(result.item.reveal!.mark).toBeUndefined();
        expect(engine.revealMinimumLevel(result.item)).toBe(0);
        expect(result.cost.map((entry) => entry.id)).toEqual([bone.id, putrefaction]);
    });

    it("retains bone eligibility and Breach pools when replacing fractured Marks", () => {
        for (const ticket of catalog.crafting.desecration.filter((entry) =>
            entry.itemClasses.includes("Ring"),
        )) {
            const item = marked("prefix", false, ticket.maximumItemLevel || 86, true);
            const method = { kind: "currency" as const, id: ticket.id };
            const hidden = engine.apply(item, method, seededRandom(42)).item;
            const choices = engine.revealChoices(hidden, seededRandom(42));
            const floor = Math.max(ticket.minimumModLevel, Math.floor(item.level * 0.4));
            expect(engine.revealMinimumLevel(hidden)).toBe(floor);
            expect(choices.reveal!.choices.length).toBeGreaterThan(0);
            expect(
                choices.reveal!.choices.every((id) => engine.mod(id).required_level >= floor),
            ).toBe(true);
            if (ticket.tag) {
                expect(
                    engine
                        .revealPool(hidden)
                        .some((entry) =>
                            entry.mod.spawn_weights.some((weight) => weight.tag === ticket.tag),
                        ),
                ).toBe(false);
                const low = engine.apply(
                    marked("prefix", false, 1, true),
                    method,
                    seededRandom(42),
                ).item;
                expect(
                    engine
                        .revealPool(low)
                        .some((entry) =>
                            entry.mod.spawn_weights.some((weight) => weight.tag === ticket.tag),
                        ),
                ).toBe(true);
            }
            if (ticket.maximumItemLevel)
                expect(() =>
                    engine.apply(
                        { ...item, level: ticket.maximumItemLevel + 1 },
                        method,
                        seededRandom(42),
                    ),
                ).toThrow("class or level");
        }
    });

    it("lets Putrefaction use its own replacement and reveal rules", () => {
        const putrefaction = omen("OmenOnAbyssVeilAllAndCorrupt");
        const result = engine.apply(
            marked("prefix", true),
            { ...bone, omens: [putrefaction] },
            seededRandom(42),
        );
        expect(result.item.putrefied).toBe(true);
        expect(result.item.corrupted).toBe(true);
        expect(result.item.reveal!.mark).toBeUndefined();
        expect(result.item.mods.every((entry) => engine.mod(entry.id).domain === "veiled")).toBe(
            true,
        );
        expect(engine.revealMinimumLevel(result.item)).toBe(0);
        expect(engine.revealPool(result.item).some((entry) => entry.mod.required_level < 34)).toBe(
            true,
        );
        expect(result.cost.map((entry) => entry.id)).toEqual([bone.id, putrefaction]);
    });

    it("round-trips crafted Marks through item text and rejects forged or unresolved reveal state", () => {
        const item = marked();
        const text = exportCraftingItemText(engine, item);
        expect(importCraftingItemText(engine, text)[0]!.item.mods).toEqual(item.mods);
        const hidden = engine.apply(item, bone, seededRandom(1)).item;
        for (const mark of ["IncreasedLife1", markId("suffix")])
            expect(() =>
                engine.validateItem({ ...hidden, reveal: { ...hidden.reveal!, mark } }),
            ).toThrow("origin");
        expect(() =>
            engine.validateItem({
                ...hidden,
                reveal: { ...hidden.reveal!, omens: [omen("OmenOnAbyssAddPrefixes")] },
            }),
        ).toThrow("not consumed");
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(item, currency("AbyssalBenchTicketWeapon"), random)).toThrow(
            "item class",
        );
        expect(() => engine.apply(item, method, random)).toThrow("crafted modifier");
        expect(pick).not.toHaveBeenCalled();
    });

    it("calculates deterministic bone costs and simulates the complete three-step craft", () => {
        const necromancy = omen("OmenOnAbyssAddPrefixes");
        const directedBone = { ...bone, omens: [necromancy] };
        const target = engine.validateTarget({ groups: [], unrevealedCount: { min: 1, max: 1 } });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: marked("suffix"),
            method: directedBone,
            target,
            steps: [{ id: "bone", method: directedBone, condition: target }],
            prices: { [bone.id]: 3, [necromancy]: 99, [method.id]: 7 },
            seed: 42,
            iterations: 500,
            maxActions: 3,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBe(3);
        expect(exact.spending[necromancy]).toBeUndefined();
        const initial = engine.addStartingMod(
            engine.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        const complete = craftingProjectSchema.parse({
            ...project,
            item: initial,
            target: { groups: [], unrevealedCount: { min: 0, max: 0 } },
            steps: [
                { id: "essence", method, condition: { groups: [] }, onSuccess: "bone" },
                { id: "bone", method: directedBone, condition: target, onSuccess: "reveal" },
                {
                    id: "reveal",
                    method: { kind: "reveal", preferred: [] },
                    condition: { groups: [] },
                },
            ],
        });
        const simulation = new CraftingSimulation(catalog, complete, true);
        for (let trial = 0; trial < complete.iterations; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBe(1);
        expect(result.meanCost).toBe(10);
        expect(result.spending).toEqual({ [bone.id]: 500, [method.id]: 500 });
        for (const sample of result.samples) {
            expect(sample.item.mods).toHaveLength(1);
            expect(sample.item.mods[0]!.crafted).toBe(false);
            expect(engine.isDesecrated(sample.item.mods[0]!)).toBe(true);
            expect(engine.mod(sample.item.mods[0]!.id).required_level).toBeGreaterThanOrEqual(34);
        }
    });

    it("calculates fracture-to-desecration routes and simulates their final reveals", () => {
        const full = marked("suffix", true);
        const item = { ...full, mods: full.mods.slice(0, 4) };
        const fracture = {
            kind: "currency" as const,
            id: catalog.crafting.currencies.find((entry) => entry.action === "fracture_random_mod")!
                .id,
        };
        const fractured = engine.apply(item, fracture, {
            pick: (choices) => choices[0]!.value,
            integer: (min) => min,
        }).item;
        expect(fractured.mods[0]).toMatchObject({
            id: markId("suffix"),
            fractured: true,
            crafted: true,
        });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, fractured))[0]!.item,
        ).toEqual(fractured);
        const necromancy = omen("OmenOnAbyssAddPrefixes");
        const directed = { ...bone, omens: [necromancy] };
        const hidden = { groups: [], unrevealedCount: { min: 1, max: 1 } };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            method: directed,
            target: hidden,
            steps: [
                {
                    id: "fracture",
                    method: fracture,
                    condition: { groups: [{ mods: [markId("suffix")], fractured: true }] },
                    onSuccess: "bone",
                    onFailure: "failure",
                },
                { id: "bone", method: directed, condition: hidden },
            ],
            prices: { [fracture.id]: 8, [bone.id]: 3, [necromancy]: 99 },
            seed: 42,
            iterations: 500,
            maxActions: 3,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 0.25,
            meanCost: 8.75,
            totalActions: 1.25,
            spending: { [fracture.id]: 1, [bone.id]: 0.25 },
            errors: {},
        });
        const complete = craftingProjectSchema.parse(
            JSON.parse(
                JSON.stringify({
                    ...project,
                    target: { groups: [], unrevealedCount: { min: 0, max: 0 } },
                    steps: [
                        project.steps[0],
                        { ...project.steps[1], onSuccess: "reveal" },
                        {
                            id: "reveal",
                            method: { kind: "reveal", preferred: [] },
                            condition: { groups: [] },
                        },
                    ],
                }),
            ),
        );
        const simulation = new CraftingSimulation(catalog, complete, true);
        for (let trial = 0; trial < complete.iterations; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeGreaterThan(0.19);
        expect(result.probability).toBeLessThan(0.31);
        expect(result.spending).toEqual({ [fracture.id]: 500, [bone.id]: result.successes });
        expect(result.meanCost).toBe(8 + (3 * result.successes) / 500);
        for (const sample of result.samples.filter((entry) => entry.success)) {
            expect(sample.item.mods.slice(1)).toEqual(item.mods.slice(1));
            expect(engine.isDesecrated(sample.item.mods[0]!)).toBe(true);
            expect(sample.item.mods[0]).toMatchObject({ fractured: false, crafted: false });
            expect(engine.mod(sample.item.mods[0]!.id).required_level).toBeGreaterThanOrEqual(34);
        }
    });
});
