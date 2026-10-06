import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { clusterModPassives, clusterSkills, clusterText } from "../app/lib/crafting-clusters";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { validateLibrary } from "../app/lib/crafting-inventory";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { modifierTiers } from "../app/lib/crafting-modifier-details";
import {
    CraftingSimulation,
    calculateExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const base = (size = "Large") => `Metadata/Items/Jewels/JewelPassiveTreeExpansion${size}`;
const attack = "affliction_attack_damage_";
const life = "affliction_maximum_life";
const blank = (size = "Large", passive = attack) =>
    engine.validateItem({
        ...engine.createItem(base(size), 100),
        rarity: "rare",
        cluster: { passive },
    });

describe("build-extracted Cluster Jewels", () => {
    it("resolves notable effects through extracted grant stats without adding character effects to the item", () => {
        const item = engine.addStartingMod(blank(), "AfflictionNotableCalamitous", seededRandom(4));
        const mod = engine.mod(item.mods[0]!.id);
        const passives = clusterModPassives(catalog, mod, item.mods[0]!.values);
        expect(passives).toHaveLength(1);
        expect(passives[0]!.name).toBe("Calamitous");
        expect(passives[0]!.text).toContain("30% increased Elemental Damage with Attack Skills");
        expect(engine.statTotals(item).get("local_affliction_notable_calamitous")).toBe(1);
        expect(engine.statTotals(item).has("elemental_damage_with_attack_skills_+%")).toBe(false);
        expect(exportCraftingItemText(engine, item)).not.toContain(
            "30% increased Elemental Damage",
        );
        expect(clusterModPassives(catalog, mod, [0])).toEqual([]);
        expect(clusterModPassives(catalog, engine.mod("IncreasedLife1"))).toEqual([]);
    });

    it("provides a passive description for every extracted Cluster notable in the modifier browser", () => {
        const notables = Object.values(catalog.mods).filter(
            (mod) =>
                mod.domain === "affliction_jewel" &&
                mod.adds_tags.includes("has_affliction_notable"),
        );
        expect(notables.length).toBeGreaterThan(250);
        for (const mod of notables) {
            const passives = clusterModPassives(catalog, mod);
            expect(passives.length, mod.name).toBeGreaterThan(0);
            expect(passives.every((passive) => passive.notable && passive.text?.length)).toBe(true);
        }
    });
    it("exposes all 55 passive definitions by size and requires explicit imported state", () => {
        expect(Object.keys(catalog.crafting.clusterJewels!.skills)).toHaveLength(55);
        for (const [baseId, rule] of Object.entries(catalog.crafting.clusterJewels!.bases)) {
            const item = engine.createItem(baseId);
            const skills = clusterSkills(catalog, item);
            expect(skills.length).toBeGreaterThan(0);
            expect(skills.every((skill) => skill.size === rule.size)).toBe(true);
            expect(item.cluster).toEqual({ passive: skills[0]!.id });
            expect(() => engine.validateItem({ ...item, cluster: undefined })).toThrow(
                "passive type",
            );
        }
    });

    it("matches the reference Attack Damage notable weights and changes cached pools with the passive type", () => {
        const item = blank();
        const pool = engine.pool(item);
        expect(pool.find((entry) => entry.id === "AfflictionNotableCalamitous")?.weight).toBe(216);
        expect(pool.find((entry) => entry.id === "AfflictionNotableDevastator")?.weight).toBe(27);
        const suffixes = pool.filter((entry) => entry.mod.generation_type === "suffix");
        expect(suffixes).toHaveLength(39);
        expect(suffixes.reduce((sum, entry) => sum + entry.weight, 0)).toBe(15230);
        const spell = blank("Large", "affliction_spell_damage");
        expect(engine.pool(spell).some((entry) => entry.id === "AfflictionNotableCalamitous")).toBe(
            false,
        );
        expect(engine.pool(item)).toEqual(pool);
        expect(
            modifierTiers(engine, item.baseId, "ordinary", item.cluster).get(
                "AfflictionNotableCalamitous",
            ),
        ).toBe(1);
        expect(
            modifierTiers(engine, spell.baseId, "ordinary", spell.cluster).has(
                "AfflictionNotableCalamitous",
            ),
        ).toBe(false);
        expect(engine.statTotals(item).has("attack_damage_+%")).toBe(false);
    });

    it("obeys the Small Jewel generation exclusion after adding a notable", () => {
        const item = blank("Small", life);
        const notables = engine
            .pool(item)
            .filter((entry) => entry.mod.adds_tags.includes("has_affliction_notable"));
        expect(notables.length).toBeGreaterThan(1);
        const rolled = engine.addStartingMod(item, notables[0]!.id, seededRandom(7));
        expect(
            engine
                .pool(rolled)
                .filter((entry) => entry.mod.adds_tags.includes("has_affliction_notable")),
        ).toEqual([]);
        expect(() => engine.addStartingMod(rolled, notables[1]!.id, seededRandom(7))).toThrow();
        expect(engine.limits(rolled)).toMatchObject({ max: 4, prefixes: 2, suffixes: 2 });
    });

    it("rejects incompatible passives, counts, annotations on ordinary bases and invalid imported modifiers", () => {
        for (const cluster of [
            { passive: life },
            { passive: "missing" },
            { passive: attack, nodes: 7 },
            { passive: attack, nodes: 13 },
            { passive: attack, nodes: 8.5 },
            { passive: attack, jewelSockets: 4 },
        ])
            expect(() => engine.validateItem({ ...blank(), cluster })).toThrow();
        expect(() =>
            engine.validateItem({ ...engine.createItem(baseId), cluster: { passive: attack } }),
        ).toThrow("PoE 1 Cluster Jewel");
        const item = engine.addStartingMod(blank(), "AfflictionNotableCalamitous", seededRandom(4));
        expect(() =>
            engine.validateItem({ ...item, cluster: { passive: "affliction_spell_damage" } }),
        ).toThrow();
        expect(() => engine.validateItem({ ...item, level: 1 })).toThrow();
    });

    it("retains passive properties through currency rolls and fresh generation without inventing a node-count distribution", () => {
        const item = {
            ...blank(),
            rarity: "normal" as const,
            cluster: { passive: attack, nodes: 8, jewelSockets: 2 },
        };
        for (const seed of [1, 3, 42]) {
            const rare = engine.apply(item, currency("transmute_to_rare"), seededRandom(seed)).item;
            for (const method of [
                currency("reroll_mod_values"),
                currency("convert_to_normal"),
                { kind: "generate" as const, id: "rare" as const },
            ]) {
                const result = engine.apply(rare, method, seededRandom(seed)).item;
                expect(result.cluster).toEqual(item.cluster);
                expect(result.mods.length).toBeLessThanOrEqual(4);
            }
        }
        expect(
            engine.apply(blank(), { kind: "generate", id: "normal" }, seededRandom(3)).item.cluster,
        ).toEqual({ passive: attack });
    });

    it.each(
        Object.entries(catalog.crafting.clusterJewels!.bases).flatMap(([baseId, rule]) =>
            clusterSkills(catalog, { baseId }).map((skill) => ({ baseId, rule, skill })),
        ),
    )("round trips $skill.id with known and unknown counts and English enchantments", ({
        baseId,
        rule,
        skill,
    }) => {
        for (const nodes of [undefined, rule.minNodes]) {
            const item = engine.validateItem({
                ...engine.createItem(baseId),
                cluster: { passive: skill.id, ...(nodes ? { nodes, jewelSockets: 0 } : {}) },
            });
            const text = exportCraftingItemText(engine, item);
            expect(importCraftingItemText(engine, text)[0]!.item).toEqual(item);
            const native = [
                "Rarity: Normal",
                engine.base(item).name,
                "--------",
                "Item Level: 86",
                "--------",
                ...clusterText(catalog, item).map((line) => `${line} (enchant)`),
            ].join("\n");
            expect(importCraftingItemText(engine, native)[0]!.item).toEqual(item);
        }
    });

    it("round trips notable modifiers alongside cluster enchants and rejects incomplete or conflicting text", () => {
        const item = engine.addStartingMod(
            { ...blank(), cluster: { passive: attack, nodes: 8, jewelSockets: 2 } },
            "AfflictionNotableCalamitous",
            seededRandom(4),
        );
        const text = exportCraftingItemText(engine, item);
        expect(importCraftingItemText(engine, text)[0]!.item).toEqual(item);
        expect(() => importCraftingItemText(engine, `${text}\nUnknown cluster modifier`)).toThrow(
            "Unknown cluster modifier",
        );
        for (const changed of [
            text.replace("Adds 8", "Adds 9.5"),
            text.replace("10% increased Attack Damage", "11% increased Attack Damage"),
            text.replace(`Cluster Passive: ${attack}`, "Cluster Passive: affliction_spell_damage"),
            text.replace("Adds 8 Passive Skills", "Adds (2-3) Passive Skills"),
        ])
            expect(() => importCraftingItemText(engine, changed)).toThrow();
        expect(() =>
            importCraftingItemText(engine, "Rarity: Normal\nLarge Cluster Jewel\nItem Level: 86"),
        ).toThrow("passive type");
    });

    it("uses the same extracted pool in exact odds and seeded simulation and retains state in projects and libraries", () => {
        const starting = { ...blank(), rarity: "magic" as const };
        const suffix = engine
            .pool(starting)
            .find((entry) => entry.mod.generation_type === "suffix")!;
        const item = engine.addStartingMod(starting, suffix.id, seededRandom(1));
        const method = currency("add_mod_to_magic");
        const target = engine.validateTarget({
            groups: [{ mods: ["AfflictionNotableCalamitous"] }],
        });
        const pool = engine.pool(item);
        const probability = 216 / pool.reduce((sum, entry) => sum + entry.weight, 0);
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(
            probability,
            12,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [],
            prices: {},
            seed: 42,
            iterations: 2000,
            maxActions: 1,
            inventory: [{ id: "jewel", name: "Attack", item }],
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
        expect(
            validateLibrary(engine, { ...project, inventoryTabs: [] }).inventory[0]!.item,
        ).toEqual(item);
        const simulation = new CraftingSimulation(catalog, project);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(Math.abs(result.probability - probability)).toBeLessThan(0.015);
        expect(result.samples.every((sample) => sample.item.cluster?.passive === attack)).toBe(
            true,
        );
    });

    it("restores Cluster Jewel imprints and rejects snapshots from a different passive setup", () => {
        const magic = engine.apply(
            { ...blank(), rarity: "normal", cluster: { passive: attack, nodes: 8 } },
            currency("transmute_to_magic"),
            seededRandom(1),
        ).item;
        const imprinted = engine.apply(
            magic,
            { kind: "beast", id: "EinharMasterCraft27" },
            seededRandom(2),
        ).item;
        expect(imprinted.imprint?.cluster).toEqual(magic.cluster);
        const regal = engine.apply(
            imprinted,
            currency("upgrade_magic_to_rare"),
            seededRandom(3),
        ).item;
        expect(engine.apply(regal, currency("restore_imprint"), seededRandom(4)).item).toEqual(
            magic,
        );
        expect(() =>
            engine.validateItem({ ...imprinted, cluster: { ...magic.cluster, nodes: 9 } }),
        ).toThrow("does not belong");
    });

    it("does not expose PoE 1 passive types or accept their state in PoE 2", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const current = new CraftingEngine(data);
        const item = current.createItem(Object.keys(data.bases)[0]!);
        expect(data.crafting.clusterJewels).toBeNull();
        expect(clusterSkills(data, item)).toEqual([]);
        expect(clusterModPassives(data, engine.mod("AfflictionNotableCalamitous"))).toEqual([]);
        expect(() => current.validateItem({ ...item, cluster: { passive: attack } })).toThrow(
            "PoE 1 Cluster Jewel",
        );
    });
});
