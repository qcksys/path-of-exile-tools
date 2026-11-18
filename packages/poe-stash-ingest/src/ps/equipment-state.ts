import type { DuckDBConnection } from "@duckdb/node-api";
import { digestWords, fingerprint, ListingState, NONE } from "#src/ps/listing-state.ts";
import { queryAll } from "#src/shared/db.ts";

/**
 * Every `ps_equipment_listing` row, active or removed, in typed arrays: its key (lowercased
 * account, item), its `equipment_id`, stash, whether it is active and a digest of its content.
 * Built from the database and kept in step by `EquipmentBatch`; a copy of committed state.
 */
export class EquipmentState {
    private capacity = 0;
    size = 0;
    nextEquipmentId = 1;

    private ids = new Uint32Array(0);
    private nextSameId = new Int32Array(0);
    private idTable = new Int32Array(0);
    private stashOf = new Int32Array(0);
    private nextInStash = new Int32Array(0);
    private stashHead: number[] = [];
    private accountOf = new Int32Array(0);
    readonly equipmentId: Float64Array<ArrayBuffer> = new Float64Array(0);
    readonly active: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    private digest = new Uint32Array(0);
    private hasDigest = new Uint8Array(0);

    private stashes = new Map<string, number>();
    private stashNames: string[] = [];
    private accounts = new Map<string, number>();
    private accountNames: string[] = [];
    private scratch = new Uint32Array(4);

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
        this.ids = resize(this.ids, 4);
        this.nextSameId = resize(this.nextSameId, 1, NONE);
        this.stashOf = resize(this.stashOf);
        this.nextInStash = resize(this.nextInStash, 1, NONE);
        this.accountOf = resize(this.accountOf);
        (this as { equipmentId: Float64Array<ArrayBuffer> }).equipmentId = resize(this.equipmentId);
        (this as { active: Uint8Array<ArrayBuffer> }).active = resize(this.active);
        this.digest = resize(this.digest, 2);
        this.hasDigest = resize(this.hasDigest);
        this.capacity = capacity;
        if (this.idTable.length < capacity * 2) this.rehash(capacity * 2);
    }

    private probe(words: Uint32Array, at: number) {
        const mask = this.idTable.length - 1;
        const mixed =
            words[at]! ^
            Math.imul(words[at + 1]!, 0x85ebca6b) ^
            Math.imul(words[at + 2]!, 0xc2b2ae35) ^
            Math.imul(words[at + 3]!, 0x27d4eb2f);
        let position = (Math.imul(mixed ^ (mixed >>> 16), 0x9e3779b1) >>> 0) & mask;
        for (;;) {
            const head = this.idTable[position]! - 1;
            if (head === NONE) return position;
            const base = head * 4;
            if (
                this.ids[base] === words[at] &&
                this.ids[base + 1] === words[at + 1] &&
                this.ids[base + 2] === words[at + 2] &&
                this.ids[base + 3] === words[at + 3]
            )
                return position;
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
        this.nextSameId[slot] = this.idTable[position]! - 1;
        this.idTable[position] = slot + 1;
    }

    private intern(map: Map<string, number>, names: string[], value: string) {
        let id = map.get(value);
        if (id === undefined) {
            id = names.length;
            names.push(value);
            map.set(value, id);
        }
        return id;
    }

    /** The slot of the row of this (lowercased) account and item, in whatever stash, or NONE. */
    find(account: string, itemId: string) {
        const owner = this.accounts.get(account);
        if (owner === undefined || !this.size) return NONE;
        fingerprint(itemId, this.scratch, 0);
        for (
            let slot = this.idTable[this.probe(this.scratch, 0)]! - 1;
            slot !== NONE;
            slot = this.nextSameId[slot]!
        )
            if (this.accountOf[slot] === owner) return slot;
        return NONE;
    }

    idKey(slot: number) {
        const base = slot * 4;
        return `${this.ids[base]},${this.ids[base + 1]},${this.ids[base + 2]},${this.ids[base + 3]}`;
    }

    /** Every slot whose row is in the stash, in no particular order. */
    stashSlots(stashId: string) {
        const stash = this.stashes.get(stashId);
        const slots: number[] = [];
        if (stash === undefined) return slots;
        for (let slot = this.stashHead[stash]!; slot !== NONE; slot = this.nextInStash[slot]!)
            slots.push(slot);
        return slots;
    }

    account(slot: number) {
        return this.accountNames[this.accountOf[slot]!]!;
    }

    stashId(slot: number) {
        return this.stashNames[this.stashOf[slot]!]!;
    }

    digestEquals(slot: number, digest: string) {
        if (!this.hasDigest[slot]) return false;
        const [a, b] = digestWords(digest);
        return this.digest[slot * 2] === a && this.digest[slot * 2 + 1] === b;
    }

    setDigest(slot: number, digest: string | null) {
        if (digest === null) {
            this.hasDigest[slot] = 0;
            return;
        }
        const [a, b] = digestWords(digest);
        this.digest[slot * 2] = a;
        this.digest[slot * 2 + 1] = b;
        this.hasDigest[slot] = 1;
    }

    add(
        account: string,
        itemId: string,
        stashId: string,
        equipmentId: number,
        digest: string | null,
    ) {
        this.grow(this.size + 1);
        const slot = this.size++;
        fingerprint(itemId, this.ids, slot * 4);
        this.linkId(slot);
        this.accountOf[slot] = this.intern(this.accounts, this.accountNames, account);
        this.equipmentId[slot] = equipmentId;
        if (equipmentId >= this.nextEquipmentId) this.nextEquipmentId = equipmentId + 1;
        this.linkStash(slot, stashId);
        this.setDigest(slot, digest);
        this.active[slot] = 0;
        return slot;
    }

    private linkStash(slot: number, stashId: string) {
        const stash = this.intern(this.stashes, this.stashNames, stashId);
        if (stash === this.stashHead.length) this.stashHead.push(NONE);
        this.stashOf[slot] = stash;
        this.nextInStash[slot] = this.stashHead[stash]!;
        this.stashHead[stash] = slot;
    }

    /** Moves a row to another stash, as an item keeps its row when it moves. */
    move(slot: number, stashId: string) {
        const from = this.stashOf[slot]!;
        if (this.stashNames[from] === stashId) return;
        let previous = NONE;
        for (let at = this.stashHead[from]!; at !== NONE; at = this.nextInStash[at]!) {
            if (at === slot) {
                if (previous === NONE) this.stashHead[from] = this.nextInStash[at]!;
                else this.nextInStash[previous] = this.nextInStash[at]!;
                break;
            }
            previous = at;
        }
        this.linkStash(slot, stashId);
    }

    /** Drops every removed row the database no longer holds, after archiving moved them. */
    async reconcileRemoved(conn: DuckDBConnection) {
        const kept = new Set(
            (
                await queryAll<{ id: number }>(
                    conn,
                    "SELECT equipment_id::DOUBLE AS id FROM ps_equipment_listing WHERE removed_at IS NOT NULL",
                )
            ).map((row) => row.id),
        );
        const rebuilt = new EquipmentState();
        for (let slot = 0; slot < this.size; slot++) {
            if (!this.active[slot] && !kept.has(this.equipmentId[slot]!)) continue;
            const copy = rebuilt.addSlot(this, slot);
            rebuilt.active[copy] = this.active[slot]!;
        }
        rebuilt.nextEquipmentId = Math.max(rebuilt.nextEquipmentId, this.nextEquipmentId);
        Object.assign(this, rebuilt);
    }

    private addSlot(from: EquipmentState, slot: number) {
        this.grow(this.size + 1);
        const copy = this.size++;
        for (let i = 0; i < 4; i++) this.ids[copy * 4 + i] = from.ids[slot * 4 + i]!;
        this.linkId(copy);
        this.accountOf[copy] = this.intern(this.accounts, this.accountNames, from.account(slot));
        this.equipmentId[copy] = from.equipmentId[slot]!;
        if (from.equipmentId[slot]! >= this.nextEquipmentId)
            this.nextEquipmentId = from.equipmentId[slot]! + 1;
        this.linkStash(copy, from.stashId(slot));
        this.digest[copy * 2] = from.digest[slot * 2]!;
        this.digest[copy * 2 + 1] = from.digest[slot * 2 + 1]!;
        this.hasDigest[copy] = from.hasDigest[slot]!;
        return copy;
    }

    static idKeyOf(itemId: string) {
        return ListingState.idKeyOf(itemId);
    }
}

