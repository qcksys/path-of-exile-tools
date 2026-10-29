// biome-ignore-all lint/style/useNamingConvention: Bestiary keys are canonical game-data identifiers.

/**
 * The species name of each named beast a Bestiary recipe sacrifices, by its recipe component ID.
 * Captured beasts are listed under this name: rare beasts as their base type, spirit beasts as
 * their unique name.
 */
export const RECIPE_BEASTS: Record<string, string> = {
    LegendaryBeastGemFrog: "Craicic Croaker",
    LegendaryBeastLynx: "Farric Lynx Alpha",
    LegendaryBeastWolf: "Farric Wolf Alpha",
    LegendaryBeastSandSpitter: "Craicic Sand Spitter",
    LegendaryBeastShieldCrab: "Craicic Shield Crab",
    LegendaryBeastCrab: "Craicic Savage Crab",
    LegendaryBeastForestSnake: "Saqawine Cobra",
    LegendaryBeastDevourer: "Fenumal Devourer",
    LegendaryBeastSandSnake: "Saqawine Blood Viper",
    LegendaryBeastCarrionQueen: "Fenumal Queen",
    LegendaryBeastSquid: "Craicic Watcher",
    LegendaryBeastSpiker: "Farric Goliath",
    LegendaryBeastSandLeaper: "Fenumal Scrabbler",
    LegendaryBeastFrog: "Craicic Maw",
    LegendaryBeastPlagueSpider: "Fenumal Plagued Arachnid",
    LegendaryBeastSirenSpawn: "Craicic Squid",
    LegendaryBeastHellionIce: "Farric Frost Hellion Alpha",
    LegendaryBeastParasiticSquid: "Craicic Vassal",
    LegendaryBeastScorpion: "Fenumal Scorpion",
    MemoryLineLegendaryBeastHarvestBeastT3: "Wild Bristle Matron",
    SpiritBossTiger: "Farrul, First of the Plains",
    SpiritBossAvian: "Saqawal, First of the Sky",
    SpiritBossSpider: "Fenumus, First of the Night",
    SpiritBossCrab: "Craiceann, First of the Deep",
    Morrigan: "Black Morrigan",
};
