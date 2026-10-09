import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { CraftingCatalog } from "../app/schemas/crafting";

const lineShape = (text: string) =>
    text
        .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
        .replace(/\[([^\]]+)\]/g, "$1")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[+-]?\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|[+-]?\d+(?:\.\d+)?/g, "#");

export async function writeCapturePolicy(catalog: CraftingCatalog) {
    const bases = Object.entries(catalog.bases).filter(
        ([id, base]) => !id.includes("Royale") && base.rarities.includes("rare") && !base.corrupted,
    );
    const specialModifiers = Object.entries(catalog.mods)
        .filter(
            ([id, mod]) =>
                !id.includes("Royale") &&
                ["prefix", "suffix"].includes(mod.generation_type) &&
                (["delve", "veiled", "unveiled", "mercenary", "ducat_crafted"].includes(
                    mod.domain,
                ) ||
                    (mod.domain === "item" &&
                        !mod.is_essence_only &&
                        !mod.spawn_weights.some((entry) => entry.weight > 0))),
        )
        .map(([id, mod]) => ({ id, name: mod.name, text: mod.text ?? null }));
    const ordinaryLines = new Set(
        Object.entries(catalog.mods)
            .filter(
                ([id, mod]) =>
                    mod.domain === "item" &&
                    !catalog.crafting.modRules[id]?.influence &&
                    mod.spawn_weights.some((entry) => entry.weight > 0),
            )
            .flatMap(([, mod]) => mod.text?.split("\n").map(lineShape) ?? []),
    );
    const policy = {
        equipmentBaseTypes: [...new Set(bases.map(([, base]) => base.name))].sort(),
        jewelBaseTypes: [
            ...new Set(
                bases
                    .filter(([, base]) => ["Jewel", "AbyssJewel"].includes(base.item_class))
                    .map(([, base]) => base.name),
            ),
        ].sort(),
        specialModifiers,
        distinctiveModifierLines: [
            ...new Set(
                specialModifiers.flatMap((mod) => mod.text?.split("\n").map(lineShape) ?? []),
            ),
        ]
            .filter((line) => line && !ordinaryLines.has(line))
            .sort(),
    };
    await writeFile(
        "../../packages/poe-market/data/capture-poe1.json",
        `${JSON.stringify(policy)}\n`,
    );
    console.log(
        `Generated capture policy: ${policy.equipmentBaseTypes.length} crafting bases, ${specialModifiers.length} special modifiers`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await writeCapturePolicy(
        JSON.parse(await readFile("public/game-data/crafting-poe1.json", "utf8")),
    );
