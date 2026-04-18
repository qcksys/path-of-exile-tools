import type { MapCraftingOption } from "~/schemas/scarab";

export const MAP_CRAFTING_OPTIONS: MapCraftingOption[] = [
    // Standard options
    {
        id: "default",
        name: "Default",
        effect: "(1 to 8)% increased Quantity of Items found in this Area",
        cost: 0,
        imbued: false,
    },
    {
        id: "fortune",
        name: "Fortune Favours the Brave",
        effect: "One of the options available from this device will be applied at random",
        cost: 3,
        imbued: false,
    },
    {
        id: "torment",
        name: "Torment",
        effect: "Area is haunted by 4 additional Tormented Spirits",
        cost: 2,
        imbued: false,
    },
    {
        id: "abyss",
        name: "Abyss",
        effect: "Area contains 2 additional Abysses",
        cost: 3,
        imbued: false,
    },
    {
        id: "anarchy",
        name: "Anarchy",
        effect: "Area contains 3 additional Rogue Exiles",
        cost: 3,
        imbued: false,
    },
    {
        id: "blight",
        name: "Blight",
        effect: "Area contains a Blight Encounter",
        cost: 3,
        imbued: false,
    },
    {
        id: "harbinger",
        name: "Harbinger",
        effect: "Area contains 3 additional Harbingers",
        cost: 3,
        imbued: false,
    },
    {
        id: "legion",
        name: "Legion",
        effect: "Area contains an additional Legion Encounter",
        cost: 3,
        imbued: false,
    },
    {
        id: "ambush",
        name: "Ambush",
        effect: "Area contains 4 additional Strongboxes",
        cost: 4,
        imbued: false,
    },
    {
        id: "beyond",
        name: "Beyond",
        effect: "Slaying Enemies close together can attract monsters from Beyond",
        cost: 4,
        imbued: false,
    },
    {
        id: "domination",
        name: "Domination",
        effect: "Area contains 4 additional Shrines",
        cost: 4,
        imbued: false,
    },
    {
        id: "essence",
        name: "Essence",
        effect: "Area contains 3 additional Imprisoned Monsters",
        cost: 4,
        imbued: false,
    },
    {
        id: "ultimatum",
        name: "Ultimatum",
        effect: "Area contains an Ultimatum Encounter",
        cost: 4,
        imbued: false,
    },
    {
        id: "expedition",
        name: "Expedition",
        effect: "Area contains an Expedition Encounter",
        cost: 5,
        imbued: false,
    },
    {
        id: "heist",
        name: "Heist",
        effect: "Area contains 3 additional Smuggler's Caches",
        cost: 5,
        imbued: false,
    },
    {
        id: "ritual",
        name: "Ritual",
        effect: "Area contains a Ritual Encounter",
        cost: 5,
        imbued: false,
    },
    {
        id: "settlers",
        name: "Settlers",
        effect: "Area contains 2 additional Ore Deposits",
        cost: 5,
        imbued: false,
    },
    {
        id: "delirium",
        name: "Delirium",
        effect: "Area contains a Mirror of Delirium",
        cost: 6,
        imbued: false,
    },
    {
        id: "harvest",
        name: "Harvest",
        effect: "Area contains The Sacred Grove",
        cost: 6,
        imbued: false,
    },

    // Imbued options (require Horned Scarab of Awakening)
    {
        id: "imbued_abyss",
        name: "Imbued Abyss",
        effect: "Area contains an additional Abyss. Abysses in Area have 100% increased chance to lead to an Abyssal Depths. Areas can contain Abysses",
        cost: 3,
        imbued: true,
    },
    {
        id: "imbued_ambush",
        name: "Imbued Ambush",
        effect: "Area contains 6 additional Strongboxes. 100% increased chance for Strongboxes in Area to be Unique",
        cost: 4,
        imbued: true,
    },
    {
        id: "imbued_anarchy",
        name: "Imbued Anarchy",
        effect: "Area is inhabited by 3 additional Rogue Exiles. Items dropped by Rogue Exiles in Area have a 20% chance to be Fractured",
        cost: 3,
        imbued: true,
    },
    {
        id: "imbued_beyond",
        name: "Imbued Beyond",
        effect: "Slaying Enemies close together can attract monsters from Beyond this realm. Monsters have 80% increased chance to spawn a Beyond Portal",
        cost: 4,
        imbued: true,
    },
    {
        id: "imbued_blight",
        name: "Imbued Blight",
        effect: "Area contains a Blight Encounter. Blight Chests in Area have a 100% increased chance to contain Oils",
        cost: 3,
        imbued: true,
    },
    {
        id: "imbued_delirium",
        name: "Imbued Delirium",
        effect: "Delirium Monsters in Area have 40% increased Pack Size. Areas contain a Mirror of Delirium",
        cost: 6,
        imbued: true,
    },
    {
        id: "imbued_domination",
        name: "Imbued Domination",
        effect: "Area contains 3 additional Shrines. 300% increased Duration of Shrine Effects on Players",
        cost: 4,
        imbued: true,
    },
    {
        id: "imbued_essence",
        name: "Imbued Essence",
        effect: "Imprisoned Monsters in Area have 30% chance to have 3 additional Essences. Area contains 2 additional Imprisoned Monsters",
        cost: 4,
        imbued: true,
    },
    {
        id: "imbued_expedition",
        name: "Imbued Expedition",
        effect: "Area contains an Expedition Encounter. Vendor Refresh Currencies dropped in Area have a 25% chance to be converted to Logbooks",
        cost: 5,
        imbued: true,
    },
    {
        id: "imbued_harbinger",
        name: "Imbued Harbinger",
        effect: "Area contains 3 additional Harbingers. Harbingers have a 25% chance to be replaced by a powerful Harbinger boss",
        cost: 3,
        imbued: true,
    },
    {
        id: "imbued_harvest",
        name: "Imbued Harvest",
        effect: "Area contains The Sacred Grove. Harvests in Area have 50% chance for the unchosen Crop to not wilt. Harvested Plants have 50% chance to spawn an additional Monster",
        cost: 6,
        imbued: true,
    },
    {
        id: "imbued_heist",
        name: "Imbued Heist",
        effect: "Area contains 5 additional Smuggler's Caches",
        cost: 5,
        imbued: true,
    },
    {
        id: "imbued_legion",
        name: "Imbued Legion",
        effect: "Area contains 2 additional Legion Encounters. Legion Encounters with a General in Area have both Generals",
        cost: 3,
        imbued: true,
    },
    {
        id: "imbued_ritual",
        name: "Imbued Ritual",
        effect: "Areas contain Ritual Altars. 150% increased chance of Ritual Altars with Special Rewards",
        cost: 5,
        imbued: true,
    },
    {
        id: "imbued_torment",
        name: "Imbued Torment",
        effect: "Area is haunted by 8 additional Tormented Spirits",
        cost: 2,
        imbued: true,
    },
    {
        id: "imbued_ultimatum",
        name: "Imbued Ultimatum",
        effect: "Areas contain an Ultimatum Encounter. Ultimatum Encounters in your Maps last up to 13 Rounds",
        cost: 4,
        imbued: true,
    },
];

export function getMapCraftingOptionById(id: string): MapCraftingOption | undefined {
    return MAP_CRAFTING_OPTIONS.find((opt) => opt.id === id);
}

export function getStandardOptions(): MapCraftingOption[] {
    return MAP_CRAFTING_OPTIONS.filter((opt) => !opt.imbued);
}

export function getImbuedOptions(): MapCraftingOption[] {
    return MAP_CRAFTING_OPTIONS.filter((opt) => opt.imbued);
}

export function getAvailableOptions(hasAwakeningScrab: boolean): MapCraftingOption[] {
    if (hasAwakeningScrab) {
        return MAP_CRAFTING_OPTIONS;
    }
    return getStandardOptions();
}
