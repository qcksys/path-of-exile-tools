import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { ConvertedData, ModifierData, UniqueIdol } from "./types.ts";
import { IDOL_BASE_TYPES, LOCALES } from "./types.ts";

const OUTPUT_DIR = path.resolve(import.meta.dirname, "../../app/data");
const SCHEMA_DIR = path.resolve(OUTPUT_DIR, "schemas");

const LOCALE_RECORD = z.record(z.enum(LOCALES), z.string());

const VALUE_RANGE_SCHEMA = z.object({
    min: z.number(),
    max: z.number(),
});

const MODIFIER_TIER_SCHEMA = z.object({
    tier: z.number().int().min(1).max(10),
    levelReq: z.number().int().min(0),
    text: LOCALE_RECORD,
    values: z.array(VALUE_RANGE_SCHEMA),
    weight: z.number().int().min(0),
    tradeStatId: z.string().optional(),
});

const ModifierDataSchema = z.object({
    id: z.string(),
    type: z.enum(["prefix", "suffix"]),
    name: LOCALE_RECORD,
    tiers: z.array(MODIFIER_TIER_SCHEMA),
    mechanic: z.string(),
    applicableIdols: z.array(z.enum(IDOL_BASE_TYPES)),
});

const UniqueIdolSchema = z.object({
    id: z.string(),
    name: LOCALE_RECORD,
    baseType: z.enum(IDOL_BASE_TYPES),
    modifiers: z.array(
        z.object({
            text: LOCALE_RECORD,
            values: z.array(VALUE_RANGE_SCHEMA),
        }),
    ),
    flavourText: LOCALE_RECORD.optional(),
});

const ConvertedDataSchema = z.object({
    modifiers: z.array(ModifierDataSchema),
    uniqueIdols: z.array(UniqueIdolSchema),
    generatedAt: z.string().datetime(),
    version: z.number().int(),
});

function ensureDirectories(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCHEMA_DIR)) {
        fs.mkdirSync(SCHEMA_DIR, { recursive: true });
    }
}

export function writeModifiersJson(modifiers: ModifierData[]): void {
    ensureDirectories();
    const outputPath = path.join(OUTPUT_DIR, "idol-modifiers.json");
    fs.writeFileSync(outputPath, JSON.stringify(modifiers, null, "\t"), "utf-8");
    console.log(`  Written: ${outputPath} (${modifiers.length} modifiers)`);
}

export function writeUniquesJson(uniques: UniqueIdol[]): void {
    ensureDirectories();
    const outputPath = path.join(OUTPUT_DIR, "unique-idols.json");
    fs.writeFileSync(outputPath, JSON.stringify(uniques, null, "\t"), "utf-8");
    console.log(`  Written: ${outputPath} (${uniques.length} unique idols)`);
}

export function writeConvertedData(data: ConvertedData): void {
    writeModifiersJson(data.modifiers);
    writeUniquesJson(data.uniqueIdols);
}

export function generateJsonSchemas(): void {
    ensureDirectories();

    const modifierSchema = z.toJSONSchema(ModifierDataSchema, {
        target: "draft-2020-12",
    });
    const modifierSchemaPath = path.join(SCHEMA_DIR, "idol-modifier.schema.json");
    fs.writeFileSync(modifierSchemaPath, JSON.stringify(modifierSchema, null, "\t"), "utf-8");
    console.log(`  Written: ${modifierSchemaPath}`);

    const uniqueSchema = z.toJSONSchema(UniqueIdolSchema, {
        target: "draft-2020-12",
    });
    const uniqueSchemaPath = path.join(SCHEMA_DIR, "unique-idol.schema.json");
    fs.writeFileSync(uniqueSchemaPath, JSON.stringify(uniqueSchema, null, "\t"), "utf-8");
    console.log(`  Written: ${uniqueSchemaPath}`);

    const fullSchema = z.toJSONSchema(ConvertedDataSchema, {
        target: "draft-2020-12",
    });
    const fullSchemaPath = path.join(SCHEMA_DIR, "idol-data.schema.json");
    fs.writeFileSync(fullSchemaPath, JSON.stringify(fullSchema, null, "\t"), "utf-8");
    console.log(`  Written: ${fullSchemaPath}`);
}

export function validateConvertedData(data: ConvertedData): boolean {
    const result = ConvertedDataSchema.safeParse(data);
    if (!result.success) {
        console.error("Validation failed:", result.error.format());
        return false;
    }
    return true;
}

export { ConvertedDataSchema, ModifierDataSchema, UniqueIdolSchema };
