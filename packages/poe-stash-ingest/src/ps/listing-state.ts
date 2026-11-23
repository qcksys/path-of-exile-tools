import { createHash } from "node:crypto";
import type { DuckDBConnection, DuckDBListValue } from "@duckdb/node-api";
import { yellowBeastMarket, yellowBeastNames } from "@poe-tools/market";
import { queryAll } from "#src/shared/db.ts";
import { MOD_POOLS } from "#src/shared/mod-extractors/mod-pools.ts";

export const NONE = -1;
const YELLOW_BEASTS = new Set<string>(yellowBeastNames);
const POOL_KINDS = new Set(Object.values(MOD_POOLS).map((pool) => pool.kind));
/** `tab` as stored: NULL for listings seen before tabs were recorded. */
const TABS = [null, "merchant", "other"] as const;
export type TabCode = 0 | 1 | 2;
export const tabCode = (tab: string | null | undefined): TabCode =>
    tab === "merchant" ? 1 : tab === "other" ? 2 : 0;
export const tabOf = (code: number) => TABS[code] ?? null;

/** DuckDB's `lower`: one code point for one (JavaScript lowers `İ` to two). */
export function lowerLikeDuckDb(value: string) {
    let out = "";
    for (const char of value) {
        const lower = char.toLowerCase();
        out += lower.length === char.length ? lower : String.fromCodePoint(lower.codePointAt(0)!);
    }
    return out;
}

/** The values of a listing that decide which sales it prices, as `ps_listing` stores them. */
export interface MarketFields {
    accountName: string;
    league: string;
    itemKey: string;
    identified: boolean;
    corrupted: boolean;
    foilVariation: number | null;
    links: number | null;
    tab: string | null;
    signatureValue: string | null;
    /** `mod_signature->>'kind'`. */
    kind: string | null;
    /** `json_extract_string(mod_signature, '$.mods[*]')`. */
    mods: string[];
    priceAmount: number | null;
    priceCurrency: string | null;
}

/** A sale of a mod pool unique, as `poolMarketPrice` prices it. */
export interface PoolSale {
    /** Whether its kind is one `priceModPoolSales` prices by mod. */
    pool: boolean;
    base: number;
    mods: string[];
    seller: number;
}

class Interner {
    private ids = new Map<string, number>();
    readonly values: string[] = [];
    id(value: string) {
        let id = this.ids.get(value);
        if (id === undefined) {
            id = this.values.length;
            this.values.push(value);
            this.ids.set(value, id);
        }
        return id;
    }
    find(value: string) {
        return this.ids.get(value) ?? NONE;
    }
}

const HEX_ID = /^[0-9a-f]{64}$/;

/** 128 bits identifying an item ID: a hex ID's two halves XORed, or a hash of any other ID. */
export function fingerprint(id: string, out: Uint32Array, at: number) {
    if (HEX_ID.test(id)) {
        for (let i = 0; i < 4; i++)
            out[at + i] =
                (Number.parseInt(id.slice(i * 8, i * 8 + 8), 16) ^
                    Number.parseInt(id.slice(32 + i * 8, 40 + i * 8), 16)) >>>
                0;
        return;
    }
    const hash = createHash("sha1").update(id).digest();
    for (let i = 0; i < 4; i++) out[at + i] = hash.readUInt32BE(i * 4);
}

/** The first 64 bits of a `rowDigest` (base64 SHA-1). */
export function digestWords(digest: string): [number, number] {
    const bytes = Buffer.from(digest, "base64");
    return [bytes.readUInt32BE(0), bytes.readUInt32BE(4)];
}

/** A dense list of slots that can drop any member in constant time. */
class Buckets {
    readonly members: number[][] = [];
    private keys = new Map<number, number>();
    bucket(key: number, create: boolean) {
        let bucket = this.keys.get(key);
        if (bucket === undefined && create) {
            bucket = this.members.length;
            this.members.push([]);
            this.keys.set(key, bucket);
        }
        return bucket ?? NONE;
    }
}

/**
 * Every `ps_listing` row, active or removed, in typed arrays: its key (stash, account, item), its
 * `listing_id`, whether it is active, when it was last seen and removed, a digest of its content,
 * and what sales it prices. Built from the database and kept in step by `ListingBatch`; a copy of
 * committed state, so it can always be rebuilt.
 */
