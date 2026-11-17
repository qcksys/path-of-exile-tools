import { readFile } from "node:fs/promises";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";

export type EquipmentClassifier = ReturnType<typeof compileMarketCohorts>;
export type Classification = ReturnType<EquipmentClassifier["classify"]>;

let defaults: Promise<EquipmentClassifier> | undefined;

/** The bundled PoE 1 cohort catalog, compiled once per thread. */
export function defaultEquipmentClassifier() {
    defaults ??= readFile(
        new URL(import.meta.resolve("@poe-tools/market/cohorts-poe1.json")),
        "utf8",
    ).then((text) => compileMarketCohorts(marketCohortManifestSchema.parse(JSON.parse(text))));
    return defaults;
}
