import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { data, Link, useRevalidator } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { Button } from "~/components/ui/button";
import { dbContext } from "~/context";
import { getServerStatus } from "~/operations/server-status.server";
import type { Route } from "./+types/server-status";

export function meta() {
    return [{ title: "Server status · POE.BOATS" }];
}

export async function loader({ context }: Route.LoaderArgs) {
    return data(await getServerStatus(context.get(dbContext)), {
        headers: { "Cache-Control": "no-store" },
    });
}

function date(value: number | null) {
    return value === null
        ? "Not yet"
        : `${new Date(value).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

const labels = {
    starting: "Starting",
    running: "Processing",
    idle: "Waiting for next cycle",
    error: "Needs attention",
    stopped: "Stopped",
    stale: "Heartbeat missing",
    stalled: "No recent progress",
};

export default function ServerStatus({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const revalidator = useRevalidator();
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible" && revalidator.state === "idle")
                void revalidator.revalidate();
        }, 30_000);
        return () => clearInterval(timer);
    }, [revalidator]);
    const { workers, coverage, checkedAt } = loaderData;
    const attention = workers.filter((worker) =>
        ["error", "stale", "stalled"].includes(worker.health),
    ).length;
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section="Server status" />
            <main className="container mx-auto flex-1 space-y-10 px-4 py-8 md:py-12">
                <div className="flex flex-wrap items-end justify-between gap-6 border-border border-b pb-8">
                    <div className="max-w-2xl space-y-3">
                        <p className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
                            <Activity size={16} /> Ingestion monitor
                        </p>
                        <h1 className="font-bold text-4xl tracking-tight">Server status</h1>
                        <p className="text-muted-foreground">
                            Follow collection, hourly processing, and delivery of league economy
                            data.
                        </p>
                    </div>
                    <div className="space-y-2 text-sm">
                        <Button
                            variant="outline"
                            onClick={() => void revalidator.revalidate()}
                            disabled={revalidator.state !== "idle"}
                        >
                            <RefreshCw
                                size={16}
                                className={revalidator.state !== "idle" ? "animate-spin" : ""}
                            />
                            {revalidator.state !== "idle" ? "Refreshing…" : "Refresh status"}
                        </Button>
                        <p className="text-muted-foreground text-xs">
                            Refreshes every 30 seconds · All times UTC
                        </p>
                    </div>
                </div>
                <section aria-label="Worker health" className="space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="font-semibold text-xl">
                            Ingestion workers{" "}
                            <span className="ml-2 font-mono text-muted-foreground">
                                {workers.length}
                            </span>
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {attention
                                ? `${attention} need attention`
                                : workers.length
                                  ? "No reported issues"
                                  : "Awaiting first heartbeat"}
                        </p>
                    </div>
                    {!workers.length && (
                        <div className="rounded-lg border border-dashed p-8 text-muted-foreground">
                            No worker has reported to this app yet. Start an ingestion worker with
                            this app as its delivery target. Stored data may still be available
                            below.
                        </div>
                    )}
                    {workers.map((worker) => {
                        const problem = ["error", "stale", "stalled"].includes(worker.health);
                        return (
                            <article
                                key={worker.workerId}
                                className="overflow-hidden rounded-lg border border-border bg-card"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b p-5">
                                    <div>
                                        <h3 className="font-semibold text-lg">
                                            {worker.league}{" "}
                                            <span className="ml-2 font-mono text-muted-foreground text-sm uppercase">
                                                {worker.realm}
                                            </span>
                                        </h3>
                                        <p className="text-muted-foreground text-xs">
                                            {worker.workerId}
                                        </p>
                                    </div>
                                    <span
                                        className={`rounded-full border px-3 py-1 font-medium text-sm ${problem ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300" : "border-border bg-muted text-foreground"}`}
                                    >
                                        {labels[worker.health]}
                                    </span>
                                </div>
                                <div className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                            Current stage
                                        </p>
                                        <p className="mt-1 font-medium capitalize">
                                            {worker.stage ?? "Between cycles"}
                                        </p>
                                        <p className="mt-2 text-muted-foreground text-xs">
                                            {worker.failedStages.length
                                                ? `Failed: ${worker.failedStages.join(", ")}. Retrying saved work.`
                                                : "Committed cursors resume after restart."}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                            Stash collection
                                        </p>
                                        <p className="mt-1 font-mono text-2xl">
                                            {worker.pages.toLocaleString("en-US")}{" "}
                                            <span className="text-muted-foreground text-sm">
                                                pages / cycle
                                            </span>
                                        </p>
                                        <p className="mt-2 text-muted-foreground text-xs">
                                            {worker.equipmentObserved.toLocaleString("en-US")}{" "}
                                            equipment observations ·{" "}
                                            {worker.stashCaughtUp === null
                                                ? "Catch-up unknown"
                                                : worker.stashCaughtUp
                                                  ? "Caught up"
                                                  : "Catching up"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                            Exchange progress
                                        </p>
                                        <p className="mt-2 font-mono text-sm">
                                            {date(
                                                worker.currencyNextHour === null
                                                    ? null
                                                    : worker.currencyNextHour * 1000,
                                            )}
                                        </p>
                                        <p className="mt-2 text-muted-foreground text-xs">
                                            Next snapshot to request
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                            Delivered this cycle
                                        </p>
                                        <p className="mt-1 font-mono text-2xl">
                                            {worker.deliveredRows.toLocaleString("en-US")}{" "}
                                            <span className="text-muted-foreground text-sm">
                                                rows
                                            </span>
                                        </p>
                                        <p className="mt-2 text-muted-foreground text-xs">
                                            {worker.deliveredHours} stream-hours · {worker.cycles}{" "}
                                            cycles since start
                                        </p>
                                    </div>
                                </div>
                                <dl className="grid gap-3 border-border border-t bg-muted/30 px-5 py-3 text-xs sm:grid-cols-3">
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Last heartbeat received
                                        </dt>
                                        <dd className="mt-1 font-mono">
                                            {date(worker.receivedAt)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Last progress</dt>
                                        <dd className="mt-1 font-mono">
                                            {date(worker.progressAt)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Last successful cycle
                                        </dt>
                                        <dd className="mt-1 font-mono">
                                            {date(worker.lastSuccessAt)}
                                        </dd>
                                    </div>
                                </dl>
                            </article>
                        );
                    })}
                </section>
                <section aria-label="Stored history" className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="font-semibold text-xl">Stored league history</h2>
                        <Link
                            className="flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                            to="/1/market"
                        >
                            Open market <ArrowRight size={14} />
                        </Link>
                    </div>
                    <p className="max-w-3xl text-muted-foreground text-sm">
                        Coverage counts distinct stored hours. Gaps are not filled. Exchange
                        snapshots can be backfilled; equipment and unique-item history begins when
                        listings were observed.
                    </p>
                    {!coverage.length ? (
                        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">
                            No hourly summaries have been delivered yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-muted/40 text-muted-foreground">
                                    <tr>
                                        {[
                                            "League / realm",
                                            "Source",
                                            "First hour",
                                            "Latest hour",
                                            "Hours",
                                            "Rows",
                                        ].map((heading) => (
                                            <th
                                                key={heading}
                                                className="whitespace-nowrap px-4 py-3 font-medium"
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {coverage.map((row) => (
                                        <tr
                                            key={`${row.stream}:${row.realm}:${row.league}`}
                                            className="border-border border-t"
                                        >
                                            <td className="whitespace-nowrap px-4 py-4 font-medium">
                                                {row.league}{" "}
                                                <span className="text-muted-foreground">
                                                    / {row.realm}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 capitalize">{row.stream}</td>
                                            <td className="whitespace-nowrap px-4 py-4 font-mono text-xs">
                                                {date(row.firstHour * 1000)}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4 font-mono text-xs">
                                                {date(row.latestHour * 1000)}
                                            </td>
                                            <td className="px-4 py-4 font-mono">
                                                {row.hours.toLocaleString("en-US")}
                                            </td>
                                            <td className="px-4 py-4 font-mono">
                                                {row.rows.toLocaleString("en-US")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-muted-foreground text-xs">
                        Checked {date(checkedAt)}. Missing heartbeats are flagged after 3 minutes;
                        active stages without progress after 10 minutes.
                    </p>
                </section>
            </main>
            <AppFooter />
        </div>
    );
}
