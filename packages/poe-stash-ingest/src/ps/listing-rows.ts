import type { PublicStashChange } from "@poe-tools/api-client";
import { isMapItem, shouldCapture } from "#src/shared/capture.ts";
import { decodeIconAsset } from "#src/shared/icon.ts";
import { itemKey, itemLinks } from "#src/shared/item-key.ts";
import { rowDigest } from "#src/shared/item-memo.ts";
import { extractModSignature, signatureValue } from "#src/shared/mod-extractors/index.ts";
import { extractListingPrice } from "#src/shared/price.ts";
import { type ListingTab, listingTab } from "#src/shared/stash-tab.ts";

export interface ListingRow {
    accountName: string;
    stashId: string;
    itemId: string;
    league: string;
    itemKey: string;
    iconAsset: string | null;
    identified: boolean;
    frameType: number;
    typeLine: string;
    baseType: string;
    name: string | null;
    rarity: string | null;
    corrupted: boolean;
    foilVariation: number | null;
    links: number;
    tab: ListingTab;
    priceAmount: number | null;
    priceCurrency: string | null;
    stackSize: number | null;
    modSignature: string | null;
    signatureValue: string;
    rawItem: string;
    /** See `rowDigest`; a re-sent listing with the same digest only records the sighting. */
    contentDigest: string;
}

/** `ps_listing` columns and how each is read from `ListingRow` JSON (`value`, from `json_each`). */
const COLUMNS: readonly (readonly [string, string])[] = [
    ["account_name", "value->>'accountName'"],
    ["stash_id", "value->>'stashId'"],
    ["item_id", "value->>'itemId'"],
    ["league", "value->>'league'"],
    ["item_key", "value->>'itemKey'"],
    ["icon_asset", "value->>'iconAsset'"],
    ["identified", "(value->>'identified')::BOOLEAN"],
    ["frame_type", "(value->>'frameType')::INTEGER"],
    ["type_line", "value->>'typeLine'"],
    ["base_type", "value->>'baseType'"],
    ["name", "value->>'name'"],
    ["rarity", "value->>'rarity'"],
    ["corrupted", "(value->>'corrupted')::BOOLEAN"],
    ["foil_variation", "(value->>'foilVariation')::INTEGER"],
    ["links", "(value->>'links')::INTEGER"],
    ["tab", "value->>'tab'"],
    ["price_amount", "(value->>'priceAmount')::DOUBLE"],
    ["price_currency", "value->>'priceCurrency'"],
    ["stack_size", "(value->>'stackSize')::INTEGER"],
    ["mod_signature", "(value->>'modSignature')::JSON"],
    ["raw_item", "(value->>'rawItem')::JSON"],
    ["signature_value", "value->>'signatureValue'"],
    ["content_digest", "value->>'contentDigest'"],
];

/** `ListingRow` JSON from `json_each`, as `ps_listing` columns apart from `exclude`. */
export const listingValues = (exclude: readonly string[] = []) =>
    COLUMNS.filter(([column]) => !exclude.includes(column))
        .map(([column, value]) => `${value} AS ${column}`)
        .join(",\n    ");

export const LISTING_VALUES = listingValues();

export const UPDATED_COLUMNS = [
    "league",
    "item_key",
    "icon_asset",
    "identified",
    "frame_type",
    "type_line",
    "base_type",
    "name",
    "rarity",
    "corrupted",
    "foil_variation",
    "links",
    "tab",
    "price_amount",
    "price_currency",
    "stack_size",
    "mod_signature",
    "signature_value",
    "raw_item",
    "content_digest",
];

export function listingRows(change: PublicStashChange, accountName: string, league: string) {
    const rows: ListingRow[] = [];
    const tab = listingTab(change);
    for (const item of change.items) {
        if (!item.id || !shouldCapture(item)) continue;
        const iconAsset = decodeIconAsset(item.icon);
        const price = extractListingPrice(item, change.stash);
        const signature = extractModSignature(item);
        const row = {
            accountName,
            stashId: change.id,
            itemId: item.id,
            league,
            itemKey: itemKey(item, iconAsset),
            iconAsset,
            // Crafting base markets do not split by identification, so sales compare across it.
            identified: signature?.kind === "base" || item.identified,
            // Unknown legacy frame; preserve the source frameTypeId in rawItem.
            frameType: item.frameType ?? -1,
            typeLine: item.typeLine,
            baseType: item.baseType,
            // A rare map's or crafting base's random name is not part of its market.
            name:
                item.identified && !isMapItem(item) && signature?.kind !== "base"
                    ? item.name
                    : null,
            rarity: item.rarity ?? null,
            corrupted: item.corrupted ?? false,
            foilVariation: item.foilVariation ?? null,
            links: itemLinks(item),
            tab,
            priceAmount: price?.amount ?? null,
            priceCurrency: price?.currency ?? null,
            stackSize: item.stackSize ?? null,
            modSignature: signature ? JSON.stringify(signature) : null,
            signatureValue: signatureValue(signature),
        };
        rows.push({ ...row, rawItem: JSON.stringify(item), contentDigest: rowDigest(item, row) });
    }
    return rows;
}
