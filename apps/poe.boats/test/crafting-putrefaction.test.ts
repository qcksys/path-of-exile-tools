import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
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

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const baseId = Object.entries(catalog.bases).find(([, base]) => base.name === "Golden Hoop")![0];
const omen = "Metadata/Items/Currency/OmenOnAbyssVeilAllAndCorrupt";
const echoes = "Metadata/Items/Currency/OmenOnAbyssRerollOptions";
const bone = "Metadata/Items/Currency/AbyssalBenchTicketJewellery";
const method = { kind: "currency" as const, id: bone, omens: [omen] };
const six = () => ({
    pick: <T>(choices: { value: T; weight: number }[]) =>
        choices.find((entry) => entry.value === 6)?.value ?? choices[0]!.value,
    integer: (min: number) => min,
});
const prepared = () => engine.validateItem({ ...engine.createItem(baseId), rarity: "rare" });

describe("PoE 2 Putrefaction", () => {
    it("fills six affixes with separate unrevealed slots, corrupts, retains fractures and charges both ingredients", () => {
        let item = engine.addStartingMod(prepared(), "IncreasedLife1", seededRandom(1));
        item.mods[0]!.fractured = true;
        const fracture = structuredClone(item.mods[0]!);
        item = engine.addStartingMod(
            item,
            engine.pool(item, { side: "suffix" })[0]!.id,
            seededRandom(1),
        );
        const before = structuredClone(item);
        const result = engine.apply(item, method, six());
        expect(item).toEqual(before);
        expect(result.item.corrupted).toBe(true);
        let revealed = result.item;
        while (revealed.reveal)
            revealed = engine.apply(
                revealed,
                { kind: "reveal", preferred: [] },
                seededRandom(42),
            ).item;
        expect(engine.unrevealedCount(revealed)).toBe(0);
        expect(result.item.putrefied).toBe(true);
        expect(result.item.mods).toHaveLength(6);
        expect(result.item.mods[0]).toEqual(fracture);
        expect(engine.counts(result.item)).toEqual({ prefixes: 3, suffixes: 3 });
        expect(engine.unrevealedCount(result.item)).toBe(5);
        expect(result.item.reveal).toEqual({
            mod: "VeiledPrefix",
            index: 1,
            source: bone,
            choices: [],
        });
        expect(result.item.implicits).toEqual(item.implicits);
        expect(result.cost.map((entry) => [entry.id, entry.amount])).toEqual([
            [bone, 1],
            [omen, 1],
        ]);
        expect(availableOmens(catalog, method).some((entry) => entry.id === omen)).toBe(true);
    });

    it.each(catalog.crafting.desecration)("honors $id class and maximum-level rules", (ticket) => {
        const base = Object.entries(catalog.bases).find(
            ([id, entry]) =>
                ticket.itemClasses.includes(entry.item_class) &&
                entry.rarities.includes("rare") &&
                !entry.corrupted &&
                engine.pool({
                    ...engine.createItem(id, ticket.maximumItemLevel || 86),
                    rarity: "rare",
                }).length > 0,
        )![0];
        const item = engine.validateItem({
            ...engine.createItem(base, ticket.maximumItemLevel || 86),
            rarity: "rare",
        });
        const result = engine.apply(
            item,
            { kind: "currency", id: ticket.id, omens: [omen] },
            seededRandom(42),
        );
        expect(result.item.mods.length).toBeLessThanOrEqual(engine.limits(result.item).max);
        expect(engine.unrevealedCount(result.item)).toBe(result.item.mods.length);
        expect(result.item.corrupted).toBe(true);
        let revealed = result.item;
        while (revealed.reveal)
            revealed = engine.apply(
                revealed,
                { kind: "reveal", preferred: [] },
                seededRandom(42),
            ).item;
        expect(engine.unrevealedCount(revealed)).toBe(0);
        expect(revealed.mods).toHaveLength(result.item.mods.length);
        if (ticket.maximumItemLevel)
            expect(() =>
                engine.apply(
                    { ...item, level: ticket.maximumItemLevel + 1 },
                    { kind: "currency", id: ticket.id, omens: [omen] },
                    seededRandom(42),
                ),
            ).toThrow("class or level");
    });

    it("ignores Ancient floors and otherworldly pools and resolves only the selected slot", () => {
        for (const id of [
            "Metadata/Items/Currency/AbyssalBenchTicketJewelleryHigh",
            "Metadata/Items/Currency/AbyssalBenchTicketBreach",
        ]) {
            let item = engine.apply(
                prepared(),
                { kind: "currency", id, omens: [omen] },
                six(),
            ).item;
            item = engine.selectUnrevealed(item, 5);
            const pool = engine.revealPool(item);
            expect(
                pool.every(
                    (entry) =>
                        [engine.base(item).domain, "desecrated"].includes(entry.mod.domain) &&
                        !entry.mod.is_essence_only,
                ),
            ).toBe(true);
            expect(pool.some((entry) => entry.mod.domain === "desecrated")).toBe(true);
            const empty = { ...item, mods: [] };
            const ordinary = engine.pool(empty).map((entry) => entry.id);
            const exclusive = engine.pool(empty, { domain: "desecrated" }).map((entry) => entry.id);
            expect(pool.every((entry) => [...ordinary, ...exclusive].includes(entry.id))).toBe(
                true,
            );
            expect(pool.some((entry) => entry.mod.required_level < 40)).toBe(true);
            const before = structuredClone(item);
            const preparedReveal = engine.prepareReveal(
                item,
                { kind: "reveal", preferred: [], omens: [echoes] },
                seededRandom(42),
            );
            expect(preparedReveal.cost.map((entry) => entry.id)).toEqual([echoes]);
            item = preparedReveal.item;
            expect(() => engine.selectUnrevealed(item, 0)).toThrow("before switching");
            expect(
                engine.prepareReveal(
                    item,
                    { kind: "reveal", preferred: [], omens: [echoes] },
                    seededRandom(1),
                ).cost,
            ).toEqual([]);
            item = engine.rerollReveal(item, seededRandom(43));
            expect(item.reveal!.echoes!.remaining).toBe(0);
            expect(() => engine.rerollReveal(item, seededRandom(1))).toThrow("no reveal reroll");
            item = engine.chooseRevealed(item, item.reveal!.choices[0]!, seededRandom(44));
            expect(engine.isDesecrated(item.mods[5]!)).toBe(true);
            expect(item.mods.slice(0, 5)).toEqual(before.mods.slice(0, 5));
            expect(engine.unrevealedCount(item)).toBe(5);
            expect(item.reveal).toEqual({ mod: "VeiledPrefix", index: 0, source: id, choices: [] });
            while (item.reveal)
                item = engine.apply(item, { kind: "reveal", preferred: [] }, seededRandom(45)).item;
            expect(engine.unrevealedCount(item)).toBe(0);
            expect(item.mods.every((entry) => engine.isDesecrated(entry))).toBe(true);
            const groups = item.mods.flatMap((entry) => engine.mod(entry.id).groups);
            expect(new Set(groups).size).toBe(groups.length);
            expect(() =>
                engine.apply(item, { kind: "currency", id: bone }, seededRandom(1)),
            ).toThrow("uncorrupted");
        }
    });

    it("rejects conflicting omens, invalid input states and forged multi-reveal states", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const id of ["OmenOnAbyssAddPrefixes", "OmenOnAbyssGuarenteeLichTypeMod1"])
            expect(() =>
                engine.apply(
                    prepared(),
                    { ...method, omens: [omen, `Metadata/Items/Currency/${id}`] },
                    random,
                ),
            ).toThrow("cannot be combined");
        for (const item of [
            { ...prepared(), rarity: "magic" },
            { ...prepared(), corrupted: true },
            { ...prepared(), mirrored: true },
        ] satisfies CraftingItem[])
            expect(() => engine.apply(item, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const item = engine.apply(prepared(), method, six()).item;
        for (const invalid of [
            { ...item, putrefied: undefined },
            { ...item, corrupted: false },
            { ...item, reveal: undefined },
            { ...item, reveal: { ...item.reveal!, index: 6 } },
            { ...item, reveal: { ...item.reveal!, index: 4 } },
        ])
            expect(() => engine.validateItem(invalid)).toThrow();
        expect(() => engine.selectUnrevealed(item, -1)).toThrow("Choose an unrevealed");
        const duplicate = engine.rollMod("IncreasedLife1", seededRandom(1), { desecrated: true });
        expect(() =>
            engine.validateItem({ ...item, mods: [duplicate, duplicate], reveal: undefined }),
        ).toThrow("same group");
        expect(() =>
            engine.validateTarget({ groups: [], unrevealedCount: { min: 3, max: 2 } }),
        ).toThrow();
    });

    it("retains corruption and costs when the extracted reveal pool has no eligible choices", () => {
        const narrow = {
            ...catalog,
            mods: Object.fromEntries(
                Object.entries(catalog.mods).filter(
                    ([, mod]) =>
                        !["prefix", "suffix"].includes(mod.generation_type) ||
                        mod.domain === "veiled",
                ),
            ),
        };
        const current = new CraftingEngine(narrow);
        const result = current.apply(prepared(), method, six());
        expect(result.item).toMatchObject({ corrupted: true, putrefied: true });
        expect(current.unrevealedCount(result.item)).toBe(6);
        expect(current.revealPool(result.item)).toEqual([]);
        expect(result.cost.map(({ id, amount }) => [id, amount])).toEqual([
            [bone, 1],
            [omen, 1],
        ]);
        expect(current.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const reveal = { kind: "reveal" as const, preferred: [], omens: [echoes] };
        expect(() => current.prepareReveal(result.item, reveal, random)).toThrow(
            "No eligible reveal choices",
        );
        expect(pick).not.toHaveBeenCalled();
        expect(result.item.reveal?.echoes).toBeUndefined();
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: prepared(),
            method,
            target: { groups: [], unrevealedCount: { min: 0, max: 0 } },
            steps: [
                { id: "putrefy", method, condition: { groups: [] }, onSuccess: "reveal" },
                { id: "reveal", method: reveal, condition: { groups: [] }, onSuccess: "success" },
            ],
            prices: { [bone]: 2, [omen]: 3, [echoes]: 7 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const exact = calculateProcessExact(current, project);
        expect(exact.probability).toBe(0);
        expect(exact.meanCost).toBeCloseTo(5);
        expect(Object.keys(exact.errors)).toEqual(["No eligible reveal choices."]);
        expect(exact.errors["No eligible reveal choices."]).toBeCloseTo(1);
        const simulation = new CraftingSimulation(narrow, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ probability: 0, meanCost: 5 });
        expect(simulation.result().errors).toEqual({ "No eligible reveal choices.": 100 });
    });

    it("keeps an exhausted prefix slot while allowing other slots on a level-one Golden Plate to reveal", () => {
        const id = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Golden Plate",
        )![0];
        const ticket = catalog.crafting.desecration.find((entry) =>
            entry.itemClasses.includes("Body Armour"),
        )!;
        const start = { ...engine.createItem(id, 1), rarity: "rare" as const };
        let item = engine.apply(
            start,
            { kind: "currency", id: ticket.id, omens: [omen] },
            six(),
        ).item;
        expect(engine.counts(item)).toEqual({ prefixes: 3, suffixes: 3 });
        for (const preferred of [["IncreasedLife1"], ["AttackerTakesDamage1"]])
            item = engine.apply(item, { kind: "reveal", preferred }, six()).item;
        expect(item.reveal?.index).toBe(2);
        expect(engine.revealPool(item)).toEqual([]);
        expect(engine.unrevealedCount(item)).toBe(4);
        expect(() =>
            engine.prepareReveal(item, { kind: "reveal", preferred: [], omens: [echoes] }, six()),
        ).toThrow("No eligible reveal choices");
        const suffix = engine.selectUnrevealed(item, 3);
        expect(engine.revealPool(suffix).length).toBeGreaterThan(0);
        const revealed = engine.apply(suffix, { kind: "reveal", preferred: [] }, six()).item;
        expect(engine.unrevealedCount(revealed)).toBe(3);
        expect(revealed.reveal?.index).toBe(2);
        expect(revealed.mods.slice(0, 3)).toEqual(item.mods.slice(0, 3));
        expect(engine.validateItem(JSON.parse(JSON.stringify(revealed)))).toEqual(revealed);
    });

    it("persists partial choices and completed mixed-source modifiers in JSON and item text", () => {
        let item = engine.apply(prepared(), method, six()).item;
        item = engine.prepareReveal(
            item,
            { kind: "reveal", preferred: [], omens: [echoes] },
            seededRandom(42),
        ).item;
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        expect(() => exportCraftingItemText(engine, item)).toThrow("unrevealed");
        const exclusive = engine
            .revealPool(item)
            .find((entry) => entry.mod.domain === "desecrated")!;
        item.reveal!.choices = [exclusive.id];
        item = engine.chooseRevealed(item, exclusive.id, seededRandom(42));
        expect(engine.mod(item.mods[0]!.id).domain).toBe("desecrated");
        while (item.reveal)
            item = engine.apply(item, { kind: "reveal", preferred: [] }, seededRandom(42)).item;
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("Corrupted");
        expect(text.match(/\{desecrated\}/g)!.length).toBeGreaterThanOrEqual(6);
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        const imported = importCraftingItemText(engine, text)[0]!;
        expect(imported.item.putrefied).toBe(true);
        expect(imported.item.mods.map((entry) => entry.id)).toEqual(
            item.mods.map((entry) => entry.id),
        );
        expect(imported.item.mods.every((entry) => engine.isDesecrated(entry))).toBe(true);
        expect(exportCraftingItemText(engine, imported.item)).toBe(text);
        expect(imported.warnings).toEqual([]);
    });

    it("calculates modeled affix counts and a reveal-until-finished process with per-reveal Echoes costs", () => {
        let item = prepared();
        for (const side of ["prefix", "prefix", "suffix", "suffix"])
            item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(1));
        item.mods = item.mods.map((entry) => ({ ...entry, fractured: true }));
        const kept = item.mods.map((entry) => entry.id);
        const remaining = ["prefix", "suffix"].map((side) => engine.pool(item, { side })[0]!.id);
        const narrow = structuredClone(catalog);
        narrow.mods = Object.fromEntries(
            Object.entries(narrow.mods).filter(([id]) =>
                [
                    ...kept,
                    ...remaining,
                    ...engine.base(item).implicits,
                    "VeiledPrefix",
                    "VeiledSuffix",
                ].includes(id),
            ),
        );
        const small = new CraftingEngine(narrow);
        const sixAffixes = small.validateTarget({ groups: [], affixCount: { min: 6, max: 6 } });
        expect(calculateExact(small, item, method, sixAffixes).probability).toBeCloseTo(1 / 12);
        const done = small.validateTarget({ groups: [], unrevealedCount: { min: 0, max: 0 } });
        const reveal = { kind: "reveal" as const, preferred: [], omens: [echoes] };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: narrow.patch,
            item,
            method,
            target: done,
            steps: [
                { id: "putrefy", method, condition: done, onFailure: "reveal" },
                { id: "reveal", method: reveal, condition: done, onFailure: "reveal" },
            ],
            useProcess: true,
            prices: { [bone]: 2, [omen]: 3, [echoes]: 1 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const result = calculateProcessExact(small, project);
        expect(result.probability).toBe(1);
        expect(result.totalActions).toBeCloseTo(17 / 12);
        expect(result.meanCost).toBeCloseTo(65 / 12);
        expect(result.errors).toEqual({});
        const simulation = new CraftingSimulation(narrow, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBe(1);
        expect(simulation.result().meanCost).toBeCloseTo(65 / 12, 1);
        expect(simulation.result().errors).toEqual({});
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
