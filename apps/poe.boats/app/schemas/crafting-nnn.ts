import { z } from "zod";

export const nonNativeEssenceSourceSchema = z.object({
    id: z.string(),
    name: z.string(),
    modId: z.string(),
    side: z.enum(["prefix", "suffix"]),
    nativeOnOther: z.boolean().nullable(),
    rerollsRare: z.boolean(),
    itemLevelLimit: z.number().nullable(),
});
