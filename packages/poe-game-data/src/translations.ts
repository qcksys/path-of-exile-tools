import { translationFile } from "./constants.ts";
import type { CraftingData } from "./crafting-data-model.ts";
import { decodeText } from "./io.ts";
import type { Mods, StatValue } from "./model.ts";
import { AssetNotFound, type AssetSource } from "./source.ts";
import type { Row, Tables } from "./tables.ts";
import {
    formatStatNumber,
    matchesCondition as matches,
    numericHandler,
    relationalPlaceholders,
    specificity,
    translationStatId,
} from "./translation-formats.ts";

export { numericHandler } from "./translation-formats.ts";

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

export class Translations {
    readonly errors: Record<string, string> = {};
    private cache = new Map<string, Descriptions>();
    private loading = new Set<string>();
    private failed = new Map<string, unknown>();
    constructor(
        private source: AssetSource,
        private tables: Tables,
    ) {}

    private descriptions(domain: string) {
        const file =
            domain === "sanctum_relic" && this.tables.game === "poe2"
                ? "sanctum_relic_stat_descriptions.txt"
                : translationFile(domain);
        return this.load(`Metadata/StatDescriptions/${file}`);
    }

    async exportDescriptions(
        mods: Mods,
        additionalStats: StatValue[][] = [],
    ): Promise<
        Pick<CraftingData, "statDescriptions" | "modDescriptions" | "modTexts" | "statLookups"> & {
            additionalDescriptions: number[][];
        }
    > {
        const statDescriptions: Description[] = [];
        const modDescriptions: Record<string, number[]> = {};
        const modTexts: Record<string, string> = {};
        const statLookups: Record<string, Record<string, string>> = {};
        const additionalDescriptions: number[][] = additionalStats.map(() => []);
        const indices = new Map<Description, number>();
        const records: {
            id: string;
            mod: Pick<Mods[string], "domain" | "generation_type" | "text" | "stats">;
            additional?: number;
        }[] = [
            ...Object.entries(mods).map(([id, mod]) => ({ id, mod })),
            ...additionalStats.map((stats, additional) => ({
                id: `augment stats ${additional}`,
                mod: { domain: "item", generation_type: "unique", text: null, stats },
                additional,
            })),
        ];
        for (const { id, mod, additional } of records) {
            const mapCorruption = mod.domain === "area" && mod.generation_type === "corrupted";
            if (
                (!mod.text &&
                    additional === undefined &&
                    !mapCorruption &&
                    !mod.stats.some((stat) => stat.id === "mod_granted_passive_hash_essence")) ||
                !mod.stats.length
            )
                continue;
            try {
                const all = await this.descriptions(mod.domain);
                // Map display hides these stats; corruption modifiers still need their item text.
                const fallback = mapCorruption ? await this.descriptions("item") : undefined;
                if (mapCorruption && !mod.text) {
                    const text = await this.translate("item", mod.stats, id);
                    if (text) modTexts[id] = text;
                }
                const stats = new Map(mod.stats.map((stat) => [translationStatId(stat.id), stat]));
                const descriptions = new Set(
                    [...stats.keys()].flatMap((id) => all.get(id) ?? fallback?.get(id) ?? []),
                );
                const references: number[] = [];
                for (const description of descriptions) {
                    let index = indices.get(description);
                    if (index === undefined) {
                        index = statDescriptions.length;
                        indices.set(description, index);
                        statDescriptions.push(description);
                    }
                    references.push(index);
                    for (const rule of description.rules) {
                        for (let handler = 0; handler < rule.handlers.length; handler++) {
                            const name = rule.handlers[handler]!;
                            if (name === "canonical_line") continue;
                            const argument = rule.handlers[++handler];
                            if (
                                ["reminderstring", "canonical_stat"].includes(name) ||
                                numericHandler(name, 0) !== undefined
                            )
                                continue;
                            const stat = stats.get(description.ids[Number(argument) - 1] ?? "");
                            const min = stat?.min ?? 0;
                            const max = stat?.max ?? 0;
                            if (max - min > 1024) continue;
                            const lookup = statLookups[name] ?? {};
                            statLookups[name] = lookup;
                            for (let value = min; value <= max; value++) {
                                if (Object.hasOwn(lookup, value)) continue;
                                const text = await this.relational(name, value);
                                if (text !== undefined) lookup[value] = text;
                            }
                        }
                    }
                }
                if (additional !== undefined) additionalDescriptions[additional] = references;
                else if (references.length) modDescriptions[id] = references;
            } catch (error) {
                this.errors[id] = error instanceof Error ? error.message : String(error);
            }
        }
        return { statDescriptions, modDescriptions, modTexts, statLookups, additionalDescriptions };
    }

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
                    return formatStatNumber(value, numericFormats.get(index) ?? "");
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
            const descriptions = await this.descriptions(domain);
            stats = stats.map((stat) => ({ ...stat, id: translationStatId(stat.id) }));
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
