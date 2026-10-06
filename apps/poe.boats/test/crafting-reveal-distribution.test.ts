import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import {
    CraftingEngine,
    type CraftingRandom,
    type PoolEntry,
    seededRandom,
} from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(([, entry]) => entry.name === "Golden Hoop")![0];
const empty = { ...engine.createItem(base), rarity: "rare" as const };
const currency = (suffix: string) => `Metadata/Items/Currency/${suffix}`;
const bone = {
    kind: "currency" as const,
    id: currency("AbyssalBenchTicketJewellery"),
    omens: [currency("OmenOnAbyssAddPrefixes")],
};
const echoes = currency("OmenOnAbyssRerollOptions");

function distinct(pool: PoolEntry[], count: number, blocked: string[] = []) {
    const selected: PoolEntry[] = [];
    const groups = new Set(blocked);
    for (const entry of pool) {
        if (selected.length === count) break;
        if (entry.mod.groups.some((group) => groups.has(group))) continue;
        if (selected.length && entry.weight !== selected[0]!.weight) continue;
        selected.push(entry);
        for (const group of entry.mod.groups) groups.add(group);
    }
    expect(selected).toHaveLength(count);
    return selected;
}

const exclusive = distinct(engine.pool(empty, { domain: "desecrated", side: "prefix" }), 3);
const ordinary = distinct(
    engine.pool(empty, { side: "prefix" }),
    3,
    exclusive.flatMap((entry) => entry.mod.groups),
);

function narrow(entries: PoolEntry[]) {
    const keep = new Set([
        ...empty.implicits.map((entry) => entry.id),
        "VeiledPrefix",
        ...entries.map((entry) => entry.id),
    ]);
    return new CraftingEngine({
        ...catalog,
        mods: Object.fromEntries(Object.entries(catalog.mods).filter(([id]) => keep.has(id))),
    });
}

function revealRandom(count: number): CraftingRandom {
    const random = seededRandom(42);
    let first = true;
    return {
        integer: random.integer,
        pick(choices) {
            if (first) {
                first = false;
                return choices[count - 1]!.value;
            }
            return random.pick(choices);
        },
    };
}

