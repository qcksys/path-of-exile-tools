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

export function itemArtUrl(path: string) {
    if (!path.startsWith("Art/2DItems/") || !path.endsWith(".dds")) return "";
    return `https://www.pathofexile.com/image/${path.slice(0, -4).split("/").map(encodeURIComponent).join("/")}.png`;
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
