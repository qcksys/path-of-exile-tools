import { z } from "zod";
import { matchItemCondition } from "./match.ts";
import { itemRarity } from "./normalize.ts";
import {
    type ItemCondition,
    type ItemRecord,
    itemQuerySchema,
    itemRecordSchema,
} from "./schema.ts";

export const itemQuerySelectionSchema = z.strictObject({
    minimumLevel: z.boolean().default(true),
    rarity: z.boolean().default(true),
    flags: z.boolean().default(true),
    modifiers: z.boolean().default(true),
    implicitModifiers: z.boolean().default(false),
    openAffixes: z.boolean().default(false),
    sockets: z.boolean().default(false),
});
export type ItemQuerySelection = z.infer<typeof itemQuerySelectionSchema>;

export function queryFromItem(input: ItemRecord, selection: ItemQuerySelection) {
    const record = itemRecordSchema.parse(input);
    const options = itemQuerySelectionSchema.parse(selection);
    const { item, facts } = record;
    const warnings: string[] = [];
    const filters: ItemCondition[] = [
        facts.baseId
            ? { kind: "base", field: "baseId", values: [facts.baseId] }
            : { kind: "base", field: "baseType", values: [item.baseType] },
    ];
    if (options.minimumLevel) {
        const level = item.ilvl ?? item.itemLevel;
        if (level === undefined) warnings.push("Item level is unknown and was omitted.");
        else filters.push({ kind: "range", field: "ilvl", value: { min: level } });
    }
    if (options.rarity) {
        const rarity = itemRarity(item);
        if (rarity === undefined) warnings.push("Rarity is unknown and was omitted.");
        else filters.push({ kind: "rarity", values: [rarity] });
    }
    if (options.flags) {
        const flags = [
            "identified",
            "corrupted",
            "mirrored",
            "fractured",
            ...(record.game === "poe1"
                ? (["split", "synthesised", "influenced"] as const)
                : (["sanctified"] as const)),
        ] as const;
        for (const field of flags) {
            const match = matchItemCondition(record, { kind: "flag", field, value: true });
            if (match !== "unknown")
                filters.push({ kind: "flag", field, value: match === "match" });
        }
        for (const [influence, present] of Object.entries(item.influences ?? {})) {
            if (present) filters.push({ kind: "influence", values: [influence] });
        }
    }
    if (options.modifiers || options.implicitModifiers) {
        if (!facts.modifiersComplete)
            warnings.push(
                "Modifier knowledge is incomplete. Only supported modifier facts are included.",
            );
        for (const mod of facts.modifiers) {
            if (!mod.side && !(options.modifiers && options.implicitModifiers)) {
                warnings.push(
                    `Modifier ${mod.name ?? mod.id ?? "with unknown identity"} has no known affix side and was omitted.`,
                );
                continue;
            }
            if (mod.side === "implicit" ? !options.implicitModifiers : !options.modifiers) continue;
            if (!mod.id && !mod.possibleIds) {
                warnings.push(
                    `Modifier ${mod.name ?? "with unknown name"} has no resolved identity and was omitted.`,
                );
                continue;
            }
            if (!mod.id)
                warnings.push(
                    `Modifier ${mod.name ?? "with unknown name"} has multiple possible identities; the query accepts every listed possibility.`,
                );
            filters.push({
                kind: "mod",
                ids: mod.id ? [mod.id] : mod.possibleIds,
                side: mod.side,
                count: { min: 1 },
                ...(mod.tier === undefined ? {} : { tier: { min: mod.tier, max: mod.tier } }),
                ...(mod.fractured === undefined ? {} : { fractured: mod.fractured }),
                ...(mod.crafted === undefined ? {} : { crafted: mod.crafted }),
            });
        }
    }
    if (options.openAffixes) {
        for (const side of ["prefix", "suffix"] as const) {
            const count = side === "prefix" ? facts.prefixes : facts.suffixes;
            const limit = side === "prefix" ? facts.prefixLimit : facts.suffixLimit;
            if (!facts.modifiersComplete || count === undefined || limit === undefined)
                warnings.push(`Empty ${side} slots are unknown and were omitted.`);
            else
                filters.push({
                    kind: "range",
                    field: side === "prefix" ? "openPrefixes" : "openSuffixes",
                    value: { min: Math.max(0, limit - count) },
                });
        }
    }
    if (options.sockets) {
        const count = facts.socketCount ?? item.sockets?.length;
        if (count === undefined) warnings.push("Socket count is unknown and was omitted.");
        else filters.push({ kind: "range", field: "sockets", value: { min: count } });
        if (record.game === "poe1") {
            const socketGroups = new Map<number, number>();
            for (const socket of item.sockets ?? [])
                socketGroups.set(socket.group, (socketGroups.get(socket.group) ?? 0) + 1);
            const largest = Math.max(0, ...socketGroups.values());
            const links =
                facts.linkedSockets ?? (item.sockets ? { min: largest, max: largest } : undefined);
            if (links && links.min === links.max)
                filters.push({ kind: "range", field: "links", value: { min: links.min } });
            else warnings.push("Socket links are not fully known and were omitted.");
        }
    }
    const groups = [];
    for (let index = 0; index < filters.length; index += 64)
        groups.push({ type: "and", filters: filters.slice(index, index + 64) });
    return { query: itemQuerySchema.parse({ game: record.game, groups }), warnings };
}