export class ListingState {
    private capacity = 0;
    size = 0;
    nextListingId = 1;

    private ids = new Uint32Array(0);
    private nextSameId = new Int32Array(0);
    private idTable = new Int32Array(0);
    private stashOf = new Int32Array(0);
    private nextInStash = new Int32Array(0);
    private stashHead: number[] = [];
    private accountOf = new Int32Array(0);
    readonly listingId: Float64Array<ArrayBuffer> = new Float64Array(0);
    readonly active: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    /** Microseconds since the epoch. */
    readonly lastSeen: Float64Array<ArrayBuffer> = new Float64Array(0);
    /** Microseconds since the epoch; NaN while active. */
    readonly removedAt: Float64Array<ArrayBuffer> = new Float64Array(0);
    private digest = new Uint32Array(0);
    private hasDigest = new Uint8Array(0);
    private itemKeyOf = new Int32Array(0);
    private iconOf = new Int32Array(0);
    readonly tab: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    /** The sale market's fields apart from `tab`; NONE when it has no market. */
    private marketBase = new Int32Array(0);
    private poolBase = new Int32Array(0);
    private poolKind = new Uint8Array(0);
    private price = new Float64Array(0);
    private sellerOf = new Int32Array(0);
    private marketBucket = new Int32Array(0);
    private marketPos = new Int32Array(0);
    private poolBucket = new Int32Array(0);
    private poolPos = new Int32Array(0);
    private modsOf = new Map<number, string[]>();

    private stashes = new Interner();
    private accounts = new Interner();
    private sellers = new Interner();
    private strings = new Interner();
    private marketBases = new Interner();
    private poolBases = new Interner();
    private market = new Buckets();
    private pool = new Buckets();

    private grow(min: number) {
        if (min <= this.capacity) return;
        let capacity = Math.max(1024, this.capacity * 2);
        while (capacity < min) capacity *= 2;
        const resize = <T extends Float64Array | Int32Array | Uint32Array | Uint8Array>(
            array: T,
            per = 1,
            fill?: number,
        ): T => {
            const next = new (array.constructor as new (length: number) => T)(capacity * per);
            if (fill !== undefined) next.fill(fill);
            next.set(array);
            return next;
        };
        const self = this as unknown as Record<
            string,
            Float64Array | Int32Array | Uint32Array | Uint8Array
        >;
        self.ids = resize(this.ids, 4);
        self.nextSameId = resize(this.nextSameId, 1, NONE);
        self.stashOf = resize(this.stashOf);
        self.nextInStash = resize(this.nextInStash, 1, NONE);
        self.accountOf = resize(this.accountOf);
        self.listingId = resize(this.listingId);
        self.active = resize(this.active);
        self.lastSeen = resize(this.lastSeen);
        self.removedAt = resize(this.removedAt);
        self.digest = resize(this.digest, 2);
        self.hasDigest = resize(this.hasDigest);
        self.itemKeyOf = resize(this.itemKeyOf);
        self.iconOf = resize(this.iconOf);
        self.tab = resize(this.tab);
        self.marketBase = resize(this.marketBase);
        self.poolBase = resize(this.poolBase);
        self.poolKind = resize(this.poolKind);
        self.price = resize(this.price);
        self.sellerOf = resize(this.sellerOf);
        self.marketBucket = resize(this.marketBucket, 1, NONE);
        self.marketPos = resize(this.marketPos);
        self.poolBucket = resize(this.poolBucket, 1, NONE);
        self.poolPos = resize(this.poolPos);
        this.capacity = capacity;
        if (this.idTable.length < capacity * 2) this.rehash(capacity * 2);
    }

    private hashSlot(words: Uint32Array, at: number, mask: number) {
        const mixed =
            words[at]! ^
            Math.imul(words[at + 1]!, 0x85ebca6b) ^
            Math.imul(words[at + 2]!, 0xc2b2ae35) ^
            Math.imul(words[at + 3]!, 0x27d4eb2f);
        return (Math.imul(mixed ^ (mixed >>> 16), 0x9e3779b1) >>> 0) & mask;
    }

    private sameId(slot: number, words: Uint32Array, at: number) {
        const base = slot * 4;
        return (
            this.ids[base] === words[at] &&
            this.ids[base + 1] === words[at + 1] &&
            this.ids[base + 2] === words[at + 2] &&
            this.ids[base + 3] === words[at + 3]
        );
    }

