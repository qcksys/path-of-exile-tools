import {
    BRIDGE_VERSION,
    type ExtensionMessage,
    extensionEnvelope,
    pageEnvelopeSchema,
} from "@poe-tools/trade-bridge";
import { backgroundToPageSchema, type ContentToBackground } from "@/lib/messages";
import { LOCAL_POE_BOATS_MATCHES, POE_BOATS_MATCHES } from "@/lib/origins";

/**
 * Relays bridge messages between a poe.boats page and the background worker. Development-only
 * origins are removed from store builds in wxt.config.ts.
 */
export default defineContentScript({
    matches: [...POE_BOATS_MATCHES, ...LOCAL_POE_BOATS_MATCHES],
    runAt: "document_start",
    main(ctx) {
        const post = (message: ExtensionMessage) =>
            window.postMessage(extensionEnvelope(message), window.location.origin);
        const fromPage = (event: MessageEvent) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const envelope = pageEnvelopeSchema.safeParse(event.data);
            if (!envelope.success) return;
            const { message } = envelope.data;
            if (message.kind === "hello") {
                post({
                    kind: "ready",
                    version: browser.runtime.getManifest().version,
                    bridge: BRIDGE_VERSION,
                });
                return;
            }
            if (envelope.data.bridge !== BRIDGE_VERSION) return;
            void browser.runtime.sendMessage({
                kind: "page",
                message,
            } satisfies ContentToBackground);
        };
        const fromBackground = (raw: unknown) => {
            const parsed = backgroundToPageSchema.safeParse(raw);
            if (parsed.success) post(parsed.data.message);
        };
        window.addEventListener("message", fromPage);
        browser.runtime.onMessage.addListener(fromBackground);
        ctx.onInvalidated(() => {
            window.removeEventListener("message", fromPage);
            browser.runtime.onMessage.removeListener(fromBackground);
        });
    },
});
