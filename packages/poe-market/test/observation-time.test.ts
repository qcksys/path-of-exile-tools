import { describe, expect, it } from "vite-plus/test";
import { marketObservationRange } from "../src/observation-time.ts";

describe("market observation age policy", () => {
    const hour = 1792666800;
    const now = hour + 5400;
    it("uses only the latest 24 completed UTC hours", () => {
        expect(marketObservationRange(undefined, now)).toEqual({
            earliestHour: hour - 23 * 3600,
            latestHour: hour,
        });
        expect(marketObservationRange(undefined, hour + 3600).latestHour).toBe(hour);
    });
    it("keeps historical cutoffs inclusive and refuses incomplete or future hours", () => {
        expect(marketObservationRange(hour - 100 * 3600, now).latestHour).toBe(hour - 100 * 3600);
        expect(marketObservationRange(hour + 86400, now).latestHour).toBe(hour);
        expect(marketObservationRange(0, now)).toEqual({ earliestHour: 0, latestHour: 0 });
    });
});
