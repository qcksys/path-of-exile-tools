import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { type CraftingItem, craftingCatalogSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s hypothetical reveal offers", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const item = () => engine.createItem(base);
    const source = () => engine.revealSources(item())[0]!.id;
    const hidden = (source: string, side: "prefix" | "suffix", input = item()) => {
        const mod = side === "prefix" ? "VeiledPrefix" : "VeiledSuffix";
        return engine.validateItem({
            ...input,
            rarity: "rare",
            mods: [engine.rollMod(mod, seededRandom(1))],
            reveal: { mod, source, choices: [] },
        });
    };

    it("uses valid extracted source identities and rejects unknown, incompatible and out-of-level sources", () => {
        const sources = engine.revealSources(item());
        expect(sources.length).toBeGreaterThan(0);
        for (const entry of sources) expect(catalog.crafting.currencies).toContainEqual(entry);
        expect(() => engine.revealPreview(item(), "unknown")).toThrow("reveal source");
        if (game === "poe2") {
            const jewellery = catalog.crafting.desecration.find((entry) =>
                entry.itemClasses.includes("Ring"),
            )!.id;
            expect(() => engine.revealPreview(item(), jewellery)).toThrow("reveal source");
            const low = catalog.crafting.desecration.find(
                (entry) => entry.itemClasses.includes("Body Armour") && entry.maximumItemLevel,
            )!.id;
            expect(
                engine.revealSources({ ...item(), level: 64 }).some((entry) => entry.id === low),
            ).toBe(true);
            expect(() => engine.revealPreview({ ...item(), level: 65 }, low)).toThrow(
                "reveal source",
            );
        }
        const flask = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "LifeFlask",
        )![0];
        expect(engine.revealSources(engine.createItem(flask))).toEqual([]);
        expect(() => engine.revealPreview(engine.createItem(flask), source())).toThrow(
            "reveal source",
        );
    });

    it("matches actual hidden-prefix and hidden-suffix offers without mutating an existing item", () => {
        const alchemy = catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!.id;
        const input = engine.apply(
            item(),
            { kind: "currency", id: alchemy },
            seededRandom(42),
        ).item;
        const before = structuredClone(input);
        const preview = engine.revealPreview(input, source());
        expect(preview).toEqual(engine.revealPreview(item(), source()));
        for (const side of ["prefix", "suffix"] as const) {
            const current = hidden(source(), side);
            const actual = engine.revealPool(current);
            expect(preview.pool.filter((entry) => entry.mod.generation_type === side)).toEqual(
                actual,
            );
            const probabilities = engine.revealProbabilities(current);
            for (const { id } of actual)
                expect(preview.probabilities.get(id)).toBeCloseTo(probabilities.get(id)!, 12);
            expect(
                [...probabilities.values()].reduce((sum, chance) => sum + chance, 0),
            ).toBeCloseTo(3, 10);
        }
        expect(input).toEqual(before);
    });

    it("agrees with sampled three-choice offers on both affix sides", () => {
        const preview = engine.revealPreview(item(), source());
        for (const side of ["prefix", "suffix"] as const) {
            const current = hidden(source(), side);
            const observed = new Map<string, number>();
            const random = seededRandom(42);
            for (let trial = 0; trial < 1000; trial++) {
                const choices = engine.revealChoices(current, random).reveal!.choices;
                for (const id of choices) observed.set(id, (observed.get(id) ?? 0) + 1);
            }
            for (const entry of preview.pool.filter((entry) => entry.mod.generation_type === side))
                expect(
                    Math.abs(
                        (observed.get(entry.id) ?? 0) / 1000 - preview.probabilities.get(entry.id)!,
                    ),
                ).toBeLessThan(0.06);
        }
    });

    it("keeps source-specific floors and extra tags separate from the generic reveal catalog", () => {
        if (game === "poe1") {
            const sources = engine.revealSources(item());
            for (const entry of sources)
                expect(engine.revealPreview(item(), entry.id)).toEqual(
                    engine.revealPreview(item(), source()),
                );
            return;
        }
        const high = catalog.crafting.desecration.find(
            (entry) => entry.itemClasses.includes("Body Armour") && entry.minimumModLevel > 0,
        )!;
        const ancient = engine.revealPreview(item(), high.id);
        expect(ancient.pool.length).toBeGreaterThan(0);
        expect(
            ancient.pool.every((entry) => entry.mod.required_level >= high.minimumModLevel),
        ).toBe(true);
        expect(ancient.pool.length).toBeLessThan(
            engine.revealPreview(item(), source()).pool.length,
        );
        const ring = engine.createItem(
            Object.entries(catalog.bases).find(([, base]) => base.name === "Golden Hoop")![0],
        );
        const altered = catalog.crafting.desecration.find((entry) => entry.tag)!;
        const ordinary = catalog.crafting.desecration.find(
            (entry) =>
                entry.itemClasses.includes("Ring") &&
                !entry.tag &&
                !entry.maximumItemLevel &&
                !entry.minimumModLevel,
        )!;
        const extra = engine.revealPreview(ring, altered.id);
        const normal = new Set(
            engine.revealPreview(ring, ordinary.id).pool.map((entry) => entry.id),
        );
        const additions = extra.pool.filter((entry) => !normal.has(entry.id));
        expect(additions.length).toBeGreaterThan(0);
        for (const entry of additions) {
            expect(
                entry.mod.spawn_weights.some(
                    (weight) => weight.tag === altered.tag && weight.weight > 0,
                ),
            ).toBe(true);
            expect(extra.probabilities.get(entry.id)).toBeGreaterThan(0);
        }
    });

    it("excludes previous offers, affixes and Putrefaction from the hypothetical empty-affix model", () => {
        const offered = engine.revealChoices(hidden(source(), "prefix"), seededRandom(15));
        const state: CraftingItem = {
            ...offered,
            ...(game === "poe2" ? { putrefied: true as const } : {}),
        };
        const before = structuredClone(state);
        expect(engine.revealPreview(state, source())).toEqual(
            engine.revealPreview(item(), source()),
        );
        expect(state).toEqual(before);
    });
});
