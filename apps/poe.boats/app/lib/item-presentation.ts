import { z } from "zod";
import type { CraftingCatalog } from "~/schemas/crafting";
import { cleanModText } from "./crafting-text";

export const itemPresentationSchema = z.object({
    name: z.string(),
    itemClass: z.string(),
    art: z.string(),
    dropLevel: z.number(),
    requirements: z
        .object({
            strength: z.number(),
            dexterity: z.number(),
            intelligence: z.number(),
            level: z.number(),
        })
        .nullable(),
    implicits: z.array(z.string()),
});
export const itemPresentationsSchema = z.record(z.string(), itemPresentationSchema);
export type ItemPresentation = z.infer<typeof itemPresentationSchema>;
export type ItemPresentations = z.infer<typeof itemPresentationsSchema>;

const names = new WeakMap<ItemPresentations, Map<string, ItemPresentation>>();

export function findItemPresentation(items: ItemPresentations, id?: string, name?: string) {
    const item = id ? items[id.replace(/^poe[12]:/, "")] : undefined;
    if (item || !name) return item;
    let index = names.get(items);
    if (!index) {
        index = new Map();
        for (const entry of Object.values(items)) {
            const key = entry.name.toLowerCase();
            if (!index.get(key)?.art) index.set(key, entry);
        }
        names.set(items, index);
    }
    return index.get(name.toLowerCase());
}

export function marketItemArtUrl(asset: string | null, game: "poe1" | "poe2" = "poe1") {
    if (!asset) return "";
    const path = asset.replace(/^Art\//, "").replace(/\.(dds|png|webp)$/, "");
    if (!/^2DItems\/[\w /'-]+$/.test(path) || path.split("/").includes("..")) return "";
    return itemArtUrl(`Art/${path}.dds`, game);
}

export function craftingItemOptions(catalog: CraftingCatalog) {
    return Object.entries(catalog.bases)
        .map(([id, base]) => ({
            id,
            label: `${base.name} · ${base.item_class}`,
            item: {
                name: base.name,
                itemClass: base.item_class,
                art: "",
                dropLevel: base.drop_level,
                requirements: base.requirements,
                implicits: base.implicits.flatMap((id) =>
                    catalog.mods[id]?.text ? [cleanModText(catalog.mods[id].text)] : [],
                ),
            },
        }))
        .sort((a, b) => compareItemPresentations(a.item, b.item));
}

export function itemArtUrl(path: string, game: "poe1" | "poe2" = "poe1") {
    if (!path.startsWith("Art/2DItems/") || !path.endsWith(".dds")) return "";
    const asset = path.slice(0, -4).split("/").map(encodeURIComponent).join("/");
    return game === "poe2"
        ? `https://cdn.poe2db.tw/image/${asset}.webp`
        : `https://www.pathofexile.com/image/${asset}.png`;
}

export function itemSubtitle(item: ItemPresentation) {
    const requirements = item.requirements;
    return [
        `Base level ${item.dropLevel}`,
        requirements &&
            [
                requirements.strength && `${requirements.strength} Str`,
                requirements.dexterity && `${requirements.dexterity} Dex`,
                requirements.intelligence && `${requirements.intelligence} Int`,
            ]
                .filter(Boolean)
                .join(" / "),
        requirements?.level ? `Requires level ${requirements.level}` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

export function compareItemPresentations(a: ItemPresentation, b: ItemPresentation) {
    const requirement = (
        item: ItemPresentation,
        key: "level" | "strength" | "dexterity" | "intelligence",
    ) => item.requirements?.[key] ?? 0;
    return (
        a.itemClass.localeCompare(b.itemClass) ||
        a.dropLevel - b.dropLevel ||
        requirement(a, "level") - requirement(b, "level") ||
        requirement(a, "strength") - requirement(b, "strength") ||
        requirement(a, "dexterity") - requirement(b, "dexterity") ||
        requirement(a, "intelligence") - requirement(b, "intelligence") ||
        a.name.localeCompare(b.name)
    );
}