describe("PoE 2 reveal source distribution", () => {
    const small = narrow([...exclusive, ...ordinary]);
    const hidden = small.apply(empty, bone, seededRandom(1)).item;

    it.each([
        1, 2, 3,
    ])("offers %s exclusive choices before filling with ordinary modifiers", (count) => {
        const before = structuredClone(hidden);
        const item = small.revealChoices(hidden, revealRandom(count));
        expect(hidden).toEqual(before);
        const choices = item.reveal!.choices;
        expect(choices).toHaveLength(3);
        expect(choices.slice(0, count).every((id) => small.mod(id).domain === "desecrated")).toBe(
            true,
        );
        expect(choices.slice(count).every((id) => small.mod(id).domain !== "desecrated")).toBe(
            true,
        );
        expect(new Set(choices.flatMap((id) => small.mod(id).groups)).size).toBe(3);
        expect(small.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
    });

    it("enumerates the reference distribution using extracted weights within each source", () => {
        for (const [id, probability] of [
            [ordinary[0]!.id, 7 / 12],
            [exclusive[0]!.id, 5 / 12],
        ] as const) {
            const method = { kind: "reveal" as const, preferred: [id] };
            const target = small.validateTarget({ groups: [{ mods: [id] }] });
            expect(calculateExact(small, hidden, method, target).probability).toBeCloseTo(
                probability,
            );
            expect(small.revealProbabilities(hidden).get(id)).toBeCloseTo(probability, 12);
            const withEchoes = { ...method, omens: [echoes] };
            expect(
                calculateExact(small, hidden, withEchoes, target, 20000).probability,
            ).toBeCloseTo(1 - (1 - probability) ** 2);
        }
        expect(small.revealPool(hidden).map(({ id, weight }) => ({ id, weight }))).toEqual(
            [...exclusive, ...ordinary].map(({ id, weight }) => ({ id, weight })),
        );
    });

    it("applies the same distribution and one Echoes cost in exact and sampled processes", () => {
        const id = ordinary[0]!.id;
        const target = small.validateTarget({ groups: [{ mods: [id] }] });
        const reveal = { kind: "reveal" as const, preferred: [id], omens: [echoes] };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: empty,
            method: bone,
            target,
            steps: [
                { id: "bone", method: bone, condition: { groups: [] }, onSuccess: "reveal" },
                { id: "reveal", method: reveal, condition: target },
            ],
            prices: { [bone.id]: 2, [bone.omens[0]!]: 3, [echoes]: 7 },
            seed: 42,
            iterations: 2000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(small, project, 20000);
        expect(exact.probability).toBeCloseTo(119 / 144);
        expect(exact.meanCost).toBeCloseTo(12);
        expect(exact.totalActions).toBeCloseTo(2);
        expect(exact.spending[echoes]).toBeCloseTo(1);
        const simulation = new CraftingSimulation(small.catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(119 / 144, 1);
        expect(simulation.result().meanCost).toBe(12);
        expect(simulation.result().errors).toEqual({});
    });

    it.each([
        1, 2, 3,
    ])("includes the guaranteed Lich choice in the %s exclusive choices", (count) => {
        const lich = engine.pool(empty, {
            domain: "desecrated",
            side: "prefix",
            tag: "ulaman_mod",
        })[0]!;
        const hidden = engine.apply(
            empty,
            { ...bone, omens: [...bone.omens, currency("OmenOnAbyssGuarenteeLichTypeMod1")] },
            seededRandom(1),
        ).item;
        expect(engine.revealPool(hidden).some((entry) => entry.id === lich.id)).toBe(true);
        const prepared = engine.prepareReveal(
            hidden,
            { kind: "reveal", preferred: [], omens: [echoes] },
            revealRandom(count),
        );
        for (const item of [
            prepared.item,
            engine.rerollReveal(prepared.item, revealRandom(count)),
        ]) {
            expect(engine.mod(item.reveal!.choices[0]!).implicit_tags).toContain("ulaman_mod");
            expect(
                item.reveal!.choices.filter((id) => engine.mod(id).domain === "desecrated"),
            ).toHaveLength(count);
        }
        expect(prepared.cost.map((entry) => entry.id)).toEqual([echoes]);
    });

    it("fills unavailable exclusive choices with ordinary options and permits shorter offers", () => {
        for (const count of [1, 2, 3]) {
            const noExclusive = narrow(ordinary);
            const ordinaryHidden = noExclusive.apply(empty, bone, seededRandom(1)).item;
            expect(
                noExclusive.revealChoices(ordinaryHidden, revealRandom(count)).reveal!.choices,
            ).toHaveLength(3);
            const noOrdinary = narrow(exclusive);
            const exclusiveHidden = noOrdinary.apply(empty, bone, seededRandom(1)).item;
            expect(
                noOrdinary.revealChoices(exclusiveHidden, revealRandom(count)).reveal!.choices,
            ).toHaveLength(count);
        }
        const one = narrow([exclusive[0]!]);
        const oneHidden = one.apply(empty, bone, seededRandom(1)).item;
        expect(one.revealChoices(oneHidden, revealRandom(3)).reveal!.choices).toEqual([
            exclusive[0]!.id,
        ]);
    });

    it.each([
        false,
        true,
    ])("falls back from an unavailable Lich tag with other exclusive choices: %s", (includeExclusive) => {
        const remaining = distinct(
            engine
                .pool(empty, { domain: "desecrated", side: "prefix" })
                .filter((entry) => !entry.mod.implicit_tags.includes("ulaman_mod")),
            3,
            ordinary.flatMap((entry) => entry.mod.groups),
        );
        const model = narrow([...ordinary, ...(includeExclusive ? remaining : [])]);
        const lich = currency("OmenOnAbyssGuarenteeLichTypeMod1");
        const method = { ...bone, omens: [...bone.omens, lich] };
        const result = model.apply(empty, method, seededRandom(1));
        expect(result.cost.map((entry) => entry.id)).toContain(lich);
        for (const count of [1, 2, 3]) {
            const prepared = model.prepareReveal(
                result.item,
                {
                    kind: "reveal",
                    preferred: [],
                    omens: [echoes],
                },
                revealRandom(count),
            ).item;
            for (const offer of [prepared, model.rerollReveal(prepared, revealRandom(count))]) {
                expect(offer.reveal!.choices).toHaveLength(3);
                expect(
                    offer.reveal!.choices.every(
                        (id) => !model.mod(id).implicit_tags.includes("ulaman_mod"),
                    ),
                ).toBe(true);
                expect(
                    offer.reveal!.choices.filter((id) => model.mod(id).domain === "desecrated"),
                ).toHaveLength(includeExclusive ? count : 0);
                expect(model.validateItem(JSON.parse(JSON.stringify(offer)))).toEqual(offer);
                expect(
                    model.chooseRevealed(offer, offer.reveal!.choices[0]!, seededRandom(1)).reveal,
                ).toBeUndefined();
            }
        }
    });

    it("draws Breach-only modifiers from the ordinary fill pool", () => {
        const allExclusive = new Set(
            engine.pool(empty, { domain: "desecrated", side: "prefix" }).map((entry) => entry.id),
        );
        const breach = distinct(
            engine
                .pool(empty, {
                    domain: "desecrated",
                    side: "prefix",
                    extraTags: [catalog.crafting.desecration.find((ticket) => ticket.tag)!.tag!],
                })
                .filter((entry) => !allExclusive.has(entry.id)),
            3,
            exclusive.flatMap((entry) => entry.mod.groups),
        );
        const model = narrow([...exclusive, ...breach]);
        const item = model.apply(
            empty,
            { ...bone, id: currency("AbyssalBenchTicketBreach") },
            seededRandom(1),
        ).item;
        for (const count of [1, 2, 3]) {
            const result = model.revealChoices(item, revealRandom(count));
            expect(
                result.reveal!.choices.filter((id) => breach.some((entry) => entry.id === id)),
            ).toHaveLength(3 - count);
        }
        const revealed = model.revealChoices(item, revealRandom(1));
        const result = model.chooseRevealed(
            revealed,
            revealed.reveal!.choices[1]!,
            seededRandom(1),
        );
        expect(model.isDesecrated(result.mods[0]!)).toBe(true);
        expect(
            importCraftingItemText(model, exportCraftingItemText(model, result))[0]!.item.mods,
        ).toEqual(result.mods);
    });

    it.each([1, 2, 3])("uses the %s-choice branch on every Putrefaction slot", (count) => {
        const putrefied = engine.apply(
            empty,
            { ...bone, omens: [currency("OmenOnAbyssVeilAllAndCorrupt")] },
            seededRandom(42),
        ).item;
        for (let index = 0; index < putrefied.mods.length; index++) {
            const selected = engine.selectUnrevealed(putrefied, index);
            const result = engine.revealChoices(selected, revealRandom(count));
            expect(
                result.reveal!.choices.filter((id) => engine.mod(id).domain === "desecrated"),
            ).toHaveLength(count);
            expect(result.reveal!.choices).toHaveLength(3);
            expect(result.mods).toEqual(putrefied.mods);
        }
    });
});
