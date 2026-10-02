import { translationFile } from "./constants.ts";
import { decodeText } from "./io.ts";
import type { StatValue } from "./model.ts";
import { AssetNotFound, type AssetSource } from "./source.ts";
import type { Row, Tables } from "./tables.ts";
import { relationalPlaceholders, specificity } from "./translation-formats.ts";

type Rule = { conditions: string[]; text: string; handlers: string[] };
type Description = { ids: string[]; rules: Rule[] };
type Descriptions = Map<string, Description[]>;
type Entry = { description: Description } | { include: string } | { hidden: string };

export function parseDescriptions(text: string) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//"));
    const descriptions: Description[] = [];
    const includes: string[] = [];
    const hidden: string[] = [];
    const entries: Entry[] = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? "";
        const include = /^include "([^"]+)"/.exec(line);
        if (include?.[1]) {
            includes.push(include[1]);
            entries.push({ include: include[1].replaceAll("\\", "/") });
        }
        if (line.startsWith("no_description "))
            for (const id of line.slice(15).trim().split(/\s+/)) {
                hidden.push(id);
                entries.push({ hidden: id });
            }
        if (!/^description(?:\s|$)/.test(line)) continue;
        const header = lines[++index]?.split(/\s+/) ?? [];
        const count = Number(header.shift());
        if (!Number.isInteger(count) || count < 1 || header.length !== count)
            throw new Error(`Invalid description header: ${header.join(" ")}`);
        const ruleCount = Number(lines[++index]);
        if (!Number.isInteger(ruleCount) || ruleCount < 0)
            throw new Error("Invalid description rule count");
        const rules: Rule[] = [];
        for (let r = 0; r < ruleCount; r++) {
            const rule = /^(.*?)\s+"((?:[^"\\]|\\.)*)"(.*)$/.exec(lines[++index] ?? "");
            if (!rule) throw new Error(`Invalid description rule: ${lines[index]}`);
            const conditions = (rule[1] ?? "").trim().split(/\s+/);
            if (
                conditions.length > count &&
                conditions
                    .slice(count)
                    .every((condition) => ["table_only", "gem_quality"].includes(condition))
            )
                continue;
            if (conditions.length !== count)
                throw new Error(
                    `Description condition count differs from stat count (${count}): ${lines[index]}`,
                );
            rules.push({
                conditions,
                text: (rule[2] ?? "")
                    .replaceAll("\\n", "\n")
                    .replaceAll('\\"', '"')
                    .replaceAll("\\\\", "\\"),
                handlers: (rule[3] ?? "").trim().split(/\s+/).filter(Boolean),
            });
        }
        if (rules.length) {
            const description = { ids: header, rules };
            descriptions.push(description);
            entries.push({ description });
        }
    }
    return { descriptions, includes, hidden, entries };
}

function matches(condition: string, value: number): boolean {
    if (condition.startsWith("!")) return !matches(condition.slice(1), value);
    if (condition === "#") return true;
    if (condition.includes("|")) {
        const [min, max] = condition.split("|");
        return (min === "#" || value >= Number(min)) && (max === "#" || value <= Number(max));
    }
    return value === Number(condition);
}

const divisors: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    ten: 10,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
    fifty: 50,
    one_hundred: 100,
    one_thousand: 1000,
};
export function numericHandler(name: string, value: number): number | undefined {
    if (name === "subtract_one") return value - 1;
    if (name === "add_one") return value + 1;
    if (name === "invert_chance") return 100 - value;
    if (name === "negate") return -value;
    if (name === "double") return value * 2;
    if (name === "negate_and_double") return value * -2;
    if (name === "times_one_point_five") return value * 1.5;
    if (name === "times_twenty") return value * 20;
    if (name === "multiply_by_ten") return value * 10;
    if (name === "multiply_by_one_hundred") return value * 100;
    if (name === "plus_two_hundred") return value + 200;
    if (name === "multiplicative_damage_modifier") return value + 100;
    if (name === "multiplicative_permyriad_damage_modifier") return value / 100 + 100;
    if (name === "old_leech_percent") return value / 5;
    if (name === "old_leech_permyriad") return value / 500;
    if (name === "permyriad_per_minute_to_%_per_second") return value / 6000;
    const percent = /^(\d+)%_of_value$/.exec(name)?.[1];
    if (percent) return (value * Number(percent)) / 100;
    if (name === "milliseconds_to_seconds_halved") return value / 500;
    if (name === "divide_by_twenty_then_double_0dp") return value / 10;
    const division = /^divide_by_(.+?)(?:_([012])dp(?:_if_required)?|_and_negate)?$/.exec(name);
    let divisor = division?.[1] ? divisors[division[1]] : undefined;
    if (name.startsWith("milliseconds_to_seconds")) divisor = 1000;
    if (name.startsWith("per_minute_to_per_second")) divisor = 60;
    if (name === "deciseconds_to_seconds" || name === "locations_to_metres") divisor = 10;
    if (!divisor) return undefined;
    const result = (value / divisor) * (name.endsWith("and_negate") ? -1 : 1);
    return result;
}

