import { MAIN_RESPONSE, mainRequestSchema } from "@/lib/messages";
import { TRADE_MATCHES } from "@/lib/origins";
import { performTradeRequest } from "@/lib/trade-request";

/**
 * Runs in the trade page's own context so requests are the page's own same-origin requests.
 * Only trade search and fetch paths are allowed.
 */
export default defineContentScript({
    matches: TRADE_MATCHES,
    world: "MAIN",
    runAt: "document_start",
    main() {
        window.addEventListener("message", async (event) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const parsed = mainRequestSchema.safeParse(event.data);
            if (!parsed.success) return;
            let response: Awaited<ReturnType<typeof performTradeRequest>>;
            try {
                response = await performTradeRequest(parsed.data.request);
            } catch {
                response = { status: 0, headers: {}, body: null };
            }
            window.postMessage(
                { source: MAIN_RESPONSE, id: parsed.data.id, response },
                window.location.origin,
            );
        });
    },
});
