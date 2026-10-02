import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { readJson, writeJson } from "../src/io.ts";
import { Metadata } from "../src/metadata.ts";
import { datasetSchema } from "../src/model.ts";
import { normalize } from "../src/normalize.ts";
import { Tables } from "../src/tables.ts";
import { Translations } from "../src/translations.ts";

const root = process.env.POE_REFERENCE_SNAPSHOT;
it.skipIf(!root)(
    "normalizes saved client records against the reference export",
    async () => {
        if (!root) return;
        const game = process.env.POE_REFERENCE_GAME === "poe2" ? "poe2" : "poe1";
        const source = { get: (name: string) => readFile(join(root, "raw", name)) };
        const tables = new Tables(game, source, await readJson(join(root, "schema.json")));
        const reference = datasetSchema.parse(
            Object.fromEntries(
                await Promise.all(
                    Object.keys(datasetSchema.shape).map(async (name) => [
                        name,
                        await readJson(join(root, "normalized", `${name}.json`)),
                    ]),
                ),
            ),
        );
        const translations = new Translations(source, tables);
        const result = await normalize(tables, new Metadata(source), async (domain, stats, id) => {
            // Compare the old export's six-stat text limit; production renders all eight.
            const text = await translations.translate(domain, stats.slice(0, 6), id);
            const prior = reference.mods[id]?.text;
            if (
                prior?.includes("[]") &&
                (id.startsWith("UltimatumWagerCurrency") ||
                    [
                        "PuzzlePieceCleansingFireUnique__1",
                        "PuzzlePieceGreatTangleUnique__1",
                    ].includes(id))
            ) {
                expect(text).toBeTruthy();
                expect(text).not.toContain("[]");
                expect(text).not.toContain("up to  to");
                reference.mods[id]!.text = text;
            }
            return text;
        });
        for (const [id, mod] of Object.entries(reference.mods)) {
            // The former Python join emitted null for every PoE 2 gold price.
            if (game === "poe2") mod.gold_value = result.data.mods[id]?.gold_value ?? null;
        }
        if (game === "poe2") expect(result.data.mods.Strength1?.gold_value).toBe(134);
        const failures: Record<string, unknown[]> = {};
        for (const table of ["mods", "stats", "base_items", "item_classes"] as const) {
            const expected = reference[table];
            const actual = result.data[table];
            const mismatches = Object.keys(expected).filter(
                (id) => JSON.stringify(expected[id]) !== JSON.stringify(actual[id]),
            );
            failures[table] = mismatches.map((id) => ({
                id,
                differences: Object.keys(expected[id] ?? {})
                    .filter(
                        (key) =>
                            JSON.stringify(Reflect.get(expected[id] ?? {}, key)) !==
                            JSON.stringify(Reflect.get(actual[id] ?? {}, key)),
                    )
                    .map((key) => ({
                        key,
                        expected: Reflect.get(expected[id] ?? {}, key),
                        actual: Reflect.get(actual[id] ?? {}, key),
                    })),
            }));
            expect(Object.keys(actual).length).toBe(Object.keys(expected).length);
        }
        await writeJson(`.cache/parity-${game}.json`, {
            failures,
            translationErrors: translations.errors,
        });
        expect(
            Object.fromEntries(
                Object.entries(failures).map(([name, failures]) => [name, failures.slice(0, 3)]),
            ),
        ).toEqual({ mods: [], stats: [], base_items: [], item_classes: [] });
        expect(result.data.tags).toEqual(reference.tags);
    },
    120_000,
);