export class Translations {
    readonly errors: Record<string, string> = {};
    private cache = new Map<string, Descriptions>();
    private loading = new Set<string>();
    private failed = new Map<string, unknown>();
    constructor(
        private source: AssetSource,
        private tables: Tables,
    ) {}

    private async load(path: string): Promise<Descriptions> {
        if (this.tables.game === "poe2")
            path = path
                .replace("Metadata/StatDescriptions/", "Data/StatDescriptions/")
                .replace(/\.txt$/, ".csd");
        const cached = this.cache.get(path);
        if (cached) return cached;
        if (this.failed.has(path)) throw this.failed.get(path);
        if (this.loading.has(path)) throw new Error(`Cyclic stat description include: ${path}`);
        this.loading.add(path);
        try {
            const parsed = parseDescriptions(decodeText(await this.source.get(path)));
            const result: Descriptions = new Map();
            for (const entry of parsed.entries) {
                if ("include" in entry)
                    for (const [id, descriptions] of await this.load(entry.include))
                        result.set(id, descriptions);
                else if ("hidden" in entry) result.delete(entry.hidden);
                else
                    for (const id of entry.description.ids) {
                        const prior = result.get(id) ?? [];
                        result.set(id, [
                            ...prior.filter(
                                (description) =>
                                    description.ids.join("\n") !== entry.description.ids.join("\n"),
                            ),
                            entry.description,
                        ]);
                    }
            }
            this.cache.set(path, result);
            return result;
        } catch (error) {
            this.failed.set(path, error);
            throw error;
        } finally {
            this.loading.delete(path);
        }
    }

    private async relational(name: string, value: number): Promise<string | undefined> {
        const definitions: Record<
            string,
            { table: string; index?: string; value?: string; start?: number }
        > = {
            mod_value_to_item_class: { table: "ItemClasses" },
            tempest_mod_text: { table: "Mods" },
            display_indexable_support: { table: "IndexableSupportGems", index: "Index" },
            display_indexable_non_active_support: {
                table: "IndexableNonActiveSupportGems",
                index: "Index",
            },
            display_indexable_skill: {
                table: "IndexableSkillGems",
                index: "Index",
                value: "Name1",
            },
            tree_expansion_jewel_passive: { table: "PassiveTreeExpansionJewelSizes" },
            affliction_reward_type: {
                table: "AfflictionRewardTypeVisuals",
                index: "AfflictionRewardTypes",
            },
            passive_hash: { table: "PassiveSkills", index: "PassiveSkillGraphId" },
            ultimatum_wager_type_hash: {
                table: "UltimatumWagerTypes",
                index: "HASH16",
                value: "DisplayText",
            },
            passive_keystone_index: {
                table: "PassiveKeystoneList",
                start: 1,
                value: "DisplayText",
            },
            mages_legacy_index: { table: "UniqueMagesLegacy", start: 1, value: "DisplayText" },
            specific_skill: { table: "SkillGemsForUniqueStat", index: "Index", value: "SkillGems" },
        };
        const definition = definitions[name];
        if (!definition) return undefined;
        await this.tables.load([definition.table]);
        let rows = this.tables.rows(definition.table);
        if (name === "tempest_mod_text")
            rows = rows.filter((row) => row.number("GenerationType") === 8);
        const index = ["passive_hash", "ultimatum_wager_type_hash"].includes(name)
            ? value & 0xffff
            : value;
        const row: Row | undefined = definition.index
            ? rows.find((row) => row.value(definition.index ?? "Index") === index)
            : rows[index - (definition.start ?? 0)];
        if (!row) return relationalPlaceholders[name] ?? "";
        if (name === "specific_skill") {
            await this.tables.load(["SkillGems", "BaseItemTypes"]);
            return row
                .refs("SkillGems")
                .map((gem) => gem.ref("BaseItemType")?.string("Name"))
                .join(" and ");
        }
        return row.string(definition.value ?? "Name");
    }

