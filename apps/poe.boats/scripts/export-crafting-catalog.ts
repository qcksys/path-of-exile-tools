import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCraftingData } from "../../../packages/poe-game-data/src/crafting-data-model";
import {
    baseItemsSchema,
    dataPackageManifestSchema,
    itemClassesSchema,
    itemMetadataSchema,
    modsSchema,
    tagsSchema,
} from "../../../packages/poe-game-data/src/model";
import { gildedImplicitId } from "../app/lib/crafting-fossils";
import { heistEnchantmentKind } from "../app/lib/crafting-heist";
import { supportedStrongbox } from "../app/lib/crafting-strongboxes";
import {
    type CraftingBase,
    craftingBaseSchema,
    craftingCatalogSchema,
} from "../app/schemas/crafting";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function parseSocketInfo(value: unknown) {
    if (value === undefined) return [];
    if (typeof value !== "string" || !/^\d+:\d+:\d+(?: \d+:\d+:\d+)*$/.test(value))
        throw new Error("Invalid extracted socket_info metadata.");
    const entries = value.split(" ").map((entry) => {
        const [count, level, weight] = entry.split(":").map(Number);
        return { count, level, weight };
    });
    if (new Set(entries.map((entry) => entry.count)).size !== entries.length)
        throw new Error("Duplicate extracted socket_info count.");
    return craftingBaseSchema.shape.socketInfo.parse(entries);
}

