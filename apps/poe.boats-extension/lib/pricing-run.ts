import {
    type ExtensionMessage,
    type ListingBatch,
    type PageMessage,
    type StageDecision,
    scrubTradeListing,
    TRADE_FETCH_LIMIT,
    type TradeGame,
    type TradeSale,
    tradeFetchPath,
    tradeFetchResponseSchema,
    tradeSearchPath,
    tradeSearchResponseSchema,
} from "@poe-tools/trade-bridge";
import type { TradeRequest, TradeResponse } from "./messages";
import { type RateLimiter, retryAfterSeconds } from "./rate-limit";

export type StartRun = Extract<PageMessage, { kind: "startRun" }>;

/** Most fetches of 10 listings made for one search. */
const MAX_FETCHES = 2;

export interface PricingRunDependencies {
    request(game: TradeGame, request: TradeRequest): Promise<TradeResponse>;
    sleep(ms: number): Promise<void>;
    now(): number;
    emit(message: ExtensionMessage): void;
    /** Hand a batch to the page and wait for its decision. */
    decide(batch: ListingBatch): Promise<StageDecision>;
    cancelled(): boolean;
    id(): string;
}

class RunStopped extends Error {
    constructor(
        message: string,
        readonly details: { signIn?: boolean; retryAt?: string } = {},
    ) {
        super(message);
    }
}
class RunCancelled extends Error {}

/**
 * Search and fetch each stage's listings one request at a time, paced by the trade site's
 * rate-limit headers. Any error response stops the whole run; stages already priced keep their
 * prices on the page.
 */
export async function runPricing(
    run: StartRun,
    limiter: RateLimiter,
    dependencies: PricingRunDependencies,
) {
    const { emit } = dependencies;
    async function send(
        stageId: string,
        sale: TradeSale,
        kind: "search" | "fetch",
        request: TradeRequest,
    ) {
        const key = `${run.game}:${kind}`;
        const wait = limiter.waitMs(key, dependencies.now());
        if (wait > 0) {
            emit({
                kind: "progress",
                runId: run.runId,
                stageId,
                step: "waiting",
                sale,
                waitUntil: new Date(dependencies.now() + wait).toISOString(),
            });
            await dependencies.sleep(wait);
        }
        if (dependencies.cancelled()) throw new RunCancelled();
        emit({
            kind: "progress",
            runId: run.runId,
            stageId,
            step: kind === "search" ? "searching" : "fetching",
            sale,
        });
        limiter.sentAt(key, dependencies.now());
        const response = await dependencies.request(run.game, request);
        limiter.record(key, response.headers, dependencies.now());
        if (response.status === 401 || response.status === 403)
            throw new RunStopped("Sign in on pathofexile.com in this browser, then try again.", {
                signIn: true,
            });
        if (response.status === 429) {
            const seconds = retryAfterSeconds(response.headers) ?? 60;
            throw new RunStopped("The trade site asked to slow down.", {
                retryAt: new Date(dependencies.now() + seconds * 1000).toISOString(),
            });
        }
        if (response.status < 200 || response.status >= 300)
            throw new RunStopped(`The trade site returned an error (${response.status}).`);
        return response.body;
    }

    async function priceStage(stage: StartRun["stages"][number]) {
        let sale: TradeSale = "instant";
        let payload = stage.instant;
        for (;;) {
            const search = tradeSearchResponseSchema.safeParse(
                await send(stage.stageId, sale, "search", {
                    method: "POST",
                    path: tradeSearchPath(run.game, run.league),
                    body: payload,
                }),
            );
            if (!search.success)
                throw new RunStopped(
                    "The trade site's search response was not recognised. Update the extension.",
                );
            const { id: queryId, result: ids, total } = search.data;
            let fetches = 0;
            let decision: StageDecision = "done";
            do {
                const slice = ids.slice(
                    fetches * TRADE_FETCH_LIMIT,
                    (fetches + 1) * TRADE_FETCH_LIMIT,
                );
                let listings: ListingBatch["listings"] = [];
                if (slice.length) {
                    const fetched = tradeFetchResponseSchema.safeParse(
                        await send(stage.stageId, sale, "fetch", {
                            method: "GET",
                            path: tradeFetchPath(run.game, slice, queryId),
                        }),
                    );
                    if (!fetched.success)
                        throw new RunStopped(
                            "The trade site's listing response was not recognised. Update the extension.",
                        );
                    listings = fetched.data.result.flatMap((entry) => {
                        const listing = scrubTradeListing(entry, sale);
                        return listing ? [listing] : [];
                    });
                }
                fetches++;
                if (dependencies.cancelled()) throw new RunCancelled();
                decision = await dependencies.decide({
                    runId: run.runId,
                    graphId: run.graphId,
                    batchId: dependencies.id(),
                    stageId: stage.stageId,
                    stageKey: stage.stageKey,
                    fetches,
                    sale,
                    total,
                    available: ids.length,
                    listings,
                    receivedAt: new Date(dependencies.now()).toISOString(),
                });
                if (dependencies.cancelled()) throw new RunCancelled();
            } while (
                decision === "more" &&
                fetches < MAX_FETCHES &&
                fetches * TRADE_FETCH_LIMIT < ids.length
            );
            if (decision !== "in-person" || sale !== "instant" || !stage.inPerson) return;
            sale = "in-person";
            payload = stage.inPerson;
        }
    }

    try {
        for (const stage of run.stages) await priceStage(stage);
        emit({ kind: "runFinished", runId: run.runId, graphId: run.graphId, outcome: "done" });
    } catch (error) {
        if (error instanceof RunCancelled) {
            emit({
                kind: "runFinished",
                runId: run.runId,
                graphId: run.graphId,
                outcome: "cancelled",
                reason: "Pricing was cancelled.",
            });
            return;
        }
        emit({
            kind: "runFinished",
            runId: run.runId,
            graphId: run.graphId,
            outcome: "stopped",
            reason:
                error instanceof Error ? error.message : "The pricing run stopped unexpectedly.",
            ...(error instanceof RunStopped ? error.details : {}),
        });
    }
}
