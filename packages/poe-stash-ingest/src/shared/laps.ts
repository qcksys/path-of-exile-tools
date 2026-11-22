/** Seconds spent in each named section of a run of statements, for one timing log line. */
export class Laps {
    private last = performance.now();
    private readonly started = this.last;
    private readonly seconds = new Map<string, number>();

    /** Charges the time since the previous lap (or since creation) to `name`. */
    lap(name: string) {
        const now = performance.now();
        this.seconds.set(name, (this.seconds.get(name) ?? 0) + (now - this.last) / 1000);
        this.last = now;
    }

    /** Such as "12.3 s (sales 1.0, hours 11.3)". */
    toString() {
        const sections = [...this.seconds]
            .map(([name, seconds]) => `${name} ${seconds.toFixed(1)}`)
            .join(", ");
        return `${((this.last - this.started) / 1000).toFixed(1)} s (${sections})`;
    }
}
