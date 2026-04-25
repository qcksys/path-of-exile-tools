/**
 * Wire format for the poe.boats hourly-summary ingest endpoints.
 * Both shapes are kept JSON-stable so older clients keep working.
 */

export interface UniqueHourlyRow {
  league: string;
  hour: number; // unix-hour
  /** Identity key — `unid:<icon>` | unique name | baseType. */
  itemKey: string;
  /** Variant axes — first-class PK components on the remote. */
  corrupted: boolean;
  /** -1 sentinel for "not foil" (column is non-nullable to participate in PK). */
  foilVariation: number;
  /** Empty string when no extractor matched. */
  signatureKind: string;
  /** Empty string when no extractor matched. */
  signatureValue: string;
  /** Full structured signature payload, or null when none. */
  signatureData: Record<string, unknown> | null;

  iconAsset: string | null;
  name: string | null; // resolved (from basemap) when unid; otherwise item.name
  baseType: string;
  frameType: number;
  identified: boolean;

  listingCount: number;
  uniqueSellers: number;
  /** Per-currency price aggregates: { chaos: { count, min, median, max }, divine: {...} } */
  prices: Record<string, { count: number; min: number; median: number; max: number }>;
  firstSeenAt: string; // ISO
  lastSeenAt: string; // ISO
}

export interface UniqueHourlyPayload {
  stream: "psapi";
  rows: UniqueHourlyRow[];
}

export interface CurrencyHourlyRow {
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

export type IngestPayload = UniqueHourlyPayload | CurrencyHourlyPayload | BasemapSnapshotPayload;
