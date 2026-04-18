import { z } from "zod";
import { IdolSetSchema } from "~/schemas/idol-set";
import { InventoryIdolSchema } from "~/schemas/inventory";

export const SHARE_ID_LENGTH = 10;

export const ShareIdSchema = z
    .string()
    .length(SHARE_ID_LENGTH)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid share ID format");

export type ShareId = z.infer<typeof ShareIdSchema>;

export const SharedSetSchema = z.object({
    version: z.literal(1),
    set: IdolSetSchema,
    idols: z.array(InventoryIdolSchema),
    createdAt: z.number(),
});

export type SharedSet = z.infer<typeof SharedSetSchema>;
