import { parseArgs } from "node:util";
import { clearCache, fetchPoedbPage, listCachedFiles } from "./fetcher.ts";
import { generateJsonSchemas, validateConvertedData, writeConvertedData } from "./output.ts";
import { parseIdolPage } from "./parser.ts";
import { applyTradeStatMappings } from "./trade-stats.ts";
import { transform } from "./transformer.ts";
import type { Locale, ParsedPage } from "./types.ts";
import { LOCALES } from "./types.ts";
import { applyValueOverrides } from "./value-overrides.ts";

const IDOL_PAGES = [
    "Minor_Idol",
    "Noble_Idol",
    "Kamasan_Idol",
    "Burial_Idol",
    "Totemic_Idol",
    "Conqueror_Idol",
] as const;

const { values: args } = parseArgs({
    allowPositionals: true,
    options: {
        cached: { type: "boolean", default: false },
        "clear-cache": { type: "boolean", default: false },
        "generate-schemas": { type: "boolean", default: true },
        help: { type: "boolean", short: "h", default: false },
    },
});

function printHelp(): void {
    console.log(`
poedb-converter - Fetch and convert POE idol data from poedb.tw

Usage: pnpm run data:idols [options]

Options:
  --cached           Use cached HTML files if available
  --clear-cache      Clear the cache before fetching
  --generate-schemas Generate JSON Schema files (default: true)
  -h, --help         Show this help message

Locales processed: ${LOCALES.join(", ")}

Examples:
  pnpm run data:idols
  pnpm run data:idols --cached
  pnpm run data:idols --clear-cache
`);
}

async function main(): Promise<void> {
    if (args.help || process.argv.includes("--help") || process.argv.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    console.log("=== POE Idol Data Converter ===\n");

    if (args["clear-cache"]) {
        console.log("Clearing cache...");
        clearCache();
    }

    console.log(`Use cache: ${args.cached}`);
    console.log("");

    const dataByLocale = new Map<Locale, ParsedPage>();

    for (const locale of LOCALES) {
        console.log(`Processing locale: ${locale}`);

        for (const idolPage of IDOL_PAGES) {
            try {
                const html = await fetchPoedbPage(locale, idolPage, args.cached ?? false);
                const parsed = parseIdolPage(html, locale, idolPage);

                const existingData = dataByLocale.get(locale) || {
                    modifiers: [],
                    uniqueIdols: [],
                };
                existingData.modifiers.push(...parsed.modifiers);
                existingData.uniqueIdols.push(...parsed.uniqueIdols);
                dataByLocale.set(locale, existingData);

                const uniqueCount =
                    parsed.uniqueIdols.length > 0 ? `, ${parsed.uniqueIdols.length} uniques` : "";
                console.log(`  ${idolPage}: ${parsed.modifiers.length} modifiers${uniqueCount}`);
            } catch (error) {
                console.error(
                    `  Error fetching ${idolPage}:`,
                    error instanceof Error ? error.message : error,
                );
            }
        }
    }

    const enData = dataByLocale.get("en");
    if (!enData || enData.modifiers.length === 0) {
        console.error("No English idol data found. Exiting.");
        process.exit(1);
    }

    console.log("\nTransforming data...");
    const convertedData = transform(dataByLocale);

    console.log(`  Total modifiers: ${convertedData.modifiers.length}`);
    console.log(`  Total uniques: ${convertedData.uniqueIdols.length}`);

    console.log("\nApplying value overrides...");
    const overrideResult = applyValueOverrides(convertedData.modifiers);
    if (overrideResult.modifiedCount > 0) {
        console.log(`  Modified ${overrideResult.modifiedCount} modifier(s):`);
        for (const mod of overrideResult.modifications) {
            console.log(`    - ${mod}`);
        }
    } else {
        console.log("  No overrides applied");
    }

    console.log("\nApplying trade stat mappings...");
    const tradeStatResult = await applyTradeStatMappings(
        convertedData.modifiers,
        convertedData.uniqueIdols,
    );
    if (tradeStatResult.regular.unmatchedModifiers.length > 0) {
        console.log("  Unmatched modifiers:", tradeStatResult.regular.unmatchedModifiers);
    }
    if (tradeStatResult.unique.unmatchedMods.length > 0) {
        console.log("  Unmatched unique mods:", tradeStatResult.unique.unmatchedMods);
    }

    console.log("\nValidating data...");
    if (!validateConvertedData(convertedData)) {
        console.error("Validation failed. Data not written.");
        process.exit(1);
    }
    console.log("  Validation passed!");

    console.log("\nWriting output files...");
    writeConvertedData(convertedData);

    if (args["generate-schemas"]) {
        console.log("\nGenerating JSON schemas...");
        generateJsonSchemas();
    }

    console.log("\nDone!");
    const cachedFiles = listCachedFiles();
    if (cachedFiles.length > 0) {
        console.log(`\nCached files available: ${cachedFiles.length}`);
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
