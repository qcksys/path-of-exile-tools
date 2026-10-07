import { z } from "zod";
import { renderStatText, type StatTextData } from "../../poe-game-data/src/render-stat-text.ts";
import { numericHandler, translationStatId } from "../../poe-game-data/src/translation-formats.ts";

export const modifierScalingSchema = z.strictObject({
    stats: z
        .array(
            z.strictObject({
                id: z.string(),
                min: z.number().int(),
                max: z.number().int(),
                scalable: z.boolean(),
            }),
        )
        .max(32),
    descriptions: z.array(z.number().int().nonnegative()).max(32),
});
export const modifierTranslationsSchema = z.strictObject({
    statDescriptions: z
        .array(
            z.strictObject({
                ids: z.array(z.string()).max(32),
                rules: z
                    .array(
                        z.strictObject({
                            conditions: z.array(z.string()),
                            text: z.string(),
                            handlers: z.array(z.string()),
                        }),
                    )
                    .max(500),
            }),
        )
        .max(20_000),
    statLookups: z.record(z.string(), z.record(z.string(), z.string())),
});
type Range = { min: number; max: number };
type Scaling = z.infer<typeof modifierScalingSchema>;
const numbers = /[+-]?\d+(?:\.\d+)?/g;

function product<T>(inputs: T[][], limit: number): T[][] | null {
    let result: T[][] = [[]];
    for (const input of inputs) {
        if (result.length * input.length > limit) return null;
        result = result.flatMap((previous) => input.map((value) => [...previous, value]));
    }
    return result;
}

// Each interval has a constant rule selection. Numeric handlers are affine; endpoint
// rendering also applies the game's monotone display rounding. Lookup inputs are enumerated.
export function scaledModifierTexts(
    data: StatTextData,
    definition: Scaling,
    effect: number,
): string[] | null {
    const stats = new Map(
        definition.stats.map((stat) => [
            translationStatId(stat.id),
            {
                min: stat.scalable ? Math.trunc((stat.min * (100 + effect)) / 100) : stat.min,
                max: stat.scalable ? Math.trunc((stat.max * (100 + effect)) / 100) : stat.max,
            },
        ]),
    );
    const sections: string[][] = [];
    for (const reference of definition.descriptions) {
        const description = data.statDescriptions[reference];
        if (!description) return null;
        const partitions: Range[][] = [];
        for (const [index, id] of description.ids.entries()) {
            const range = stats.get(id) ?? { min: 0, max: 0 };
            if (range.min > range.max) return null;
            const boundaries = new Set([range.min, range.max + 1, 0, 1]);
            let lookup = false;
            for (const rule of description.rules) {
                const condition = rule.conditions[index];
                if (!condition || !/^!?(?:#|-?\d+)(?:\|(?:#|-?\d+))?$/.test(condition)) return null;
                for (const value of condition.match(/-?\d+/g) ?? []) {
                    boundaries.add(Number(value));
                    boundaries.add(Number(value) + 1);
                }
                for (let h = 0; h < rule.handlers.length; h++) {
                    const name = rule.handlers[h]!;
                    if (name === "canonical_line") continue;
                    const argument = Number(rule.handlers[++h]) - 1;
                    if (["reminderstring", "canonical_stat"].includes(name)) continue;
                    if (argument === index && numericHandler(name, 0) === undefined) lookup = true;
                }
            }
            if (lookup) {
                if (range.max - range.min > 128) return null;
                for (let value = range.min; value <= range.max; value++) boundaries.add(value);
            }
            const ordered = [...boundaries]
                .filter((value) => value >= range.min && value <= range.max + 1)
                .sort((a, b) => a - b);
            partitions.push(
                ordered.slice(0, -1).map((min, i) => ({ min, max: ordered[i + 1]! - 1 })),
            );
        }
        const cells = product(partitions, 256);
        if (!cells) return null;
        const texts = new Set<string>();
        for (const cell of cells) {
            const corners = product(
                cell.map((range) =>
                    range.min === range.max ? [range.min] : [range.min, range.max],
                ),
                256,
            );
            if (!corners) return null;
            let shape: string | undefined;
            let template = "";
            const bounds: Range[] = [];
            for (const corner of corners) {
                const text = renderStatText(
                    data,
                    [reference],
                    new Map(description.ids.map((id, i) => [id, corner[i]!])),
                );
                if (text === null) return null;
                const key = text.replace(numbers, "#");
                if (shape !== undefined && shape !== key) return null;
                shape = key;
                template = text;
                [...text.matchAll(numbers)].forEach(([raw], i) => {
                    const value = Number(raw);
                    const previous = bounds[i] ?? { min: value, max: value };
                    bounds[i] = {
                        min: Math.min(previous.min, value),
                        max: Math.max(previous.max, value),
                    };
                });
            }
            let position = 0;
            texts.add(
                template.replace(numbers, () => {
                    const range = bounds[position++]!;
                    return range.min === range.max
                        ? String(range.min)
                        : `(${range.min}-${range.max})`;
                }),
            );
        }
        sections.push([...texts]);
    }
    const combinations = product(sections, 256);
    return combinations
        ? [...new Set(combinations.map((parts) => parts.filter(Boolean).join("\n")))]
        : null;
}
