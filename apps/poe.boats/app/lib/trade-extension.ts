import {
    type ExtensionMessage,
    extensionEnvelopeSchema,
    type PageMessage,
    pageEnvelope,
} from "@poe-tools/trade-bridge";

/** How long to wait for the extension to answer before treating it as not installed. */
const DETECT_MS = 1500;

/**
 * Talks to the poe.boats browser extension through its content script on this page. Messages stay
 * on this window and origin; the extension never receives poe.boats or trade-site credentials.
 */
export function createTradeExtensionClient(target: Window = window) {
    const listeners = new Set<(message: ExtensionMessage) => void>();
    const receive = (event: MessageEvent) => {
        if (event.source !== target || event.origin !== target.location.origin) return;
        const envelope = extensionEnvelopeSchema.safeParse(event.data);
        if (envelope.success) for (const listener of listeners) listener(envelope.data.message);
    };
    target.addEventListener("message", receive);
    const subscribe = (listener: (message: ExtensionMessage) => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    const send = (message: PageMessage) =>
        target.postMessage(pageEnvelope(message), target.location.origin);
    return {
        send,
        subscribe,
        /** Resolves with the extension version, or null when it does not answer. */
        detect: () =>
            new Promise<string | null>((resolve) => {
                const timer = setTimeout(() => {
                    stop();
                    resolve(null);
                }, DETECT_MS);
                const stop = subscribe((message) => {
                    if (message.kind !== "ready") return;
                    clearTimeout(timer);
                    stop();
                    resolve(message.version);
                });
                send({ kind: "hello" });
            }),
        close: () => {
            target.removeEventListener("message", receive);
            listeners.clear();
        },
    };
}

export type TradeExtensionClient = ReturnType<typeof createTradeExtensionClient>;
