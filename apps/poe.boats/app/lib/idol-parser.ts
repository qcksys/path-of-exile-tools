import { nanoid } from "nanoid";
import { IDOL_BASES, type IdolBaseKey } from "~/data/idol-bases";
import { matchModifierToDefinition } from "~/lib/mod-matcher";
import type { IdolInstance, IdolModifier, Rarity } from "~/schemas/idol";

type ParseFormat = "simple" | "advanced";

interface ParsedModifier {
    type: "prefix" | "suffix";
    modName: string | null;
    tier: number | null;
    text: string;
    rolledValue: number;
    valueRange?: { min: number; max: number };
}

interface ParsedIdol {
    name: string;
    baseType: IdolBaseKey;
    itemLevel: number;
    rarity: Rarity;
    implicit: { text: string; value: number } | null;
    modifiers: ParsedModifier[];
}

export interface ParseResult {
    success: boolean;
    idol?: IdolInstance;
    error?: string;
}

function detectFormat(text: string): ParseFormat {
    return text.includes("{ Prefix Modifier") || text.includes("{ Suffix Modifier")
        ? "advanced"
        : "simple";
}

function detectBaseType(text: string): IdolBaseKey | null {
    const lowerText = text.toLowerCase();
    for (const key of Object.keys(IDOL_BASES) as IdolBaseKey[]) {
        const baseName = IDOL_BASES[key].name.toLowerCase();
        if (lowerText.includes(baseName)) {
            return key;
        }
    }
    return null;
}

function detectRarity(text: string): Rarity {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("unique")) return "unique";
    if (lowerText.includes("rare")) return "rare";
    if (lowerText.includes("magic")) return "magic";
    return "normal";
}

function extractItemLevel(text: string): number {
    const match = text.match(/Item Level:\s*(\d+)/i);
    return match ? Number.parseInt(match[1], 10) : 1;
}

function extractName(lines: string[]): string {
    for (const line of lines) {
        const trimmed = line.trim();
        if (
            trimmed &&
            !trimmed.startsWith("Rarity:") &&
            !trimmed.startsWith("--------") &&
            !trimmed.includes("{ ")
        ) {
            return trimmed;
        }
    }
    return "Unknown Idol";
}

function extractValue(text: string): number {
    const match = text.match(/[+-]?(\d+(?:\.\d+)?)/);
    return match ? Number.parseFloat(match[1]) : 0;
}

function parseSimpleFormat(text: string): ParsedIdol | null {
    const lines = text.split("\n").map((l) => l.trim());
    const baseType = detectBaseType(text);
    if (!baseType) return null;

    const rarity = detectRarity(text);
    const itemLevel = extractItemLevel(text);

    let foundItemLevel = false;
    let separatorCount = 0;
    const modLines: string[] = [];
    let implicitText: string | null = null;

    for (const line of lines) {
        if (line.includes("Item Level:")) {
            foundItemLevel = true;
            continue;
        }
        if (!foundItemLevel) continue;

        if (line.startsWith("--------")) {
            separatorCount++;
            continue;
        }

        if (!line) continue;

        if (line.includes("(implicit)")) {
            implicitText = line.replace("(implicit)", "").trim();
        } else if (separatorCount >= 1) {
            modLines.push(line);
        }
    }

    const modifiers: ParsedModifier[] = modLines
        .filter((line) => line && !line.startsWith("{"))
        .map((line) => ({
            type: "prefix" as const,
            modName: null,
            tier: null,
            text: line,
            rolledValue: extractValue(line),
        }));

    return {
        name: extractName(lines),
        baseType,
        itemLevel,
        rarity,
        implicit: implicitText ? { text: implicitText, value: extractValue(implicitText) } : null,
        modifiers,
    };
}

