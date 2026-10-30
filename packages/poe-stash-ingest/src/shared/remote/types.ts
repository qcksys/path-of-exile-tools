/**
 * Wire format for the poe.boats hourly-summary ingest endpoints.
 * Both shapes are kept JSON-stable so older clients keep working.
 */

import type { CohortHourly, MarketCohortDefinition } from "@poe-tools/market";
import type { ListingTab } from "#src/shared/stash-tab.ts";

/** Listing prices in one currency. Rows pushed before mean and quantiles were added omit them. */
export interface PriceSummary {
    count: number;
    min: number;
    mean?: number;
    p10?: number;
    p25?: number;
    median: number;
    p75?: number;
    p90?: number;
    max: number;
}

export interface UniqueHourlyRow {
    realm?: string;
    league: string;
    hour: number; // unix-hour
    /** Identity key — `unid:<icon>` | unique name | baseType. */
    itemKey: string;
    /** Variant axes — first-class PK components on the remote. */
    corrupted: boolean;
    /** 5 or 6 for a unique's largest linked socket group, otherwise 0. */
    links: number;
    /** Merchant (Faustus) or other public tabs; empty for listings seen before tabs were recorded. */
    tab: ListingTab | "";
    /** Empty string when no extractor matched. */
    signatureKind: string;
    /** Empty string when no extractor matched. */
    signatureValue: string;
    /** Full structured signature payload, or null when none. */
    signatureData: Record<string, unknown> | null;

    iconAsset: string | null;
    name: string | null; // resolved (from basemap) when unid; otherwise item.name
    baseType: string;
    /** -1 when the source omits its deprecated numeric frame. */
    frameType: number;
    identified: boolean;

    listingCount: number;
    uniqueSellers: number;
    /** Listings first seen in this hour. */
    newCount?: number;
    removedCount?: number;
    likelySales?: number;
    relistedCount?: number;
    pendingCount?: number;
    salesPrices?: Record<string, PriceSummary>;
    /** Per-currency price aggregates: { chaos: { count, min, median, max, ... }, divine: {...} } */
    prices: Record<string, PriceSummary>;
    firstSeenAt: string; // ISO
    lastSeenAt: string; // ISO
}

export interface UniqueHourlyPayload {
    stream: "psapi";
    rows: UniqueHourlyRow[];
}

export interface CurrencyHourlyRow {
    realm?: string;
    league: string;
    hour: number;
    marketId: string;
    lowestRatio: Record<string, number>;
    highestRatio: Record<string, number>;
    volumeTraded: Record<string, number>;
    lowestStock: Record<string, number>;
    highestStock: Record<string, number>;
}

export interface CurrencyHourlyPayload {
    stream: "cxapi";
    rows: CurrencyHourlyRow[];
}

export interface BasemapSnapshotPayload {
    stream: "basemap";
    rows: Array<{
        iconAsset: string;
        name: string;
        baseType: string;
        seenCount: number;
    }>;
}

export type IngestPayload =
    | { stream: "stash-checkpoints"; rows: import("@poe-tools/market").StashCheckpointUpload[] }
    | { stream: "status"; rows: import("@poe-tools/market").IngestStatus[] }
    | ({ stream: "leagues" } & import("@poe-tools/market").LeagueList)
    | UniqueHourlyPayload
    | CurrencyHourlyPayload
    | BasemapSnapshotPayload
    | { stream: "equipment"; rows: CohortHourly[] }
    | { stream: "equipment-definitions"; rows: MarketCohortDefinition[] };
