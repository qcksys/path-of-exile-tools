import {
    type Column,
    type ColumnDef,
    type ColumnFiltersState,
    columnFilteringFeature,
    createColumnHelper,
    createFilteredRowModel,
    createSortedRowModel,
    filterFn_includesString,
    filterFn_inNumberRange,
    globalFilteringFeature,
    metaHelper,
    type OnChangeFn,
    type RowData,
    rowSortingFeature,
    type SortingState,
    sortFn_alphanumeric,
    sortFn_basic,
    tableFeatures,
    useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Input } from "~/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

export interface DataTableColumnMeta {
    /** Shows a text box (`includesString`) or minimum/maximum boxes (`inNumberRange`) under the header. */
    filter?: "text" | "range";
    className?: string;
}

export const dataTableFeatures = tableFeatures({
    columnFilteringFeature,
    globalFilteringFeature,
    rowSortingFeature,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    filterFns: { includesString: filterFn_includesString, inNumberRange: filterFn_inNumberRange },
    sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
    columnMeta: metaHelper<DataTableColumnMeta>(),
});
type Features = typeof dataTableFeatures;

export const dataTableColumns = <TData extends RowData>() => createColumnHelper<Features, TData>();

/** A range filter's value: the raw minimum and maximum box contents. */
export type RangeFilter = [min?: string, max?: string];

/**
 * Sorting and column filters held outside the table (for example in the URL). The table
 * reports changes instead of sorting and filtering its rows, and the filter boxes report a
 * change on Enter or blur rather than on every keystroke.
 */
export interface DataTableServerState {
    sorting: SortingState;
    onSortingChange: OnChangeFn<SortingState>;
    columnFilters: ColumnFiltersState;
    onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
}

export function DataTable<TData extends RowData>({
    label,
    data,
    columns,
    getRowId,
    server,
    search = false,
    empty = "No rows match these filters.",
    className,
}: {
    label: string;
    data: TData[];
    columns: ColumnDef<Features, TData, unknown>[];
    getRowId?: (row: TData) => string;
    server?: DataTableServerState;
    /** Adds a box that searches every filterable column of the loaded rows. */
    search?: boolean;
    empty?: ReactNode;
    className?: string;
}) {
    const table = useTable({
        features: dataTableFeatures,
        data,
        columns,
        getRowId,
        enableSortingRemoval: false,
        globalFilterFn: "includesString",
        getColumnCanGlobalFilter: (column) =>
            (column.columnDef.meta as DataTableColumnMeta | undefined)?.filter !== undefined,
        ...(server
            ? {
                  manualFiltering: true,
                  manualSorting: true,
                  state: { sorting: server.sorting, columnFilters: server.columnFilters },
                  onSortingChange: server.onSortingChange,
                  onColumnFiltersChange: server.onColumnFiltersChange,
              }
            : {}),
    });
    const rows = table.getRowModel().rows;
    return (
        <div className={cn("space-y-3", className)}>
            {search ? (
                <Input
                    type="search"
                    aria-label={`Search ${label}`}
                    placeholder="Search rows…"
                    value={String(table.state.globalFilter ?? "")}
                    onChange={(event) => table.setGlobalFilter(event.target.value)}
                    className="max-w-xs bg-background"
                />
            ) : null}
            <Table aria-label={label} className="text-sm">
                <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id} className="hover:bg-transparent">
                            {headerGroup.headers.map((header) => {
                                const sorted = header.column.getIsSorted();
                                const canSort = header.column.getCanSort();
                                return (
                                    <TableHead
                                        key={header.id}
                                        aria-sort={
                                            !canSort
                                                ? undefined
                                                : sorted === "asc"
                                                  ? "ascending"
                                                  : sorted === "desc"
                                                    ? "descending"
                                                    : "none"
                                        }
                                        className={cn(
                                            "h-auto px-4 py-3 align-top text-xs font-medium text-muted-foreground",
                                            header.column.columnDef.meta?.className,
                                        )}
                                    >
                                        {canSort ? (
                                            <button
                                                type="button"
                                                onClick={header.column.getToggleSortingHandler()}
                                                className="inline-flex items-center gap-1 hover:text-foreground"
                                            >
                                                <table.FlexRender header={header} />
                                                <SortIcon sorted={sorted} />
                                            </button>
                                        ) : (
                                            <table.FlexRender header={header} />
                                        )}
                                        {header.column.getCanFilter() ? (
                                            <ColumnFilter column={header.column} live={!server} />
                                        ) : null}
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {rows.length ? (
                        rows.map((row) => (
                            <TableRow key={row.id} className="hover:bg-muted/30">
                                {row.getAllCells().map((cell) => (
                                    <TableCell
                                        key={cell.id}
                                        className={cn(
                                            "whitespace-normal px-4 py-3 align-top",
                                            cell.column.columnDef.meta?.className,
                                        )}
                                    >
                                        <table.FlexRender cell={cell} />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow className="hover:bg-transparent">
                            <TableCell
                                colSpan={table.getAllLeafColumns().length}
                                className="whitespace-normal px-4 py-10 text-center text-muted-foreground"
                            >
                                {empty}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
    const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
    return <Icon aria-hidden="true" className={cn("size-3", !sorted && "opacity-40")} />;
}

function ColumnFilter<TData extends RowData>({
    column,
    live,
}: {
    column: Column<Features, TData, unknown>;
    live: boolean;
}) {
    const name = String(column.columnDef.header);
    const value = column.getFilterValue();
    if (column.columnDef.meta?.filter === "range") {
        const [min = "", max = ""] = (value as RangeFilter | undefined) ?? [];
        const setBound = (index: 0 | 1, bound: string) =>
            column.setFilterValue((old: RangeFilter | undefined) => {
                const next: RangeFilter = [...(old ?? [])];
                next[index] = bound;
                return next;
            });
        return (
            <div className="mt-1.5 flex gap-1 font-normal">
                <FilterInput
                    live={live}
                    value={min}
                    onCommit={(bound) => setBound(0, bound)}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="Min"
                    aria-label={`Minimum ${name}`}
                    className="w-20"
                />
                <FilterInput
                    live={live}
                    value={max}
                    onCommit={(bound) => setBound(1, bound)}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="Max"
                    aria-label={`Maximum ${name}`}
                    className="w-20"
                />
            </div>
        );
    }
    return (
        <div className="mt-1.5 font-normal">
            <FilterInput
                live={live}
                value={String(value ?? "")}
                onCommit={(text) => column.setFilterValue(text)}
                placeholder="Filter…"
                aria-label={`Filter ${name}`}
                className="w-40"
            />
        </div>
    );
}

function FilterInput({
    live,
    value,
    onCommit,
    className,
    ...props
}: {
    live: boolean;
    value: string;
    onCommit: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange">) {
    const inputClass = cn("h-7 bg-background px-2 text-xs", className);
    if (live)
        return (
            <Input
                {...props}
                value={value}
                onChange={(event) => onCommit(event.target.value)}
                className={inputClass}
            />
        );
    // Remount when the committed value changes so the box shows it.
    return (
        <Input
            {...props}
            key={value}
            defaultValue={value}
            onBlur={(event) => {
                if (event.target.value !== value) onCommit(event.target.value);
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
            }}
            className={inputClass}
        />
    );
}