/**
 * Numbers every equipment row written without an `equipment_id`, or sharing one, then reads them.
 */
export async function loadEquipmentState(conn: DuckDBConnection) {
    await conn.run(
        `UPDATE ps_equipment_listing
        SET equipment_id = (SELECT coalesce(max(equipment_id), 0) FROM ps_equipment_listing) + rowid + 1
        WHERE equipment_id IS NULL OR equipment_id IN (
            SELECT equipment_id FROM ps_equipment_listing GROUP BY equipment_id HAVING count(*) > 1)`,
    );
    const state = new EquipmentState();
    const result = await conn.stream(
        `SELECT equipment_id::DOUBLE AS id, account_name, item_id, stash_id, content_digest,
            removed_at IS NULL AS active
        FROM ps_equipment_listing`,
    );
    for (;;) {
        const chunk = await result.fetchChunk();
        if (!chunk || chunk.rowCount === 0) break;
        const [ids, accounts, items, stashes, digests, active] = chunk.getColumns();
        for (let row = 0; row < chunk.rowCount; row++) {
            const slot = state.add(
                accounts![row] as string,
                items![row] as string,
                stashes![row] as string,
                ids![row] as number,
                (digests![row] as string | null) ?? null,
            );
            state.active[slot] = active![row] ? 1 : 0;
        }
    }
    return state;
}
