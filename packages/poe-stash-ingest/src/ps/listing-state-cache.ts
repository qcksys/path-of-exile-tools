import type { DuckDBConnection } from "@duckdb/node-api";
import { type EquipmentState, loadEquipmentState } from "#src/ps/equipment-state.ts";
import { type ListingState, loadListingState } from "#src/ps/listing-state.ts";
import { queryAll } from "#src/shared/db.ts";

// One state per connection: the worker holds one for its lifetime, each test database its own.
const states = new WeakMap<DuckDBConnection, Promise<ListingState>>();

/**
 * The connection's listing state, read from `ps_listing` the first time, and again if rows came
 * or went other than through it (a tool, or a test, writing the table directly).
 */
export async function listingState(conn: DuckDBConnection) {
    const cached = states.get(conn);
    if (cached) {
        const state = await cached;
        const [table] = await queryAll<{ rows: number; unnumbered: number }>(
            conn,
            `SELECT count(*)::DOUBLE AS rows, count(*) FILTER (WHERE listing_id IS NULL)::DOUBLE AS unnumbered
            FROM ps_listing`,
        );
        if (table!.rows === state.size && table!.unnumbered === 0) return state;
        console.warn(
            `ps_listing holds ${table!.rows} rows (${table!.unnumbered} without listing_id) against ${state.size} in memory; reading it again.`,
        );
    }
    const state = loadListingState(conn);
    states.set(conn, state);
    state.catch(() => states.delete(conn));
    return state;
}

/** Drops the state after `ps_listing` changed other than through a `ListingBatch`. */
export function invalidateListingState(conn: DuckDBConnection) {
    states.delete(conn);
}

/** Forgets removed listings archiving moved out of `ps_listing`. */
export async function reconcileListingState(conn: DuckDBConnection) {
    const state = states.get(conn);
    if (state) await (await state).reconcileRemoved(conn);
}

const equipmentStates = new WeakMap<DuckDBConnection, Promise<EquipmentState>>();

/** The connection's equipment state; see `listingState`. */
export async function equipmentState(conn: DuckDBConnection) {
    const cached = equipmentStates.get(conn);
    if (cached) {
        const state = await cached;
        const [table] = await queryAll<{ rows: number; unnumbered: number }>(
            conn,
            `SELECT count(*)::DOUBLE AS rows, count(*) FILTER (WHERE equipment_id IS NULL)::DOUBLE AS unnumbered
            FROM ps_equipment_listing`,
        );
        if (table!.rows === state.size && table!.unnumbered === 0) return state;
        console.warn(
            `ps_equipment_listing holds ${table!.rows} rows (${table!.unnumbered} without equipment_id) against ${state.size} in memory; reading it again.`,
        );
    }
    const state = loadEquipmentState(conn);
    equipmentStates.set(conn, state);
    state.catch(() => equipmentStates.delete(conn));
    return state;
}

/** Drops the state after `ps_equipment_listing` changed other than through an `EquipmentBatch`. */
export function invalidateEquipmentState(conn: DuckDBConnection) {
    equipmentStates.delete(conn);
}

/** Forgets removed equipment rows archiving moved out of `ps_equipment_listing`. */
export async function reconcileEquipmentState(conn: DuckDBConnection) {
    const state = equipmentStates.get(conn);
    if (state) await (await state).reconcileRemoved(conn);
}
