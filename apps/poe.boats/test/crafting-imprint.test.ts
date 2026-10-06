import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { CraftingSimulation } from "../app/lib/crafting-simulation";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const beast = { kind: "beast" as const, id: "EinharMasterCraft27" };
const magic = () =>
    engine.apply(engine.createItem(baseId), currency("transmute_to_magic"), seededRandom(1)).item;

describe("PoE 1 imprints", () => {
    it("stores a magic snapshot, restores after regal and consumes the imprint", () => {
        const item = magic();
        const imprinted = engine.apply(item, beast, seededRandom(2));
        expect(item.imprint).toBeUndefined();
        expect(imprinted.item.imprint).toEqual(item);
        expect(imprinted.cost).toEqual([
            { id: beast.id, name: "Beastcraft · Create an Imprint: Of a Magic Item", amount: 1 },
        ]);
        const regal = engine.apply(
            imprinted.item,
            currency("upgrade_magic_to_rare"),
            seededRandom(3),
        ).item;
        expect(regal.imprint).toEqual(item);
        const restored = engine.apply(regal, currency("restore_imprint"), seededRandom(4));
        expect(restored.item).toEqual(item);
        expect(restored.cost).toEqual([]);
        expect(() =>
            engine.apply(restored.item, currency("restore_imprint"), seededRandom(4)),
        ).toThrow("no stored imprint");
    });

    it("rejects rare beast-imprints, fractured items and mismatched imported snapshots", () => {
        const item = magic();
        expect(() => engine.apply({ ...item, rarity: "rare" }, beast, seededRandom(1))).toThrow(
            "magic",
        );
        const fractured = {
            ...item,
            mods: item.mods.map((entry, i) => ({ ...entry, fractured: i === 0 })),
        };
        expect(() => engine.apply(fractured, beast, seededRandom(1))).toThrow("Fractured");
        const imprinted = engine.apply(item, beast, seededRandom(2)).item;
        expect(() => engine.validateItem({ ...imprinted, level: 85 })).toThrow("does not belong");
        expect(() =>
            engine.apply(
                { ...imprinted, corrupted: true },
                currency("restore_imprint"),
                seededRandom(2),
            ),
        ).toThrow("uncorrupted");
    });

    it("charges a complete beastcraft once in a process and consumes restoration without extra cost", () => {
        const item = magic();
        const target = engine.validateTarget({
            groups: item.mods.map((entry) => ({ mods: [entry.id] })),
        });
        const always = engine.validateTarget({ groups: [] });
        const regal = currency("upgrade_magic_to_rare");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            target,
            method: beast,
            steps: [
                {
                    id: "imprint",
                    method: beast,
                    condition: always,
                    onSuccess: "regal",
                    onFailure: "failure",
                },
                {
                    id: "regal",
                    method: regal,
                    condition: always,
                    onSuccess: "restore",
                    onFailure: "failure",
                },
                {
                    id: "restore",
                    method: currency("restore_imprint"),
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [beast.id]: 20, [engine.costs(regal)[0]!.id]: 1 },
            seed: 4,
            iterations: 1,
            maxActions: 3,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        simulation.runTrial();
        expect(simulation.result().successes).toBe(1);
        expect(simulation.result().meanCost).toBe(21);
        expect(simulation.result().samples[0]!.item).toEqual(item);
    });
});
