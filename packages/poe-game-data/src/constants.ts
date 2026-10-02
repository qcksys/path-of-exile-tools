import type { Game } from "./config.ts";

const poe1Domains =
    "undefined item flask monster chest area unknown1 templar_relic unknown3 crafted misc atlas leaguestone abyss_jewel map_device dummy delve delve_area synthesis_a synthesis_globals synthesis_bonus affliction_jewel heist_area heist_npc heist_trinket watchstone veiled expedition_relic unveiled primordial_altar sentinel memory_lines sanctum_relic crucible_remnant tincture affliction_charm necropolis_monster map_relic brequel_graft deepwater_chart deepwater_border mercenary ducat_crafted".split(
        " ",
    );
const poe2Domains =
    "undefined item flask monster chest strongbox area undefined sanctum_relic undefined crafted misc atlas leaguestone undefined map_device dummy undefined delve_area synthesis_a synthesis_globals synthesis_bonus affliction_jewel heist_area heist_npc heist_trinket watchstone veiled desecrated expedition_relic undefined sentinel memory_line sanctified_relic tablet ultimatum_key vault_key incursion_limb mods_disallowed".split(
        " ",
    );
const generations =
    "<unknown> prefix suffix unique nemesis corrupted bloodlines torment tempest talisman enchantment essence <unknown> bestiary delve_area synthesis_a synthesis_globals synthesis_bonus blight blight_tower monster_affliction flask_enchantment_enkindling flask_enchantment_instilling expedition_logbook scourge_benefit scourge_detriment scourge_gimmick <unknown> searing_exarch_implicit eater_of_worlds_implicit <unknown> crucible_tree crucible_unique_tree azmeri_empowered_monster necropolis_monster necropolis_devoted_monster memory_altar deepwater_chart".split(
        " ",
    );

export function domainName(game: Game, value: number): string {
    return (game === "poe1" ? poe1Domains : poe2Domains)[value] ?? "undefined";
}
export function generationName(game: Game, value: number): string {
    if (game === "poe2" && value === 33) return "instilled";
    if (game === "poe2" && value === 34) return "azmeri_empowered_monster";
    return generations[value] ?? "<unknown>";
}
export const itemDomainCorrections = new Set([
    "AreaDamageUniqueBodyDexInt1",
    "ElementalResistancePerEnduranceChargeDescentShield1",
    "LifeGainOnEndurangeChargeConsumptionUniqueBodyStrInt6",
    "ReturningProjectilesUniqueDescentBow1",
]);

export function translationFile(domain: string): string {
    const files: Record<string, string> = {
        monster: "monster",
        chest: "chest",
        strongbox: "chest",
        area: "map",
        atlas: "atlas",
        leaguestone: "leaguestone",
        delve_area: "map",
        map_device: "map",
        crafted: "map",
        heist_npc: "heist_equipment",
        primordial_altar: "primordial_altar",
        sentinel: "sentinel",
        templar_relic: "sanctum_relic",
        tincture: "tincture",
        map_relic: "atlas_relic",
        brequel_graft: "graft",
        tablet: "tablet",
    };
    return files[domain] ? `${files[domain]}_stat_descriptions.txt` : "stat_descriptions.txt";
}
