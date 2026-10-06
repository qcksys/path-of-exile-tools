import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { dataPackages } from "../src/distribute.ts";
import { readJson } from "../src/io.ts";
import { generateJsonSchemas, jsonSchemaPath } from "../src/json-schema.ts";
import { dataPackageManifestSchema, rangeSchema } from "../src/model.ts";
import { packageDirectory } from "../src/pipeline.ts";

it.each([
    "poe1",
    "poe2",
] as const)("validates every packaged %s JSON using Draft 2020-12", async (game) => {
    const directory = join(packageDirectory, "..", dataPackages[game]);
    const manifest = dataPackageManifestSchema.parse(
        await readJson(join(directory, "manifest.json")),
    );
    const ajv = new Ajv2020({ strict: true });
    const validators = new Map<string, ReturnType<typeof ajv.compile>>();
    for (const [path, expected] of Object.entries(generateJsonSchemas(manifest))) {
        const schema = await readJson(join(directory, path));
        expect(schema).toEqual(expected);
        validators.set(path, ajv.compile(schema as typeof expected));
    }
    expect(validators.size).toBe(8);
    const validateManifest = validators.get("json-schema/manifest.schema.json")!;
    expect(validateManifest(manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    for (const [path, metadata] of Object.entries(manifest.files)) {
        expect(metadata.schema).toBe(jsonSchemaPath(path));
        const validate = validators.get(metadata.schema)!;
        expect(
            validate(await readJson(join(directory, "data", path))),
            `${path}: ${JSON.stringify(validate.errors)}`,
        ).toBe(true);
    }
    for (const invalid of [
        { game: game === "poe1" ? "poe2" : "poe1" },
        { client_build: "3.0.0" },
        { version: "1.0.0" },
        { files: {} },
    ]) {
        expect(validateManifest({ ...manifest, ...invalid })).toBe(false);
    }
    const validateBases = validators.get("json-schema/base_items.schema.json")!;
    const bases = (await readJson(join(directory, "data/base_items.json"))) as Record<
        string,
        Record<string, unknown>
    >;
    const base = Object.values(bases)[0]!;
    expect(validateBases({})).toBe(false);
    expect(validateBases({ test: { ...base, drop_level: "1" } })).toBe(false);
    expect(validateBases({ test: { ...base, extra: true } })).toBe(false);
    for (const reload of [-1, 1.5, "800"])
        expect(
            validateBases({
                test: {
                    ...base,
                    properties: { ...(base.properties as object), reload_time: reload },
                },
            }),
        ).toBe(false);
    const { requirements: _requirements, ...missingOutputField } = base;
    expect(validateBases({ test: missingOutputField })).toBe(false);
}, 30_000);

it("retains cross-field refinements in Zod when standard JSON Schema cannot express them", () => {
    const validate = new Ajv2020().compile(z.toJSONSchema(rangeSchema));
    expect(validate({ min: 2, max: 1 })).toBe(true);
    expect(rangeSchema.safeParse({ min: 2, max: 1 }).success).toBe(false);
});
