import type { Game } from "./config.ts";
import { domainName, generationName, itemDomainCorrections } from "./constants.ts";
import type { Metadata } from "./metadata.ts";
import {
    baseSchema,
    type Dataset,
    itemClassSchema,
    modSchema,
    type StatValue,
    statSchema,
    validateDataset,
} from "./model.ts";
import { releaseStates } from "./release-states.ts";
import type { Row, Tables } from "./tables.ts";

type Translate = (domain: string, stats: StatValue[], id: string) => Promise<string | null>;
export type ImageAsset = { path: string; compose: boolean };
const ids = (rows: Row[]) => rows.map((row) => row.id());
function weights(row: Row, tagColumn: string, valueColumn: string) {
    const tags = ids(row.refs(tagColumn));
    const values = row.numbers(valueColumn);
    if (tags.length !== values.length)
        throw new Error(`${row.id()}: ${tagColumn} and ${valueColumn} have different lengths`);
    return tags.map((tag, index) => ({ tag, weight: values[index] }));
}

export async function normalize(tables: Tables, metadata: Metadata, translate: Translate) {
    const game: Game = tables.game;
    const field = (poe1: string, poe2: string) => (game === "poe1" ? poe1 : poe2);
    await tables.load([
        "Tags",
        "Stats",
        "Mods",
        "ModType",
        "ModFamily",
        "GrantedEffectsPerLevel",
        "GrantedEffects",
        "BaseItemTypes",
        "ItemClasses",
        "ItemClassCategories",
        "ItemVisualIdentity",
        "ArmourTypes",
        "ShieldTypes",
        "Flasks",
        "ComponentCharges",
        "WeaponTypes",
        "CurrencyItems",
        "BuffDefinitions",
    ]);
    await tables.load(
        game === "poe1"
            ? [
                  "ComponentAttributeRequirements",
                  "Tinctures",
                  "ItemisedCorpse",
                  "MonsterVarieties",
                  "CorpseTypeTags",
                  "InfluenceTags",
              ]
            : ["AttributeRequirements", "ItemInherentSkills", "SkillGems", "GoldModPrices"],
    );
    const data: Dataset = {
        tags: ids(tables.rows("Tags")),
        stats: {},
        mods: {},
        base_items: {},
        item_classes: {},
    };
    const tagDetails = Object.fromEntries(
        tables.rows("Tags").map((row) => [
            row.id(),
            {
                name: row.string("DisplayString"),
                ...(game === "poe2"
                    ? { used_in_crafting: Boolean(row.string("DisplayString")) }
                    : {}),
            },
        ]),
    );
    for (const row of tables.rows("Stats"))
        data.stats[row.id()] = statSchema.parse({
            is_local: row.boolean("IsLocal"),
            is_aliased: row.boolean("IsWeaponLocal"),
            alias: {
                when_in_main_hand: row
                    .ref(field("MainHandAlias_StatsKey", "MainHandAlias_Stat"))
                    ?.id(),
                when_in_off_hand: row
                    .ref(field("OffHandAlias_StatsKey", "OffHandAlias_Stat"))
                    ?.id(),
            },
        });
    const prices = new Map<number, number>();
    if (game === "poe2")
        for (const row of tables.rows("GoldModPrices")) {
            const mod = row.ref("Mod");
            if (mod && !prices.has(mod.index)) prices.set(mod.index, row.number("Value"));
        }
    for (const row of tables.rows("Mods")) {
        if (Object.hasOwn(data.mods, row.id())) continue;
        const stats: StatValue[] = [];
        for (let i = 1; i <= 8; i++) {
            const stat = row.ref(field(`StatsKey${i}`, `Stat${i}`));
            if (!stat) continue;
            const range =
                game === "poe1"
                    ? [row.number(`Stat${i}Min`), row.number(`Stat${i}Max`)]
                    : row.numbers(`Stat${i}Value`);
            const [min, max] = range;
            if (min === undefined || max === undefined || range.length !== 2)
                throw new Error(`${row.id()}: invalid stat range`);
            stats.push({ id: stat.id(), min, max });
        }
        const domain = domainName(game, row.number("Domain"));
        data.mods[row.id()] = modSchema.parse({
            required_level: row.number("Level"),
            maximum_level: row.number("MaxLevel"),
            stats,
            text: await translate(domain, stats, row.id()),
            domain: itemDomainCorrections.has(row.id()) ? "item" : domain,
            name: row.string("Name"),
            type: row.ref(field("ModTypeKey", "ModType"))?.string("Name"),
            generation_type: generationName(game, row.number("GenerationType")),
            groups: ids(row.refs("Families")),
            spawn_weights: weights(
                row,
                field("SpawnWeight_TagsKeys", "SpawnWeight_Tags"),
                "SpawnWeight_Values",
            ),
            generation_weights: weights(
                row,
                field("GenerationWeight_TagsKeys", "GenerationWeight_Tags"),
                "GenerationWeight_Values",
            ),
            grants_effects: row
                .refs(field("GrantedEffectsPerLevelKeys", "GrantedEffectsPerLevel"))
                .map((effect) => ({
                    granted_effect_id: effect.ref("GrantedEffect")?.id(),
                    level: effect.number("Level"),
                })),
            is_essence_only: row.boolean("IsEssenceOnlyModifier"),
            adds_tags: ids(row.refs(field("TagsKeys", "Tags"))),
            implicit_tags: ids(row.refs(field("ImplicitTagsKeys", "ImplicitTags"))),
            gold_value: prices.get(row.index) ?? null,
        });
    }
    const influences = new Map<string, string[]>();
    if (game === "poe1")
        for (const row of tables.rows("InfluenceTags")) {
            const itemClass = row.ref("ItemClass")?.id();
            const tag = row.ref("Tag")?.id();
            if (itemClass && tag)
                influences.set(itemClass, [...(influences.get(itemClass) ?? []), tag]);
        }
    for (const row of tables.rows("ItemClasses"))
        data.item_classes[row.id()] = itemClassSchema.parse({
            name: row.string("Name"),
            category_id: row.ref("ItemClassCategory")?.id() ?? null,
            category: row.ref("ItemClassCategory")?.string("Text") ?? null,
            influence_tags: influences.get(row.id()) ?? null,
        });
    const component = (table: string, key = field("BaseItemTypesKey", "BaseItemType")) =>
        new Map(
            tables.rows(table).flatMap((row) => {
                const column = row.has(key) ? key : "BaseItemTypesKey";
                const value = row.value(column);
                const id = typeof value === "string" ? value : row.ref(column)?.id();
                return id ? [[id, row] as const] : [];
            }),
        );
    const requirements = component(
        field("ComponentAttributeRequirements", "AttributeRequirements"),
    );
    const armour = component("ArmourTypes");
    const shields = component("ShieldTypes");
    const flasks = component("Flasks");
    const charges = component("ComponentCharges");
    const weapons = component("WeaponTypes");
    const currency = component("CurrencyItems");
    const tinctures = game === "poe1" ? component("Tinctures", "BaseItem") : new Map<string, Row>();
    const corpses =
        game === "poe1" ? component("ItemisedCorpse", "BaseItem") : new Map<string, Row>();
    const skills = game === "poe2" ? component("ItemInherentSkills") : new Map<string, Row>();
    const images = new Map<string, ImageAsset>();
    for (const row of tables.rows("BaseItemTypes")) {
        const id = row.id();
        const properties: Record<string, unknown> = {};
        const copy = (
            source: Row | undefined,
            mapping: Record<string, string>,
            positive = false,
        ) => {
            if (source)
                for (const [column, target] of Object.entries(mapping)) {
                    const value = source.value(column);
                    if (!positive || (typeof value === "number" && value > 0))
                        properties[target] = value;
                }
        };
        const defence = armour.get(id);
        if (defence) {
            for (const [column, key] of [
                ["Armour", "armour"],
                ["Evasion", "evasion"],
                ["EnergyShield", "energy_shield"],
                ...(game === "poe1" ? [["Ward", "ward"]] : []),
            ]) {
                if (!column || !key) continue;
                const min = defence.number(game === "poe1" ? `${column}Min` : column);
                const max = defence.number(game === "poe1" ? `${column}Max` : column);
                if (min > 0) properties[key] = { min, max };
            }
            if (defence.number("IncreasedMovementSpeed"))
                properties.movement_speed = defence.number("IncreasedMovementSpeed");
        }
        copy(shields.get(id), { Block: "block" });
        copy(
            flasks.get(id),
            { LifePerUse: "life_per_use", ManaPerUse: "mana_per_use", RecoveryTime: "duration" },
            true,
        );
        copy(charges.get(id), { MaxCharges: "charges_max", PerCharge: "charges_per_use" });
        copy(weapons.get(id), {
            [field("Critical", "CritChance")]: "critical_strike_chance",
            Speed: "attack_time",
            DamageMin: "physical_damage_min",
            DamageMax: "physical_damage_max",
            RangeMax: "range",
        });
        const money = currency.get(id);
        copy(money, {
            StackSize: "stack_size",
            Directions: "directions",
            Description: "description",
            [field("CurrencyTab_StackSize", "CurrencyTab_StackSize")]: "stack_size_currency_tab",
        });
        const fullStack = money?.ref(field("FullStack_BaseItemTypesKey", "FullStack_BaseItemType"));
        if (fullStack) properties.full_stack_turns_into = fullStack.id();
        copy(tinctures.get(id), { DebuffInterval: "mana_burn_ms", Cooldown: "cooldown_ms" });
        const corpse = corpses.get(id);
        if (corpse) {
            properties.monster_id = corpse.ref("MonsterVariety")?.id();
            properties.monster_ability_text = corpse.string("MonsterAbilities");
            properties.monster_category = corpse.ref("MonsterCategory")?.string("Name");
        }
        const requirement = requirements.get(id);
        const visual = row.ref("ItemVisualIdentity");
        if (!visual) throw new Error(`${id}: missing visual identity`);
        const path = row.string("InheritsFrom");
        const domain = domainName(game, row.number("ModDomain"));
        const flask = flasks.get(id);
        const buff = flask?.ref(field("BuffDefinitionsKey", "BuffDefinition"));
        let grantsBuff = null;
        if (buff && flask) {
            const stats = ids(buff.refs(field("StatsKeys", "Stats")));
            const values = flask.numbers("BuffStatValues");
            if (stats.length !== values.length)
                throw new Error(`${id}: buff stats and values differ in length`);
            grantsBuff = {
                id: buff.id(),
                stats: Object.fromEntries(stats.map((stat, index) => [stat, values[index]])),
            };
        }
        const skillIds = skills
            .get(id)
            ?.refs("SkillsGranted")
            .flatMap((skill) => {
                const base = skill.ref("BaseItemType");
                return base ? [base.id()] : [];
            });
        data.base_items[id] = baseSchema.parse({
            name: row.string("Name"),
            item_class: row.ref(field("ItemClassesKey", "ItemClass"))?.id(),
            inherits_from: path,
            inventory_width: row.number("Width"),
            inventory_height: row.number("Height"),
            drop_level: row.number("DropLevel"),
            implicits: ids(row.refs(field("Implicit_ModsKeys", "Implicit_Mods"))),
            tags: [...ids(row.refs(field("TagsKeys", "Tags"))), ...(await metadata.tags(path))],
            visual_identity: { id: visual.id(), dds_file: visual.string("DDSFile") },
            requirements: requirement
                ? {
                      strength: requirement.number("ReqStr"),
                      dexterity: requirement.number("ReqDex"),
                      intelligence: requirement.number("ReqInt"),
                      level: row.number("DropLevel"),
                  }
                : null,
            properties,
            release_state: releaseStates[id] ?? "released",
            domain: domain === "mods_disallowed" ? "undefined" : domain,
            grants_buff: grantsBuff,
            skills_granted: skillIds?.length ? skillIds : null,
        });
        if (visual.string("DDSFile"))
            images.set(visual.string("DDSFile"), {
                path: visual.string("DDSFile"),
                compose: game === "poe2" && visual.number("Composition") === 1,
            });
    }
    return { data: validateDataset(data), tagDetails, images: [...images.values()] };
}
