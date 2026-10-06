import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableCatalysts } from "../app/lib/crafting-quality";
import { cleanModText, rolledModText } from "../app/lib/crafting-text";
import { craftingCatalogSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s PoB crafting blueprints", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && entry.drop_level === 1,
    )![0];
    const text = (records: string, summary = "", baseId = base) =>
        `Rarity: Rare\nTest\n${catalog.bases[baseId]!.name}\nCrafted: true\n${records}\nItem Level: 86\nImplicits: 0\n${summary}`;
    const life = game === "poe1" ? 17 : 15;

    it.each([
        "before",
        "after",
    ])("imports blueprint records %s Item Level, including empty slots and fractures", (position) => {
        const records = "Prefix: {fractured}{range:0.5}IncreasedLife1\nPrefix: None\nSuffix: None";
        const input =
            position === "before"
                ? text(records)
                : text("").replace("Implicits: 0", `Implicits: 0\n${records}`);
        const result = importCraftingItemText(engine, input);
        expect(result).toHaveLength(1);
        expect(result[0]!.item.mods).toEqual([
            { id: "IncreasedLife1", values: [life], crafted: false, fractured: true },
        ]);
        expect(result[0]!.warnings).toEqual([]);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result[0]!.item)))).toEqual(
            result[0]!.item,
        );
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result[0]!.item))[0]!
                .item,
        ).toEqual(result[0]!.item);
    });

    it("reconciles rendered summaries without adding the same affixes twice", () => {
        const result = importCraftingItemText(
            engine,
            text(
                "Prefix: {range:0.5}IncreasedLife1\nSuffix: {range:0.123}LifeRegeneration1",
                `{prefix}+${life} to maximum Life\n{suffix}${game === "poe1" ? "Regenerate 1.1 Life per second" : "1.1 Life Regeneration per second"}`,
            ),
        );
        expect(result[0]!.item.mods.map((mod) => mod.values)).toEqual([[life], [67]]);
        expect(result[0]!.warnings).toEqual([]);
    });

    it("checks merged hybrid summaries against the blueprint's raw stats", () => {
        const hybrid = game === "poe1" ? "LocalBaseArmourAndLife1" : "LocalIncreasedArmourAndLife1";
        expect(catalog.mods[hybrid]).toBeDefined();
        const definition = engine.mod(hybrid);
        const extraLife = definition.stats.find((stat) => stat.id === "base_maximum_life")!.min;
        const armour = cleanModText(definition.text!)
            .split("\n")
            .find((line) => !line.includes("maximum Life"))!
            .replace(/\((\d+)-\d+\)/g, "$1");
        const input = text(
            `Prefix: {range:0}IncreasedLife1\nPrefix: {range:0}${hybrid}`,
            `{prefix}+${10 + extraLife} to maximum Life\n{prefix}${armour}`,
        );
        const result = importCraftingItemText(engine, input);
        expect(result[0]!.item.mods.map((mod) => mod.id)).toEqual(["IncreasedLife1", hybrid]);
        expect(result[0]!.item.mods[1]!.values).toEqual(definition.stats.map((stat) => stat.min));
        expect(() =>
            importCraftingItemText(engine, input.replace(`+${10 + extraLife}`, "+999")),
        ).toThrow("summary does not match");
    });

    it("applies comma-separated positions to damage endpoints", () => {
        const id = "LocalAddedFireDamage1";
        const weapon = Object.entries(catalog.bases).find(
            ([baseId, entry]) =>
                entry.implicits.length === 0 &&
                engine
                    .pool({ ...engine.createItem(baseId), rarity: "rare" })
                    .some((entry) => entry.id === id),
        )![0];
        const result = importCraftingItemText(engine, text(`Prefix: {range:0,1}${id}`, "", weapon));
        expect(result[0]!.item.mods[0]!.values).toEqual(game === "poe1" ? [1, 4] : [1, 5]);
    });

    it("restarts the position list for each hybrid display line", () => {
        const id =
            game === "poe1"
                ? "LocalIncreasedPhysicalDamageReductionRatingPercentAndStunRecovery1"
                : "LocalIncreasedArmourAndLife1";
        const result = importCraftingItemText(engine, text(`Prefix: {range:0,1}${id}`));
        expect(result[0]!.item.mods[0]!.values).toEqual(
            engine.mod(id).stats.map((stat) => stat.min),
        );
    });

    it("keeps catalyst scaling outside raw blueprint rolls and implicit summaries", () => {
        const ring = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const item = engine.createItem(ring);
        const catalyst = availableCatalysts(catalog, item).find((entry) =>
            entry.description.includes("Life"),
        )!;
        const input = text(
            "Prefix: {range:0.5}IncreasedLife1",
            `{prefix}+${life} to maximum Life`,
            ring,
        ).replace(
            "Implicits: 0",
            `${catalyst.description}: +20%\nImplicits: ${item.implicits.length}\n${item.implicits.map((mod) => rolledModText(catalog, mod)).join("\n")}`,
        );
        const imported = importCraftingItemText(engine, input)[0]!.item;
        expect(imported.mods[0]!.values).toEqual([life]);
        expect(imported.implicits).toEqual(item.implicits);
        expect(exportCraftingItemText(engine, imported)).toContain(
            game === "poe1" ? "+20 to maximum Life" : "+18 to maximum Life",
        );
    });

    it("validates item level, groups, influence and affix capacity after reconstruction", () => {
        const groups = new Set<string>();
        const prefixes = engine
            .pool({ ...engine.createItem(base), rarity: "rare" })
            .filter(({ mod }) => {
                if (
                    mod.generation_type !== "prefix" ||
                    mod.groups.some((group) => groups.has(group))
                )
                    return false;
                for (const group of mod.groups) groups.add(group);
                return true;
            })
            .slice(0, 4);
        expect(prefixes).toHaveLength(4);
        expect(() =>
            importCraftingItemText(
                engine,
                text(prefixes.map(({ id }) => `Prefix: {range:0}${id}`).join("\n")),
            ),
        ).toThrow();
        const high = engine
            .pool({ ...engine.createItem(base), rarity: "rare" })
            .find(
                ({ mod }) =>
                    mod.stats.some((stat) => stat.id === "base_maximum_life") &&
                    mod.required_level > 20,
            )!;
        expect(() =>
            importCraftingItemText(
                engine,
                text(`Prefix: {range:0}${high.id}`).replace("Item Level: 86", "Item Level: 1"),
            ),
        ).toThrow();
        expect(() =>
            importCraftingItemText(
                engine,
                text("Prefix: {range:0}IncreasedLife1\nPrefix: {range:0}IncreasedLife2"),
            ),
        ).toThrow("same group");
        expect(() =>
            importCraftingItemText(
                engine,
                text("Prefix: {range:0}IncreasedLife1").replace(
                    "Rarity: Rare\nTest\n",
                    "Rarity: Normal\n",
                ),
            ),
        ).toThrow();
        if (game === "poe1") {
            const influenced = engine
                .pool({ ...engine.createItem(base), rarity: "rare", influences: [0] })
                .find((entry) => catalog.crafting.modRules[entry.id]?.influence === 0)!;
            const record = `${influenced.mod.generation_type === "prefix" ? "Prefix" : "Suffix"}: {range:0}${influenced.id}`;
            expect(() => importCraftingItemText(engine, text(record))).toThrow(
                "matching influence",
            );
            expect(
                importCraftingItemText(
                    engine,
                    text(record).replace("Item Level: 86", "Item Level: 86\nShaper Item"),
                )[0]!.item.influences,
            ).toEqual([0]);
        }
    });

    it.each([
        "Prefix: {range:0.5}UnknownModifier",
        "Suffix: {range:0.5}IncreasedLife1",
        "Prefix: {range:0.5,NaN}IncreasedLife1",
        "Prefix: {range:1.1}IncreasedLife1",
        "Prefix: {range:0.5,,0.2}IncreasedLife1",
        "Prefix: {range:}IncreasedLife1",
        "Prefix: {range:0.5}None",
        "Prefix: {fractured}None",
        "Prefix: {crafted}{range:0.5}IncreasedLife1",
    ])("rejects invalid blueprint %s", (record) => {
        expect(() => importCraftingItemText(engine, text(record))).toThrow(/Blueprint|blueprint/);
    });

    it("requires an explicit position for variable rolls without guessing PoB preferences", () => {
        expect(() => importCraftingItemText(engine, text("Prefix: IncreasedLife1"))).toThrow(
            "explicit {range:",
        );
        expect(() =>
            importCraftingItemText(engine, text("Prefix: None", "+10 to maximum Life")),
        ).toThrow(/summary.*not match/);
    });

    it("imports fixed-value blueprint modifiers without inventing a roll position", () => {
        const id = "ReducedLocalAttributeRequirements1";
        const result = importCraftingItemText(
            engine,
            text(`Suffix: ${id}`, `{suffix}${cleanModText(engine.mod(id).text!)}`),
        );
        expect(result[0]!.item.mods[0]).toEqual({
            id,
            values: engine.mod(id).stats.map((stat) => stat.min),
            crafted: false,
            fractured: false,
        });
        expect(result[0]!.warnings).toEqual([]);
    });

    if (game === "poe1")
        it("reconciles a bench-crafted blueprint modifier with its crafted summary flag", () => {
            const id = catalog.crafting.bench.find(
                (entry) =>
                    entry.itemClasses.includes("Body Armour") &&
                    entry.mod &&
                    engine.mod(entry.mod).generation_type === "suffix",
            )!.mod!;
            const original = importCraftingItemText(engine, text(`Suffix: {range:0}${id}`))[0]!
                .item;
            const summary = rolledModText(catalog, original.mods[0]!)!
                .split("\n")
                .map((line) => `{modGroup:${id}}{crafted}${line}`)
                .join("\n");
            const result = importCraftingItemText(engine, text(`Suffix: {range:0}${id}`, summary));
            expect(result[0]!.item.mods).toEqual(original.mods);
            expect(result[0]!.item.mods[0]!.crafted).toBe(true);
        });

    it.each([
        "{fractured}",
        "{suffix}",
        "{modGroup:IncreasedLife2}",
        "{desecrated}",
    ])("rejects conflicting summary annotation %s instead of dropping it", (annotation) => {
        expect(() =>
            importCraftingItemText(
                engine,
                text("Prefix: {range:0.5}IncreasedLife1", `${annotation}+${life} to maximum Life`),
            ),
        ).toThrow("annotations do not match");
    });

    it("retains additional crafted modifier lines alongside ordinary blueprint affixes", () => {
        const item = { ...engine.createItem(base), rarity: "rare" as const };
        const record = "Prefix: {range:0.5}IncreasedLife1";
        const crafted =
            game === "poe1"
                ? catalog.crafting.bench.find(
                      (entry) =>
                          entry.itemClasses.includes("Body Armour") &&
                          entry.mod &&
                          engine.mod(entry.mod).generation_type === "suffix",
                  )!.mod!
                : engine
                      .pool(item)
                      .find(
                          ({ mod }) =>
                              mod.generation_type === "suffix" &&
                              catalog.crafting.craftableModTypes.includes(mod.type),
                      )!.id;
        const mod = { ...engine.rollMod(crafted, seededRandom(1)), crafted: true };
        const result = importCraftingItemText(
            engine,
            text(
                record,
                `{prefix}+${life} to maximum Life\n${rolledModText(catalog, mod)!
                    .split("\n")
                    .map((line) => `{modGroup:${crafted}}{crafted}${line}`)
                    .join("\n")}`,
            ),
        );
        expect(result[0]!.item.mods).toHaveLength(2);
        expect(result[0]!.item.mods[1]).toMatchObject({ id: crafted, crafted: true });
    });
});
