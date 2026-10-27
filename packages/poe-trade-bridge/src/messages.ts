import { z } from "zod";
import { tradeListingSchema, tradeSaleSchema } from "./listing.ts";
import { tradeGameSchema, tradePayloadSchema } from "./trade-api.ts";

/** Bumped when the page/extension protocol changes incompatibly. */
export const BRIDGE_VERSION = 1;
export const PAGE_SOURCE = "poe-boats";
export const EXTENSION_SOURCE = "poe-boats-extension";

const id = z.string().min(1).max(100);

export const stageSearchSchema = z.strictObject({
    stageId: id,
    /** Fingerprint of the stage's query when the run started, returned with its listings. */
    stageKey: id,
    name: z.string().min(1).max(120),
    instant: tradePayloadSchema,
    inPerson: tradePayloadSchema.optional(),
});
export type StageSearch = z.infer<typeof stageSearchSchema>;

export const stageDecisionSchema = z.enum(["done", "more", "in-person"]);
export type StageDecision = z.infer<typeof stageDecisionSchema>;

/** Messages a poe.boats page posts to the extension. */
export const pageMessageSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("hello") }),
    z.strictObject({
        kind: z.literal("startRun"),
        runId: id,
        graphId: id,
        game: tradeGameSchema,
        league: z.string().trim().min(1).max(100),
        stages: z.array(stageSearchSchema).min(1).max(100),
    }),
    z.strictObject({
        kind: z.literal("decide"),
        runId: id,
        batchId: id,
        decision: stageDecisionSchema,
    }),
    z.strictObject({ kind: z.literal("cancelRun"), runId: id }),
    z.strictObject({ kind: z.literal("collect"), graphId: id }),
    z.strictObject({
        kind: z.literal("acknowledge"),
        graphId: id,
        batchIds: z.array(id).max(1000),
    }),
]);
export type PageMessage = z.infer<typeof pageMessageSchema>;

/** Listings from one trade fetch for one stage. */
export const listingBatchSchema = z.strictObject({
    runId: id,
    graphId: id,
    batchId: id,
    stageId: id,
    stageKey: id,
    /** Fetches already made for this stage's current search, including this one. */
    fetches: z.number().int().positive(),
    sale: tradeSaleSchema,
    /** Total listings the trade site reported for the search. */
    total: z.number().int().nonnegative(),
    /** Listing IDs the search returned (at most 100), so callers know whether more can be fetched. */
    available: z.number().int().nonnegative(),
    listings: z.array(tradeListingSchema).max(10),
    receivedAt: z.iso.datetime(),
});
export type ListingBatch = z.infer<typeof listingBatchSchema>;

export const runOutcomeSchema = z.enum(["done", "cancelled", "stopped"]);

/** Messages the extension posts back to a poe.boats page. */
export const extensionMessageSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("ready"),
        version: z.string().min(1).max(40),
        bridge: z.number().int().positive(),
    }),
    z.strictObject({
        kind: z.literal("progress"),
        runId: id,
        stageId: id,
        step: z.enum(["waiting", "searching", "fetching"]),
        sale: tradeSaleSchema,
        waitUntil: z.iso.datetime().optional(),
    }),
    listingBatchSchema.extend({ kind: z.literal("batch") }),
    z.strictObject({
        kind: z.literal("stageFailed"),
        runId: id,
        stageId: id,
        message: z.string().max(500),
    }),
    z.strictObject({
        kind: z.literal("runFinished"),
        runId: id,
        graphId: id,
        outcome: runOutcomeSchema,
        reason: z.string().max(500).optional(),
        signIn: z.boolean().optional(),
        retryAt: z.iso.datetime().optional(),
    }),
    z.strictObject({
        kind: z.literal("stored"),
        graphId: id,
        batches: z.array(listingBatchSchema).max(1000),
    }),
]);
export type ExtensionMessage = z.infer<typeof extensionMessageSchema>;

export const pageEnvelopeSchema = z.strictObject({
    source: z.literal(PAGE_SOURCE),
    bridge: z.number().int().positive(),
    message: pageMessageSchema,
});
export const extensionEnvelopeSchema = z.strictObject({
    source: z.literal(EXTENSION_SOURCE),
    bridge: z.number().int().positive(),
    message: extensionMessageSchema,
});

export function pageEnvelope(message: PageMessage) {
    return { source: PAGE_SOURCE, bridge: BRIDGE_VERSION, message } as const;
}
export function extensionEnvelope(message: ExtensionMessage) {
    return { source: EXTENSION_SOURCE, bridge: BRIDGE_VERSION, message } as const;
}
