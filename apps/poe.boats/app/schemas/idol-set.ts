import { z } from "zod";
import { InventoryIdolSchema } from "~/schemas/inventory";
import { createEmptyMapDevice, MapDeviceSchema } from "~/schemas/scarab";

export const GridPositionSchema = z.object({
    x: z.number().int().min(0).max(5),
    y: z.number().int().min(0).max(6),
});

export const IdolPlacementSchema = z.object({
    id: z.string().min(1),
    inventoryIdolId: z.string().min(1),
    position: GridPositionSchema,
});

export const IdolSetSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(50),
    createdAt: z.number(),
    updatedAt: z.number(),
    placements: z.array(IdolPlacementSchema),
    inventory: z.array(InventoryIdolSchema).default([]),
    mapDevice: MapDeviceSchema.default(createEmptyMapDevice()),
    unlockedConditions: z.array(z.string()).default([]),
    contentHash: z.string().optional(),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;
export type IdolPlacement = z.infer<typeof IdolPlacementSchema>;
export type IdolSet = z.infer<typeof IdolSetSchema>;
