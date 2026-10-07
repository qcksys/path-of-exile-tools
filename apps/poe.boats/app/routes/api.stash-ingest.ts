import { cohortHourlySchema, marketCohortDefinitionSchema } from "@poe-tools/market";
import { z } from "zod";
import { dbContext, envContext } from "~/context";
import {
    insertStashCohorts,
    upsertStashBasemapSnapshot,
    upsertStashCohortHourly,
    upsertStashCurrencyHourly,
    upsertStashUniqueHourly,
} from "~/db/queries/stash-ingest.queries";
import { sStashCurrencyHourlyI } from "~/db/schema/stash.currency-hourly";
import { logger } from "~/services/logger";
import type { Route } from "./+types/api.stash-ingest";

const PRICE_SCHEMA = z.record(
    z.string(),
    z.object({
        count: z.number().int().nonnegative(),
        min: z.number().positive(),
        median: z.number().positive(),
        max: z.number().positive(),
    }),
);

const REALM_SCHEMA = z.enum(["pc", "poe2", "xbox", "sony"]).default("pc");
const UNIQUE_ROW_SCHEMA = z.object({
    realm: REALM_SCHEMA,
    league: z.string().min(1).max(100),
    hour: z.number().int().nonnegative(),
    itemKey: z.string().min(1).max(255),
    corrupted: z.boolean(),
    foilVariation: z.number().int(),
    signatureKind: z.string().max(32),
    signatureValue: z.string().max(255),
    signatureData: z.record(z.string(), z.unknown()).nullable(),
    iconAsset: z.string().max(255).nullable(),
    name: z.string().max(100).nullable(),
    baseType: z.string().min(1).max(100),
    frameType: z.number().int(),
    identified: z.boolean(),
    listingCount: z.number().int().nonnegative(),
    uniqueSellers: z.number().int().nonnegative(),
    removedCount: z.number().int().nonnegative().optional(),
    likelySales: z.number().int().nonnegative().optional(),
    relistedCount: z.number().int().nonnegative().optional(),
    pendingCount: z.number().int().nonnegative().optional(),
    prices: PRICE_SCHEMA,
    salesPrices: PRICE_SCHEMA.optional(),
    firstSeenAt: z.string().max(32),
    lastSeenAt: z.string().max(32),
});

const CURRENCY_ROW_SCHEMA = z.object({
    realm: REALM_SCHEMA,
    league: z.string().min(1).max(100),
    hour: z.number().int().nonnegative(),
    marketId: sStashCurrencyHourlyI.shape.marketId.min(1),
    lowestRatio: z.record(z.string(), z.number()),
    highestRatio: z.record(z.string(), z.number()),
    volumeTraded: z.record(z.string(), z.number()),
    lowestStock: z.record(z.string(), z.number()),
    highestStock: z.record(z.string(), z.number()),
});

const BASEMAP_ROW_SCHEMA = z.object({
    iconAsset: z.string().max(255),
    name: z.string().max(100),
    baseType: z.string().max(100),
    seenCount: z.number().int().nonnegative(),
});

const PAYLOAD_SCHEMA = z.discriminatedUnion("stream", [
    z.object({ stream: z.literal("psapi"), rows: z.array(UNIQUE_ROW_SCHEMA).max(1000) }),
    z.object({ stream: z.literal("cxapi"), rows: z.array(CURRENCY_ROW_SCHEMA).max(1000) }),
    z.object({ stream: z.literal("basemap"), rows: z.array(BASEMAP_ROW_SCHEMA).max(2000) }),
    z.object({ stream: z.literal("equipment"), rows: z.array(cohortHourlySchema).max(1000) }),
    z.object({
        stream: z.literal("equipment-definitions"),
        rows: z.array(marketCohortDefinitionSchema).max(1000),
    }),
]);

export async function action({ request, context }: Route.ActionArgs) {
    if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const env = context.get(envContext);
    const expected = (env as unknown as { STASH_INGEST_TOKEN?: string }).STASH_INGEST_TOKEN;
    if (!expected) {
        logger.error("STASH_INGEST_TOKEN is not configured on this environment");
        return Response.json({ error: "Ingest disabled" }, { status: 503 });
    }
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = context.get(dbContext);

    let parsed: z.infer<typeof PAYLOAD_SCHEMA>;
    try {
        const body = await request.json();
        const result = PAYLOAD_SCHEMA.safeParse(body);
        if (!result.success) {
            return Response.json(
                { error: "Invalid payload", issues: result.error.issues.slice(0, 10) },
                { status: 400 },
            );
        }
        parsed = result.data;
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let written = 0;
    if (parsed.stream === "psapi") {
        written = await upsertStashUniqueHourly(db, parsed.rows);
    } else if (parsed.stream === "cxapi") {
        written = await upsertStashCurrencyHourly(db, parsed.rows);
    } else if (parsed.stream === "equipment") {
        written = await upsertStashCohortHourly(db, parsed.rows);
    } else if (parsed.stream === "equipment-definitions") {
        written = await insertStashCohorts(db, parsed.rows);
    } else {
        written = await upsertStashBasemapSnapshot(db, parsed.rows);
    }

    logger.info({ stream: parsed.stream, written }, "stash-ingest accepted");
    return Response.json({ stream: parsed.stream, written });
}
