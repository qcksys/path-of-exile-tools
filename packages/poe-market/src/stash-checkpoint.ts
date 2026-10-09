import { z } from "zod";

export const stashCheckpointSchema = z.object({
    id: z.string().uuid(),
    realm: z.enum(["pc", "xbox", "sony"]),
    league: z.string().min(1).max(100),
    cursor: z.string().min(1).max(255).nullable(),
    nextCursor: z.string().min(1).max(255),
    capturedAt: z.number().int().nonnegative(),
    responseHash: z.string().regex(/^[a-f0-9]{64}$/),
    stashCount: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    responseBytes: z.number().int().nonnegative(),
});

export const stashCheckpointUploadSchema = stashCheckpointSchema.extend({
    responseGzip: z.string().max(16_000_000).nullable(),
});

export const stashCheckpointQuerySchema = z
    .object({
        kind: z.enum(["checkpoints", "sample"]),
        realm: stashCheckpointSchema.shape.realm,
        league: stashCheckpointSchema.shape.league,
        from: z.coerce.number().int().nonnegative(),
        to: z.coerce.number().int().nonnegative(),
        afterTime: z.coerce.number().int().nonnegative().optional(),
        afterId: stashCheckpointSchema.shape.id.optional(),
    })
    .refine((v) => v.to > v.from && v.to - v.from <= 31 * 86_400_000, {
        message: "Choose a range of at most 31 days.",
    })
    .refine((v) => (v.afterTime === undefined) === (v.afterId === undefined), {
        message: "Both pagination fields are required together.",
    });

export type StashCheckpoint = z.infer<typeof stashCheckpointSchema>;
export type StashCheckpointUpload = z.infer<typeof stashCheckpointUploadSchema>;
export type StashCheckpointQuery = z.infer<typeof stashCheckpointQuerySchema>;
