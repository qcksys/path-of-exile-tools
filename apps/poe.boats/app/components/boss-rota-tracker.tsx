import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    analyzeRotaLog,
    killSecondsSchema,
    netPerHour,
    rotaLogSchema,
    startRotaLog,
} from "~/lib/boss-rota-log";
import { rotaValueScale } from "~/lib/rota-value-scale";
import type { BossRotaResult } from "~/schemas/boss-rota";
import { bossMoney } from "./boss-money";

const savedRota = z.object({
    id: z.string(),
    startedAt: z.string(),
    divine: z.number().positive().nullable(),
    log: rotaLogSchema,
});
const bookSchema = z.object({ selected: z.string(), rotas: z.array(savedRota) });
const emptyBook: z.infer<typeof bookSchema> = { selected: "", rotas: [] };
const paceSchema = z.record(z.string(), killSecondsSchema.nullable());
const emptyPace: z.infer<typeof paceSchema> = {};

function subscribe(notify: () => void) {
    window.addEventListener("storage", notify);
    window.addEventListener("boss-rota-saved", notify);
    return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("boss-rota-saved", notify);
    };
}

function useRotaStorage<T>(key: string, schema: z.ZodType<T>, initial: T) {
    const read = () => {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    };
    const raw = useSyncExternalStore(subscribe, read, () => null);
    const parse = (text: string | null) =>
        text === null ? initial : schema.parse(JSON.parse(text));
    const stored = useMemo(() => {
        try {
            return raw === null ? initial : schema.parse(JSON.parse(raw));
        } catch {
            return initial;
        }
    }, [raw, initial, schema]);
    function update(change: (previous: T) => T) {
        try {
            const next = change(parse(read()));
            localStorage.setItem(key, JSON.stringify(next));
            window.dispatchEvent(new Event("boss-rota-saved"));
        } catch {
            toast.error("Could not save this change in this browser.");
        }
    }
    return [stored, update] as const;
}

export function useBossPace(league: string, priorLeagues: string[]) {
    const [pace, update] = useRotaStorage(`boss-rota:pace:${league}`, paceSchema, emptyPace);
    const sources = useSyncExternalStore(
        subscribe,
        () => {
            try {
                return JSON.stringify(
                    priorLeagues.map((source) => localStorage.getItem(`boss-rota:pace:${source}`)),
                );
            } catch {
                return "[]";
            }
        },
        () => "[]",
    );
    const times = useMemo(() => {
        const inherited = { ...emptyPace };
        const records: (string | null)[] = JSON.parse(sources);
        for (const record of records.reverse()) {
            if (record === null) continue;
            try {
                Object.assign(inherited, paceSchema.parse(JSON.parse(record)));
            } catch {
                // Skip an unreadable league while retaining other saved times.
            }
        }
        return { ...inherited, ...pace };
    }, [sources, pace]);
    function setPace(boss: string, seconds: number | null) {
        // An explicitly cleared time also overrides an inherited time.
        update((previous) => ({ ...previous, [boss]: seconds }));
    }
    return [times, setPace] as const;
}

export function BossKillTime({
    id,
    label,
    seconds,
    setSeconds,
}: {
    id?: string;
    label?: string;
    seconds: number | null;
    setSeconds: (seconds: number | null) => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <Input
            id={id}
            aria-label={label}
            className="w-24"
            type="number"
            step="any"
            min="0"
            max="86400"
            placeholder="e.g. 90"
            value={draft ?? seconds ?? ""}
            onChange={(event) => {
                const { value, valueAsNumber, validity } = event.currentTarget;
                setDraft(value);
                if (validity.badInput) return;
                if (!value) setSeconds(null);
                else if (killSecondsSchema.safeParse(valueAsNumber).success)
                    setSeconds(valueAsNumber);
            }}
            onBlur={(event) => {
                if (
                    event.currentTarget.validity.badInput ||
                    (event.currentTarget.value &&
                        !killSecondsSchema.safeParse(event.currentTarget.valueAsNumber).success)
                )
                    toast.error("Enter a positive kill time up to 86,400 seconds.");
                setDraft(null);
            }}
        />
    );
}

