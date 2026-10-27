import {
    backgroundToTradeSchema,
    type ContentToBackground,
    MAIN_REQUEST,
    mainResponseSchema,
    type TradeResponse,
} from "@/lib/messages";
import { TRADE_MATCHES } from "@/lib/origins";

/** How long a trade request may take before it counts as failed. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Announces a trade tab to the background worker and passes its requests to the main-world
 * script, which makes them as the trade page.
 */
export default defineContentScript({
    matches: TRADE_MATCHES,
    runAt: "document_idle",
    main(ctx) {
        const pending = new Map<string, (response: TradeResponse) => void>();
        const fromMain = (event: MessageEvent) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const parsed = mainResponseSchema.safeParse(event.data);
            if (!parsed.success) return;
            pending.get(parsed.data.id)?.(parsed.data.response);
            pending.delete(parsed.data.id);
        };
        const fromBackground = (
            raw: unknown,
            _sender: unknown,
            respond: (response: TradeResponse) => void,
        ) => {
            const parsed = backgroundToTradeSchema.safeParse(raw);
            if (!parsed.success) return false;
            const id = crypto.randomUUID();
            pending.set(id, respond);
            ctx.setTimeout(() => {
                if (pending.delete(id)) respond({ status: 0, headers: {}, body: null });
            }, REQUEST_TIMEOUT_MS);
            window.postMessage(
                { source: MAIN_REQUEST, id, request: parsed.data.request },
                window.location.origin,
            );
            return true;
        };
        window.addEventListener("message", fromMain);
        browser.runtime.onMessage.addListener(fromBackground);
        ctx.onInvalidated(() => {
            window.removeEventListener("message", fromMain);
            browser.runtime.onMessage.removeListener(fromBackground);
        });
        void browser.runtime.sendMessage({
            kind: "tradeReady",
            game: window.location.pathname.startsWith("/trade2") ? "poe2" : "poe1",
        } satisfies ContentToBackground);
    },
});