    private async render(rule: Rule, values: StatValue[]): Promise<string> {
        const ranges: (number | string)[][] = values.map((value) => [value.min, value.max]);
        const numericFormats = new Map<number, string>();
        const relationalFormats = new Map<number, string>();
        for (let i = 0; i < rule.handlers.length; i++) {
            const name = rule.handlers[i];
            if (!name || name === "canonical_line") continue;
            const arg = rule.handlers[++i];
            if (name === "reminderstring" || name === "canonical_stat") continue;
            const index = Number(arg) - 1;
            const range = ranges[index];
            if (!range) throw new Error(`Invalid ${name} argument: ${arg}`);
            for (let j = 0; j < range.length; j++) {
                const value = range[j];
                if (typeof value !== "number")
                    throw new Error(`Non-numeric handler input: ${name}`);
                const numeric = numericHandler(name, value);
                if (numeric !== undefined) numericFormats.set(index, name);
                else relationalFormats.set(index, name);
                const result = numeric ?? (await this.relational(name, value));
                if (result === undefined) throw new Error(`Unsupported stat handler: ${name}`);
                range[j] = result;
            }
        }
        let sequential = 0;
        return rule.text.replace(
            /\{(\d*)(?::([^}]*))?\}/g,
            (_match, rawIndex: string, format: string | undefined) => {
                const index = rawIndex ? Number(rawIndex) : sequential++;
                const range = ranges[index];
                if (!range || range[0] === undefined || range[1] === undefined)
                    throw new Error(`Missing stat placeholder ${index}`);
                let [min, max] = range;
                const negative =
                    typeof min === "number" && typeof max === "number" && min < 0 && max < 0;
                if (negative) {
                    min = Math.abs(Number(min));
                    max = Math.abs(Number(max));
                }
                const clean = (value: number | string) => {
                    if (typeof value !== "number") return value;
                    const handler = numericFormats.get(index) ?? "";
                    const fractional = [
                        "per_minute_to_per_second",
                        "permyriad_per_minute_to_%_per_second",
                    ].includes(handler);
                    const dp = /_([012])dp/.exec(handler)?.[1] ?? (fractional ? "1" : undefined);
                    if (dp === "0") return String(Math.trunc(value));
                    if (dp !== undefined) {
                        const factor = 10 ** Number(dp);
                        const scaled = value * factor;
                        const rounded =
                            scaled % 1 === 0.5
                                ? (Math.floor(scaled) % 2 === 0
                                      ? Math.floor(scaled)
                                      : Math.ceil(scaled)) / factor
                                : value;
                        const formatted = rounded.toFixed(Number(dp));
                        return handler.endsWith("_if_required") || fractional
                            ? String(Number(formatted))
                            : formatted;
                    }
                    return String(Number(value.toPrecision(6)));
                };
                const sign = negative
                    ? "-"
                    : format?.includes("+") && typeof min === "number"
                      ? "+"
                      : "";
                const relational = relationalFormats.get(index);
                if (relational && min !== max) return relationalPlaceholders[relational] ?? "";
                return sign + (min === max ? clean(min) : `(${clean(min)}-${clean(max)})`);
            },
        );
    }

    async translate(domain: string, stats: StatValue[], id: string): Promise<string | null> {
        if (!stats.length) return null;
        try {
            const file =
                domain === "sanctum_relic" && this.tables.game === "poe2"
                    ? "sanctum_relic_stat_descriptions.txt"
                    : translationFile(domain);
            const descriptions = await this.load(`Metadata/StatDescriptions/${file}`);
            stats = stats.map((stat) =>
                stat.id === "corrosive_shroud_maximum_stored_poison_damage"
                    ? { ...stat, id: "virtual_plague_bearer_maximum_stored_poison_damage" }
                    : stat,
            );
            const values = new Map(stats.map((stat) => [stat.id, stat]));
            const used = new Set<Description>();
            const lines: string[] = [];
            for (const stat of stats) {
                if (stat.min === 0 && stat.max === 0) continue;
                for (const description of descriptions.get(stat.id) ?? []) {
                    if (used.has(description)) continue;
                    used.add(description);
                    const input = description.ids.map(
                        (id) => values.get(id) ?? { id, min: 0, max: 0 },
                    );
                    if (input.every((value) => value.min === 0 && value.max === 0)) continue;
                    const rule = description.rules
                        .filter((candidate) =>
                            candidate.conditions.every((condition, index) =>
                                matches(condition, input[index]?.max || input[index]?.min || 0),
                            ),
                        )
                        .sort((a, b) => specificity(b) - specificity(a))[0];
                    if (!rule) continue;
                    const line = await this.render(rule, input);
                    lines.push(line);
                }
            }
            return lines.length ? lines.join("\n") : null;
        } catch (error) {
            if (error instanceof AssetNotFound || error instanceof Error) {
                this.errors[id] = error.message;
                return null;
            }
            throw error;
        }
    }
}
