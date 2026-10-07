import type { CraftingData } from "./crafting-data-model.ts";
import {
    formatStatNumber,
    matchesCondition,
    numericHandler,
    specificity,
} from "./translation-formats.ts";

export type StatTextData = Pick<CraftingData, "statDescriptions" | "statLookups">;

export function renderStatText(
    data: StatTextData,
    references: number[],
    stats: Map<string, number>,
): string | null {
    const lines: string[] = [];
    for (const index of references) {
        const description = data.statDescriptions[index];
        if (!description) return null;
        const input = description.ids.map((id) => stats.get(id) ?? 0);
        if (input.every((value) => value === 0)) continue;
        const rule = description.rules
            .filter((rule) =>
                rule.conditions.every((condition, index) =>
                    matchesCondition(condition, input[index] ?? 0),
                ),
            )
            .sort((a, b) => specificity(b) - specificity(a))[0];
        if (!rule) continue;
        const values: (string | number)[] = [...input];
        const formats = new Map<number, string>();
        for (let handler = 0; handler < rule.handlers.length; handler++) {
            const name = rule.handlers[handler]!;
            if (name === "canonical_line") continue;
            const argument = rule.handlers[++handler];
            if (["reminderstring", "canonical_stat"].includes(name)) continue;
            const index = Number(argument) - 1;
            const value = values[index];
            if (typeof value !== "number") return null;
            const numeric = numericHandler(name, value);
            if (numeric !== undefined) {
                values[index] = numeric;
                formats.set(index, name);
            } else {
                const text = data.statLookups[name]?.[String(value)];
                if (text === undefined) return null;
                values[index] = text;
            }
        }
        let sequential = 0;
        let missing = false;
        const text = rule.text.replace(
            /\{(\d*)(?::([^}]*))?\}/g,
            (_match, rawIndex: string, format: string | undefined) => {
                const index = rawIndex ? Number(rawIndex) : sequential++;
                const value = values[index];
                if (value === undefined) {
                    missing = true;
                    return "";
                }
                if (typeof value === "string") return value;
                const sign = value < 0 ? "-" : format?.includes("+") ? "+" : "";
                return sign + formatStatNumber(Math.abs(value), formats.get(index) ?? "");
            },
        );
        if (missing) return null;
        lines.push(text);
    }
    return lines.join("\n");
}
