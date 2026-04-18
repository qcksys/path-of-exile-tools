import { z } from "zod";
import { IdolInstanceSchema } from "~/schemas/idol";

export const ImportSourceSchema = z.enum(["clipboard", "manual", "shared"]);

export const InventoryIdolSchema = z.object({
    id: z.string().min(1),
    idol: IdolInstanceSchema,
    importedAt: z.number(),
    source: ImportSourceSchema,
    usageCount: z.number().int().min(0).default(0),
});

export const InventorySchema = z.object({
    idols: z.array(InventoryIdolSchema),
});

export type ImportSource = z.infer<typeof ImportSourceSchema>;
export type InventoryIdol = z.infer<typeof InventoryIdolSchema>;
export type Inventory = z.infer<typeof InventorySchema>;
