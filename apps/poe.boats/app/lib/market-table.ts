import {
    type ColumnFiltersState,
    functionalUpdate,
    type SortingState,
} from "@tanstack/react-table";
import type { DataTableServerState, RangeFilter } from "~/components/data-table";
import {
    MARKET_RANGE_COLUMNS,
    MARKET_SORT_COLUMNS,
    type MarketFilters,
    type MarketOrder,
    type MarketRangeColumn,
    type MarketSortColumn,
    marketLink,
} from "~/schemas/market";

const rangeColumns = Object.entries(MARKET_RANGE_COLUMNS) as [
    MarketRangeColumn,
    (typeof MARKET_RANGE_COLUMNS)[MarketRangeColumn],
][];

export function marketTableSorting(order: MarketOrder): SortingState {
    for (const [id, orders] of Object.entries(MARKET_SORT_COLUMNS)) {
        if (orders.asc === order) return [{ id, desc: false }];
        if (orders.desc === order) return [{ id, desc: true }];
    }
    return [];
}

export function marketTableOrder(sorting: SortingState): MarketOrder {
    const [sort] = sorting;
    const orders = sort && MARKET_SORT_COLUMNS[sort.id as MarketSortColumn];
    return orders ? orders[sort.desc ? "desc" : "asc"] : "sales";
}

/** The item column filters by the text search; range columns by their URL bounds. */
export function marketTableFilters(filters: MarketFilters): ColumnFiltersState {
    return [
        ...(filters.q ? [{ id: "item", value: filters.q }] : []),
        ...rangeColumns.flatMap(([id, [minParam, maxParam]]) => {
            const min = filters[minParam];
            const max = filters[maxParam];
            if (min === undefined && max === undefined) return [];
            const value: RangeFilter = [min?.toString() ?? "", max?.toString() ?? ""];
            return [{ id, value }];
        }),
    ];
}

function bound(raw: string | undefined) {
    if (!raw?.trim()) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1e12 ? value : undefined;
}

/** Applies the table's column filters to the market filters and returns to the first page. */
export function applyMarketTableFilters(
    filters: MarketFilters,
    columnFilters: ColumnFiltersState,
): MarketFilters {
    const value = (id: string) => columnFilters.find((filter) => filter.id === id)?.value;
    const next = { ...filters, q: String(value("item") ?? "").slice(0, 100), page: 1 };
    for (const [id, [minParam, maxParam]] of rangeColumns) {
        const [min, max] = (value(id) as RangeFilter | undefined) ?? [];
        next[minParam] = bound(min);
        next[maxParam] = bound(max);
    }
    return next;
}

/** Keeps the market table's sorting and column filters in the URL. */
export function marketTableState(
    filters: MarketFilters,
    navigate: (to: string) => void,
): DataTableServerState {
    const sorting = marketTableSorting(filters.order);
    const columnFilters = marketTableFilters(filters);
    return {
        sorting,
        onSortingChange: (updater) =>
            navigate(
                marketLink({
                    ...filters,
                    order: marketTableOrder(functionalUpdate(updater, sorting)),
                    page: 1,
                }),
            ),
        columnFilters,
        onColumnFiltersChange: (updater) =>
            navigate(
                marketLink(
                    applyMarketTableFilters(filters, functionalUpdate(updater, columnFilters)),
                ),
            ),
    };
}
