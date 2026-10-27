import {
    type ExtensionMessage,
    type ListingBatch,
    type PageMessage,
    type StageDecision,
    type TradeGame,
    tradePageUrl,
} from "@poe-tools/trade-bridge";
import { storage } from "@wxt-dev/storage";
import { contentToBackgroundSchema, type TradeRequest, tradeResponseSchema } from "@/lib/messages";
import { runPricing, type StartRun } from "@/lib/pricing-run";
import { RateLimiter } from "@/lib/rate-limit";
import { createStoredBatches } from "@/lib/stored-batches";

/** A page that takes longer than this to decide on a batch is treated as closed. */
const DECISION_TIMEOUT_MS = 120_000;
const TRADE_TAB_TIMEOUT_MS = 30_000;
/** Chrome stops an idle service worker after 30 seconds; extension API calls keep a run alive. */
const KEEP_ALIVE_MS = 20_000;

type ActiveRun = {
    run: StartRun;
    pageTabId: number;
    cancelled: boolean;
    decisions: Map<string, (decision: StageDecision) => void>;
};

export default defineBackground(() => {
    const batchesItem = storage.defineItem<ListingBatch[]>("local:batches", { fallback: [] });
    const stored = createStoredBatches({
        get: () => batchesItem.getValue(),
        set: (value) => batchesItem.setValue(value),
    });
    const limiter = new RateLimiter();
    const tradeTabs = new Map<TradeGame, number>();
    const tradeWaiters = new Map<TradeGame, ((tabId: number) => void)[]>();
    let active: ActiveRun | null = null;

    const toPage = (tabId: number, message: ExtensionMessage) =>
        browser.tabs.sendMessage(tabId, { kind: "toPage", message }).catch(() => undefined);

    async function openTradeTab(game: TradeGame) {
        const ready = new Promise<number>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("The pathofexile.com trade page did not load.")),
                TRADE_TAB_TIMEOUT_MS,
            );
            tradeWaiters.set(game, [
                ...(tradeWaiters.get(game) ?? []),
                (tabId) => {
                    clearTimeout(timer);
                    resolve(tabId);
                },
            ]);
        });
        await browser.tabs.create({ url: tradePageUrl(game), active: false });
        return ready;
    }

    async function request(game: TradeGame, tradeRequest: TradeRequest) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const tabId = tradeTabs.get(game) ?? (await openTradeTab(game));
            try {
                return tradeResponseSchema.parse(
                    await browser.tabs.sendMessage(tabId, {
                        kind: "tradeRequest",
                        request: tradeRequest,
                    }),
                );
            } catch (error) {
                // The tab was closed or navigated away from the trade site; open a new one.
                tradeTabs.delete(game);
                if (attempt) throw error;
            }
        }
        throw new Error("The trade page is unavailable.");
    }

    function cancel(current: ActiveRun) {
        current.cancelled = true;
        for (const resolve of current.decisions.values()) resolve("done");
        current.decisions.clear();
    }

    function start(run: StartRun, pageTabId: number) {
        if (active) {
            void toPage(pageTabId, {
                kind: "runFinished",
                runId: run.runId,
                graphId: run.graphId,
                outcome: "stopped",
                reason: "Another pricing run is in progress in this browser.",
            });
            return;
        }
        const current: ActiveRun = { run, pageTabId, cancelled: false, decisions: new Map() };
        active = current;
        const keepAlive = setInterval(() => void browser.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
        void runPricing(run, limiter, {
            request,
            sleep: async (ms) => {
                const end = Date.now() + ms;
                while (!current.cancelled && Date.now() < end)
                    await new Promise((resolve) =>
                        setTimeout(resolve, Math.min(500, end - Date.now())),
                    );
            },
            now: Date.now,
            emit: (message) => void toPage(current.pageTabId, message),
            decide: async (batch) => {
                await stored.add(batch);
                return new Promise<StageDecision>((resolve) => {
                    current.decisions.set(batch.batchId, resolve);
                    void toPage(current.pageTabId, { kind: "batch", ...batch });
                    setTimeout(() => {
                        if (!current.decisions.delete(batch.batchId)) return;
                        cancel(current);
                        resolve("done");
                    }, DECISION_TIMEOUT_MS);
                });
            },
            cancelled: () => current.cancelled,
            id: () => crypto.randomUUID(),
        }).finally(() => {
            clearInterval(keepAlive);
            if (active === current) active = null;
        });
    }

    async function fromPage(message: PageMessage, tabId: number) {
        switch (message.kind) {
            case "startRun":
                start(message, tabId);
                return;
            case "decide": {
                const resolve = active?.decisions.get(message.batchId);
                active?.decisions.delete(message.batchId);
                await stored.remove([message.batchId]);
                resolve?.(message.decision);
                return;
            }
            case "cancelRun":
                if (active?.run.runId === message.runId) cancel(active);
                return;
            case "collect": {
                const batches = await stored.forGraph(message.graphId, active?.run.runId);
                if (batches.length)
                    await toPage(tabId, { kind: "stored", graphId: message.graphId, batches });
                return;
            }
            case "acknowledge":
                await stored.remove(message.batchIds);
                return;
            case "hello":
                return;
        }
    }

    browser.runtime.onMessage.addListener((raw, sender) => {
        const parsed = contentToBackgroundSchema.safeParse(raw);
        const tabId = sender.tab?.id;
        if (!parsed.success || tabId === undefined) return;
        if (parsed.data.kind === "tradeReady") {
            const { game } = parsed.data;
            tradeTabs.set(game, tabId);
            for (const resolve of tradeWaiters.get(game) ?? []) resolve(tabId);
            tradeWaiters.delete(game);
            return;
        }
        void fromPage(parsed.data.message, tabId);
    });

    browser.tabs.onRemoved.addListener((tabId) => {
        for (const [game, id] of tradeTabs) if (id === tabId) tradeTabs.delete(game);
        if (active?.pageTabId === tabId) cancel(active);
    });
});
