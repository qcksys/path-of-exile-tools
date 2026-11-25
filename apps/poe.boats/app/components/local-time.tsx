import { useSyncExternalStore } from "react";
import { browserTimeZone, formatTime } from "~/lib/local-time";
import { cn } from "~/lib/utils";

const subscribe = () => () => {};

/**
 * The browser's time zone, or null while the server renders and the client hydrates. The server
 * cannot know the zone, so anything formatted with it waits until hydration has finished.
 */
export function useTimeZone() {
    return useSyncExternalStore(subscribe, browserTimeZone, () => null);
}

/** An instant (epoch milliseconds) in the browser's time zone, with a skeleton until it is known. */
export function LocalTime({
    at,
    seconds = false,
    className,
}: {
    at: number;
    seconds?: boolean;
    className?: string;
}) {
    const timeZone = useTimeZone();
    if (timeZone === null)
        return (
            <span
                aria-hidden="true"
                data-slot="local-time-skeleton"
                className={cn(
                    "inline-block h-[1em] animate-pulse rounded bg-muted align-[-0.125em]",
                    seconds ? "w-[19ch]" : "w-[16ch]",
                    className,
                )}
            />
        );
    return (
        <time dateTime={new Date(at).toISOString()} className={className}>
            {formatTime(at, timeZone, { seconds })}
        </time>
    );
}
