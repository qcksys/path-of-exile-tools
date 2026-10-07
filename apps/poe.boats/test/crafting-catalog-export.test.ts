import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { exportCraftingCatalog } from "../scripts/export-crafting-catalog";

it("leaves identical catalogs untouched and replaces changed output with validated data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crafting-catalog-export-"));
    try {
        const path = join(directory, "catalog.json");
        const source = resolve("../../packages/poe-1-data");
        await exportCraftingCatalog(source, path);
        const expected = await readFile(path, "utf8");
        const previous = new Date("2000-01-01T00:00:00.000Z");
        await utimes(path, previous, previous);
        await exportCraftingCatalog(source, path);
        expect((await stat(path)).mtimeMs).toBe(previous.getTime());
        expect(await readFile(path, "utf8")).toBe(expected);
        await writeFile(path, "{}");
        await exportCraftingCatalog(source, path);
        expect(await readFile(path, "utf8")).toBe(expected);
        await expect(exportCraftingCatalog(source, directory)).rejects.toThrow();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 15000);
