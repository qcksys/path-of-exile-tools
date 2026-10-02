import { type FileHandle, open } from "node:fs/promises";

type Entry = { offset: number; size: number };

export class Ggpk {
    private constructor(
        private file: FileHandle,
        private size: number,
        private version: number,
        private root: number,
    ) {}
    private entries = new Map<string, Entry>();
    private indexed = false;

    static async open(path: string): Promise<Ggpk> {
        const file = await open(path, "r");
        try {
            const size = (await file.stat()).size;
            const header = Buffer.alloc(28);
            if (
                (await file.read(header, 0, 28, 0)).bytesRead !== 28 ||
                header.toString("ascii", 4, 8) !== "GGPK"
            )
                throw new Error("Invalid GGPK header");
            const version = header.readUInt32LE(8);
            if (![2, 3, 4].includes(version))
                throw new Error(`Unsupported GGPK version: ${version}`);
            return new Ggpk(file, size, version, Number(header.readBigUInt64LE(12)));
        } catch (error) {
            await file.close();
            throw error;
        }
    }

    private async read(offset: number, size: number): Promise<Buffer> {
        if (
            !Number.isSafeInteger(offset) ||
            !Number.isSafeInteger(size) ||
            offset < 0 ||
            size < 0 ||
            offset + size > this.size
        )
            throw new Error("GGPK record outside archive");
        const data = Buffer.alloc(size);
        let read = 0;
        while (read < size) {
            const result = await this.file.read(data, read, size - read, offset + read);
            if (!result.bytesRead) throw new Error("Truncated GGPK record");
            read += result.bytesRead;
        }
        return data;
    }

    private async index(): Promise<void> {
        const pending = [{ offset: this.root, parent: "" }];
        const seen = new Set<number>();
        const wchar = this.version === 4 ? 4 : 2;
        while (pending.length) {
            const current = pending.pop();
            if (!current) break;
            if (seen.has(current.offset)) throw new Error("Cyclic GGPK directory");
            seen.add(current.offset);
            const header = await this.read(current.offset, 12);
            const length = header.readUInt32LE(0);
            const tag = header.toString("ascii", 4, 8);
            const chars = header.readUInt32LE(8);
            if (!chars || !["FILE", "PDIR"].includes(tag))
                throw new Error(`Invalid GGPK tree record: ${tag}`);
            const nameOffset = tag === "FILE" ? 44 : 48;
            const metadataSize = nameOffset + chars * wchar;
            if (metadataSize > length || current.offset + length > this.size)
                throw new Error("Invalid GGPK record length");
            const data = await this.read(current.offset, metadataSize);
            const nameBytes = data.subarray(nameOffset, metadataSize - wchar);
            let name = "";
            if (wchar === 2) name = nameBytes.toString("utf16le");
            else
                for (let i = 0; i < nameBytes.length; i += 4)
                    name += String.fromCodePoint(nameBytes.readUInt32LE(i));
            if (/[\\/:]/.test(name) || name === "..") throw new Error("Invalid GGPK entry name");
            const path = current.parent ? `${current.parent}/${name}` : name;
            if (tag === "FILE")
                this.entries.set(path.toLowerCase(), {
                    offset: current.offset + metadataSize,
                    size: length - metadataSize,
                });
            else {
                const count = data.readUInt32LE(12);
                if (metadataSize + count * 12 !== length)
                    throw new Error("Invalid GGPK directory length");
                const entries = await this.read(current.offset + metadataSize, count * 12);
                for (let i = 0; i < count; i++)
                    pending.push({
                        offset: Number(entries.readBigUInt64LE(i * 12 + 4)),
                        parent: path,
                    });
            }
        }
        this.indexed = true;
    }

    async get(name: string): Promise<Buffer | null> {
        if (!this.indexed) await this.index();
        const entry = this.entries.get(name.replaceAll("\\", "/").toLowerCase());
        return entry ? this.read(entry.offset, entry.size) : null;
    }

    close() {
        return this.file.close();
    }
}
