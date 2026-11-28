import type { Item } from "@poe-tools/api-client";
import { apexRoomMarket, TEMPLE_APEX, TEMPLE_CHRONICLE } from "@poe-tools/market";
import { propertyNumber } from "#src/shared/mod-extractors/gem.ts";
import { withoutMarkup } from "#src/shared/mod-extractors/lines.ts";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

/** Tier 3 rooms whose altars craft items, which temples trade by. */
export const TEMPLE_ROOMS = ["Doryani's Institute", "Locus of Corruption"] as const;

/**
 * Open rooms of a Chronicle of Atzoatl: the `additionalProperties` values between `Open Rooms:`
 * and `Obstructed Rooms:`, such as `Locus of Corruption (Tier 3)`.
 */
function openRooms(item: Item) {
    const rooms: string[] = [];
    let open = false;
    for (const property of item.additionalProperties ?? []) {
        if (property.name === "Open Rooms:") open = true;
        else if (property.name === "Obstructed Rooms:") open = false;
        else if (open && !property.name && property.values[0]?.[0])
            rooms.push(withoutMarkup(property.values[0][0]).trim());
    }
    return rooms;
}

/**
 * Temples trade by which of TEMPLE_ROOMS they have open at tier 3, comma-separated in that order
 * (`Locus of Corruption`), and empty without either.
 */
export const templeExtractor: ModExtractor = {
    kind: "temple",
    value: (signature) => (signature.rooms as string[]).join(", "),
    matches: (item) => item.baseType === TEMPLE_CHRONICLE && item.identified,
    extract(item) {
        const open = new Set(openRooms(item));
        const roomMarkets = [...open].filter(Boolean);
        const level = propertyNumber(item, "Area Level");
        if (open.has(TEMPLE_APEX) && (level === 83 || level === 84))
            roomMarkets.push(apexRoomMarket(level));
        return {
            kind: "temple",
            rooms: TEMPLE_ROOMS.filter((room) => open.has(`${room} (Tier 3)`)),
            roomMarkets,
        };
    },
};
