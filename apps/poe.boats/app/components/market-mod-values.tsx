import { useMemo } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, dataTableColumns } from "~/components/data-table";
import { marketNumber as number } from "~/lib/market-number";
import type { ModPoolModValue } from "~/lib/mod-pools";
import { type MarketFilters, marketLink } from "~/schemas/market";

const modColumn = dataTableColumns<ModPoolModValue>();
const count = { sortDescFirst: true, meta: { filter: "range" } } as const;

export function MarketModValues({
    filters,
    values,
    game,
}: {
    filters: MarketFilters;
    values: ModPoolModValue[];
    game: "poe1" | "poe2";
}) {
    const columns = useMemo(() => {
        const price = (value: number | null) =>
            value === null ? (
                "—"
            ) : (
                <>
                    {number(value)} <CurrencyLabel currency={filters.currency} game={game} />
                </>
            );
        return modColumn.columns([
            modColumn.accessor("mod", {
                header: "Mod",
                meta: { filter: "text" },
                cell: ({ getValue, row: { original } }) => (
                    <Link
                        to={marketLink(filters, {
                            itemKey: filters.item ?? "",
                            identified: filters.identified === "true",
                            corrupted: filters.corrupted === "true",
                            signatureKind: filters.kind,
                            signatureValue: original.signatureValue,
                        })}
                        className="text-primary hover:underline"
                    >
                        {getValue()}
                    </Link>
                ),
            }),
            modColumn.accessor("modCount", { header: "Mods on item", ...count }),
            modColumn.accessor("listings", {
                header: "Listed now",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
            modColumn.accessor((row) => row.cheapest ?? undefined, {
                id: "cheapest",
                header: "Cheapest ask",
                ...count,
                sortUndefined: "last",
                cell: ({ row }) => price(row.original.cheapest),
            }),
            modColumn.accessor((row) => row.medianAsk ?? undefined, {
                id: "medianAsk",
                header: "Median ask",
                ...count,
                sortUndefined: "last",
                cell: ({ row }) => price(row.original.medianAsk),
            }),
            modColumn.accessor("sales", {
                header: "Likely sales",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
            modColumn.accessor((row) => row.saleMedian ?? undefined, {
                id: "saleMedian",
                header: "Median sale ask",
                ...count,
                sortUndefined: "last",
                cell: ({ row }) => price(row.original.saleMedian),
            }),
        ]);
    }, [filters, game]);
    return (
        <section
            aria-label="Mod values"
            className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
            <div>
                <h2 className="text-lg font-semibold">Mod values</h2>
                <p className="text-sm text-muted-foreground">
                    Every item counts once for each of its mods, at its full price, separately for 2
                    and 3 mod items, so a mod's price includes the value of the mods alongside it.
                    Asks and listings come from the latest hour; likely sales and the median last
                    ask before each sale cover the period. Rolls are merged.
                </p>
            </div>
            <DataTable
                label="Mod values"
                data={values}
                columns={columns}
                getRowId={(row) => row.signatureValue}
                search
            />
        </section>
    );
}