    /** The table position holding this ID's first slot, or the empty position it would take. */
    private probe(words: Uint32Array, at: number) {
        const mask = this.idTable.length - 1;
        let position = this.hashSlot(words, at, mask);
        for (;;) {
            const head = this.idTable[position]! - 1;
            if (head === NONE || this.sameId(head, words, at)) return position;
            position = (position + 1) & mask;
        }
    }

    private rehash(size: number) {
        this.idTable = new Int32Array(size);
        this.nextSameId.fill(NONE);
        for (let slot = 0; slot < this.size; slot++) this.linkId(slot);
    }

    private linkId(slot: number) {
        const position = this.probe(this.ids, slot * 4);
        const head = this.idTable[position]! - 1;
        this.nextSameId[slot] = head;
        this.idTable[position] = slot + 1;
    }

    private scratch = new Uint32Array(4);

    /** The slot of the listing with this key, or NONE. */
    find(stashId: string, accountName: string, itemId: string) {
        const stash = this.stashes.find(stashId);
        const account = this.accounts.find(accountName);
        if (stash === NONE || account === NONE || !this.size) return NONE;
        fingerprint(itemId, this.scratch, 0);
        let slot = this.idTable[this.probe(this.scratch, 0)]! - 1;
        while (slot !== NONE) {
            if (this.stashOf[slot] === stash && this.accountOf[slot] === account) return slot;
            slot = this.nextSameId[slot]!;
        }
        return NONE;
    }

    /** Whether `slot` holds one of these item IDs, as `idKeys` gives them. */
    idKey(slot: number) {
        const base = slot * 4;
        return `${this.ids[base]},${this.ids[base + 1]},${this.ids[base + 2]},${this.ids[base + 3]}`;
    }

    static idKeyOf(itemId: string) {
        const words = new Uint32Array(4);
        fingerprint(itemId, words, 0);
        return `${words[0]},${words[1]},${words[2]},${words[3]}`;
    }

    /** Every slot of the stash, in no particular order. */
    stashSlots(stashId: string) {
        const stash = this.stashes.find(stashId);
        const slots: number[] = [];
        if (stash === NONE) return slots;
        for (let slot = this.stashHead[stash]!; slot !== NONE; slot = this.nextInStash[slot]!)
            slots.push(slot);
        return slots;
    }

    account(slot: number) {
        return this.accounts.values[this.accountOf[slot]!]!;
    }

    stashId(slot: number) {
        return this.stashes.values[this.stashOf[slot]!]!;
    }

    digestEquals(slot: number, digest: string) {
        if (!this.hasDigest[slot]) return false;
        const [a, b] = digestWords(digest);
        return this.digest[slot * 2] === a && this.digest[slot * 2 + 1] === b;
    }

    keysOf(itemKey: string, iconAsset: string | null) {
        return [
            this.strings.id(itemKey),
            iconAsset === null ? NONE : this.strings.id(iconAsset),
        ] as const;
    }

    /** Adds a listing; it starts removed and outside every market until `activate`. */
    add(
        stashId: string,
        accountName: string,
        itemId: string,
        listingId: number,
        fields: MarketFields,
        digest: string | null,
        iconAsset: string | null,
    ) {
        this.grow(this.size + 1);
        const slot = this.size++;
        fingerprint(itemId, this.ids, slot * 4);
        this.linkId(slot);
        const stash = this.stashes.id(stashId);
        if (stash === this.stashHead.length) this.stashHead.push(NONE);
        this.stashOf[slot] = stash;
        this.nextInStash[slot] = this.stashHead[stash]!;
        this.stashHead[stash] = slot;
        this.accountOf[slot] = this.accounts.id(accountName);
        this.listingId[slot] = listingId;
        if (listingId >= this.nextListingId) this.nextListingId = listingId + 1;
        this.active[slot] = 0;
        this.removedAt[slot] = Number.NaN;
        this.marketBucket[slot] = NONE;
        this.poolBucket[slot] = NONE;
        this.setValues(slot, fields, digest, iconAsset);
        return slot;
    }

