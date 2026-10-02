import { decodeText } from "./io.ts";
import type { AssetSource } from "./source.ts";

type Section = Record<string, string | number | boolean | string[]>;
export type ItemMetadata = {
    extends: string | null;
    version: number;
    abstract: boolean;
    sections: Record<string, Section>;
};

export class Metadata {
    readonly files = new Map<string, ItemMetadata>();
    private loading = new Set<string>();
    constructor(private source: AssetSource) {}

    async get(path: string): Promise<ItemMetadata> {
        const cached = this.files.get(path);
        if (cached) return cached;
        if (this.loading.has(path)) throw new Error(`Cyclic item inheritance: ${path}`);
        this.loading.add(path);
        try {
            const text = decodeText(await this.source.get(`${path}.it`));
            const parent = /^extends\s+"([^"]+)"/m.exec(text)?.[1];
            if (!parent) throw new Error(`Missing item inheritance declaration: ${path}`);
            const inherited = parent === "nothing" ? null : await this.get(parent);
            const sections: Record<string, Section> = structuredClone(inherited?.sections ?? {});
            const ownLists = new Map<string, string[]>();
            const stack: string[] = [];
            let pending = "";
            for (const rawLine of text.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (
                    !line ||
                    line.startsWith("//") ||
                    line.startsWith("version ") ||
                    line.startsWith("extends ") ||
                    line === "abstract"
                )
                    continue;
                if (line === "{") {
                    stack.push(pending);
                    pending = "";
                    continue;
                }
                if (line === "}") {
                    stack.pop();
                    continue;
                }
                const match = /^(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s]+)\s*(?:\/\/.*)?$/.exec(line);
                if (!match) {
                    pending = line;
                    continue;
                }
                if (stack.length !== 1) continue;
                const sectionName = stack[0];
                const key = match[1];
                const literal = match[2];
                if (!sectionName || !key || literal === undefined)
                    throw new Error(`Invalid item metadata: ${path}`);
                sections[sectionName] ??= {};
                const section = sections[sectionName];
                const value = literal.startsWith('"')
                    ? literal.slice(1, -1)
                    : /^-?\d+$/.test(literal)
                      ? Number(literal)
                      : literal;
                if (key === "tag" || key === "enable_rarity") {
                    const listKey = `${sectionName}.${key}`;
                    const values = ownLists.get(listKey) ?? [];
                    if (!values.includes(String(value))) values.push(String(value));
                    ownLists.set(listKey, values);
                    const parentValues = inherited?.sections[sectionName]?.[key];
                    section[key] = [
                        ...new Set([
                            ...values,
                            ...(Array.isArray(parentValues) ? parentValues : []),
                        ]),
                    ];
                } else section[key] = value;
            }
            const result = {
                extends: parent === "nothing" ? null : parent,
                version: Number(/^version (\d+)/m.exec(text)?.[1] ?? 0),
                abstract: /^abstract\s*$/m.test(text),
                sections,
            };
            this.files.set(path, result);
            return result;
        } finally {
            this.loading.delete(path);
        }
    }

    async tags(path: string): Promise<string[]> {
        const tags = (await this.get(path)).sections.Base?.tag;
        return Array.isArray(tags) ? tags : [];
    }
}
