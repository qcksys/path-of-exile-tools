import { randomUUID } from "node:crypto";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
    decompressedBundleSize,
    decompressSliceInBundle,
    getFileInfo,
    type IndexBundle,
    readIndexBundle,
} from "pathofexile-dat/bundles.js";
import { type Game, hosts, type SourceConfig } from "./config.ts";
import { Ggpk } from "./ggpk.ts";
import { assetPath, digest, missing, writeBytes } from "./io.ts";

export interface AssetSource {
    get(name: string): Promise<Uint8Array>;
}
export class AssetNotFound extends Error {}
export type Evidence = Record<string, { sha256: string; bytes: number }>;

export class Source implements AssetSource {
    inputs: Evidence = {};
    transports: Evidence = {};
    private index: IndexBundle | null = null;
    private archive: Ggpk | null = null;
    private bundle: { name: string; data: Uint8Array } | null = null;

    private constructor(
        private game: Game,
        private config: SourceConfig,
        private raw: string,
        private cache: string,
    ) {}

    static async open(
        game: Game,
        config: SourceConfig,
        raw: string,
        cache: string,
    ): Promise<Source> {
        const source = new Source(game, config, raw, cache);
        try {
            if (config.directory) {
                try {
                    source.archive = await Ggpk.open(join(config.directory, "Content.ggpk"));
                } catch (error) {
                    if (!missing(error)) throw error;
                }
            }
            const compressed = await source.transport("Bundles2/_.index.bin");
            if (compressed) {
                const size = decompressedBundleSize(compressed);
                if (size <= 0 || size > 1024 ** 3) throw new Error("Invalid bundle index size");
                const data = new Uint8Array(size);
                decompressSliceInBundle(compressed, 0, data);
                source.index = readIndexBundle(data);
            }
            return source;
        } catch (error) {
            await source.close();
            throw error;
        }
    }

    private async transport(name: string): Promise<Uint8Array | null> {
        let data: Uint8Array | null = null;
        if (this.config.directory) {
            try {
                data = await readFile(assetPath(this.config.directory, name));
            } catch (error) {
                if (!missing(error)) throw error;
            }
            data ??= (await this.archive?.get(name)) ?? null;
        } else {
            const path = assetPath(join(this.cache, this.game, this.config.patch), name);
            try {
                data = await readFile(path);
            } catch (error) {
                if (!missing(error)) throw error;
                const url = `https://${hosts[this.game]}/${this.config.patch}/${name.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}`;
                const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
                if (response.status === 404) return null;
                if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
                data = new Uint8Array(await response.arrayBuffer());
                const temporary = `${path}.${randomUUID()}`;
                await writeBytes(temporary, data);
                await rename(temporary, path);
            }
        }
        if (data) this.transports[name] = { sha256: digest(data), bytes: data.byteLength };
        return data;
    }

    async get(name: string): Promise<Uint8Array> {
        const path = assetPath(this.raw, name);
        if (this.inputs[name]) return readFile(path);
        const location =
            this.index &&
            getFileInfo(name.replaceAll("\\", "/"), this.index.bundlesInfo, this.index.filesInfo);
        let data: Uint8Array | null;
        if (location) {
            if (this.bundle?.name !== location.bundle) {
                const compressed = await this.transport(`Bundles2/${location.bundle}`);
                if (!compressed) throw new AssetNotFound(`Missing bundle: ${location.bundle}`);
                this.bundle = { name: location.bundle, data: compressed };
            }
            data = new Uint8Array(location.size);
            decompressSliceInBundle(this.bundle.data, location.offset, data);
        } else data = await this.transport(name);
        if (!data) throw new AssetNotFound(`Missing asset: ${name}`);
        await writeBytes(path, data);
        this.inputs[name] = { sha256: digest(data), bytes: data.byteLength };
        return data;
    }

    async close() {
        await this.archive?.close();
    }
}