type Encounter = BossRotaResult["encounters"][number];
export function BossRotaTracker({
    boss,
    league,
    runs,
    divine,
    seconds,
    setSeconds,
}: {
    boss: Encounter;
    league: string;
    runs: number;
    divine: number | null;
    seconds: number | null;
    setSeconds: (value: number | null) => void;
}) {
    const [book, save] = useRotaStorage(
        `boss-rota:logs:${league}:${boss.id}`,
        bookSchema,
        emptyBook,
    );
    const active = book.rotas.find((row) => row.id === book.selected);
    const report = useMemo(
        () => (active ? analyzeRotaLog({ log: active.log, secondsPerKill: seconds }) : null),
        [active, seconds],
    );
    const logged = report?.drops ?? [];
    const countScale = rotaValueScale(logged.flatMap((row) => [row.count, row.median]));
    const differenceScale = rotaValueScale(
        logged.map((row) => row.difference),
        0,
    );
    const valueScale = rotaValueScale(logged.map((row) => row.valueChaos));
    const expectedHourly = netPerHour(boss.perKill.profitFromPricedDropsChaos, seconds);
    const hourlyScale = rotaValueScale([expectedHourly, report?.pricedNetPerHour], 0);
    const netScale = rotaValueScale(
        [
            report?.pricedNetChaos,
            active && boss.perKill.profitFromPricedDropsChaos !== null
                ? boss.perKill.profitFromPricedDropsChaos * active.log.kills
                : null,
        ],
        0,
    );
    function start() {
        const rota = {
            id: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            divine,
            log: startRotaLog(boss, runs),
        };
        save((previous) => ({ selected: rota.id, rotas: [rota, ...previous.rotas] }));
    }
    function changeCount(index: number, delta: number) {
        save((previous) => ({
            ...previous,
            rotas: previous.rotas.map((rota) => {
                if (rota.id !== active?.id) return rota;
                const drops = rota.log.drops.map((row, i) =>
                    i === index ? { ...row, count: row.count + delta } : row,
                );
                const result = rotaLogSchema.safeParse({ ...rota.log, drops });
                return result.success ? { ...rota, log: result.data } : rota;
            }),
        }));
    }
    return (
        <section className="space-y-4 rounded-lg border p-4" aria-label="Manual rota tracker">
            <h2 className="font-heading text-xl font-semibold">Your rota</h2>
            <div className="flex flex-wrap items-end gap-4">
                <label htmlFor="boss-seconds" className="grid gap-1 text-sm">
                    Seconds per kill
                    <BossKillTime id="boss-seconds" seconds={seconds} setSeconds={setSeconds} />
                </label>
                <div className="text-sm">
                    Expected net per hour{" "}
                    <strong>
                        {bossMoney(
                            divine,
                            netPerHour(boss.perKill.profitChaos, seconds),
                            expectedHourly,
                            hourlyScale,
                        )}
                    </strong>
                </div>
                <Button type="button" onClick={start}>
                    Track {runs} {runs === 1 ? "kill" : "kills"}
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                Kill times carry forward from earlier leagues in this browser. Editing a time sets
                it for this league. Logged loot uses the prices captured when you start a rota.
                Hourly returns use your seconds per kill.
            </p>
            {active && report && (
                <>
                    <label htmlFor="boss-log" className="grid max-w-sm gap-1 text-sm">
                        Saved rota
                        <FormSelect
                            id="boss-log"
                            value={active.id}
                            onValueChange={(id) => {
                                if (id) save((previous) => ({ ...previous, selected: id }));
                            }}
                        >
                            {book.rotas.map((rota, i) => (
                                <FormSelectItem key={rota.id} value={rota.id}>
                                    #{book.rotas.length - i} · {rota.log.kills} kills ·{" "}
                                    {new Date(rota.startedAt).toLocaleString()}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </label>
                    <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm" aria-live="polite">
                        {[
                            ["Entry cost", bossMoney(active.divine, report.entryChaos)],
                            [
                                "Logged loot value",
                                bossMoney(active.divine, report.lootChaos, report.pricedLootChaos),
                            ],
                            [
                                "Logged net",
                                bossMoney(
                                    active.divine,
                                    report.netChaos,
                                    report.pricedNetChaos,
                                    netScale,
                                ),
                            ],
                            [
                                "Logged net per hour",
                                bossMoney(
                                    active.divine,
                                    report.netPerHour,
                                    report.pricedNetPerHour,
                                    hourlyScale,
                                ),
                            ],
                        ].map(([label, amount]) => (
                            <div key={String(label)}>
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="font-semibold">{amount}</dd>
                            </div>
                        ))}
                    </dl>
                    <Table aria-label="Recorded drops">
                        <TableHeader>
                            <TableRow>
                                {[
                                    "Drop",
                                    "Received",
                                    "Median",
                                    "Compared with median",
                                    "Loot value",
                                ].map((h) => (
                                    <TableHead key={h}>{h}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {report.drops.map((row, i) => {
                                const pool = active.log.drops[i]!.pool;
                                const used =
                                    pool === "Additional Drops"
                                        ? row.count
                                        : active.log.drops
                                              .filter((item) => item.pool === pool)
                                              .reduce((sum, item) => sum + item.count, 0);
                                return (
                                    <TableRow key={row.name}>
                                        <TableCell>{row.name}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    aria-label={`Remove one ${row.name}`}
                                                    disabled={!row.count}
                                                    onClick={() => changeCount(i, -1)}
                                                >
                                                    −
                                                </Button>
                                                <span
                                                    className="min-w-5 text-center tabular-nums"
                                                    style={countScale(row.count)}
                                                >
                                                    {row.count}
                                                </span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    aria-label={`Add one ${row.name}`}
                                                    disabled={used >= active.log.kills}
                                                    onClick={() => changeCount(i, 1)}
                                                >
                                                    +
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell style={countScale(row.median)}>
                                            {row.median}
                                        </TableCell>
                                        <TableCell style={differenceScale(row.difference)}>
                                            {row.difference === 0
                                                ? "At median"
                                                : `${Math.abs(row.difference)} ${row.difference > 0 ? "above" : "below"}`}
                                        </TableCell>
                                        <TableCell>
                                            {bossMoney(
                                                active.divine,
                                                row.valueChaos,
                                                null,
                                                valueScale,
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <p className="text-sm text-muted-foreground">
                        For each item, at least half of modeled rotas of this length finish with the
                        median count or fewer. Ties use the lower median.
                    </p>
                </>
            )}
        </section>
    );
}
