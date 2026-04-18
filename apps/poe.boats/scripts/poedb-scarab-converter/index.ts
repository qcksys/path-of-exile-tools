import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { clearCache, downloadImage, fetchScarabPage, listCachedFiles } from "./fetcher.ts";
import { parseScarabPage } from "./parser.ts";
import {
    type ConvertedScarabData,
    LOCALES,
    type Locale,
    type RawScarab,
    type ScarabData,
} from "./types.ts";

const OUTPUT_DIR = path.join(import.meta.dirname, "../../app/data");

const { values: args } = parseArgs({
    allowPositionals: true,
    options: {
        cached: { type: "boolean", default: false },
        "clear-cache": { type: "boolean", default: false },
        "skip-images": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
    },
});

function printHelp(): void {
    console.log(`
scarab-converter - Fetch and convert POE scarab data from poedb.tw

Usage: pnpm run data:scarabs [options]

Options:
  --cached           Use cached HTML files if available
  --clear-cache      Clear the cache before fetching
  --skip-images      Skip downloading images (use existing local images only)
  -h, --help         Show this help message

Examples:
  pnpm run data:scarabs
  pnpm run data:scarabs --cached
  pnpm run data:scarabs --cached --skip-images
`);
}

function getImageFilename(imageUrl: string, scarabId: string): string {
    // Extract extension from URL
    const ext = imageUrl.split(".").pop()?.split("?")[0] || "webp";
    return `${scarabId}.${ext}`;
}

function getLocalImagePath(scarabId: string): string {
    return `/images/scarabs/${scarabId}.webp`;
}

function localImageExists(scarabId: string): boolean {
    const imagePath = path.join(
        import.meta.dirname,
        "../../public/images/scarabs",
        `${scarabId}.webp`,
    );
    return fs.existsSync(imagePath);
}

async function downloadScarabImages(scarabs: RawScarab[]): Promise<Map<string, string | null>> {
    const imageMap = new Map<string, string | null>();
    console.log(`\nDownloading ${scarabs.length} scarab images...`);

    for (const scarab of scarabs) {
        try {
            const filename = getImageFilename(scarab.imageUrl, scarab.id);
            const localPath = await downloadImage(scarab.imageUrl, filename);
            imageMap.set(scarab.id, localPath);
        } catch (error) {
            console.warn(
                `  [warning] Failed to download image for ${scarab.name}:`,
                error instanceof Error ? error.message : error,
            );
            imageMap.set(scarab.id, null);
        }
    }

    return imageMap;
}

function mergeScarabTranslations(
    scarabsByLocale: Map<Locale, RawScarab[]>,
    imageMap: Map<string, string | null>,
): ScarabData[] {
    // Use English as the base
    const enScarabs = scarabsByLocale.get("en");
    if (!enScarabs) {
        throw new Error("English scarab data is required");
    }

    return enScarabs.map((enScarab) => {
        const names: Record<Locale, string> = {} as Record<Locale, string>;
        const effects: Record<Locale, string> = {} as Record<Locale, string>;

        for (const locale of LOCALES) {
            const localeScarabs = scarabsByLocale.get(locale);
            if (localeScarabs) {
                // Find matching scarab by ID
                const localeScarab = localeScarabs.find((s) => s.id === enScarab.id);
                if (localeScarab) {
                    names[locale] = localeScarab.name;
                    effects[locale] = localeScarab.effect;
                } else {
                    // Fallback to English if not found
                    names[locale] = enScarab.name;
                    effects[locale] = enScarab.effect;
                }
            } else {
                // Fallback to English
                names[locale] = enScarab.name;
                effects[locale] = enScarab.effect;
            }
        }

        const image = imageMap.get(enScarab.id) ?? null;

        return {
            id: enScarab.id,
            name: names,
            effect: effects,
            category: enScarab.category,
            image,
            limit: enScarab.limit ?? 5,
        };
    });
}

function getCategories(scarabs: ScarabData[]): string[] {
    const categories = new Set<string>();
    for (const scarab of scarabs) {
        categories.add(scarab.category);
    }
    return Array.from(categories).sort();
}

function writeOutput(data: ConvertedScarabData): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const outputPath = path.join(OUTPUT_DIR, "scarabs.json");
    fs.writeFileSync(outputPath, JSON.stringify(data, null, "\t"), "utf-8");
    console.log(`  Written to ${outputPath}`);
}

async function main(): Promise<void> {
    if (args.help || process.argv.includes("--help") || process.argv.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    console.log("=== POE Scarab Data Converter ===\n");

    if (args["clear-cache"]) {
        console.log("Clearing cache...");
        clearCache();
    }

    console.log(`Use cache: ${args.cached}`);
    console.log(`Skip images: ${args["skip-images"]}`);
    console.log("");

    // Fetch and parse HTML for all locales
    const scarabsByLocale = new Map<Locale, RawScarab[]>();

    for (const locale of LOCALES) {
        console.log(`\nFetching scarab page for ${locale}...`);
        try {
            const html = await fetchScarabPage(locale, args.cached ?? false);
            const rawScarabs = parseScarabPage(html);
            console.log(`  Found ${rawScarabs.length} scarabs`);
            scarabsByLocale.set(locale, rawScarabs);
        } catch (error) {
            console.error(
                `  [error] Failed to fetch/parse ${locale}:`,
                error instanceof Error ? error.message : error,
            );
            // Continue with other locales
        }
    }

    const enScarabs = scarabsByLocale.get("en");
    if (!enScarabs || enScarabs.length === 0) {
        console.error("No English scarabs found. Exiting.");
        process.exit(1);
    }

    // Download images (unless skipped) - use English scarabs for images
    let imageMap: Map<string, string | null>;
    if (args["skip-images"]) {
        console.log("\nSkipping image downloads, using local paths if available...");
        imageMap = new Map(
            enScarabs.map((s) => {
                if (localImageExists(s.id)) {
                    return [s.id, getLocalImagePath(s.id)];
                }
                console.warn(`  [warning] Local image not found for ${s.id}, image will be null`);
                return [s.id, null];
            }),
        );
    } else {
        imageMap = await downloadScarabImages(enScarabs);
    }

    // Merge translations from all locales
    console.log("\nMerging translations...");
    const scarabs = mergeScarabTranslations(scarabsByLocale, imageMap);
    const categories = getCategories(scarabs);

    console.log(`  Total scarabs: ${scarabs.length}`);
    console.log(`  Categories: ${categories.join(", ")}`);

    // Create output
    const convertedData: ConvertedScarabData = {
        scarabs,
        categories,
        generatedAt: new Date().toISOString(),
        version: 2,
    };

    // Write output
    console.log("\nWriting output files...");
    writeOutput(convertedData);

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
