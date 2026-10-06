import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { availableOmens } from "../app/lib/crafting-omens";
import { CraftingSimulation, calculateExact } from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s reveal crafting", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(
            readFileSync(
                new URL(`../public/game-data/crafting-${game}.json`, import.meta.url),
                "utf8",
            ),
        ),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.tags.includes("str_armour"),
    )![0];
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const method = currency(
        game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour",
    );
    const rare = () =>
        engine.apply(engine.createItem(baseId), currency("transmute_to_rare"), seededRandom(3))
            .item;
    const hidden = () => engine.apply(rare(), method, seededRandom(11)).item;

    it("matches exact crafting outcomes for an extracted pool and preserves its restrictions", () => {
        const item = hidden();
        const groups = new Set<string>();
        const candidates = engine.revealPool(item).filter((entry) => {
            if (groups.size >= 4 || entry.mod.groups.some((group) => groups.has(group)))
                return false;
            for (const group of entry.mod.groups) groups.add(group);
            return true;
        });
        expect(candidates.length).toBeGreaterThan(2);
        const keep = new Set(
            [...item.mods, ...item.implicits, ...candidates].map((entry) => entry.id),
        );
        const small = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(Object.entries(catalog.mods).filter(([id]) => keep.has(id))),
        });
        const before = structuredClone(item);
        const probabilities = small.revealProbabilities(item);
        for (const { id } of candidates) {
            const result = calculateExact(
                small,
                item,
                { kind: "reveal", preferred: [id] },
                small.validateTarget({ groups: [{ mods: [id] }] }),
            );
            expect(probabilities.get(id)).toBeCloseTo(result.probability, 12);
        }
        expect(item).toEqual(before);
        expect([...probabilities.keys()]).toEqual(small.revealPool(item).map((entry) => entry.id));
    });

    it("preserves other modifiers, offers distinct eligible groups and accepts one choice", () => {
        const original = rare();
        const before = structuredClone(original);
        const result = engine.apply(original, method, seededRandom(11));
        expect(original).toEqual(before);
        const item = result.item;
        expect(item.mods.length).toBe(original.mods.length + (game === "poe1" ? 0 : 1));
        expect(item.reveal?.choices).toEqual([]);
        const revealed = engine.revealChoices(item, seededRandom(15));
        expect(revealed.reveal?.choices).toHaveLength(3);
        expect(item.reveal?.choices).toEqual([]);
        expect(engine.revealChoices(revealed, seededRandom(99))).toEqual(revealed);
        const choices = revealed.reveal!.choices;
        const probabilities = engine.revealProbabilities(revealed);
        for (const [id, chance] of probabilities) expect(chance).toBe(choices.includes(id) ? 1 : 0);
        const groups = choices.flatMap((id) => engine.mod(id).groups);
        expect(new Set(groups).size).toBe(groups.length);
        const selected = engine.chooseRevealed(revealed, choices[1]!, seededRandom(12));
        expect(() => engine.revealProbabilities(selected)).toThrow("no modifier to reveal");
        expect(selected.reveal).toBeUndefined();
        expect(selected.mods.some((entry) => entry.id === choices[1] && !entry.crafted)).toBe(true);
        expect(selected.mods).toHaveLength(item.mods.length);
        expect(() => engine.apply(selected, method, seededRandom(13))).toThrow("existing");
        const rerolled = engine.apply(revealed, currency("reroll_mod_values"), seededRandom(13));
        expect(rerolled.item.reveal!.choices).toEqual(revealed.reveal!.choices);
        expect(rerolled.item.reveal!.offeredOn?.mods).toEqual(revealed.mods);
        expect(() =>
            engine.chooseRevealed(revealed, original.mods[0]!.id, seededRandom(13)),
        ).toThrow("Choose one");
    });

    it("automatically selects preferred reveal outcomes in a process", () => {
        const item = hidden();
        const options = engine.revealChoices(item, seededRandom(22)).reveal!.choices;
        const chosen = options[2]!;
        const result = engine.apply(
            item,
            { kind: "reveal", preferred: [chosen] },
            seededRandom(22),
        );
        expect(result.item.mods.some((entry) => entry.id === chosen)).toBe(true);
        expect(result.cost).toEqual([]);
        const target = engine.validateTarget({ groups: [{ mods: [chosen] }] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            target,
            method: { kind: "reveal", preferred: [chosen] },
            steps: [
                {
                    id: "reveal",
                    method: { kind: "reveal", preferred: [chosen] },
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: {},
            seed: 22,
            iterations: 1,
            maxActions: 1,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        simulation.runTrial();
        expect(simulation.result().successes).toBe(1);
    });

    it("rejects forged reveal sources and choices and honors existing modifier groups", () => {
        const item = hidden();
        const existingGroups = item.mods
            .filter((entry) => entry.id !== item.reveal!.mod)
            .flatMap((entry) => engine.mod(entry.id).groups);
        expect(
            engine
                .revealPool(item)
                .every(
                    (entry) => !entry.mod.groups.some((group) => existingGroups.includes(group)),
                ),
        ).toBe(true);
        expect(() =>
            engine.validateItem({ ...item, reveal: { ...item.reveal, source: "missing" } }),
        ).toThrow("source");
        expect(() =>
            engine.validateItem({ ...item, reveal: { ...item.reveal, choices: ["missing"] } }),
        ).toThrow("reveal choices");
    });

    if (game === "poe1") {
        it("does not offer or accept PoE 2 reveal omens", () => {
            const method = {
                kind: "reveal" as const,
                preferred: [],
                omens: ["Metadata/Items/Currency/OmenOnAbyssRerollOptions"],
            };
            expect(availableOmens(catalog, method)).toEqual([]);
            expect(() => engine.prepareReveal(hidden(), method, seededRandom(1))).toThrow(
                "does not apply",
            );
        });
        it("rerolls with one veiled modifier and retains a protected prefix", () => {
            const item = rare();
            const prefix = item.mods.find(
                (entry) => engine.mod(entry.id).generation_type === "prefix",
            )!;
            const fractured = { ...prefix, fractured: true };
            const result = engine.apply(
                { ...item, mods: [fractured] },
                currency("reroll_rare_veiled"),
                seededRandom(6),
            ).item;
            expect(result.mods).toContainEqual(fractured);
            expect(
                result.mods.filter((entry) => engine.mod(entry.id).domain === "veiled"),
            ).toHaveLength(1);
            expect(result.mods.length).toBeGreaterThanOrEqual(4);
        });
    } else {
        const echoes = {
            kind: "reveal" as const,
            preferred: [],
            omens: [
                catalog.crafting.currencies.find((entry) =>
                    entry.id.endsWith("/OmenOnAbyssRerollOptions"),
                )!.id,
            ],
        };
        const lichOmens = [
            ["OmenOnAbyssGuarenteeLichTypeMod1", "ulaman_mod"],
            ["OmenOnAbyssGuarenteeLichTypeMod2", "amanamu_mod"],
            ["OmenOnAbyssGuarenteeLichTypeMod3", "kurgal_mod"],
        ];
        const jewellery = () => ({
            ...engine.createItem(
                Object.entries(catalog.bases).find(([, base]) => base.item_class === "Ring")![0],
            ),
            rarity: "rare" as const,
        });
        const omenId = (suffix: string) =>
            catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;

        it.each(
            lichOmens,
        )("combines %s with the Breach bone and retains its special reveal pool", (suffix, tag) => {
            const bone = catalog.crafting.desecration.find((entry) => entry.tag)!;
            const method = {
                kind: "currency" as const,
                id: bone.id,
                omens: [omenId(suffix!), omenId("OmenOnAbyssAddSuffixes")],
            };
            expect(availableOmens(catalog, method).map((entry) => entry.id)).toContain(
                method.omens[0],
            );
            const result = engine.apply(jewellery(), method, seededRandom(1));
            expect(result.cost).toHaveLength(3);
            const ordinary = engine.apply(
                jewellery(),
                { ...currency("abyssal_bench_ticket_jewellery"), omens: method.omens },
                seededRandom(1),
            ).item;
            const ordinaryIds = new Set(engine.revealPool(ordinary).map((entry) => entry.id));
            const pool = engine.revealPool(result.item);
            expect(pool.some((entry) => !ordinaryIds.has(entry.id))).toBe(true);
            const revealed = engine.prepareReveal(result.item, echoes, seededRandom(8)).item;
            const rerolled = engine.rerollReveal(revealed, seededRandom(9));
            for (const item of [revealed, rerolled]) {
                expect(item.reveal?.source).toBe(bone.id);
                expect(item.reveal?.omens).toEqual(method.omens);
                expect(
                    item.reveal?.choices.some((id) => engine.mod(id).implicit_tags.includes(tag!)),
                ).toBe(true);
                expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
            }
        });

        it.each(lichOmens)("guarantees one %s choice through reveals and Echoes", (suffix, tag) => {
            const method = {
                ...currency("abyssal_bench_ticket_jewellery"),
                omens: [omenId(suffix!), omenId("OmenOnAbyssAddSuffixes")],
            };
            expect(availableOmens(catalog, method).map((entry) => entry.id)).toContain(
                method.omens[0],
            );
            const original = jewellery();
            const before = structuredClone(original);
            const result = engine.apply(original, method, seededRandom(12));
            expect(original).toEqual(before);
            expect(result.cost).toEqual(engine.costs(method));
            expect(result.cost).toHaveLength(3);
            expect(result.item.reveal?.omens).toEqual(method.omens);
            expect(engine.mod(result.item.reveal!.mod).generation_type).toBe("suffix");
            const pool = engine.revealPool(result.item);
            expect(pool.length).toBeGreaterThan(0);
            expect(pool.some((entry) => entry.mod.implicit_tags.includes(tag!))).toBe(true);
            expect(pool.some((entry) => entry.mod.domain === engine.base(original).domain)).toBe(
                true,
            );
            const loaded = engine.validateItem(JSON.parse(JSON.stringify(result.item)));
            const first = engine.prepareReveal(loaded, echoes, seededRandom(12));
            const second = engine.rerollReveal(first.item, seededRandom(15));
            for (const item of [first.item, second]) {
                expect(item.reveal?.omens).toEqual(method.omens);
                expect(item.reveal!.choices.length).toBeGreaterThan(0);
                expect(
                    item.reveal!.choices.some((id) => engine.mod(id).implicit_tags.includes(tag!)),
                ).toBe(true);
            }
            const selected = engine.chooseRevealed(
                second,
                second.reveal!.choices[0]!,
                seededRandom(16),
            );
            expect(selected.reveal).toBeUndefined();
            expect(
                selected.mods.some((entry) => engine.mod(entry.id).implicit_tags.includes(tag!)),
            ).toBe(true);
        });

        it("rejects incompatible lich omens, forged direction and choices missing the guarantee", () => {
            const sovereign = omenId(lichOmens[0]![0]!);
            for (const action of [
                "abyssal_bench_ticket_armour",
                "abyssal_bench_ticket_jewel",
                "abyssal_bench_ticket_waystone",
            ]) {
                const method = { ...currency(action), omens: [sovereign] };
                expect(availableOmens(catalog, method).map((entry) => entry.id)).not.toContain(
                    sovereign,
                );
                expect(() => engine.validateMethod(method)).toThrow("does not apply");
            }
            expect(() =>
                engine.validateMethod({
                    ...currency("abyssal_bench_ticket_jewellery"),
                    omens: [sovereign, omenId(lichOmens[1]![0]!)],
                }),
            ).toThrow("conflicting");
            const item = engine.apply(
                jewellery(),
                {
                    ...currency("abyssal_bench_ticket_jewellery"),
                    omens: [sovereign, omenId("OmenOnAbyssAddSuffixes")],
                },
                seededRandom(12),
            ).item;
            const wrongFamily = engine
                .revealPool({ ...item, reveal: { ...item.reveal!, omens: [] } })
                .find((entry) => !entry.mod.implicit_tags.includes("ulaman_mod"))!.id;
            expect(() =>
                engine.validateItem({
                    ...item,
                    reveal: { ...item.reveal, choices: [wrongFamily] },
                }),
            ).toThrow("guaranteed Lich modifier");
            expect(() =>
                engine.validateItem({
                    ...item,
                    reveal: {
                        ...item.reveal,
                        omens: [sovereign, omenId("OmenOnAbyssAddPrefixes")],
                    },
                }),
            ).toThrow("directional omen");
            expect(() =>
                engine.apply(
                    rare(),
                    { ...currency("abyssal_bench_ticket_weapon"), omens: [sovereign] },
                    seededRandom(12),
                ),
            ).toThrow("item class");
        });

        it("simulates a lich desecration and reveal while charging its omen once", () => {
            const omen = omenId(lichOmens[0]![0]!);
            const method = {
                ...currency("abyssal_bench_ticket_jewellery"),
                omens: [omen],
            };
            const target = engine.validateTarget({
                groups: [
                    {
                        mods: engine
                            .revealedModifiers(jewellery())
                            .filter((entry) => entry.mod.implicit_tags.includes("ulaman_mod"))
                            .map((entry) => entry.id),
                    },
                ],
            });
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item: jewellery(),
                target,
                method,
                steps: [
                    {
                        id: "desecrate",
                        method,
                        condition: { groups: [] },
                        onSuccess: "reveal",
                        onFailure: "reveal",
                    },
                    { id: "reveal", method: echoes, condition: target },
                ],
                prices: { [omen]: 5, [echoes.omens[0]!]: 7, [method.id]: 0 },
                seed: 22,
                iterations: 20,
                maxActions: 2,
            });
            const simulation = new CraftingSimulation(catalog, project, true);
            for (let i = 0; i < 20; i++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                successes: 20,
                totalActions: 40,
                meanCost: 12,
                spending: { [omen]: 20, [echoes.omens[0]!]: 20 },
            });
        });

        it("consumes one Echoes omen before revealing and persists exactly one reroll", () => {
            const item = hidden();
            const before = structuredClone(item);
            const first = engine.prepareReveal(item, echoes, seededRandom(22));
            expect(item).toEqual(before);
            expect(first.cost).toEqual([
                { id: echoes.omens[0], name: "Omen of Abyssal Echoes", amount: 1 },
            ]);
            expect(first.item.reveal?.echoes).toEqual({ omen: echoes.omens[0], remaining: 1 });
            const loaded = engine.validateItem(JSON.parse(JSON.stringify(first.item)));
            expect(engine.prepareReveal(loaded, echoes, seededRandom(99))).toEqual({
                item: loaded,
                cost: [],
            });
            const rerolled = engine.rerollReveal(loaded, seededRandom(41));
            expect(rerolled.reveal?.echoes?.remaining).toBe(0);
            expect(rerolled.reveal?.choices).toHaveLength(3);
            expect(rerolled.reveal?.choices).not.toEqual(loaded.reveal?.choices);
            expect(rerolled.mods).toEqual(item.mods);
            expect(loaded).toEqual(first.item);
            expect(() => engine.rerollReveal(rerolled, seededRandom(7))).toThrow(
                "no reveal reroll",
            );
            const selected = engine.chooseRevealed(
                rerolled,
                rerolled.reveal!.choices[0]!,
                seededRandom(7),
            );
            expect(selected.reveal).toBeUndefined();
            expect(() => engine.rerollReveal(selected, seededRandom(7))).toThrow(
                "no reveal reroll",
            );
        });
        it("rejects late activation and forged Echoes states", () => {
            const item = hidden();
            const first = engine.revealChoices(item, seededRandom(22));
            expect(() => engine.prepareReveal(first, echoes, seededRandom(1))).toThrow(
                "before revealing",
            );
            expect(() => engine.rerollReveal(first, seededRandom(1))).toThrow("no reveal reroll");
            expect(() =>
                engine.validateItem({
                    ...item,
                    reveal: { ...item.reveal, echoes: { omen: echoes.omens[0], remaining: 1 } },
                }),
            ).toThrow("revealed choices");
            expect(() =>
                engine.validateItem({
                    ...first,
                    reveal: { ...first.reveal, echoes: { omen: method.id, remaining: 1 } },
                }),
            ).toThrow("does not apply");
        });
        it("rerolls only if no preferred choice appears, with one omen cost per trial", () => {
            const item = hidden();
            const random = seededRandom(22);
            const first = engine.prepareReveal(item, echoes, random).item;
            const second = engine.rerollReveal(first, random);
            const desired = second.reveal!.choices.find(
                (id) => !first.reveal!.choices.includes(id),
            )!;
            expect(desired).toBeDefined();
            const method = { ...echoes, preferred: [desired] };
            const result = engine.apply(item, method, seededRandom(22));
            expect(result.item.mods.some((entry) => entry.id === desired)).toBe(true);
            expect(result.cost).toEqual(engine.costs(echoes));
            const existingPreference = first.reveal!.choices[2]!;
            const keep = engine.apply(
                item,
                { ...echoes, preferred: [existingPreference] },
                seededRandom(22),
            );
            expect(keep.item.mods.some((entry) => entry.id === existingPreference)).toBe(true);
            expect(keep.cost).toEqual(engine.costs(echoes));
            const resume = engine.apply(first, method, random);
            expect(resume.cost).toEqual([]);

            const target = engine.validateTarget({ groups: [{ mods: [desired] }] });
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item,
                target,
                method,
                steps: [{ id: "reveal", method, condition: target }],
                prices: { [echoes.omens[0]!]: 7 },
                seed: 22,
                iterations: 1,
                maxActions: 1,
            });
            const simulation = new CraftingSimulation(catalog, project, true);
            simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                successes: 1,
                totalActions: 1,
                meanCost: 7,
                spending: { [echoes.omens[0]!]: 1 },
            });
        });
        it("includes special bone outcomes in the target and preference catalog", () => {
            const ticket = catalog.crafting.desecration.find((entry) => entry.tag)!;
            const base = Object.entries(catalog.bases).find(([, entry]) =>
                ticket.itemClasses.includes(entry.item_class),
            )![0];
            const item = { ...engine.createItem(base), rarity: "rare" as const };
            const special = engine.pool(item, { domain: "desecrated", extraTags: [ticket.tag!] });
            expect(special.length).toBeGreaterThan(0);
            const entries = engine.revealedModifiers(item);
            expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
            for (const entry of special)
                expect(entries.some((candidate) => candidate.id === entry.id)).toBe(true);
        });
        it("applies extracted bone restrictions and directional and Light omens", () => {
            const item = rare();
            expect(() =>
                engine.apply(item, currency("abyssal_bench_ticket_armour_low"), seededRandom(5)),
            ).toThrow("level");
            expect(() =>
                engine.apply(item, currency("abyssal_bench_ticket_weapon"), seededRandom(5)),
            ).toThrow("item class");
            const omen = (suffix: string) =>
                catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;
            const result = engine.apply(
                item,
                {
                    ...currency("abyssal_bench_ticket_armour_high"),
                    omens: [omen("OmenOnAbyssAddSuffixes")],
                },
                seededRandom(5),
            );
            expect(engine.mod(result.item.reveal!.mod).generation_type).toBe("suffix");
            expect(
                engine.revealPool(result.item).every((entry) => entry.mod.required_level >= 40),
            ).toBe(true);
            expect(result.cost).toHaveLength(2);
            const selected = engine.apply(
                result.item,
                { kind: "reveal", preferred: [] },
                seededRandom(5),
            ).item;
            const removed = engine.apply(
                selected,
                { ...currency("remove_random_mod"), omens: [omen("OmenOnAnnulRemoveAbyssMod")] },
                seededRandom(5),
            ).item;
            expect(removed.mods).toEqual(item.mods);
        });
    }
});
