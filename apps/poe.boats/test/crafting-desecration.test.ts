import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(([, base]) => base.item_class === "Ring")![0];
const currency = (action: string): Extract<CraftingMethod, { kind: "currency" }> => ({
    kind: "currency",
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const bone = currency("abyssal_bench_ticket_jewellery");
const omen = (suffix: string) =>
    catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;

function ring(prefixes: number, suffixes: number) {
    let item: CraftingItem = { ...engine.createItem(base), rarity: "rare" };
    for (const [side, count] of [
        ["prefix", prefixes],
        ["suffix", suffixes],
    ] as const)
        for (let i = 0; i < count; i++)
            item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(i));
    return item;
}

describe("PoE 2 desecration replacement", () => {
    it("replaces one modifier on a full item and preserves every other roll", () => {
        const original = ring(3, 3);
        const before = structuredClone(original);
        for (let seed = 0; seed < 30; seed++) {
            const result = engine.apply(original, bone, seededRandom(seed));
            expect(original).toEqual(before);
            expect(result.cost).toEqual(engine.costs(bone));
            expect(result.item.mods).toHaveLength(6);
            const retained = result.item.mods.filter(
                (entry) => entry.id !== result.item.reveal!.mod,
            );
            expect(retained).toHaveLength(5);
            for (const entry of retained) expect(original.mods).toContainEqual(entry);
            expect(engine.counts(result.item)).toEqual({ prefixes: 3, suffixes: 3 });
            const revealed = engine.apply(
                result.item,
                { kind: "reveal", preferred: [] },
                seededRandom(seed),
            ).item;
            expect(revealed.mods).toHaveLength(6);
            expect(revealed.mods.filter((entry) => engine.isDesecrated(entry))).toHaveLength(1);
        }
    });

    it("uses an open side without removing modifiers unless a directional omen requires replacement", () => {
        const original = ring(3, 1);
        for (let seed = 0; seed < 30; seed++) {
            const item = engine.apply(original, bone, seededRandom(seed)).item;
            expect(engine.mod(item.reveal!.mod).generation_type).toBe("suffix");
            expect(item.mods).toHaveLength(5);
            expect(item.mods.slice(0, 4)).toEqual(original.mods);
        }
        const target = engine.validateTarget({ groups: [{ mods: [original.mods[0]!.id] }] });
        expect(calculateExact(engine, original, bone, target).probability).toBe(1);
        const directed = { ...bone, omens: [omen("OmenOnAbyssAddPrefixes")] };
        expect(calculateExact(engine, original, directed, target).probability).toBeCloseTo(2 / 3);
    });

    it("honors directional omens and retains fractured modifiers during replacement", () => {
        const original = ring(1, 3);
        original.mods[1]!.fractured = true;
        const method = { ...bone, omens: [omen("OmenOnAbyssAddSuffixes")] };
        const removedIds = new Set<string>();
        for (let seed = 0; seed < 30; seed++) {
            const item = engine.apply(original, method, seededRandom(seed)).item;
            expect(item.mods).toHaveLength(4);
            expect(item.mods).toContainEqual(original.mods[0]);
            expect(item.mods).toContainEqual(original.mods[1]);
            expect(engine.mod(item.reveal!.mod).generation_type).toBe("suffix");
            const removed = original.mods.find(
                (entry) => !item.mods.some((mod) => mod.id === entry.id),
            )!;
            expect(engine.mod(removed.id).generation_type).toBe("suffix");
            removedIds.add(removed.id);
        }
        expect(removedIds.size).toBe(2);
        const target = engine.validateTarget({ groups: [{ mods: [original.mods[2]!.id] }] });
        expect(calculateExact(engine, original, method, target).probability).toBeCloseTo(1 / 2);
    });

    it("runs full-item replacement and reveal in the process simulator", () => {
        const item = ring(3, 3);
        const target = engine.validateTarget({
            groups: [],
            rarity: "rare",
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            target,
            method: bone,
            steps: [
                { id: "desecrate", method: bone, condition: { groups: [] }, onSuccess: "reveal" },
                { id: "reveal", method: { kind: "reveal", preferred: [] }, condition: target },
            ],
            prices: { [bone.id]: 3 },
            seed: 1,
            iterations: 20,
            maxActions: 2,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let i = 0; i < 20; i++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 20,
            totalActions: 40,
            meanCost: 3,
            spending: { [bone.id]: 20 },
        });
    });

    it("checks bone level restrictions before consuming randomness or modifying the item", () => {
        const item = ring(3, 3);
        const before = structuredClone(item);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() =>
            engine.apply(item, currency("abyssal_bench_ticket_jewellery_low"), random),
        ).toThrow("level");
        expect(pick).not.toHaveBeenCalled();
        expect(item).toEqual(before);
    });

    it("weights full-item removal uniformly across unfractured modifiers before selecting the free side", () => {
        const original = ring(3, 3);
        original.mods[0]!.fractured = true;
        original.mods[1]!.fractured = true;
        const prefix = engine.validateTarget({ groups: [{ mods: ["VeiledPrefix"] }] });
        const suffix = engine.validateTarget({ groups: [{ mods: ["VeiledSuffix"] }] });
        expect(calculateExact(engine, original, bone, prefix).probability).toBeCloseTo(1 / 4);
        expect(calculateExact(engine, original, bone, suffix).probability).toBeCloseTo(3 / 4);
        for (const mod of original.mods.slice(2)) {
            const target = engine.validateTarget({ groups: [{ mods: [mod.id] }] });
            expect(calculateExact(engine, original, bone, target).probability).toBeCloseTo(3 / 4);
        }
    });

    it("retains empty hidden outcomes from extracted bone floors and refuses a later reveal without spending Echoes", () => {
        const sceptre = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Rattling Sceptre",
        )![0];
        const input = { ...engine.createItem(sceptre, 1), rarity: "rare" as const };
        const high = currency("abyssal_bench_ticket_weapon_high");
        const result = engine.apply(input, high, seededRandom(1));
        expect(result.cost).toEqual(engine.costs(high));
        expect(result.item.reveal).toBeDefined();
        expect(engine.revealPool(result.item)).toEqual([]);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        expect(() => exportCraftingItemText(engine, result.item)).toThrow("Use JSON export");
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() =>
            engine.prepareReveal(
                result.item,
                {
                    kind: "reveal",
                    preferred: [],
                    omens: [omen("OmenOnAbyssRerollOptions")],
                },
                random,
            ),
        ).toThrow("No eligible reveal choices");
        expect(pick).not.toHaveBeenCalled();
        expect(result.item.reveal!.echoes).toBeUndefined();
    });

    it("keeps unfavorable removal branches and their completed costs in exact and sampled processes", () => {
        let item = ring(3, 0);
        const eligible = engine
            .pool(item, { side: "suffix" })
            .find((entry) => entry.mod.required_level >= 40)!;
        item = engine.addStartingMod(item, eligible.id, seededRandom(1));
        while (item.mods.length < 6)
            item = engine.addStartingMod(
                item,
                engine.pool(item, { side: "suffix" })[0]!.id,
                seededRandom(1),
            );
        expect(
            item.mods.filter((mod) => engine.mod(mod.id).required_level >= 40).map((mod) => mod.id),
        ).toEqual([eligible.id]);
        const keep = new Set([...item.mods, ...item.implicits].map((mod) => mod.id));
        keep.add("VeiledPrefix");
        keep.add("VeiledSuffix");
        const restricted = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(Object.entries(catalog.mods).filter(([id]) => keep.has(id))),
        });
        const method = {
            ...currency("abyssal_bench_ticket_jewellery_high"),
            omens: [omen("OmenOnAbyssAddSuffixes")],
        };
        const echoes = omen("OmenOnAbyssRerollOptions");
        const target = engine.validateTarget({ groups: [{ mods: [eligible.id] }] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [
                { id: "bone", method, condition: { groups: [] }, onSuccess: "reveal" },
                {
                    id: "reveal",
                    method: { kind: "reveal", preferred: [], omens: [echoes] },
                    condition: target,
                },
            ],
            prices: { [method.id]: 3, [method.omens[0]!]: 2, [echoes]: 7 },
            seed: 42,
            iterations: 600,
            maxActions: 2,
        });
        expect(calculateExact(restricted, item, method, target).probability).toBeCloseTo(2 / 3);
        const exact = calculateProcessExact(restricted, project);
        expect(exact.probability).toBeCloseTo(1 / 3);
        expect(exact.errors["No eligible reveal choices."]).toBeCloseTo(2 / 3);
        expect(exact.meanCost).toBeCloseTo(5 + 7 / 3);
        expect(exact.spending[method.id]).toBeCloseTo(1);
        expect(exact.spending[echoes]).toBeCloseTo(1 / 3);
        const simulation = new CraftingSimulation(restricted.catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        const result = simulation.result();
        expect(result.probability).toBeCloseTo(1 / 3, 1);
        expect(result.meanCost).toBeCloseTo(5 + 7 * result.probability);
        expect(result.spending[method.id]).toBe(600);
        const process = new CraftingProcess(restricted, project, {
            pick: (choices) => choices[choices.length - 1]!.value,
            integer: (min) => min,
        });
        process.advance();
        const hidden = process.result().item;
        expect(restricted.revealPool(hidden)).toEqual([]);
        process.advance();
        expect(process.result()).toMatchObject({
            item: hidden,
            error: "No eligible reveal choices.",
            actions: 1,
            spending: { [method.id]: 1, [method.omens[0]!]: 1 },
        });
    });

    it("allows the Breach bone to combine a Lich omen with a directional omen", () => {
        const ticket = catalog.crafting.desecration.find((entry) => entry.tag)!;
        const method = { kind: "currency" as const, id: ticket.id };
        const sovereign = omen("OmenOnAbyssGuarenteeLichTypeMod1");
        expect(availableOmens(catalog, method).map((entry) => entry.id)).toContain(sovereign);
        const combined = { ...method, omens: [sovereign, omen("OmenOnAbyssAddSuffixes")] };
        expect(engine.validateMethod(combined)).toEqual(combined);
        expect(availableOmens(catalog, method).map((entry) => entry.id)).toContain(
            omen("OmenOnAbyssAddSuffixes"),
        );
    });
});
