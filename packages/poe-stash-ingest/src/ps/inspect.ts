import type { PoeApiClient, PublicStashPage, Realm } from "@poe-tools/api-client";

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadata(value: unknown) {
    if (!record(value)) return null;
    return {
        name: typeof value.name === "string" && value.name ? value.name : null,
        tier: typeof value.tier === "string" && value.tier ? value.tier : null,
        level:
            typeof value.level === "number" && Number.isInteger(value.level) && value.level >= 0
                ? value.level
                : null,
    };
}

export function inspectStashPage(page: PublicStashPage) {
    const result = {
        publicStashes: 0,
        items: 0,
        itemsWithExplicitMods: 0,
        explicitRows: 0,
        stringRows: 0,
        objectRows: 0,
        rowsWithCompleteMetadata: 0,
        examples: [] as Array<{
            baseType: string;
            rarity: string | number | null;
            itemLevel: number | null;
            description: string | null;
            metadata: ReturnType<typeof metadata>[];
        }>,
    };
    const sampled = new Set<string>();
    for (const stash of page.stashes) {
        if (!stash.public) continue;
        result.publicStashes++;
        for (const item of stash.items) {
            result.items++;
            if (item.explicitMods?.length) result.itemsWithExplicitMods++;
            for (const mod of item.explicitMods ?? []) {
                result.explicitRows++;
                if (typeof mod === "string") result.stringRows++;
                else result.objectRows++;
                const entries =
                    record(mod) && Array.isArray(mod.mods) ? mod.mods.map(metadata) : [];
                const complete =
                    entries.length > 0 &&
                    entries.every(
                        (entry) =>
                            entry !== null &&
                            entry.name !== null &&
                            entry.tier !== null &&
                            entry.level !== null,
                    );
                if (complete) result.rowsWithCompleteMetadata++;
                const kind =
                    typeof mod === "string" ? "string" : complete ? "complete" : "incomplete";
                if (sampled.has(kind)) continue;
                sampled.add(kind);
                result.examples.push({
                    baseType: item.baseType,
                    rarity: item.rarity ?? item.frameType ?? null,
                    itemLevel: item.ilvl ?? item.itemLevel ?? null,
                    description: typeof mod === "string" ? mod : mod.description,
                    metadata: entries,
                });
            }
        }
    }
    return result;
}

export async function* inspectPublicStashes(
    client: Pick<PoeApiClient["public"], "stashTabs">,
    options: { pages: number; cursor?: string; realm?: Realm },
) {
    if (!Number.isInteger(options.pages) || options.pages < 1 || options.pages > 5)
        throw new Error("Inspection requires one to five pages.");
    if (options.realm === "poe2") throw new Error("PoE 2 public stash inspection is unsupported.");
    let cursor = options.cursor;
    for (let index = 0; index < options.pages; index++) {
        const page = await client.stashTabs({ realm: options.realm, id: cursor });
        yield {
            observedAt: new Date().toISOString(),
            realm: options.realm ?? "pc",
            page: index + 1,
            startedAtOldest: index === 0 && cursor === undefined,
            nextCursor: page.next_change_id,
            ...inspectStashPage(page),
        };
        if (!page.stashes.length || page.next_change_id === cursor) break;
        cursor = page.next_change_id;
    }
}
