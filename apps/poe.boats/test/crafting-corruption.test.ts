import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
} from "../app/lib/crafting-simulation";
import { socketLimit } from "../app/lib/crafting-sockets";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { parseSocketInfo } from "../scripts/export-crafting-catalog";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const base = (name: string) =>
    Object.entries(catalog.bases).find(([, entry]) => entry.name === name)![0];
const method = (action: string): Extract<CraftingMethod, { kind: "currency" }> => ({
    kind: "currency",
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const vaal = method("corrupt_item");
const artificer = method("add_equipment_socket");
const blank = () => engine.createItem(base("Rusted Cuirass"));
const withOmen = { ...vaal, omens: [availableOmens(catalog, vaal)[0]!.id] };
const force = (outcome: string) => {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((choice) => choice.value === outcome)!.value,
    );
    return random;
};
const project = (item: CraftingItem, craft: CraftingMethod = vaal) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe2",
        patch: catalog.patch,
        item,
        method: craft,
        target: { groups: [], sockets: { min: 3, max: 3 } },
        steps: [],
        prices: { [vaal.id]: 2, [artificer.id]: 1, [withOmen.omens[0]!]: 4 },
        seed: 42,
        iterations: 2000,
        maxActions: 5,
    });

describe("PoE 2 sockets and equipment corruption", () => {
    it("exports socket metadata faithfully and rejects malformed client records", () => {
        for (const game of ["poe1", "poe2"] as const) {
            const directory = `../../packages/poe-${game === "poe1" ? 1 : 2}-data/data`;
            const bases = JSON.parse(readFileSync(`${directory}/base_items.json`, "utf8"));
            const data = craftingCatalogSchema.parse(
                JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
            );
            const metadata = new Map<string, ReturnType<typeof parseSocketInfo>>();
            for (const [id, entry] of Object.entries(data.bases)) {
                if (entry.strongbox) {
                    expect(bases[id]).toBeUndefined();
                    expect(entry.socketInfo).toEqual([]);
                    expect(entry.initialSockets).toBe(0);
                    continue;
                }
                const path = bases[id].inherits_from;
                if (!metadata.has(path))
                    metadata.set(
                        path,
                        parseSocketInfo(
                            JSON.parse(readFileSync(`${directory}/${path}.json`, "utf8")).Sockets
                                ?.socket_info,
                        ),
                    );
                expect(entry.socketInfo).toEqual(metadata.get(path));
            }
        }
        for (const invalid of [null, 1, "", "1:5", "1:5:2 1:5:3", "7:1:100", "1:5:nope"])
            expect(() => parseSocketInfo(invalid)).toThrow();
        expect(parseSocketInfo(undefined)).toEqual([]);
        expect(socketLimit(catalog, blank())).toBe(2);
        expect(socketLimit(catalog, { baseId: base("Iron Ring") })).toBe(0);
    });

    it("adds sockets deterministically up to each extracted base limit and preserves item state", () => {
        let checked = 0;
        for (const [baseId, entry] of Object.entries(catalog.bases)) {
            const maximum = socketLimit(catalog, { baseId });
            if (!maximum || entry.corrupted) continue;
            const input = { ...engine.createItem(baseId, 1), quality: 20 };
            const original = structuredClone(input);
            let item = input;
            for (let count = (item.sockets ?? 0) + 1; count <= maximum; count++) {
                const result = engine.apply(item, artificer, seededRandom(42));
                expect(result.item).toEqual({ ...input, sockets: count });
                expect(result.cost).toEqual([
                    { id: artificer.id, name: "Artificer's Orb", amount: 1 },
                ]);
                item = result.item;
            }
            expect(input).toEqual(original);
            expect(() => engine.apply(item, artificer, seededRandom(42))).toThrow("maximum number");
            checked++;
        }
        expect(checked).toBeGreaterThan(500);
        const target = engine.validateTarget({ groups: [], sockets: { min: 1, max: 1 } });
        expect(hasCraftingRequirements(target)).toBe(true);
        expect(calculateExact(engine, blank(), artificer, target).probability).toBe(1);
    });

    it("models all four equipment outcomes, keeps fractures and ignores unavailable socket outcomes", () => {
        const input = {
            ...engine.apply(blank(), method("transmute_to_rare"), seededRandom(7)).item,
            sockets: 2,
            quality: 20,
        };
        input.mods[0]!.fractured = true;
        const original = structuredClone(input);
        const untouched = engine.apply(input, vaal, force("none")).item;
        expect(untouched).toEqual({ ...input, corrupted: true });
        const socketed = engine.apply(input, vaal, force("socket")).item;
        expect(socketed).toEqual({ ...input, sockets: 3, corrupted: true });
        const rerolled = engine.apply(input, vaal, force("reroll")).item;
        expect(rerolled.mods).toHaveLength(input.mods.length);
        expect(rerolled.mods).toContainEqual(input.mods[0]);
        expect(rerolled.mods).not.toEqual(input.mods);
        expect(rerolled).toMatchObject({ sockets: 2, quality: 20, corrupted: true });
        const ring = engine.createItem(base("Iron Ring"));
        expect(engine.apply(ring, vaal, force("socket")).item).toEqual({
            ...ring,
            corrupted: true,
        });
        const implicit = engine.apply(ring, vaal, force("implicit")).item;
        expect(implicit.implicits).toHaveLength(1);
        expect(engine.mod(implicit.implicits[0]!.id).generation_type).toBe("corrupted");
        expect(
            engine.corruptedModifiers(ring).some((entry) => entry.id === implicit.implicits[0]!.id),
        ).toBe(true);
        expect(input).toEqual(original);
        expect(engine.apply(blank(), vaal, force("reroll")).item.mods).toEqual([]);
        const fractured = {
            ...input,
            mods: input.mods.map((entry) => ({ ...entry, fractured: true })),
        };
        expect(engine.apply(fractured, vaal, force("reroll")).item).toEqual({
            ...fractured,
            corrupted: true,
        });
    });

    it("uses the extracted corrupted pool without influence or fossil substitutions", () => {
        for (const name of ["Rusted Cuirass", "Iron Ring"]) {
            const item = engine.createItem(base(name));
            const tags = engine.base(item).tags;
            const pool = engine.corruptedModifiers(item);
            expect(pool.length).toBeGreaterThan(0);
            for (const entry of pool) {
                expect(entry.mod.domain).toBe(engine.base(item).domain);
                expect(entry.mod.required_level).toBeLessThanOrEqual(item.level);
                const spawn =
                    entry.mod.spawn_weights.find((rule) => tags.includes(rule.tag))?.weight ?? 0;
                const generation =
                    entry.mod.generation_weights.find((rule) => tags.includes(rule.tag))?.weight ??
                    100;
                expect(entry.weight).toBe((spawn * generation) / 100);
            }
        }
        const ring = engine.createItem(base("Iron Ring"));
        const reduced = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(
                Object.entries(catalog.mods).filter(
                    ([, mod]) => mod.generation_type !== "corrupted",
                ),
            ),
        });
        expect(reduced.apply(ring, vaal, force("implicit")).item).toEqual({
            ...ring,
            corrupted: true,
        });
    });

    it("enumerates socket probabilities, omen costs and routed preparation consistently", () => {
        const input = { ...blank(), sockets: 2 };
        const saved = project(input);
        for (const [craft, probability, cost] of [
            [vaal, 1 / 4, 2],
            [withOmen, 1 / 3, 6],
        ] as const) {
            expect(calculateExact(engine, input, craft, saved.target).probability).toBeCloseTo(
                probability,
            );
            const configured = { ...saved, method: craft };
            const simulation = new CraftingSimulation(catalog, configured);
            for (let index = 0; index < configured.iterations; index++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({ errors: {}, meanCost: cost });
            expect(simulation.result().probability).toBeCloseTo(probability, 1);
        }
        const process = craftingProjectSchema.parse({
            ...saved,
            item: blank(),
            steps: [
                {
                    id: "socket1",
                    method: artificer,
                    condition: { groups: [] },
                    onSuccess: "socket2",
                },
                {
                    id: "socket2",
                    method: artificer,
                    condition: { groups: [] },
                    onSuccess: "corrupt",
                },
                { id: "corrupt", method: withOmen, condition: saved.target },
            ],
            useProcess: true,
        });
        expect(calculateProcessExact(engine, process)).toMatchObject({
            probability: expect.closeTo(1 / 3),
            meanCost: expect.closeTo(8),
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(process)))).toEqual(process);
    });

    it("round trips sockets and corruption and rejects invalid counts, flags and repeated crafts", () => {
        const item = engine.apply({ ...blank(), sockets: 2 }, vaal, force("socket")).item;
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("Sockets: S S S");
        expect(importCraftingItemText(engine, text)[0]!.item).toEqual(item);
        const ring = engine.apply(
            engine.createItem(base("Iron Ring")),
            vaal,
            force("implicit"),
        ).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, ring))[0]!.item,
        ).toEqual(ring);
        for (const invalid of [
            { ...item, corrupted: false },
            { ...item, sockets: 4 },
            { ...item, sockets: -1 },
            { ...item, sockets: 1.5 },
            { ...ring, sockets: 1 },
        ])
            expect(() => engine.validateItem(invalid)).toThrow();
        for (const malformed of ["Sockets: R-G", "Sockets: S\nSockets: S", "Sockets: 2"])
            expect(() =>
                importCraftingItemText(engine, text.replace("Sockets: S S S", malformed)),
            ).toThrow("socket");
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const invalid of [item, { ...blank(), mirrored: true }])
            for (const craft of [vaal, artificer])
                expect(() => engine.apply(invalid, craft, random)).toThrow();
        expect(() => engine.apply(engine.createItem(base("Iron Ring")), artificer, random)).toThrow(
            "cannot have",
        );
        expect(() => engine.validateTarget({ groups: [], sockets: { min: 3, max: 1 } })).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });
});

