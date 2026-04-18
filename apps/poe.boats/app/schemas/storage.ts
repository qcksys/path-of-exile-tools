import { z } from "zod";
import { IdolSetSchema } from "~/schemas/idol-set";

export const STORAGE_VERSION = 5;

export const StorageSchema = z.object({
    version: z.literal(STORAGE_VERSION),
    sets: z.array(IdolSetSchema),
    activeSetId: z.string().nullable(),
});

export type StorageData = z.infer<typeof StorageSchema>;

export function createEmptyStorage(): StorageData {
    return {
        version: STORAGE_VERSION,
        sets: [],
        activeSetId: null,
    };
}
