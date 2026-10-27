import type { ModExtractor } from "#src/shared/mod-extractors/types.ts";

const BASE_TYPE = "Prime Chaotic Resonator";

export const emptyResonatorExtractor: ModExtractor = {
    kind: "empty-resonator-v1",
    value: () => "reroll:4",
    matches: (item) => item.baseType === BASE_TYPE,
    extract(item) {
        // The public-stash caller rejects PoE 2 before capture; Item alone has no game field.
        if (
            item.baseType !== BASE_TYPE ||
            item.typeLine !== BASE_TYPE ||
            item.name !== "" ||
            item.identified !== true ||
            item.verified !== true ||
            (item.frameType !== undefined && item.frameType !== 5) ||
            (item.rarity !== undefined && item.rarity !== "Currency") ||
            (item.frameType !== 5 && item.rarity !== "Currency") ||
            ("realm" in item && item.realm !== "pc") ||
            (item.foilVariation !== undefined && item.foilVariation !== -1)
        )
            return null;

        const flags = [
            item.corrupted,
            item.doubleCorrupted,
            item.fractured,
            item.synthesised,
            item.mutated,
            item.memoryItem,
            item.replica,
            item.isRelic,
            item.duplicated,
            item.split,
            item.unmodifiable,
            item.sanctified,
            item.lockedToAccount,
            item.lockedToCharacter,
        ];
        const mods = [
            item.explicitMods,
            item.implicitMods,
            item.enchantMods,
            item.craftedMods,
            item.fracturedMods,
            item.mutatedMods,
            item.scourgeMods,
            item.crucibleMods,
        ];
        if (
            flags.some((flag) => flag !== undefined && flag !== false) ||
            mods.some(
                (lines) => lines !== undefined && (!Array.isArray(lines) || lines.length !== 0),
            ) ||
            !Array.isArray(item.socketedItems) ||
            item.socketedItems.length !== 0 ||
            !Array.isArray(item.sockets) ||
            item.sockets.length !== 4
        )
            return null;

        for (const socket of item.sockets) {
            if (
                !socket ||
                typeof socket !== "object" ||
                Array.isArray(socket) ||
                !Number.isSafeInteger(socket.group) ||
                socket.group < 0 ||
                socket.attr !== "DV" ||
                socket.sColour !== "DV" ||
                Object.keys(socket).some((key) => !["group", "attr", "sColour"].includes(key))
            )
                return null;
        }
        return {
            kind: "empty-resonator-v1",
            action: "delve_currency_reroll",
            sockets: 4,
            socketedItems: 0,
        };
    },
};
