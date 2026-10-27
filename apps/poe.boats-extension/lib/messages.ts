import {
    extensionMessageSchema,
    pageMessageSchema,
    tradeGameSchema,
    tradePayloadSchema,
} from "@poe-tools/trade-bridge";
import { z } from "zod";

/** A request the trade page's main-world script makes on the background's behalf. */
export const tradeRequestSchema = z.discriminatedUnion("method", [
    z.strictObject({ method: z.literal("GET"), path: z.string().max(2000) }),
    z.strictObject({
        method: z.literal("POST"),
        path: z.string().max(2000),
        body: tradePayloadSchema,
    }),
]);
export type TradeRequest = z.infer<typeof tradeRequestSchema>;

export const tradeResponseSchema = z.strictObject({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
    body: z.unknown(),
});
export type TradeResponse = z.infer<typeof tradeResponseSchema>;

/** Content scripts → background. */
export const contentToBackgroundSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("page"), message: pageMessageSchema }),
    z.strictObject({ kind: z.literal("tradeReady"), game: tradeGameSchema }),
]);
export type ContentToBackground = z.infer<typeof contentToBackgroundSchema>;

/** Background → poe.boats content script. */
export const backgroundToPageSchema = z.strictObject({
    kind: z.literal("toPage"),
    message: extensionMessageSchema,
});

/** Background → trade content script. */
export const backgroundToTradeSchema = z.strictObject({
    kind: z.literal("tradeRequest"),
    request: tradeRequestSchema,
});

/** Window messages between the trade content script and its main-world script. */
export const MAIN_REQUEST = "poe-boats-trade-request";
export const MAIN_RESPONSE = "poe-boats-trade-response";
export const mainRequestSchema = z.strictObject({
    source: z.literal(MAIN_REQUEST),
    id: z.string().min(1).max(100),
    request: tradeRequestSchema,
});
export const mainResponseSchema = z.strictObject({
    source: z.literal(MAIN_RESPONSE),
    id: z.string().min(1).max(100),
    response: tradeResponseSchema,
});
