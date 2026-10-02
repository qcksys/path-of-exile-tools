import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { readDatFile } from "../src/dat-reader.ts";
import { Source } from "../src/source.ts";

it.skipIf(!process.env.POE_CDN_PATCH)(
    "extracts a real table from the pinned patch CDN",
    async () => {
        const patch = process.env.POE_CDN_PATCH;
        if (!patch) return;
        const game = patch.startsWith("4.") ? "poe2" : "poe1";
        const raw = await mkdtemp(join(tmpdir(), "poe-cdn-"));
        const source = await Source.open(game, { patch }, raw, ".cache/bundles");
        try {
            const path = `Data/${game === "poe2" ? "Balance/" : ""}BaseItemTypes.datc64`;
            const bytes = await source.get(path);
            expect(readDatFile(".datc64", bytes).rowCount).toBeGreaterThan(5000);
            expect(source.inputs[path]?.bytes).toBe(bytes.byteLength);
            expect(Object.keys(source.transports)).toContain("Bundles2/_.index.bin");
            expect(
                Object.keys(source.transports).some((name) => name.endsWith(".bundle.bin")),
            ).toBe(true);
        } finally {
            await source.close();
            await rm(raw, { recursive: true, force: true });
        }
    },
    180_000,
);
