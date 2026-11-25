const formats = new Map<string, Intl.DateTimeFormat>();

/**
 * An instant as `2026-11-26 14:00 AEDT` in `timeZone`. The zone is named as the browser's
 * language names it, so the same zone may read `GMT+11` in another language.
 */
export function formatTime(at: number, timeZone: string, { seconds = false } = {}) {
    const key = `${timeZone} ${seconds}`;
    let format = formats.get(key);
    if (!format) {
        format = new Intl.DateTimeFormat(undefined, {
            timeZone,
            calendar: "gregory",
            numberingSystem: "latn",
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            ...(seconds && { second: "2-digit" }),
            timeZoneName: "short",
        });
        formats.set(key, format);
    }
    const part = Object.fromEntries(
        format.formatToParts(at).map(({ type, value }) => [type, value]),
    );
    const time = `${part.hour}:${part.minute}${seconds ? `:${part.second}` : ""}`;
    return `${part.year}-${part.month}-${part.day} ${time} ${part.timeZoneName}`;
}

let zone: string | undefined;

/** The browser's IANA time zone, read once per page load. */
export function browserTimeZone() {
    zone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone;
}
