import { describe, expect, it } from "vite-plus/test";
import { MIN_GAP_MS, parseRateLimitRules, RateLimiter, retryAfterSeconds } from "@/lib/rate-limit";

const headers = (state: string, restriction = "") => ({
    "X-Rate-Limit-Policy": "trade-search-request-limit",
    "X-Rate-Limit-Rules": "Ip,Account",
    "X-Rate-Limit-Ip": "8:10:60,15:60:120",
    "X-Rate-Limit-Ip-State": state,
    "X-Rate-Limit-Account": "3:5:60",
    "X-Rate-Limit-Account-State": restriction || "1:5:0",
});

describe("rate-limit headers", () => {
    it("parses rules, windows and state", () => {
        expect(parseRateLimitRules(headers("2:10:0,3:60:0"))).toEqual([
            {
                name: "ip",
                windows: [
                    { max: 8, period: 10, restriction: 60 },
                    { max: 15, period: 60, restriction: 120 },
                ],
                state: [
                    { hits: 2, period: 10, restricted: 0 },
                    { hits: 3, period: 60, restricted: 0 },
                ],
            },
            {
                name: "account",
                windows: [{ max: 3, period: 5, restriction: 60 }],
                state: [{ hits: 1, period: 5, restricted: 0 }],
            },
        ]);
        expect(parseRateLimitRules({})).toEqual([]);
        expect(retryAfterSeconds({ "Retry-After": "30" })).toBe(30);
        expect(retryAfterSeconds({})).toBeNull();
    });
});

describe("rate limiter", () => {
    it("keeps a minimum gap between requests of one kind", () => {
        const limiter = new RateLimiter();
        expect(limiter.waitMs("poe1:search", 0)).toBe(0);
        limiter.sentAt("poe1:search", 0);
        expect(limiter.waitMs("poe1:search", 500)).toBe(MIN_GAP_MS - 500);
        expect(limiter.waitMs("poe1:fetch", 500)).toBe(0);
    });

    it("waits for a window to clear one request before its limit", () => {
        const limiter = new RateLimiter();
        limiter.sentAt("poe1:search", 0);
        limiter.record("poe1:search", headers("7:10:0,7:60:0"), 100);
        // 7 hits of 8 leaves no room once one request of margin is kept.
        expect(limiter.waitMs("poe1:search", 2_000)).toBe(10_000 - 2_000);
        limiter.record("poe1:search", headers("1:10:0,1:60:0"), 100);
        expect(limiter.waitMs("poe1:search", 2_000)).toBe(0);
    });

    it("counts its own requests made since the last response", () => {
        const limiter = new RateLimiter();
        limiter.record("poe2:fetch", headers("1:10:0,1:60:0", "1:5:0"), 0);
        limiter.sentAt("poe2:fetch", 2_000);
        // Account: 1 hit + 1 sent since = 2 of an allowed 3 - 1.
        expect(limiter.waitMs("poe2:fetch", 4_000)).toBe(2_000 + 5_000 - 4_000);
    });

    it("forgets hits once their window has passed", () => {
        const limiter = new RateLimiter();
        limiter.record("poe1:search", headers("7:10:0,7:60:0"), 0);
        expect(limiter.waitMs("poe1:search", 61_000)).toBe(0);
    });

    it("waits out an active restriction", () => {
        const limiter = new RateLimiter();
        limiter.record("poe1:search", headers("1:10:0,1:60:0", "3:5:60"), 1_000);
        expect(limiter.waitMs("poe1:search", 2_000)).toBe(60_000 - 1_000);
    });
});
