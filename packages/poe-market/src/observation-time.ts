export function marketObservationRange(at?: number, now = Date.now() / 1000) {
    const completedHour = Math.floor(now / 3600) * 3600 - 3600;
    const latestHour = Math.min(
        at === undefined ? completedHour : Math.floor(at / 3600) * 3600,
        completedHour,
    );
    return { earliestHour: Math.max(0, latestHour - 23 * 3600), latestHour };
}
