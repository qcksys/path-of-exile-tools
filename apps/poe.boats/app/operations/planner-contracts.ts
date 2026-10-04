import { z } from "zod";
import { IdolSetSchema } from "~/schemas/idol-set";
import { InventoryIdolSchema } from "~/schemas/inventory";
import { ShareIdSchema } from "~/schemas/share";
import { IdSchema } from "./operation";

export const SetIdSchema = z.object({ setId: IdSchema });
export const CreateSetSchema = IdolSetSchema.pick({ name: true });
export const UpdateSetSchema = IdolSetSchema.pick({
    name: true,
    mapDevice: true,
    unlockedConditions: true,
})
    .extend({
        mapDevice: IdolSetSchema.shape.mapDevice.unwrap(),
        unlockedConditions: IdolSetSchema.shape.unlockedConditions.unwrap(),
    })
    .partial()
    .extend({
        setId: IdSchema,
        isActive: z.boolean().optional(),
    });
export const SavedSetSchema = z.object({ set: IdolSetSchema, isActive: z.boolean() });
export const CreateShareSchema = z.object({
    set: IdolSetSchema,
    inventory: z.array(InventoryIdolSchema).max(500),
});
export const GetShareSchema = z.object({ shareId: ShareIdSchema });
export const LeaguePriceSchema = z.object({
    league: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[\w\s.-]+$/),
});
