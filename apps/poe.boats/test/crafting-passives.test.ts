import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { extractedGrantedPassives } from "../app/lib/crafting-passives";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const base = Object.entries(catalog.bases).find(([, entry]) => entry.name === "Rusted Cuirass")![0];
const passive = "elemental32";
const modId = "EssenceGrantedPassive";
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const annul = currency("remove_random_mod");
function prepared() {
    return engine.addStartingMod(
        engine.setStartingPassive(engine.createItem(base), passive),
        "ColdResist1",
        seededRandom(1),
    );
}

describe("existing PoE 2 allocated passive modifiers", () => {
    it("sets and replaces an existing payload using extracted tree and anointment notables", () => {
        const item = prepared();
        expect(item.mods[0]).toMatchObject({
            id: modId,
            values: [0],
            crafted: true,
            grantedPassive: passive,
        });
        expect(rolledModText(catalog, item.mods[0]!, item)).toBe("Allocates Harness the Elements");
        const changed = engine.setStartingPassive(item, "witch_sorceress_notable1");
        expect(changed.mods).toHaveLength(2);
        expect(changed.mods[0]!.grantedPassive).toBe("witch_sorceress_notable1");
        expect(item.mods[0]!.grantedPassive).toBe(passive);
        expect(catalog.crafting.anointing.passives.witch_sorceress_notable1).toBeUndefined();
        const passives = extractedGrantedPassives(catalog);
        expect(Object.keys(passives)).toHaveLength(942);
        for (const [id, entry] of Object.entries(catalog.crafting.passiveTree!.notables))
            if (entry.ascendancy || entry.visibleForAscendancy)
                expect(passives[id]).toBeUndefined();
    });

    it("rejects missing, unknown, misplaced and out-of-range payloads and full affix sides", () => {
        const item = prepared();
        for (const grantedPassive of [undefined, "unknown"])
            expect(() =>
                engine.validateItem({ ...item, mods: [{ ...item.mods[0], grantedPassive }] }),
            ).toThrow(/passive/);
        expect(() =>
            engine.validateItem({ ...item, mods: [{ ...item.mods[1], grantedPassive: passive }] }),
        ).toThrow(/passive/);
        expect(() =>
            engine.validateItem({ ...item, mods: [{ ...item.mods[0], values: [12611] }] }),
        ).toThrow("extracted ranges");
        const ring = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Iron Ring",
        )![0];
        expect(() => engine.setStartingPassive(engine.createItem(ring), passive)).toThrow(
            "cannot allocate",
        );
        let full = engine.validateItem({ ...engine.createItem(base), rarity: "rare" });
        for (let count = 0; count < 3; count++)
            full = engine.addStartingMod(
                full,
                engine.pool(full, { side: "prefix" })[0]!.id,
                seededRandom(1),
            );
        expect(() => engine.setStartingPassive(full, passive)).toThrow(/affix|prefix/i);
        expect(() => engine.validateTarget({ groups: [], grantedPassives: ["unknown"] })).toThrow(
            "Unknown allocated",
        );
    });

    it("preserves allocated identity through Divine and JSON while removals remove the allocation", () => {
        const item = prepared();
        const target = engine.validateTarget({ groups: [], grantedPassives: [passive] });
        const divine = currency("reroll_mod_values");
        const result = engine.apply(item, divine, seededRandom(3));
        expect(result.item.mods[0]).toEqual(item.mods[0]);
        expect(calculateExact(engine, item, divine, target).probability).toBe(1);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        expect(engine.matches({ ...item, mods: item.mods.slice(1) }, target)).toBe(false);
        expect(engine.matches(item, { ...target, grantedPassives: ["dexterity102"] })).toBe(false);
        expect(calculateExact(engine, item, annul, target).probability).toBe(0.5);
    });

    it("shares passive-only targets with exact processes, seeded simulation and costs", () => {
        const item = prepared();
        const target = engine.validateTarget({ groups: [], grantedPassives: [passive] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            target,
            method: annul,
            steps: [{ id: "annul", method: annul, condition: target }],
            prices: { [annul.id]: 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 0.5,
            meanCost: 4,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            meanCost: 4,
            errors: {},
            spending: { [annul.id]: 1000 },
        });
        expect(simulation.result().probability).toBeCloseTo(0.5, 1);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("imports explicit allocated passives separately from instilled enchantments and preserves named duplicates in exports", () => {
        for (const id of [passive, "witch_sorceress_notable1", "Puppetmaster6", "Puppetmaster9"]) {
            const item = engine.setStartingPassive(prepared(), id);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
            ).toEqual(item);
        }
        const copy =
            "Rarity: Rare\nMind Shell\nRusted Cuirass\nItem Level: 86\n--------\nAllocates Harness the Elements\n+15% to Cold Resistance";
        const imported = importCraftingItemText(engine, copy)[0]!.item;
        expect(imported.mods.find((entry) => entry.id === modId)?.grantedPassive).toBe(passive);
        expect(imported.anointments).toBeUndefined();
        expect(() =>
            importCraftingItemText(
                engine,
                copy.replace("Harness the Elements", "Nonexistent Skill"),
            ),
        ).toThrow();
        expect(() =>
            importCraftingItemText(
                engine,
                copy.replace("Harness the Elements", "Puppet Master chance"),
            ),
        ).toThrow();
        const tampered = exportCraftingItemText(engine, prepared()).replace(
            `@${passive}`,
            "@unknown",
        );
        expect(() => importCraftingItemText(engine, tampered)).toThrow();
    });

    it("keeps the random Delirium method unavailable without an extracted outcome pool", () => {
        const essence = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Essence of Delirium",
        )!;
        expect(engine.essenceSupported(essence.id)).toBe(false);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(prepared(), { kind: "essence", id: essence.id }, random)).toThrow(
            "outcome rule",
        );
        expect(pick).not.toHaveBeenCalled();
    });
});
