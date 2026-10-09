import { readFile } from "node:fs/promises";
import type { Item } from "@poe-tools/api-client";
import type { MarketCohortManifest } from "@poe-tools/market";
import { isUniqueItem } from "#src/shared/capture.ts";

interface CapturePolicy {
    equipmentBaseTypes: string[];
    jewelBaseTypes: string[];
    specialModifiers: Array<{ id: string; name: string; text: string | null }>;
    distinctiveModifierLines: string[];
}

const normalize = (text: string) =>
    text
        .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
        .replace(/\[([^\]]+)\]/g, "$1")
        .trim()
        .replace(/\s+/g, " ");
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function modifierLine(text: string) {
    const ranges: Array<[number, number]> = [];
    let pattern = "";
    let offset = 0;
    const source = normalize(text);
    for (const match of source.matchAll(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g)) {
        pattern += `${escapePattern(source.slice(offset, match.index))}(-?\\d+(?:\\.\\d+)?)`;
        ranges.push([Number(match[1]), Number(match[2])]);
        offset = match.index + match[0].length;
    }
    const expression = new RegExp(`^${pattern}${escapePattern(source.slice(offset))}$`);
    return (line: string) => {
        const values = expression.exec(line);
        return (
            !!values &&
            ranges.every(
                ([min, max], i) => Number(values[i + 1]) >= min && Number(values[i + 1]) <= max,
            )
        );
    };
}

export function compileCraftingCapture(manifest: MarketCohortManifest, policy: CapturePolicy) {
    const goodBases = new Set(
        manifest.cohorts
            .filter((cohort) => cohort.purpose === "base")
            .flatMap((cohort) =>
                cohort.query.groups.flatMap((group) =>
                    group.filters.flatMap((filter) =>
                        filter.kind === "base" && filter.field === "baseType" ? filter.values : [],
                    ),
                ),
            ),
    );
    const equipmentBases = new Set(policy.equipmentBaseTypes);
    for (const base of policy.jewelBaseTypes) goodBases.add(base);
    const distinctive = new Set(policy.distinctiveModifierLines);
    const patterns = [
        ...new Set(policy.specialModifiers.flatMap((mod) => (mod.text?.trim() ? [mod.text] : []))),
    ].map((text) => text.split("\n").map(modifierLine));
    return (item: Item): boolean => {
        if (
            isUniqueItem(item) ||
            item.frameType === 9 ||
            item.rarity === "Currency" ||
            item.frameType === 5 ||
            item.frameType === 6
        )
            return true;
        if (goodBases.has(item.baseType)) return true;
        if (!equipmentBases.has(item.baseType)) return false;
        if (
            item.fractured ||
            item.fracturedMods?.length ||
            item.synthesised ||
            item.delve ||
            item.memoryItem ||
            item.mutated ||
            Object.values(item.influences ?? {}).some(Boolean)
        )
            return true;
        const mods = item.explicitMods ?? [];
        if (
            mods.some(
                (mod) =>
                    typeof mod !== "string" &&
                    (mod.flags?.fractured ||
                        mod.flags?.mutated ||
                        mod.flags?.desecrated ||
                        mod.flags?.vestigial),
            )
        )
            return true;
        const lines = mods.flatMap((mod) =>
            (typeof mod === "string" ? mod : mod.description).split("\n").map(normalize),
        );
        if (!lines.length) return false;
        // This is a retention test, not proof of modifier identity or permission to price it.
        if (lines.some((line) => distinctive.has(line.replace(/[+-]?\d+(?:\.\d+)?/g, "#"))))
            return true;
        return patterns.some((group) => group.every((matches) => lines.some(matches)));
    };
}

let policy: Promise<CapturePolicy> | undefined;
const compiled = new WeakMap<MarketCohortManifest, ReturnType<typeof compileCraftingCapture>>();
export async function defaultCraftingCapture(manifest: MarketCohortManifest) {
    const existing = compiled.get(manifest);
    if (existing) return existing;
    policy ??= readFile(
        new URL(import.meta.resolve("@poe-tools/market/capture-poe1.json")),
        "utf8",
    ).then(JSON.parse);
    const accepts = compileCraftingCapture(manifest, await policy);
    compiled.set(manifest, accepts);
    return accepts;
}
