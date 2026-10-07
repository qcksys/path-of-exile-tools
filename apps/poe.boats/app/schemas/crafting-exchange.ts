import {
    exchangePriceReferenceSchema,
    exchangeQuoteSchema,
    exchangeRealmMatchesGame,
    exchangeRealmSchema,
    exchangeSnapshotSchema,
} from "@poe-tools/market";
import { z } from "zod";

export const craftingExchangeInputSchema = z
    .strictObject({
        game: z.enum(["poe1", "poe2"]),
        realm: exchangeRealmSchema,
        league: exchangePriceReferenceSchema.shape.league,
        currency: z.string().min(1).max(500),
        itemIds: z.array(z.string().min(1).max(500)).min(1).max(500),
        at: z.number().int().nonnegative().optional(),
        window: exchangePriceReferenceSchema.shape.window,
    })
    .refine(
        (input) => exchangeRealmMatchesGame(input.realm, input.game),
        "Exchange realm does not match the game.",
    );
export const craftingExchangeResultSchema = z.strictObject({
    quotes: z.record(z.string(), exchangeQuoteSchema),
    missing: z.record(z.string(), z.string()),
});
export const craftingExchangeHistoryInputSchema = exchangePriceReferenceSchema.extend({
    before: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(1000).default(168),
});
export const craftingExchangeHistoryResultSchema = z.strictObject({
    history: z.array(exchangeSnapshotSchema),
    nextBefore: z.number().nullable(),
});
export type CraftingExchangeInput = z.infer<typeof craftingExchangeInputSchema>;
export type CraftingExchangeResult = z.infer<typeof craftingExchangeResultSchema>;
export type CraftingExchangeHistoryInput = z.infer<typeof craftingExchangeHistoryInputSchema>;