export async function exportCraftingCatalog(directory: string, output: string) {
    const bytes = await readFile(resolve(directory, "manifest.json"));
    const manifest = dataPackageManifestSchema.parse(JSON.parse(bytes.toString()));
    const verified = async (path: string) => {
        const data = await readFile(resolve(directory, "data", path));
        if (digest(data) !== manifest.files[path]?.sha256)
            throw new Error(`Package hash mismatch: ${path}`);
        return JSON.parse(data.toString());
    };
    const [rawBases, rawMods, craftingBytes] = await Promise.all([
        verified("base_items.json"),
        verified("mods.json"),
        readFile(resolve(directory, "crafting-data.json")),
    ]);
    if (digest(craftingBytes) !== manifest.crafting_data_sha256)
        throw new Error("Package hash mismatch: crafting-data.json");
    const bases = baseItemsSchema.parse(rawBases);
    const mods = modsSchema.parse(rawMods);
    const crafting = validateCraftingData(
        JSON.parse(craftingBytes.toString()),
        {
            game: manifest.game,
            patch: manifest.client_build,
            basesSha256: manifest.files["base_items.json"]!.sha256,
            modsSha256: manifest.files["mods.json"]!.sha256,
            schemaSha256: manifest.dat_schema_sha256,
        },
        {
            base_items: bases,
            mods,
            item_classes: itemClassesSchema.parse(await verified("item_classes.json")),
            tags: tagsSchema.parse(await verified("tags.json")),
        },
    );
    const selected: Record<string, CraftingBase> = {};
    const metadata = new Map<string, ReturnType<typeof itemMetadataSchema.parse>>();
    for (const [id, base] of Object.entries(bases)) {
        if (
            !base.name ||
            !base.inherits_from ||
            crafting.classes[base.item_class]?.unmodifiable ||
            crafting.baseRules[id]?.unmodifiable
        )
            continue;
        if (!metadata.has(base.inherits_from))
            metadata.set(
                base.inherits_from,
                itemMetadataSchema.parse(await verified(`${base.inherits_from}.json`)),
            );
        const section = metadata.get(base.inherits_from)!.Mods;
        const enabled = section?.enable_rarity;
        const allowed = Array.isArray(enabled) ? enabled : [];
        const rarities = (["normal", "magic", "rare"] as const).filter(
            (rarity) =>
                (rarity === "normal" || allowed.includes(rarity)) &&
                section?.disable_rarity !== rarity,
        );
        if (!rarities.includes("magic")) continue;
        const rules = crafting.baseRules[id];
        if (!rules) throw new Error(`Missing extracted base restrictions: ${id}`);
        selected[id] = craftingBaseSchema.parse({
            ...base,
            levelRules: section,
            defences: base.properties,
            combat: base.properties,
            flask: base.properties,
            rarities,
            corrupted: rules.corrupted,
            initialSockets: rules.initialSockets,
            socketInfo: parseSocketInfo(metadata.get(base.inherits_from)!.Sockets?.socket_info),
        });
    }
    for (const chest of crafting.strongboxes) {
        if (!supportedStrongbox(manifest.game, chest.id)) continue;
        selected[chest.id] = craftingBaseSchema.parse({
            strongbox: true,
            name: chest.name,
            domain: manifest.game === "poe1" ? "chest" : "strongbox",
            item_class: "Strongbox",
            tags: [
                ...new Set([
                    "default",
                    ...chest.tags,
                    ...chest.mods.flatMap((id) => mods[id]!.adds_tags),
                ]),
            ],
            implicits: [],
            drop_level: chest.minimumLevel,
            inventory_width: 0,
            inventory_height: 0,
            defences: {},
            rarities: ["normal", "magic", "rare"],
            corrupted: false,
            initialSockets: 0,
        });
    }
    const domains = new Set(Object.values(selected).map((base) => base.domain));
    const requiredMods = new Set([
        ...(manifest.game === "poe1"
            ? Object.entries(mods)
                  .filter(([id, mod]) => heistEnchantmentKind(id, mod))
                  .map(([id]) => id)
            : []),
        ...crafting.anointing.maps.map((entry) => entry.mod),
        ...crafting.elementalConversions.flatMap((entry) =>
            Object.values(entry.mods).filter((id) => id !== null),
        ),
        ...(crafting.memoryMaps
            ? [crafting.memoryMaps.influenceMod, crafting.memoryMaps.enchantmentMod]
            : []),
        ...(crafting.fossils.some((fossil) => fossil.effects.includes("BetterSellPrice"))
            ? [gildedImplicitId]
            : []),
        ...Object.values(selected).flatMap((base) => base.implicits),
        ...crafting.strongboxes.flatMap((chest) => chest.mods),
        ...crafting.bench.flatMap((recipe) => (recipe.mod ? [recipe.mod] : [])),
        ...crafting.bench.flatMap((recipe) => (recipe.enchantment ? [recipe.enchantment.mod] : [])),
        ...crafting.flaskEnchantments.flatMap((recipe) => recipe.mods),
        ...crafting.beasts.flatMap((recipe) =>
            [recipe.mod, recipe.aspectMod].filter((id) => id !== null),
        ),
        ...crafting.essences.flatMap((essence) => Object.values(essence.mods)),
        ...crafting.anointing.recipes.flatMap((recipe) => (recipe.mod ? [recipe.mod] : [])),
        ...crafting.harvest.flatMap((recipe) =>
            recipe.enchantment ? [recipe.enchantment.mod] : [],
        ),
        ...crafting.liquidEmotions.flatMap((emotion) => emotion.rules.flatMap((rule) => rule.mods)),
        ...crafting.fossils.flatMap((fossil) => [...fossil.added, ...fossil.forced]),
        ...crafting.poe2Essences.flatMap((essence) =>
            essence.rules.flatMap((rule) => [
                ...(rule.mod ? [rule.mod] : []),
                ...rule.outcomes.map((entry) => entry.mod),
            ]),
        ),
    ]);
    for (const id of requiredMods)
        if (!mods[id]) throw new Error(`Unresolved crafting modifier: ${id}`);
    const selectedMods = Object.fromEntries(
        Object.entries(mods)
            .filter(
                ([id, mod]) =>
                    requiredMods.has(id) ||
                    ((domains.has(mod.domain) ||
                        [
                            "crafted",
                            "delve",
                            "veiled",
                            "unveiled",
                            "desecrated",
                            "mercenary",
                            "ducat_crafted",
                        ].includes(mod.domain)) &&
                        [
                            "prefix",
                            "suffix",
                            "corrupted",
                            "searing_exarch_implicit",
                            "eater_of_worlds_implicit",
                        ].includes(mod.generation_type)),
            )
            .map(([id, mod]) => [id, { ...mod, text: mod.text ?? crafting.modTexts[id] ?? null }]),
    );
    const descriptionIndices = [
        ...new Set([
            ...Object.entries(crafting.modDescriptions)
                .filter(([id]) => selectedMods[id])
                .flatMap(([, indices]) => indices),
            ...crafting.augments.flatMap((entry) =>
                entry.rules.flatMap((rule) => [
                    ...rule.statDescriptions,
                    ...rule.bondedDescriptions,
                ]),
            ),
        ]),
    ].sort((a, b) => a - b);
    const descriptionMap = new Map(descriptionIndices.map((index, position) => [index, position]));
    const selectedStats = new Set([
        ...Object.values(selectedMods).flatMap((mod) => mod.stats.map((stat) => stat.id)),
        ...crafting.augments.flatMap((entry) =>
            entry.rules.flatMap((rule) =>
                [...rule.stats, ...rule.bondedStats].map((stat) => stat.id),
            ),
        ),
    ]);
    const catalog = craftingCatalogSchema.parse({
        format: 1,
        game: manifest.game,
        patch: manifest.client_build,
        manifestSha256: digest(bytes),
        craftingSha256: digest(craftingBytes),
        bases: selected,
        mods: selectedMods,
        crafting: {
            ...crafting,
            augments: crafting.augments.map((entry) => ({
                ...entry,
                rules: entry.rules.map((rule) => ({
                    ...rule,
                    statDescriptions: rule.statDescriptions.map(
                        (index) => descriptionMap.get(index)!,
                    ),
                    bondedDescriptions: rule.bondedDescriptions.map(
                        (index) => descriptionMap.get(index)!,
                    ),
                })),
            })),
            taggedModifierEffects: crafting.taggedModifierEffects.filter((rule) =>
                selectedStats.has(rule.stat),
            ),
            scalableStats: crafting.scalableStats.filter((id) => selectedStats.has(id)),
            baseRules: Object.fromEntries(
                Object.entries(crafting.baseRules).filter(([id]) => selected[id]),
            ),
            modRules: Object.fromEntries(
                Object.entries(crafting.modRules).filter(([id]) => selectedMods[id]),
            ),
            modDescriptions: Object.fromEntries(
                Object.entries(crafting.modDescriptions)
                    .filter(([id]) => selectedMods[id])
                    .map(([id, indices]) => [
                        id,
                        indices.map((index) => descriptionMap.get(index)!),
                    ]),
            ),
            modTexts: Object.fromEntries(
                Object.entries(crafting.modTexts).filter(([id]) => selectedMods[id]),
            ),
            statDescriptions: descriptionIndices.map((index) => crafting.statDescriptions[index]),
            currencies: crafting.currencies.filter((currency) => currency.name),
            fossils: crafting.fossils.filter(
                (fossil) =>
                    fossil.name ||
                    crafting.fossils.some((parent) => parent.randomOutcomes.includes(fossil.id)),
            ),
            essences: crafting.essences.filter((essence) => essence.name),
            poe2Essences: crafting.poe2Essences.filter((essence) => essence.name),
            modEquivalencies: crafting.modEquivalencies
                .map((entry) => ({
                    ...entry,
                    mods: entry.mods.filter((id) => selectedMods[id]),
                }))
                .filter((entry) => entry.mods.length > 1),
        },
    });
    const contents = `${JSON.stringify(catalog)}\n`;
    try {
        if ((await readFile(output, "utf8")) === contents) return catalog;
    } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")
            throw error;
    }
    await mkdir(dirname(output), { recursive: true });
    await writeFile(`${output}.tmp`, contents);
    await rename(`${output}.tmp`, output);
    return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    for (const game of ["poe1", "poe2"]) {
        const catalog = await exportCraftingCatalog(
            resolve(`../../packages/poe-${game === "poe1" ? 1 : 2}-data`),
            resolve(`public/game-data/crafting-${game}.json`),
        );
        console.log(
            `${game} ${catalog.patch}: ${Object.keys(catalog.bases).length} bases, ${Object.keys(catalog.mods).length} modifiers`,
        );
    }
}