function parseAdvancedFormat(text: string): ParsedIdol | null {
    const lines = text.split("\n").map((l) => l.trim());
    const baseType = detectBaseType(text);
    if (!baseType) return null;

    const rarity = detectRarity(text);
    const itemLevel = extractItemLevel(text);

    const modifiers: ParsedModifier[] = [];
    let implicitText: string | null = null;

    const modBlockPattern =
        /\{\s*(Prefix|Suffix)\s+Modifier\s+"([^"]+)"\s*(?:\(Tier:\s*(\d+)\))?\s*\}/gi;

    let _currentIndex = 0;
    for (const match of text.matchAll(modBlockPattern)) {
        const [fullMatch, typeStr, modName, tierStr] = match;
        const type = typeStr.toLowerCase() as "prefix" | "suffix";
        const tier = tierStr ? Number.parseInt(tierStr, 10) : null;

        const blockEndIndex = (match.index ?? 0) + fullMatch.length;
        const nextBlockMatch = text.slice(blockEndIndex).match(/\{/);
        const nextBlockIndex = nextBlockMatch
            ? blockEndIndex + (nextBlockMatch.index ?? text.length)
            : text.length;

        const valueSection = text.slice(blockEndIndex, nextBlockIndex);
        const valueLines = valueSection.split("\n").filter((l) => l.trim());

        let modText = "";
        let rolledValue = 0;
        let valueRange: { min: number; max: number } | undefined;

        for (const line of valueLines) {
            if (line.startsWith("--------")) break;

            const rangeMatch = line.match(/(\d+)\s*\((\d+)-(\d+)\)/);
            if (rangeMatch) {
                rolledValue = Number.parseInt(rangeMatch[1], 10);
                valueRange = {
                    min: Number.parseInt(rangeMatch[2], 10),
                    max: Number.parseInt(rangeMatch[3], 10),
                };
                modText = line.replace(/\d+\s*\(\d+-\d+\)/, String(rolledValue));
            } else if (line.trim()) {
                modText = line.trim();
                rolledValue = extractValue(line);
            }
        }

        modifiers.push({
            type,
            modName,
            tier,
            text: modText || modName,
            rolledValue,
            valueRange,
        });

        _currentIndex = nextBlockIndex;
    }

    const implicitMatch = text.match(/([^\n]+)\s*\(implicit\)/i);
    if (implicitMatch) {
        implicitText = implicitMatch[1].trim();
    }

    return {
        name: extractName(lines),
        baseType,
        itemLevel,
        rarity,
        implicit: implicitText ? { text: implicitText, value: extractValue(implicitText) } : null,
        modifiers,
    };
}

function convertToIdolInstance(parsed: ParsedIdol): IdolInstance {
    const prefixes: IdolModifier[] = [];
    const suffixes: IdolModifier[] = [];

    for (const mod of parsed.modifiers) {
        const match = matchModifierToDefinition(
            mod.text,
            mod.rolledValue,
            mod.type === "prefix" || mod.type === "suffix" ? mod.type : undefined,
            parsed.baseType,
        );

        let idolMod: IdolModifier;

        if (match) {
            idolMod = {
                modId: match.modId,
                type: match.type,
                tier: match.tier,
                rolledValue: mod.rolledValue,
            };
        } else {
            idolMod = {
                modId: mod.modName || nanoid(),
                type: mod.type,
                tier: mod.tier,
                text: mod.text,
                rolledValue: mod.rolledValue,
            };
        }

        if (idolMod.type === "prefix") {
            prefixes.push(idolMod);
        } else {
            suffixes.push(idolMod);
        }
    }

    return {
        id: nanoid(),
        baseType: parsed.baseType,
        name: parsed.name,
        itemLevel: parsed.itemLevel,
        rarity: parsed.rarity,
        implicit: parsed.implicit
            ? {
                  text: parsed.implicit.text,
                  value: parsed.implicit.value,
              }
            : undefined,
        prefixes,
        suffixes,
    };
}

export function parseIdolText(text: string): ParseResult {
    if (!text || !text.trim()) {
        return { success: false, error: "No text provided" };
    }

    try {
        const format = detectFormat(text);
        const parsed = format === "advanced" ? parseAdvancedFormat(text) : parseSimpleFormat(text);

        if (!parsed) {
            return {
                success: false,
                error: "Could not parse idol data. Make sure you copied an idol from Path of Exile.",
            };
        }

        const idol = convertToIdolInstance(parsed);
        return { success: true, idol };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error during parsing",
        };
    }
}

export function parseMultipleIdols(text: string): ParseResult[] {
    const sections = text.split(/(?=Rarity:)/);
    return sections.filter((s) => s.trim()).map((section) => parseIdolText(section));
}
