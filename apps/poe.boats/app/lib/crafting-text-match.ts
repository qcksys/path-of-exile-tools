import {
    formatStatNumber,
    matchesCondition,
    numericHandler,
    translationStatId,
} from "../../../../packages/poe-game-data/src/translation-formats";
import type { CraftingCatalog, CraftingItem, RolledMod } from "../schemas/crafting";
import {
    corruptionStatRange,
    jewelCorruptionRange,
    supportsJewelCorruption,
} from "./crafting-corruption";
import { extractedGrantedPassives, grantedPassiveStat } from "./crafting-passives";
import { cleanModText, modifierEffect, rolledModText } from "./crafting-text";

type Description = CraftingCatalog["crafting"]["statDescriptions"][number];
type Rule = Description["rules"][number];
type Capture = { index: number; format: string };
type Constraint = {
    condition: string;
    display: (raw: number) => (string | null)[];
    expected: string[];
    selected: number[];
};
const patterns = new WeakMap<Rule, { pattern: RegExp; captures: Capture[] }>();
const normalize = (text: string) => cleanModText(text).replace(/\s+/g, " ").trim();
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rangedNumber = /\{range:([\d.e+-]+)\}([+-]?)\(([+-]?\d+(?:\.\d+)?)-([+-]?\d+(?:\.\d+)?)\)/;

function compile(catalog: CraftingCatalog, rule: Rule) {
    const cached = patterns.get(rule);
    if (cached) return cached;
    const text = normalize(rule.text);
    const captures: Capture[] = [];
    let cursor = 0;
    let sequential = 0;
    let pattern = "^";
    for (const match of text.matchAll(/\{(\d*)(?::([^}]*))?\}/g)) {
        const capture = {
            index: match[1] ? Number(match[1]) : sequential++,
            format: match[2] ?? "",
        };
        let values: string[] | undefined;
        for (let index = 0; index < rule.handlers.length; index++) {
            const handler = rule.handlers[index]!;
            if (handler === "canonical_line") continue;
            const argument = rule.handlers[++index];
            const lookup = catalog.crafting.statLookups[handler];
            if (lookup && Number(argument) - 1 === capture.index)
                values = [...new Set(Object.values(lookup).map(normalize))].sort(
                    (a, b) => b.length - a.length,
                );
        }
        pattern +=
            escapePattern(text.slice(cursor, match.index)) +
            (values
                ? `(${values.map(escapePattern).join("|")})`
                : `([+-]?\\d+(?:\\.\\d+)?|${rangedNumber.source.replace(/(?<!\\)\((?!\?)/g, "(?:")})`);
        captures.push(capture);
        cursor = match.index + match[0].length;
    }
    pattern += escapePattern(text.slice(cursor)) + (text ? "(?= |$)" : "");
    const result = { pattern: new RegExp(pattern), captures };
    patterns.set(rule, result);
    return result;
}

function displayed(catalog: CraftingCatalog, rule: Rule, capture: Capture, raw: number) {
    let value: number | string = raw;
    let formatter = "";
    for (let index = 0; index < rule.handlers.length; index++) {
        const handler = rule.handlers[index]!;
        if (handler === "canonical_line") continue;
        const argument = rule.handlers[++index];
        if (["reminderstring", "canonical_stat"].includes(handler)) continue;
        if (Number(argument) - 1 !== capture.index) continue;
        if (typeof value !== "number") return null;
        const numeric = numericHandler(handler, value);
        if (numeric !== undefined) {
            value = numeric;
            formatter = handler;
        } else {
            const lookup: string | undefined =
                catalog.crafting.statLookups[handler]?.[String(value)];
            if (lookup === undefined) return null;
            value = lookup;
        }
    }
    if (typeof value === "string") return normalize(value);
    return (
        (value < 0 ? "-" : capture.format.includes("+") ? "+" : "") +
        formatStatNumber(Math.abs(value), formatter)
    );
}

function resolveRange(catalog: CraftingCatalog, rule: Rule, capture: Capture, value: string) {
    const match = new RegExp(`^${rangedNumber.source}$`).exec(value);
    if (!match) return { text: value };
    const [, fraction, sign, from, to] = match;
    const selected =
        (Number(from) + Number(fraction) * (Number(to) - Number(from))) * (sign === "-" ? -1 : 1);
    let zero = 0;
    let one = 1;
    for (let index = 0; index < rule.handlers.length; index++) {
        const handler = rule.handlers[index]!;
        if (handler === "canonical_line") continue;
        const argument = rule.handlers[++index];
        if (
            ["reminderstring", "canonical_stat"].includes(handler) ||
            Number(argument) - 1 !== capture.index
        )
            continue;
        const nextZero = numericHandler(handler, zero);
        const nextOne = numericHandler(handler, one);
        if (nextZero === undefined || nextOne === undefined) return null;
        zero = nextZero;
        one = nextOne;
    }
    const raw = (selected - zero) / (one - zero);
    if (!Number.isFinite(raw)) return null;
    // PoB selects a range position before rounding to the stat's integer storage units.
    const rounded =
        Math.sign(raw) * Math.round(Math.abs(raw) + Number.EPSILON * Math.max(1, Math.abs(raw)));
    const text = displayed(catalog, rule, capture, rounded);
    return text === null ? null : { text, raw: rounded };
}

