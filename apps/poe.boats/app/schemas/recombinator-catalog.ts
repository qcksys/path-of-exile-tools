import { z } from "zod";

const weightSchema = z.tuple([z.string(), z.number().nonnegative()]);
export const catalogBaseSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    itemClass: z.string().min(1),
    tags: z.array(z.string()),
});
export const catalogModSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    text: z.string().min(1),
    side: z.enum(["prefixes", "suffixes"]),
    level: z.number().int().nonnegative(),
    maxLevel: z.number().int().nonnegative(),
    groups: z.array(z.string().min(1)).min(1),
    addsTags: z.array(z.string()),
    spawn: z.array(weightSchema),
    generation: z.array(weightSchema),
    crafted: z.boolean().optional(),
    exclusive: z.boolean().optional(),
});
export const catalogRecipeSchema = z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["essence", "bench"]),
    mod: z.string(),
    itemClasses: z.array(z.string()),
    cost: z.array(z.object({ name: z.string(), amount: z.number().int().positive() })),
});
export const recombinatorCatalogSchema = z.object({
    format: z.literal(1),
    game: z.literal("poe1"),
    patch: z.string().min(1),
    source: z.object({
        manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
        basesSha256: z.string().regex(/^[a-f0-9]{64}$/),
        modsSha256: z.string().regex(/^[a-f0-9]{64}$/),
        craftingSha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        craftingDataSha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
    }),
    bases: z.array(catalogBaseSchema).min(1),
    mods: z.array(catalogModSchema).min(1),
    recipes: z.array(catalogRecipeSchema).optional(),
});
export type CatalogBase = z.infer<typeof catalogBaseSchema>;
export type CatalogMod = z.infer<typeof catalogModSchema>;
export type CatalogRecipe = z.infer<typeof catalogRecipeSchema>;
export type RecombinatorCatalog = z.infer<typeof recombinatorCatalogSchema>;
