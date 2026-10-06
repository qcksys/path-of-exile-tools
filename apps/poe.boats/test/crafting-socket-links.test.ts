import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
    validateProject,
} from "../app/lib/crafting-simulation";
import { linkedSocketRange, socketBenchEligible, socketLimit } from "../app/lib/crafting-sockets";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const recipes = catalog.crafting.bench.filter((entry) => entry.linkCount);
const bench = (count: number) => ({
    kind: "bench" as const,
    id: recipes.find((entry) => entry.linkCount === count)!.id,
});
const beast = {
    kind: "beast" as const,
    id: catalog.crafting.beasts.find((entry) => entry.maximumLinks)!.id,
};
const blank = (sockets = 6) => ({ ...engine.createItem(baseId, 1), sockets });
const target = (min: number, max = min) =>
    engine.validateTarget({ groups: [], linkedSockets: { min, max } });
const deterministic = () => ({
    pick: vi.fn(() => {
        throw new Error("Link guarantees must not sample unsourced probabilities");
    }),
    integer: vi.fn(() => {
        throw new Error("Link guarantees must not reroll values");
    }),
});

describe("PoE 1 socket links", () => {
    it("uses all extracted recipes and charges the corrupted bench surcharge", () => {
        expect(recipes.map((entry) => entry.linkCount)).toEqual([2, 3, 4, 5, 6]);
        const vaal = catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!;
        for (const recipe of recipes) {
            const input = { ...blank(), quality: 20, memoryStrands: 82, corrupted: true };
            const before = structuredClone(input);
            const method = bench(recipe.linkCount!);
            const result = engine.apply(input, method, deterministic());
            expect(input).toEqual(before);
            expect(result.item).toEqual({
                ...input,
                socketLinks: Array.from({ length: 5 }, (_, index) =>
                    index < recipe.linkCount! - 1
                        ? true
                        : index === recipe.linkCount! - 1
                          ? false
                          : null,
                ),
            });
            expect(result.cost).toEqual([
                ...recipe.cost,
                {
                    id: vaal.id,
                    name: vaal.name,
                    amount: recipe.cost.reduce((sum, entry) => sum + entry.amount, 0),
                },
            ]);
            expect(engine.costs(method, blank())).toEqual(recipe.cost);
            expect(engine.costs(method)).toEqual(result.cost);
            expect(engine.matches(result.item, target(recipe.linkCount!, 6))).toBe(true);
        }
    });

    it("filters classes and actual sockets independently of item level", () => {
        let count = 0;
        for (const [id, base] of Object.entries(catalog.bases)) {
            const item = {
                ...engine.createItem(id, 1),
                sockets: socketLimit(catalog, { baseId: id }),
            };
            for (const recipe of recipes) {
                const expected =
                    recipe.itemClasses.includes(base.item_class) &&
                    item.sockets >= recipe.linkCount!;
                expect(socketBenchEligible(catalog, item, recipe)).toBe(expected);
                if (!expected) continue;
                const result = engine.apply(item, bench(recipe.linkCount!), deterministic());
                expect(result.item.sockets).toBe(item.sockets);
                expect(linkedSocketRange(result.item).min).toBe(recipe.linkCount);
                count++;
            }
        }
        expect(count).toBeGreaterThan(1000);
        expect(() => engine.apply(blank(3), bench(4), deterministic())).toThrow("socket recipe");
        expect(() =>
            engine.apply({ ...blank(), mirrored: true }, bench(6), deterministic()),
        ).toThrow("unmirrored");
        expect(() =>
            engine.apply(
                { ...blank(), corrupted: true, destroyed: true },
                bench(6),
                deterministic(),
            ),
        ).toThrow("Destroyed");
    });

    it("retains unknown connections and proves only requirements settled by the known links", () => {
        const item = engine.apply(blank(), bench(2), deterministic()).item;
        expect(item.socketLinks).toEqual([true, false, null, null, null]);
        expect(linkedSocketRange(item)).toEqual({ min: 2, max: 4 });
        expect(engine.matches(item, target(2, 4))).toBe(true);
        expect(engine.matches(item, target(5, 6))).toBe(false);
        expect(engine.matches(item, target(0, 1))).toBe(false);
        expect(() => engine.matches(item, target(3))).toThrow("not fully known");
        expect(calculateExact(engine, blank(), bench(2), target(2, 6)).probability).toBe(1);
        expect(calculateExact(engine, blank(), bench(2), target(5, 6)).probability).toBe(0);
        expect(() => calculateExact(engine, blank(), bench(2), target(3, 6))).toThrow(
            "not fully known",
        );
        expect(calculateExact(engine, blank(), bench(3), target(3)).probability).toBe(1);
        expect(hasCraftingRequirements(target(6))).toBe(true);
        const expression = engine.validateTarget({
            groups: [],
            expression: { operator: "or", operands: [target(2, 4), target(5, 6)] },
        });
        expect(engine.matches(item, expression)).toBe(true);
    });

    it("computes exact largest-group bounds for every fully or partly specified six-socket layout", () => {
        for (let value = 0; value < 3 ** 5; value++) {
            let code = value;
            const links = Array.from({ length: 5 }, () => {
                const edge = [false, true, null][code % 3]!;
                code = Math.floor(code / 3);
                return edge;
            });
            const range = linkedSocketRange({ ...blank(), socketLinks: links });
            const possible = new Set<number>();
            for (let mask = 0; mask < 32; mask++) {
                const edges = links.map((edge, index) => edge ?? Boolean(mask & (1 << index)));
                let size = 1;
                const groups = [];
                for (const linked of edges) {
                    if (linked) size++;
                    else {
                        groups.push(size);
                        size = 1;
                    }
                }
                groups.push(size);
                possible.add(Math.max(...groups));
            }
            expect(range).toEqual({ min: Math.min(...possible), max: Math.max(...possible) });
        }
    });

    it("rejects malformed, special and cross-game link states", () => {
        for (const socketLinks of [
            [],
            [true],
            [true, true, true, true, true, true],
            [1, 0, 1, 0, 1],
        ])
            expect(() => engine.validateItem({ ...blank(), socketLinks })).toThrow();
        expect(() => engine.validateItem({ ...blank(1), socketLinks: [false] })).toThrow();
        expect(() =>
            engine.validateItem({ ...engine.createItem(baseId), socketLinks: [true] }),
        ).toThrow();
        const abyss = engine.addStartingMod(
            engine.createItem(baseId),
            "DelveAbyssJewelSocket1",
            seededRandom(1),
        );
        expect(() => engine.validateItem({ ...abyss, sockets: 2, socketLinks: [true] })).toThrow(
            "Abyss",
        );
        const other = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        const id = Object.entries(other.catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour",
        )![0];
        expect(() =>
            other.validateItem({ ...other.createItem(id), sockets: 2, socketLinks: [true] }),
        ).toThrow("PoE 1");
        expect(() => other.validateTarget(target(2))).toThrow("PoE 1");
        expect(() => other.validateMethod(bench(6))).toThrow("Unknown bench");
        expect(() =>
            engine.validateTarget({ groups: [], linkedSockets: { min: 6, max: 5 } }),
        ).toThrow();
    });

    it("fully links current sockets with the extracted beastcraft without consuming extra sockets", () => {
        expect(beast.id).toBe("EinharMasterCraftMorrigan7");
        expect(engine.beastOperation(beast.id)).toBe("maximum-links");
        for (const sockets of [2, 3, 4, 5, 6]) {
            const input = { ...blank(sockets), quality: 20, memoryStrands: 82 };
            const result = engine.apply(input, beast, deterministic());
            expect(result.item).toEqual({
                ...input,
                socketLinks: Array.from({ length: sockets - 1 }, () => true),
            });
            expect(result.cost).toEqual(engine.costs(beast));
            expect(() => engine.apply(result.item, beast, deterministic())).toThrow(
                "already linked",
            );
            expect(() => engine.apply(result.item, bench(sockets), deterministic())).toThrow(
                "already linked",
            );
        }
        for (const item of [
            blank(1),
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
        ])
            expect(() => engine.apply(item, beast, deterministic())).toThrow();
        const changed = structuredClone(catalog);
        changed.crafting.beasts.find((entry) => entry.maximumLinks)!.id = "RenamedBuildLinkRecipe";
        expect(new CraftingEngine(changed).beastOperation("RenamedBuildLinkRecipe")).toBe(
            "maximum-links",
        );
    });

    it("preserves links through ordinary crafting and imprints, and clears knowledge on socket-count changes", () => {
        const input = engine.apply(blank(4), bench(4), deterministic()).item;
        const magic = engine.apply(input, currency("transmute_to_magic"), seededRandom(1)).item;
        expect(magic.socketLinks).toEqual([true, true, true]);
        const imprinted = engine.apply(
            magic,
            { kind: "beast", id: "EinharMasterCraft27" },
            deterministic(),
        ).item;
        const sixSockets = catalog.crafting.bench.find((entry) => entry.socketCount === 6)!;
        const resized = engine.apply(
            imprinted,
            { kind: "bench", id: sixSockets.id },
            deterministic(),
        ).item;
        expect(resized.socketLinks).toBeUndefined();
        expect(resized.imprint?.socketLinks).toEqual(input.socketLinks);
        expect(
            engine.apply(resized, currency("restore_imprint"), deterministic()).item.socketLinks,
        ).toEqual(input.socketLinks);
        const socketBeast = catalog.crafting.beasts.find((entry) => entry.maximumSockets)!;
        expect(
            engine.apply(input, { kind: "beast", id: socketBeast.id }, deterministic()).item
                .socketLinks,
        ).toBeUndefined();
        const tainted = engine.apply(
            { ...input, level: 86, corrupted: true },
            currency("reroll_socket_numbers_hellscape"),
            seededRandom(1),
        ).item;
        expect(tainted.socketLinks).toBeUndefined();
        expect(
            engine.apply(input, { kind: "generate", id: "normal" }, seededRandom(1)).item
                .socketLinks,
        ).toBeUndefined();
    });

    it("retains full and partial links in JSON and annotated text, and imports ordinary game socket separators", () => {
        const full = engine.apply(blank(), bench(6), deterministic()).item;
        const partial = engine.apply(blank(), bench(2), deterministic()).item;
        for (const item of [full, partial]) {
            const text = exportCraftingItemText(engine, item);
            expect(text).toContain("Socket Links:");
            expect(importCraftingItemText(engine, text)[0]!.item).toEqual(item);
        }
        const text = exportCraftingItemText(engine, blank()).replace(
            "Socket Count: 6",
            "Sockets: R-R G-G-G B",
        );
        const imported = importCraftingItemText(engine, text)[0]!;
        expect(imported.item.socketLinks).toEqual([true, false, true, true, false]);
        expect(imported.warnings.join(" ")).toContain("colours are not retained");
        for (const annotation of [
            "Socket Links: 1",
            "Socket Links: a 0 ? ? ?",
            "Socket Links: 1 0 ? ? ?\nSocket Links: 1 0 ? ? ?",
        ])
            expect(() =>
                importCraftingItemText(
                    engine,
                    `${exportCraftingItemText(engine, blank())}\n${annotation}`,
                ),
            ).toThrow();
    });

    it("runs linked-socket requirements through exact and seeded processes with conditional Vaal costs", () => {
        const method = bench(6);
        const recipe = recipes.find((entry) => entry.linkCount === 6)!;
        const fuse = recipe.cost[0]!.id;
        const vaal = catalog.crafting.currencies.find(
            (entry) => entry.action === "corrupt_item",
        )!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...blank(), corrupted: true },
            method,
            target: target(6),
            steps: [{ id: "link", method, condition: target(6) }],
            useProcess: true,
            prices: { [fuse]: 0.5, [vaal]: 1 },
            seed: 42,
            iterations: 10,
            maxActions: 1,
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
        const exact = calculateProcessExact(engine, project);
        expect(exact).toMatchObject({
            probability: 1,
            totalActions: 1,
            meanCost: 2250,
            spending: { [fuse]: 1500, [vaal]: 1500 },
            errors: {},
        });
        const sampled = new CraftingSimulation(catalog, project);
        for (let index = 0; index < 10; index++) sampled.runTrial();
        expect(sampled.result()).toMatchObject({
            probability: 1,
            meanCost: 2250,
            spending: { [fuse]: 15000, [vaal]: 15000 },
            errors: {},
        });
        project.method = bench(2);
        project.steps[0]!.method = bench(2);
        project.target = target(3, 6);
        project.steps[0]!.condition = project.target;
        expect(Object.keys(calculateProcessExact(engine, project).errors)[0]).toContain(
            "not fully known",
        );
    });
});
