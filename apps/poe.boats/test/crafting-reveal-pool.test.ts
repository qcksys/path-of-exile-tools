import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { CraftingSimulation, calculateProcessExact } from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { engine as poe1, baseId as poe1Base } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(([, entry]) => entry.name === "Golden Hoop")![0];
const empty = { ...engine.createItem(base), rarity: "rare" as const };
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const omen = (suffix: string) =>
    catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;
const bone = {
    ...currency("abyssal_bench_ticket_jewellery"),
    omens: [omen("OmenOnAbyssAddPrefixes")],
};
const hidden = () => engine.apply(empty, bone, seededRandom(1)).item;

function ordinaryReveal() {
    const item = hidden();
    const choice = engine
        .revealPool(item)
        .find((entry) => entry.mod.domain === engine.base(item).domain)!;
    return engine.chooseRevealed(
        { ...item, reveal: { ...item.reveal!, choices: [choice.id] } },
        choice.id,
        seededRandom(2),
    );
}

describe("PoE 2 mixed reveal pool and desecrated status", () => {
    it("includes ordinary and exclusive modifiers with their extracted weights and bone floor", () => {
        const item = engine.apply(
            empty,
            {
                ...currency("abyssal_bench_ticket_jewellery_high"),
                omens: bone.omens,
            },
            seededRandom(1),
        ).item;
        const pool = engine.revealPool(item);
        const options = { side: "prefix", ignoreMeta: true };
        const expected = [
            ...engine.pool(empty, { ...options, domain: "desecrated" }),
            ...engine.pool(empty, options),
        ].filter((entry) => entry.mod.required_level >= 40);
        expect(pool).toEqual(expected);
        expect(new Set(pool.map((entry) => entry.mod.domain))).toEqual(
            new Set(["desecrated", engine.base(item).domain]),
        );
        const ordinary = pool.find((entry) => entry.mod.domain !== "desecrated")!;
        expect(engine.revealedModifiers(empty)).toContainEqual(ordinary);
        expect(engine.validateMethod({ kind: "reveal", preferred: [ordinary.id] })).toMatchObject({
            preferred: [ordinary.id],
        });
    });

    it("keeps an ordinary reveal desecrated through Divine rolls and removes it with Light", () => {
        const item = ordinaryReveal();
        const mod = item.mods[0]!;
        expect(engine.mod(mod.id).domain).toBe(engine.base(item).domain);
        expect(mod).toMatchObject({ desecrated: true, crafted: false, fractured: false });
        expect(() => engine.apply(item, bone, seededRandom(1))).toThrow("existing desecrated");
        const divine = engine.apply(item, currency("reroll_mod_values"), seededRandom(3)).item;
        expect(divine.mods[0]).toMatchObject({ id: mod.id, desecrated: true });
        const removed = engine.apply(
            divine,
            {
                ...currency("remove_random_mod"),
                omens: [omen("OmenOnAnnulRemoveAbyssMod")],
            },
            seededRandom(3),
        );
        expect(removed.item.mods).toEqual([]);
        expect(removed.cost).toHaveLength(2);
        expect(engine.apply(removed.item, bone, seededRandom(4)).item.reveal).toBeDefined();
        expect(item.mods[0]).toEqual(mod);
    });

    it("round-trips ordinary desecrated modifiers through JSON, PoB and English annotations", () => {
        const item = ordinaryReveal();
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("{desecrated}");
        for (const { item: imported } of importCraftingItemText(engine, text)) {
            expect(imported.mods).toEqual(item.mods);
            expect(engine.isDesecrated(imported.mods[0]!)).toBe(true);
            expect(exportCraftingItemText(engine, imported)).toBe(text);
        }
        const native = text
            .replaceAll("{desecrated}", "")
            .split("\n")
            .map((line) =>
                line.includes(`{modGroup:${item.mods[0]!.id}}`) ? `${line} (desecrated)` : line,
            )
            .join("\n");
        expect(importCraftingItemText(engine, native)[0]!.item.mods).toEqual(item.mods);
    });

    it("enforces the one-desecration limit and rejects forged state on ineligible modifiers", () => {
        const item = ordinaryReveal();
        const second = engine.pool(item)[0]!;
        expect(() =>
            engine.validateItem({
                ...item,
                mods: [
                    ...item.mods,
                    engine.rollMod(second.id, seededRandom(1), { desecrated: true }),
                ],
            }),
        ).toThrow("Only one");
        expect(() =>
            engine.validateItem({ ...item, mods: [{ ...item.mods[0], fractured: true }] }),
        ).toThrow("cannot be fractured");
        expect(() =>
            engine.validateItem({ ...item, mods: [{ ...item.mods[0], crafted: true }] }),
        ).toThrow("cannot be marked");
        expect(() =>
            engine.validateItem({
                ...empty,
                implicits: empty.implicits.map((entry) => ({ ...entry, desecrated: true })),
            }),
        ).toThrow("Implicit modifiers cannot");
        const original = poe1.addStartingMod(
            poe1.createItem(poe1Base),
            "IncreasedLife1",
            seededRandom(1),
        );
        expect(() =>
            poe1.validateItem({ ...original, mods: [{ ...original.mods[0], desecrated: true }] }),
        ).toThrow("cannot be marked");
    });

    it("marks manual ordinary reveal choices without changing ordinary starting modifiers", () => {
        const id = ordinaryReveal().mods[0]!.id;
        const natural = engine.addStartingMod(empty, id, seededRandom(1));
        const revealed = engine.addStartingMod(empty, id, seededRandom(1), "revealed");
        expect(natural.mods[0]!.desecrated).toBeUndefined();
        expect(revealed.mods[0]!.desecrated).toBe(true);
        expect(revealed.mods[0]!.crafted).toBe(false);
        expect(engine.validateItem(JSON.parse(JSON.stringify(natural)))).toEqual(natural);
    });

    it.each([
        false,
        true,
    ])("enumerates and simulates the weighted mixed pool (Lich guarantee: %s)", (lich) => {
        const exclusive = engine.pool(empty, {
            domain: "desecrated",
            side: "prefix",
            tag: "ulaman_mod",
        })[0]!;
        const groups = new Set(exclusive.mod.groups);
        const ordinary = engine.pool(empty, { side: "prefix" }).filter((entry) => {
            if (groups.size >= 4 || entry.mod.groups.some((group) => groups.has(group)))
                return false;
            for (const group of entry.mod.groups) groups.add(group);
            return true;
        });
        expect(ordinary).toHaveLength(3);
        const reduced = structuredClone(catalog);
        const selected = [exclusive, ...ordinary];
        const keep = new Set([
            "VeiledPrefix",
            ...empty.implicits.map((entry) => entry.id),
            ...selected.map((entry) => entry.id),
        ]);
        reduced.mods = Object.fromEntries(
            Object.entries(reduced.mods).filter(([id]) => keep.has(id)),
        );
        for (const entry of selected)
            reduced.mods[entry.id]!.spawn_weights = [
                { tag: engine.base(empty).tags[0]!, weight: entry.id === ordinary[0]!.id ? 4 : 1 },
            ];
        const small = new CraftingEngine(reduced);
        const method = {
            ...bone,
            omens: [...bone.omens, ...(lich ? [omen("OmenOnAbyssGuarenteeLichTypeMod1")] : [])],
        };
        const target = small.validateTarget({ groups: [{ mods: [ordinary[0]!.id] }] });
        const reveal = { kind: "reveal" as const, preferred: [ordinary[0]!.id] };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: empty,
            target,
            method,
            steps: [
                { id: "bone", method, condition: { groups: [] }, onSuccess: "reveal" },
                { id: "reveal", method: reveal, condition: target },
            ],
            prices: Object.fromEntries(small.costs(method).map((cost) => [cost.id, 2])),
            seed: 15,
            iterations: 400,
            maxActions: 2,
        });
        const expected = 14 / 15;
        const hidden = small.apply(empty, method, seededRandom(1)).item;
        expect(small.revealProbabilities(hidden).get(ordinary[0]!.id)).toBeCloseTo(expected, 12);
        const exact = calculateProcessExact(small, project);
        expect(exact.probability).toBeCloseTo(expected);
        expect(exact.meanCost).toBeCloseTo(lich ? 6 : 4);
        const simulation = new CraftingSimulation(reduced, project, true);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeCloseTo(expected, 1);
        expect(result.meanCost).toBe(lich ? 6 : 4);
        for (const sample of result.samples)
            expect(sample.item.mods.filter((entry) => small.isDesecrated(entry))).toHaveLength(1);
    });
});