function lowerBound(min: number, max: number, predicate: (value: number) => boolean) {
    while (min < max) {
        const middle = min + Math.floor((max - min) / 2);
        if (predicate(middle)) max = middle;
        else min = middle + 1;
    }
    return min;
}

function recoverValue(
    min: number,
    max: number,
    effect: number,
    constraints: Constraint[],
    lookupValues: number[],
    sanctification = 100,
) {
    const scaled = (value: number) =>
        Math.trunc((Math.round((value * sanctification) / 100) * (100 + effect)) / 100);
    let low = min;
    let high = max;
    for (const constraint of constraints) {
        for (const selected of constraint.selected) {
            low = Math.max(
                low,
                lowerBound(min, max + 1, (value) => scaled(value) >= selected),
            );
            high = Math.min(
                high,
                lowerBound(min, max + 1, (value) => scaled(value) > selected) - 1,
            );
        }
        for (let index = 0; index < constraint.expected.length; index++) {
            const expected = constraint.expected[index]!;
            if (!/^[+-]?\d+(?:\.\d+)?$/.test(expected)) continue;
            const first = Number(constraint.display(scaled(min))[index]);
            const last = Number(constraint.display(scaled(max))[index]);
            if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
            const direction = last < first ? -1 : 1;
            const target = Number(expected) * direction;
            const valueAt = (value: number) =>
                Number(constraint.display(scaled(value))[index]) * direction;
            low = Math.max(
                low,
                lowerBound(min, max + 1, (value) => valueAt(value) >= target),
            );
            high = Math.min(high, lowerBound(min, max + 1, (value) => valueAt(value) > target) - 1);
        }
    }
    if (low > high) return;
    const boundaries = constraints.flatMap((entry) =>
        [...entry.condition.matchAll(/-?\d+/g)].map((match) => Number(match[0])),
    );
    const candidates = new Set([
        low,
        high,
        0,
        ...[...boundaries, ...lookupValues].flatMap((value) => {
            const raw = Math.floor((value * 10000) / ((100 + effect) * sanctification));
            return [raw - 1, raw, raw + 1];
        }),
    ]);
    const matches = [...candidates]
        .filter((value) => value >= low && value <= high)
        .filter((value) =>
            constraints.every((entry) => {
                const input = scaled(value);
                return (
                    matchesCondition(entry.condition, input) &&
                    entry.selected.every((value) => value === input) &&
                    entry.display(input).every((text, index) => text === entry.expected[index])
                );
            }),
        )
        .sort((a, b) => a - b);
    if (!matches.length) return;
    return { value: matches[0]!, ambiguous: matches.length > 1 };
}

export function matchRolledMod(
    catalog: CraftingCatalog,
    id: string,
    text: string,
    item: CraftingItem,
    unscaled = false,
    fractured = false,
    allocatedPassive?: string,
): { mod: RolledMod; ambiguous: boolean } | undefined {
    const definition = catalog.mods[id]!;
    if (definition.stats.some((stat) => stat.id === grantedPassiveStat)) {
        let result: RolledMod | undefined;
        for (const passive of Object.keys(extractedGrantedPassives(catalog))) {
            if (allocatedPassive && allocatedPassive !== passive) continue;
            const mod: RolledMod = {
                id,
                values: definition.stats.map((stat) => stat.min),
                fractured: false,
                crafted: false,
                grantedPassive: passive,
            };
            const rendered = rolledModText(catalog, mod, item);
            if (rendered && normalize(rendered) === normalize(text)) {
                if (result) return;
                result = mod;
            }
        }
        return result ? { mod: result, ambiguous: false } : undefined;
    }
    if (allocatedPassive) return;
    const corruption = item.corrupted && supportsJewelCorruption(catalog, item);
    const range = corruption ? jewelCorruptionRange : catalog.crafting.sanctification;
    const scalable =
        (item.sanctified || corruption) &&
        !fractured &&
        range &&
        ["prefix", "suffix"].includes(catalog.mods[id]!.generation_type);
    const factors = scalable
        ? [
              100,
              ...Array.from(
                  { length: range.max - range.min + 1 },
                  (_, index) => range.min + index,
              ).filter((value) => value !== 100),
          ]
        : [100];
    let result: ReturnType<typeof matchRolledMod>;
    for (const factor of factors) {
        const matched = matchValues(catalog, id, text, item, unscaled, factor, Boolean(corruption));
        if (!matched) continue;
        if (result) return { ...result, ambiguous: true };
        result = matched;
    }
    return result;
}

