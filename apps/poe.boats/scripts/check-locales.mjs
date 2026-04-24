import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(here, "../app/i18n/locales");
const referenceLocale = "en";

function collectPaths(obj, prefix = "") {
    const out = [];
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            out.push(...collectPaths(value, next));
        } else {
            out.push(next);
        }
    }
    return out;
}

function collectPlaceholders(obj, prefix = "") {
    const out = new Map();
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const [k, v] of collectPlaceholders(value, next)) out.set(k, v);
        } else if (typeof value === "string") {
            const names = new Set([...value.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g)].map((m) => m[1]));
            out.set(next, names);
        }
    }
    return out;
}

const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"));
const reference = JSON.parse(
    fs.readFileSync(path.join(localesDir, `${referenceLocale}.json`), "utf8"),
);
const refPaths = new Set(collectPaths(reference));
const refPlaceholders = collectPlaceholders(reference);

let failures = 0;
for (const file of files) {
    const locale = file.replace(/\.json$/, "");
    if (locale === referenceLocale) continue;
    const data = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
    const paths = new Set(collectPaths(data));
    const missing = [...refPaths].filter((p) => !paths.has(p));
    const extra = [...paths].filter((p) => !refPaths.has(p));
    const placeholders = collectPlaceholders(data);
    const placeholderMismatches = [];
    for (const [key, refNames] of refPlaceholders) {
        const names = placeholders.get(key);
        if (!names) continue;
        const refList = [...refNames].sort();
        const list = [...names].sort();
        if (refList.length !== list.length || refList.some((n, i) => n !== list[i])) {
            placeholderMismatches.push(`${key}: en=${JSON.stringify(refList)} ${locale}=${JSON.stringify(list)}`);
        }
    }
    if (missing.length || extra.length || placeholderMismatches.length) {
        failures++;
        console.error(`[${locale}] drift vs ${referenceLocale}:`);
        for (const p of missing) console.error(`  missing: ${p}`);
        for (const p of extra) console.error(`  extra:   ${p}`);
        for (const m of placeholderMismatches) console.error(`  placeholder: ${m}`);
    } else {
        console.log(`[${locale}] ok`);
    }
}

if (failures > 0) {
    console.error(`\n${failures} locale(s) drifted from ${referenceLocale}.`);
    process.exit(1);
}
