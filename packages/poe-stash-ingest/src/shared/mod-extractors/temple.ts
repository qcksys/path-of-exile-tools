import type { Item } from "@poe-tools/api-client";
import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

const CHRONICLE = "Chronicle of Atzoatl";

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
            rooms.push(property.values[0][0]);
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
    matches: (item) => item.baseType === CHRONICLE && item.identified,
    extract(item) {
        const open = new Set(openRooms(item));
        return {
            kind: "temple",
            rooms: TEMPLE_ROOMS.filter((room) => open.has(`${room} (Tier 3)`)),
        };
    },
};