function matchValues(
    catalog: CraftingCatalog,
    id: string,
    text: string,
    item: CraftingItem,
    unscaled: boolean,
    factor: number,
    corruption: boolean,
): { mod: RolledMod; ambiguous: boolean } | undefined {
    const mod = catalog.mods[id]!;
    const references = catalog.crafting.modDescriptions[id];
    if (!references?.length || !mod.stats.length) return;
    const expected = normalize(text);
    const effect = unscaled ? 0 : modifierEffect(catalog, item, id);
    const statIds = mod.stats.map((stat) => translationStatId(stat.id));
    const constraints: Constraint[][] = mod.stats.map(() => []);
    let attempts = 0;

    function matchDescription(
        index: number,
        remaining: string,
        resolved: string,
    ): ReturnType<typeof matchRolledMod> {
        if (++attempts > 256) return;
        if (index === references!.length) {
            if (remaining) return;
            const values = mod.stats.map((stat, index) => {
                const range = corruptionStatRange(catalog, item, id, index);
                const lookups = references!.flatMap((reference) =>
                    catalog.crafting.statDescriptions[reference]!.rules.flatMap((rule) =>
                        rule.handlers.flatMap((handler) =>
                            Object.keys(catalog.crafting.statLookups[handler] ?? {}).map(Number),
                        ),
                    ),
                );
                return recoverValue(
                    range.min,
                    range.max,
                    catalog.crafting.scalableStats.includes(stat.id) ? effect : 0,
                    constraints[index]!,
                    lookups,
                    factor,
                );
            });
            if (values.some((entry) => !entry)) return;
            const rolled: RolledMod = {
                id,
                values: values.map((entry) => entry!.value),
                crafted: mod.domain === "crafted",
                fractured: false,
                ...(factor !== 100
                    ? corruption
                        ? { corruptionScale: factor }
                        : { sanctification: factor }
                    : {}),
            };
            const rendered = rolledModText(
                catalog,
                rolled,
                unscaled ? undefined : { ...item, mods: [...item.mods, rolled] },
            );
            if (rendered == null || normalize(rendered) !== resolved) return;
            return { mod: rolled, ambiguous: values.some((entry) => entry!.ambiguous) };
        }
        const description = catalog.crafting.statDescriptions[references![index]!]!;
        const rules = [
            ...description.rules,
            { conditions: description.ids.map(() => "0"), text: "", handlers: [] },
        ];
        for (const rule of rules) {
            const compiled = compile(catalog, rule);
            const match = compiled.pattern.exec(remaining);
            if (!match) continue;
            const captured = compiled.captures.map((capture, index) =>
                resolveRange(catalog, rule, capture, match[index + 1]!),
            );
            if (captured.some((value) => value === null)) continue;
            const added: number[] = [];
            let valid = true;
            for (let position = 0; position < description.ids.length; position++) {
                const stat = statIds.indexOf(description.ids[position]!);
                const captures = compiled.captures.flatMap((capture, index) =>
                    capture.index === position ? [{ capture, value: captured[index]! }] : [],
                );
                const constraint: Constraint = {
                    condition: rule.conditions[position] ?? "#",
                    display: (raw) =>
                        captures.map(({ capture }) => displayed(catalog, rule, capture, raw)),
                    expected: captures.map((entry) => entry.value.text),
                    selected: captures.flatMap((entry) =>
                        entry.value.raw === undefined ? [] : [entry.value.raw],
                    ),
                };
                if (stat < 0) {
                    if (
                        !matchesCondition(constraint.condition, 0) ||
                        constraint.selected.some((value) => value !== 0) ||
                        constraint
                            .display(0)
                            .some((value, index) => value !== constraint.expected[index])
                    )
                        valid = false;
                } else {
                    constraints[stat]!.push(constraint);
                    added.push(stat);
                }
            }
            const ranged = captured.filter((_, index) => rangedNumber.test(match[index + 1]!));
            const fixed = match[0].replace(
                new RegExp(rangedNumber.source, "g"),
                () => ranged.shift()!.text,
            );
            const result = valid
                ? matchDescription(
                      index + 1,
                      remaining.slice(match[0].length).trim(),
                      `${resolved} ${fixed}`.trim(),
                  )
                : undefined;
            for (const stat of added) constraints[stat]!.pop();
            if (result) return result;
        }
    }
    return matchDescription(0, expected, "");
}
