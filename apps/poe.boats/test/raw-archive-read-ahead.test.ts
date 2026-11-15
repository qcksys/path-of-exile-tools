// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
    appendRawPage,
    RawPageReader,
    sealRawHours,
} from "../../../packages/poe-stash-ingest/src/ps/raw-archive";

// Passes through to the real stream, so the test can see how far a file has been read.
vi.mock("node:fs", async (importOriginal) => {
    const fs = await importOriginal<typeof import("node:fs")>();
    return { ...fs, createReadStream: vi.fn(fs.createReadStream) };
});

type Page = Parameters<typeof appendRawPage>[1]["page"];
const hourStart = Date.UTC(2026, 9, 28, 10);

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "raw-read-ahead-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

it("reads a sealed hour only as far as the pages taken from it", async () => {
    // Random notes keep the sealed file about as large as its pages.
    for (let n = 0; n < 200; n++)
        await appendRawPage(dir, {
            capturedAt: hourStart + n * 1000,
            page: {
                next_change_id: `p${n}`,
                stashes: [
                    {
                        id: "stash",
                        public: true,
                        league: "Standard",
                        items: [{ id: `item${n}`, note: randomBytes(8192).toString("hex") }],
                    },
                ],
            } as unknown as Page,
        });
    await sealRawHours(dir, hourStart + 3_600_000);
    const sealed = (await stat(join(dir, "2026/10/28/10.ndjson.zst"))).size;

    const reader = new RawPageReader(dir, { hour: "2026-10-28T10", offset: 0, capturedAt: 0 });
    vi.mocked(createReadStream).mockClear();
    expect((await reader.peek())?.page.next_change_id).toBe("p0");
    // A reader that runs ahead does so while the worker processes the page it was given.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const pages = vi.mocked(createReadStream).mock.results.at(-1)!.value as ReadStream;
    const bytesRead = pages.bytesRead;
    // Windows cannot remove the directory while the file is open.
    if (!pages.closed) await once(pages.destroy(), "close");
    expect(bytesRead).toBeLessThan(sealed / 4);
}, 30_000);
