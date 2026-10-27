import { useMemo } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, dataTableColumns } from "~/components/data-table";
import { marketNumber as number } from "~/lib/market-number";
import {
    MOD_SEPARATOR,
    type ModPoolMatch,
    type ModPoolModValue,
    type ModPoolValues,
} from "~/lib/mod-pools";
import { type MarketFilters, marketLink } from "~/schemas/market";

const modColumn = dataTableColumns<ModPoolModValue>();
const matchColumn = dataTableColumns<ModPoolMatch>();
const count = { sortDescFirst: true, meta: { filter: "range" } } as const;

function without(mods: string[], mod: string) {
    return mods.filter((entry) => entry !== mod);
}

export function MarketModValues({
    filters,
    values,
    game,
}: {
    filters: MarketFilters;
    values: ModPoolValues;
    game: "poe1" | "poe2";
}) {
    const { require, anyOf } = values;
    const columns = useMemo(() => {
        const variant = {
            itemKey: filters.item ?? "",
            identified: filters.identified === "true",
            corrupted: filters.corrupted === "true",
            foilVariation: filters.foil,
            signatureKind: filters.kind,
            signatureValue: filters.value,
        };
        const filterLink = (required: string[], any: string[]) =>
            marketLink(
                {
                    ...filters,
                    mods: required.join(MOD_SEPARATOR),
                    anyMods: any.join(MOD_SEPARATOR),
                },
                variant,
            );
        const marketOf = (signatureValue: string) =>
            marketLink(filters, { ...variant, signatureValue });
        const price = (value: number | null, signatureValue?: string | null) => {
            if (value === null) return "—";
            const label = (
                <>
                    {number(value)} <CurrencyLabel currency={filters.currency} game={game} />
                </>
            );
            return signatureValue ? (
                <Link to={marketOf(signatureValue)} className="underline">
                    {label}
                </Link>
            ) : (
                label
            );
        };
        const toggle = (mod: string, list: "require" | "anyOf") => {
            const inList = (list === "require" ? require : anyOf).includes(mod);
            const label = list === "require" ? "Require" : "Any of";
            const to = inList
                ? list === "require"
                    ? filterLink(without(require, mod), anyOf)
                    : filterLink(require, without(anyOf, mod))
                : list === "require"
                  ? filterLink([...require, mod], without(anyOf, mod))
                  : filterLink(without(require, mod), [...anyOf, mod]);
            return (
                <Link
                    to={to}
                    aria-pressed={inList}
                    aria-label={`${label}: ${mod}`}
                    className={`rounded-full border px-2 py-0.5 text-xs ${inList ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                >
                    {label}
                </Link>
            );
        };
        return {
            filterLink,
            mods: modColumn.columns([
                modColumn.accessor("mod", { header: "Mod", meta: { filter: "text" } }),
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
                    cell: ({ row }) => price(row.original.cheapest, row.original.cheapestValue),
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
                modColumn.accessor("mod", {
                    id: "filter",
                    header: "Filter",
                    enableSorting: false,
                    cell: ({ getValue }) => (
                        <span className="flex gap-1 whitespace-nowrap">
                            {toggle(getValue(), "require")}
                            {toggle(getValue(), "anyOf")}
                        </span>
                    ),
                }),
            ]),
            matches: matchColumn.columns([
                matchColumn.accessor((row) => row.mods.join(" · "), {
                    id: "mods",
                    header: "Mods",
                    meta: { filter: "text" },
                }),
                matchColumn.accessor("listings", {
                    header: "Listed now",
                    ...count,
                    cell: ({ getValue }) => number(getValue()),
                }),
                matchColumn.accessor("cheapest", {
                    header: "Cheapest ask",
                    ...count,
                    cell: ({ row }) => price(row.original.cheapest, row.original.signatureValue),
                }),
                matchColumn.accessor("sales", {
                    header: "Likely sales",
                    ...count,
                    cell: ({ getValue }) => number(getValue()),
                }),
                matchColumn.accessor((row) => row.saleMedian ?? undefined, {
                    id: "saleMedian",
                    header: "Median sale ask",
                    ...count,
                    sortUndefined: "last",
                    cell: ({ row }) => price(row.original.saleMedian),
                }),
            ]),
        };
    }, [filters, game, require, anyOf]);
    const filtered = require.length > 0 || anyOf.length > 0;
    return (
        <section
            aria-label="Mod values"
            className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
            <div>
                <h2 className="text-lg font-semibold">Mod values</h2>
                <p className="text-sm text-muted-foreground">
                    Cheapest ask and listings come from the latest hour; likely sales and the median
                    last ask before each sale cover the period. Rolls are merged. With a filter,
                    each row covers the matching items that also have that mod, so requiring A shows
                    the cheapest item with A and each other mod.
                </p>
            </div>
            {filtered ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {require.length ? (
                        <span className="text-muted-foreground">Has all of</span>
                    ) : null}
                    {require.map((mod) => (
                        <Link
                            key={`require:${mod}`}
                            to={columns.filterLink(without(require, mod), anyOf)}
                            aria-label={`Remove required mod: ${mod}`}
                            className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-primary"
                        >
                            {mod} ×
                        </Link>
                    ))}
                    {anyOf.length ? (
                        <span className="text-muted-foreground">and any of</span>
                    ) : null}
                    {anyOf.map((mod) => (
                        <Link
                            key={`any:${mod}`}
                            to={columns.filterLink(require, without(anyOf, mod))}
                            aria-label={`Remove any-of mod: ${mod}`}
                            className="rounded-full border border-border px-3 py-1"
                        >
                            {mod} ×
                        </Link>
                    ))}
                    <Link to={columns.filterLink([], [])} className="text-primary underline">
                        Clear
                    </Link>
                </div>
            ) : null}
            <p className="text-sm" role="status">
                {values.cheapest === null ? (
                    "No matching item is listed in the latest hour."
                ) : (
                    <>
                        Cheapest {filtered ? "matching item" : "item"}:{" "}
                        <span className="font-semibold tabular-nums">
                            {number(values.cheapest)}
                        </span>{" "}
                        <CurrencyLabel currency={filters.currency} game={game} /> (
                        {number(values.matchCount)} listed mod combinations)
                    </>
                )}
            </p>
            <DataTable
                label="Mod values"
                data={values.mods}
                columns={columns.mods}
                getRowId={(row) => row.mod}
                search
            />
            <div>
                <h3 className="text-sm font-semibold">Cheapest matching items</h3>
                <DataTable
                    label="Cheapest matching items"
                    data={values.matches}
                    columns={columns.matches}
                    getRowId={(row) => row.mods.join(MOD_SEPARATOR)}
                    className="mt-2"
                />
            </div>
        </section>
    );
}
