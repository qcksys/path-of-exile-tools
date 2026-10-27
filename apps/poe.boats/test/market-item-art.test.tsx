// @vitest-environment jsdom
// biome-ignore-all lint/style/useNamingConvention: Route component fixtures use PascalCase.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import MarketIndex from "~/routes/market/index";
import MarketItem from "~/routes/market/item";
import { marketFiltersSchema } from "~/schemas/market";

vi.mock("~/components/app-header", () => ({ AppHeader: () => null }));
vi.mock("~/components/app-footer", () => ({ AppFooter: () => null }));
afterEach(cleanup);

function showMarket(
    realm: "pc" | "poe2",
    iconAsset: string | null = "2DItems/Armours/BodyArmours/Unique",
    view: "list" | "history" = "list",
) {
    const row = {
        realm,
        league: "Standard",
        hour: 1_790_000_000,
        itemKey: "Unique armour",
        name: "Unique armour",
        baseType: "Plate Vest",
        iconAsset,
        identified: true,
        corrupted: false,
        foilVariation: -1,
        frameType: 3,
        signatureKind: "",
        signatureValue: "",
        signatureData: null,
        listingCount: 5,
        uniqueSellers: 5,
        likelySales: 2,
        removedCount: 2,
        relistedCount: 0,
        pendingCount: 0,
        prices: { divine: { count: 5, min: 1, median: 2, max: 3 } },
        salesPrices: null,
        firstSeenAt: "2026-10-08T00:00:00Z",
        lastSeenAt: "2026-10-08T01:00:00Z",
        rowCreatedAt: new Date(),
        rowUpdatedAt: new Date(),
        rowDeletedAt: null,
    };
    const loaderData: Parameters<typeof MarketIndex>[0]["loaderData"] = {
        filters: marketFiltersSchema.parse({ realm, league: "Standard", item: row.itemKey }),
        seasons: [],
        season: undefined,
        hasMore: false,
        chaosRates: {},
        exchange: [],
        variants: [],
        rows: [
            {
                ...row,
                category: "armour",
                rank: 1,
                periodSales: 2,
                periodRemovals: 2,
                periodPending: 0,
            },
        ],
        history: [{ ...row, merged: null, mergedSales: null }],
    };
    const Routes = createRoutesStub([
        {
            path: "/",
            Component: () =>
                view === "list" ? (
                    <MarketIndex loaderData={loaderData} />
                ) : (
                    <MarketItem loaderData={loaderData} />
                ),
        },
    ]);
    return render(<Routes />);
}

it.each([
    ["pc", "list"],
    ["poe2", "list"],
    ["pc", "history"],
    ["poe2", "history"],
] as const)("uses captured unique artwork in %s %s without duplicating accessible names", (realm, view) => {
    const { container } = showMarket(realm, undefined, view);
    const images = [
        ...container.querySelectorAll<HTMLImageElement>('[data-item-art="Unique armour"] img'),
    ];
    expect(images).toHaveLength(1);
    expect(images.map((image) => image.src)).toEqual(
        Array(1).fill(
            realm === "poe2"
                ? "https://cdn.poe2db.tw/image/Art/2DItems/Armours/BodyArmours/Unique.webp"
                : "https://www.pathofexile.com/image/Art/2DItems/Armours/BodyArmours/Unique.png",
        ),
    );
    expect(
        screen.getByRole(view === "list" ? "link" : "heading", { name: "Unique armour" }),
    ).toBeTruthy();
    fireEvent.error(images[0]!);
    expect(
        screen.getByRole(view === "list" ? "link" : "heading", { name: "Unique armour" }),
    ).toBeTruthy();
});

it("keeps market identity visible when a captured icon is missing", () => {
    const { container } = showMarket("pc", null);
    expect(container.querySelectorAll('[data-item-art="Unique armour"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-item-art="Unique armour"] img')).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Unique armour" })).toBeTruthy();
});