    /** Replaces a listing's values; an active listing moves to its new markets. */
    setValues(slot: number, fields: MarketFields, digest: string | null, iconAsset: string | null) {
        const wasActive = this.active[slot] === 1;
        if (wasActive) this.leaveMarkets(slot);
        if (digest === null) this.hasDigest[slot] = 0;
        else {
            const [a, b] = digestWords(digest);
            this.digest[slot * 2] = a;
            this.digest[slot * 2 + 1] = b;
            this.hasDigest[slot] = 1;
        }
        this.itemKeyOf[slot] = this.strings.id(fields.itemKey);
        this.iconOf[slot] = iconAsset === null ? NONE : this.strings.id(iconAsset);
        this.tab[slot] = tabCode(fields.tab);
        this.sellerOf[slot] = this.sellers.id(lowerLikeDuckDb(fields.accountName));
        this.price[slot] = fields.priceAmount ?? Number.NaN;
        this.marketBase[slot] = marketBaseKey(fields, this.marketBases);
        this.poolBase[slot] = poolBaseKey(fields, this.poolBases);
        this.poolKind[slot] = fields.kind !== null && POOL_KINDS.has(fields.kind) ? 1 : 0;
        if (fields.mods.length) this.modsOf.set(slot, fields.mods);
        else this.modsOf.delete(slot);
        if (wasActive) this.joinMarkets(slot);
    }

    /** Marks a listing seen at `at`; a removed one becomes active again. */
    sight(slot: number, at: number) {
        this.lastSeen[slot] = at;
        if (this.active[slot]) return;
        this.active[slot] = 1;
        this.removedAt[slot] = Number.NaN;
        this.joinMarkets(slot);
    }

    remove(slot: number, at: number) {
        if (this.active[slot]) this.leaveMarkets(slot);
        this.active[slot] = 0;
        this.removedAt[slot] = at;
    }

    private joinMarkets(slot: number) {
        if (!(this.price[slot]! > 0)) return;
        if (this.marketBase[slot] !== NONE) {
            const bucket = this.market.bucket(this.marketBase[slot]! * 4 + this.tab[slot]!, true);
            this.marketBucket[slot] = bucket;
            this.marketPos[slot] = this.market.members[bucket]!.push(slot) - 1;
        }
        if (this.poolBase[slot] !== NONE && this.modsOf.has(slot)) {
            const bucket = this.pool.bucket(this.poolBase[slot]! * 4 + this.tab[slot]!, true);
            this.poolBucket[slot] = bucket;
            this.poolPos[slot] = this.pool.members[bucket]!.push(slot) - 1;
        }
    }

    private leaveMarkets(slot: number) {
        for (const [buckets, bucketOf, pos] of [
            [this.market, this.marketBucket, this.marketPos],
            [this.pool, this.poolBucket, this.poolPos],
        ] as const) {
            const bucket = bucketOf[slot]!;
            if (bucket === NONE) continue;
            const members = buckets.members[bucket]!;
            const last = members.pop()!;
            if (last !== slot) {
                members[pos[slot]!] = last;
                pos[last] = pos[slot]!;
            }
            bucketOf[slot] = NONE;
        }
    }

    /**
     * The sale market of the removed listing in `slot`, as `recordRemovals` prices it: the median
     * of the other sellers' median prices among active, priced listings of the same market (in
     * the sale's `tab`) seen in the 24 hours before `at`.
     */
    marketPrice(slot: number, tab: TabCode, at: number) {
        const base = this.marketBase[slot]!;
        const bucket = base === NONE ? NONE : this.market.bucket(base * 4 + tab, false);
        if (bucket === NONE) return { price: null, sellers: 0 };
        const seller = this.sellerOf[slot]!;
        const since = at - DAY_US;
        const prices = new Map<number, number[]>();
        for (const peer of this.market.members[bucket]!) {
            if (this.sellerOf[peer] === seller || this.lastSeen[peer]! < since) continue;
            const list = prices.get(this.sellerOf[peer]!);
            if (list) list.push(this.price[peer]!);
            else prices.set(this.sellerOf[peer]!, [this.price[peer]!]);
        }
        const medians = [...prices.values()].map(median);
        return { price: medians.length ? median(medians) : null, sellers: medians.length };
    }

