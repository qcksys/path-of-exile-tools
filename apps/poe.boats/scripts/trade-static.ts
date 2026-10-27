import { z } from "zod";

const staticSchema = z.object({
    result: z.array(
        z.object({
            id: z.string(),
            entries: z.array(
                z.object({ id: z.string(), text: z.string(), image: z.string().optional() }),
            ),
        }),
    ),
});
type TradeStaticEntry = z.infer<typeof staticSchema>["result"][number]["entries"][number];

export const basesSchema = z.record(
    z.string(),
    z.object({
        name: z.string(),
        visual_identity: z.object({ dds_file: z.string() }).optional(),
    }),
);
type Bases = [string, z.infer<typeof basesSchema>[string]][];

export function tradeStaticUrl(game: "poe1" | "poe2") {
    return `https://www.pathofexile.com/api/${game === "poe1" ? "trade" : "trade2"}/data/static`;
}

/** The trade site's static item groups, e.g. `Currency`, `Runes`. */
export async function readTradeStatic(url: string, userAgent: string) {
    const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return staticSchema.parse(await response.json()).result;
}

// Trade images encode the item art path, which separates base items that share a name.
function imageArt(image: string | undefined) {
    const encoded = image?.match(/\/gen\/image\/([^/]+)\//)?.[1];
    if (!encoded) return undefined;
    const [, , options] = JSON.parse(Buffer.from(encoded, "base64url").toString()) as [
        unknown,
        unknown,
        { f?: string },
    ];
    return options.f;
}

/** The base item ID a trade entry names, or undefined when no single base matches. */
export function tradeEntryBaseId(entry: TradeStaticEntry, bases: Bases) {
    const named = bases.filter(([, base]) => base.name === entry.text);
    const art = imageArt(entry.image);
    const drawn = named.filter(
        ([, base]) => base.visual_identity?.dds_file.replace(/^Art\/|\.dds$/g, "") === art,
    );
    const match = named.length === 1 ? named : drawn;
    return match.length === 1 ? match[0]![0] : undefined;
}
