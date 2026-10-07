// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream API field names.
import { describe, expect, it, vi } from "vite-plus/test";
import {
    inspectPublicStashes,
    inspectStashPage,
} from "../../../packages/poe-stash-ingest/src/ps/inspect.ts";

describe("public stash metadata inspection", () => {
    it("bounds read-only pagination and stops when the source reaches its end", async () => {
        const stashTabs = vi.fn().mockResolvedValue({ next_change_id: "next", stashes: [] });
        for (const pages of [0, 6, 1.5])
            await expect(inspectPublicStashes({ stashTabs }, { pages }).next()).rejects.toThrow(
                "one to five",
            );
        await expect(
            inspectPublicStashes({ stashTabs }, { pages: 1, realm: "poe2" }).next(),
        ).rejects.toThrow("unsupported");
        expect(stashTabs).not.toHaveBeenCalled();
        const reports = [];
        for await (const report of inspectPublicStashes(
            { stashTabs },
            { pages: 5, cursor: "start", realm: "xbox" },
        ))
            reports.push(report);
        expect(reports).toHaveLength(1);
        expect(reports[0]).toMatchObject({
            realm: "xbox",
            page: 1,
            startedAtOldest: false,
            items: 0,
            nextCursor: "next",
        });
        expect(stashTabs).toHaveBeenCalledExactlyOnceWith({ realm: "xbox", id: "start" });
        stashTabs
            .mockClear()
            .mockResolvedValue({ next_change_id: "next", stashes: [{ public: false }] });
        const advancing = [];
        for await (const report of inspectPublicStashes({ stashTabs }, { pages: 5 }))
            advancing.push(report);
        expect(advancing).toHaveLength(2);
        expect(advancing[0]!.startedAtOldest).toBe(true);
        expect(stashTabs).toHaveBeenLastCalledWith({ realm: undefined, id: "next" });
    });
    it("distinguishes complete metadata from descriptions and strips unrelated listing fields", () => {
        const item = {
            verified: true,
            w: 2,
            h: 3,
            icon: "private-icon",
            name: "private-name",
            typeLine: "Vaal Regalia",
            baseType: "Vaal Regalia",
            identified: true,
            rarity: "Rare" as const,
            frameType: 2 as const,
            ilvl: 86,
            id: "private-item",
            note: "private-note",
            explicitMods: [
                "100% increased Energy Shield",
                { description: "+50 to maximum Life" },
                {
                    description: "+60 to maximum Life",
                    mods: [{ name: "Healthy", tier: "P2", level: 20, extra: "private-extra" }],
                },
                { description: "+61 to maximum Life", mods: [{ name: "Healthy", tier: "P2" }] },
                { description: "+62 to maximum Life", mods: [null] },
            ],
        };
        const stash = {
            id: "private-stash",
            public: true,
            accountName: "private-account",
            stashType: "PremiumStash",
            items: [item],
        };
        const page = { next_change_id: "cursor", stashes: [stash, { ...stash, public: false }] };
        const before = structuredClone(page);
        const result = inspectStashPage(page);
        expect(result).toMatchObject({
            publicStashes: 1,
            items: 1,
            itemsWithExplicitMods: 1,
            explicitRows: 5,
            stringRows: 1,
            objectRows: 4,
            rowsWithCompleteMetadata: 1,
        });
        expect(result.examples).toHaveLength(3);
        expect(result.examples[2]).toEqual({
            baseType: "Vaal Regalia",
            rarity: "Rare",
            itemLevel: 86,
            description: "+60 to maximum Life",
            metadata: [{ name: "Healthy", tier: "P2", level: 20 }],
        });
        expect(JSON.stringify(result)).not.toContain("private-");
        expect(page).toEqual(before);
    });
    it("reports an empty page without claiming that the feed lacks metadata", () => {
        expect(inspectStashPage({ next_change_id: "cursor", stashes: [] })).toMatchObject({
            items: 0,
            explicitRows: 0,
            rowsWithCompleteMetadata: 0,
            examples: [],
        });
    });
});