    /**
     * The market of a mod pool unique's sale, as `priceModPoolSales` sets it: for each of its mods,
     * the median of other sellers' median prices for items with that mod and as many mods; the
     * most valuable mod with enough sellers wins, and among equal prices the one with most sellers.
     */
    poolMarketPrice(sale: PoolSale, tab: TabCode, at: number, minimumSellers: number) {
        const bucket = sale.base === NONE ? NONE : this.pool.bucket(sale.base * 4 + tab, false);
        const own = sale.mods;
        let best: { price: number; sellers: number } | undefined;
        if (bucket !== NONE && own.length) {
            const seller = sale.seller;
            const since = at - DAY_US;
            for (const mod of new Set(own)) {
                const prices = new Map<number, number[]>();
                for (const peer of this.pool.members[bucket]!) {
                    const mods = this.modsOf.get(peer)!;
                    if (
                        this.sellerOf[peer] === seller ||
                        this.lastSeen[peer]! < since ||
                        mods.length !== own.length ||
                        !mods.includes(mod)
                    )
                        continue;
                    const list = prices.get(this.sellerOf[peer]!);
                    if (list) list.push(this.price[peer]!);
                    else prices.set(this.sellerOf[peer]!, [this.price[peer]!]);
                }
                if (prices.size < minimumSellers) continue;
                const price = median([...prices.values()].map(median));
                if (
                    !best ||
                    price > best.price ||
                    (price === best.price && prices.size > best.sellers)
                )
                    best = { price, sellers: prices.size };
            }
        }
        return { price: best?.price ?? null, sellers: best?.sellers ?? 0 };
    }

    /**
     * What `poolMarketPrice` needs of a sale, taken when it is recorded: a later page of the batch
     * may change the listing, but a sale keeps its values.
     */
    poolSale(slot: number): PoolSale {
        return {
            pool: this.poolKind[slot] === 1,
            base: this.poolBase[slot]!,
            mods: this.modsOf.get(slot) ?? [],
            seller: this.sellerOf[slot]!,
        };
    }

    /** Drops every removed listing the database no longer holds, after archiving moved them. */
    async reconcileRemoved(conn: DuckDBConnection) {
        const kept = new Set(
            (
                await queryAll<{ id: number }>(
                    conn,
                    "SELECT listing_id::DOUBLE AS id FROM ps_listing WHERE removed_at IS NOT NULL",
                )
            ).map((row) => row.id),
        );
        const keep: number[] = [];
        for (let slot = 0; slot < this.size; slot++)
            if (this.active[slot] || kept.has(this.listingId[slot]!)) keep.push(slot);
        if (keep.length === this.size) return 0;
        const dropped = this.size - keep.length;
        this.compact(keep);
        return dropped;
    }

    /** Keeps only `keep` (ascending slots), renumbering them and rebuilding every index. */
    private compact(keep: number[]) {
        const arrays = [
            [this.stashOf, 1],
            [this.accountOf, 1],
            [this.listingId, 1],
            [this.active, 1],
            [this.lastSeen, 1],
            [this.removedAt, 1],
            [this.digest, 2],
            [this.hasDigest, 1],
            [this.itemKeyOf, 1],
            [this.iconOf, 1],
            [this.tab, 1],
            [this.marketBase, 1],
            [this.poolBase, 1],
            [this.poolKind, 1],
            [this.price, 1],
            [this.sellerOf, 1],
            [this.ids, 4],
        ] as const;
        const mods = new Map<number, string[]>();
        keep.forEach((from, to) => {
            for (const [array, per] of arrays)
                for (let i = 0; i < per; i++) array[to * per + i] = array[from * per + i]!;
            const list = this.modsOf.get(from);
            if (list) mods.set(to, list);
        });
        this.modsOf = mods;
        this.size = keep.length;
        this.stashHead.fill(NONE);
        this.nextInStash.fill(NONE);
        for (let slot = 0; slot < this.size; slot++) {
            const stash = this.stashOf[slot]!;
            this.nextInStash[slot] = this.stashHead[stash]!;
            this.stashHead[stash] = slot;
        }
        this.rehash(this.idTable.length);
        this.market = new Buckets();
        this.pool = new Buckets();
        this.marketBucket.fill(NONE);
        this.poolBucket.fill(NONE);
        for (let slot = 0; slot < this.size; slot++) if (this.active[slot]) this.joinMarkets(slot);
    }

