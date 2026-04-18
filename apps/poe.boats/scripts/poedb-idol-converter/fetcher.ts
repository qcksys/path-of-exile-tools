import * as fs from "node:fs";
import * as path from "node:path";
import ky from "ky";
import type { Locale } from "./types.ts";
import { POEDB_LOCALE_MAP } from "./types.ts";

const CACHE_DIR = path.join(import.meta.dirname, ".cache");
const RATE_LIMIT_MS = 1000;

let lastFetchTime = 0;

async function rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastFetchTime;
    if (elapsed < RATE_LIMIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
    }
    lastFetchTime = Date.now();
}

function getCachePath(locale: Locale, page: string): string {
    return path.join(CACHE_DIR, `${locale}-${page}.html`);
}

function readCache(locale: Locale, page: string): string | null {
    const cachePath = getCachePath(locale, page);
    if (fs.existsSync(cachePath)) {
        return fs.readFileSync(cachePath, "utf-8");
    }
    return null;
}

function writeCache(locale: Locale, page: string, content: string): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const cachePath = getCachePath(locale, page);
    fs.writeFileSync(cachePath, content, "utf-8");
}

const client = ky.create({
    headers: {
        "User-Agent": "Mozilla/5.0 (compatible; poe-idol-planner/1.0)",
        Accept: "text/html",
    },
    retry: {
        limit: 3,
        methods: ["get"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
    },
    timeout: 30000,
});

export async function fetchPoedbPage(
    locale: Locale,
    page: string,
    useCache: boolean,
): Promise<string> {
    if (useCache) {
        const cached = readCache(locale, page);
        if (cached) {
            console.log(`  [cache hit] ${locale}/${page}`);
            return cached;
        }
    }

    const poedbLocale = POEDB_LOCALE_MAP[locale];
    const url = `https://poedb.tw/${poedbLocale}/${page}`;

    await rateLimit();
    console.log(`  [fetching] ${url}`);

    const html = await client.get(url).text();
    writeCache(locale, page, html);

    return html;
}

export function clearCache(): void {
    if (fs.existsSync(CACHE_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true });
    }
}

export function listCachedFiles(): string[] {
    if (!fs.existsSync(CACHE_DIR)) {
        return [];
    }
    return fs.readdirSync(CACHE_DIR);
}