describe.each(["poe1", "poe2"] as const)("%s flask corruption", (game) => {
    const data = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const model = new CraftingEngine(data);
    const id = Object.entries(data.bases).find(([, entry]) => entry.item_class === "LifeFlask")![0];
    const input = { ...model.createItem(id), quality: 20 };
    const maximum = game === "poe1" ? 40 : 23;
    it("enumerates every quality delta, with the reference cap and preserved affixes", () => {
        const target = model.validateTarget({
            groups: [],
            quality: { min: game === "poe1" ? 30 : 23, max: maximum },
        });
        expect(calculateExact(model, input, vaal, target).probability).toBeCloseTo(
            game === "poe1" ? 1 / 21 : 8 / 21,
        );
        for (const start of [0, 20, 30]) {
            const random = seededRandom(42);
            vi.spyOn(random, "pick").mockImplementation((choices) => choices.at(-1)!.value);
            const result = model.apply({ ...input, quality: start }, vaal, random);
            expect(result.item).toEqual({
                ...input,
                quality: Math.min(maximum, start + 10),
                corrupted: true,
            });
            expect(result.cost).toEqual([{ id: vaal.id, name: "Vaal Orb", amount: 1 }]);
            expect(
                importCraftingItemText(model, exportCraftingItemText(model, result.item))[0]!.item,
            ).toEqual(result.item);
        }
        expect(() => model.apply({ ...input, corrupted: true }, vaal, seededRandom(42))).toThrow(
            "uncorrupted",
        );
    });
});