    /** Listings, stashes and bytes held, for the worker's log. */
    stats() {
        const bytes =
            this.capacity * (4 * 4 + 4 * 15 + 8 * 4 + 2 * 4 + 4) + this.idTable.byteLength;
        return { listings: this.size, stashes: this.stashes.values.length, bytes };
    }
}

const DAY_US = 86_400 * 1e6;

/** DuckDB's `median`: the middle value, or `lo * 0.5 + hi * 0.5` of the middle two. */
export function median(values: number[]) {
    const sorted = values.length > 1 ? [...values].sort((a, b) => a - b) : values;
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle]! : sorted[middle - 1]! * 0.5 + sorted[middle]! * 0.5;
}

const marketKey = (itemKey: string) => (YELLOW_BEASTS.has(itemKey) ? yellowBeastMarket : itemKey);

/** The fields a sale's market matches apart from `tab`, or NONE when nothing can match them. */
function marketBaseKey(fields: MarketFields, bases: Interner, create = true) {
    if (fields.signatureValue === null || fields.priceCurrency === null) return NONE;
    const key = JSON.stringify([
        fields.league,
        marketKey(fields.itemKey),
        fields.identified,
        fields.corrupted,
        fields.foilVariation ?? -1,
        fields.links ?? 0,
        fields.signatureValue,
        fields.kind ?? "",
        fields.priceCurrency,
    ]);
    return create ? bases.id(key) : bases.find(key);
}

function poolBaseKey(fields: MarketFields, bases: Interner, create = true) {
    if (fields.priceCurrency === null) return NONE;
    const key = JSON.stringify([
        fields.league,
        fields.itemKey,
        fields.identified,
        fields.corrupted,
        fields.priceCurrency,
    ]);
    return create ? bases.id(key) : bases.find(key);
}

const LOAD_SQL = `
    SELECT listing_id::DOUBLE AS id, stash_id, account_name, item_id, content_digest,
        removed_at IS NULL AS active, epoch_us(last_seen_at)::DOUBLE AS last_seen,
        epoch_us(removed_at)::DOUBLE AS removed_at, item_key, icon_asset, league, identified,
        corrupted, foil_variation, links, tab, signature_value, mod_signature->>'kind' AS kind,
        json_extract_string(mod_signature, '$.mods[*]') AS mods, price_amount, price_currency
    FROM ps_listing`;

/**
 * Numbers every listing written without a `listing_id`, or sharing one (a row copied by hand),
 * then reads them all.
 */
export async function loadListingState(conn: DuckDBConnection) {
    await conn.run(
        `UPDATE ps_listing SET listing_id = (SELECT coalesce(max(listing_id), 0) FROM ps_listing) + rowid + 1
        WHERE listing_id IS NULL OR listing_id IN (
            SELECT listing_id FROM ps_listing GROUP BY listing_id HAVING count(*) > 1)`,
    );
    const state = new ListingState();
    const result = await conn.stream(LOAD_SQL);
    const names = result.deduplicatedColumnNames();
    for (;;) {
        const chunk = await result.fetchChunk();
        if (!chunk || chunk.rowCount === 0) break;
        for (const row of chunk.getRowObjects(names)) {
            const fields: MarketFields = {
                accountName: row.account_name as string,
                league: row.league as string,
                itemKey: row.item_key as string,
                identified: row.identified as boolean,
                corrupted: row.corrupted as boolean,
                foilVariation: (row.foil_variation as number | null) ?? null,
                links: (row.links as number | null) ?? null,
                tab: (row.tab as string | null) ?? null,
                signatureValue: (row.signature_value as string | null) ?? null,
                kind: (row.kind as string | null) ?? null,
                mods: ((row.mods as DuckDBListValue | null)?.items ?? []) as string[],
                priceAmount: (row.price_amount as number | null) ?? null,
                priceCurrency: (row.price_currency as string | null) ?? null,
            };
            const slot = state.add(
                row.stash_id as string,
                fields.accountName,
                row.item_id as string,
                row.id as number,
                fields,
                (row.content_digest as string | null) ?? null,
                (row.icon_asset as string | null) ?? null,
            );
            state.lastSeen[slot] = row.last_seen as number;
            if (row.active) state.sight(slot, row.last_seen as number);
            else state.remove(slot, row.removed_at as number);
        }
    }
    return state;
}
