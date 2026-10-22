import { expect, it } from "vite-plus/test";
import { parseRateLimit } from "../src/rate-limit.ts";

it("preserves every rate-limit window and its corresponding current state", () => {
    const parsed = parseRateLimit(
        new Headers({
            "x-rate-limit-policy": "public-stash-tabs",
            "x-rate-limit-rules": "client, ip",
            "x-rate-limit-client": "10:5:10, 100:60:60",
            "x-rate-limit-client-state": "8:5:0, 95:60:0",
            "x-rate-limit-ip": "30:60:120",
            "x-rate-limit-ip-state": "31:60:90",
            "retry-after": "90",
        }),
    );
    expect(parsed).toEqual({
        policy: "public-stash-tabs",
        retryAfterSeconds: 90,
        rules: [
            {
                rule: "client",
                maxHits: 10,
                periodSeconds: 5,
                restrictionSeconds: 10,
                currentHits: 8,
                currentPeriodSeconds: 5,
                currentRestrictionSeconds: 0,
            },
            {
                rule: "client",
                maxHits: 100,
                periodSeconds: 60,
                restrictionSeconds: 60,
                currentHits: 95,
                currentPeriodSeconds: 60,
                currentRestrictionSeconds: 0,
            },
            {
                rule: "ip",
                maxHits: 30,
                periodSeconds: 60,
                restrictionSeconds: 120,
                currentHits: 31,
                currentPeriodSeconds: 60,
                currentRestrictionSeconds: 90,
            },
        ],
    });
});

it("skips malformed or missing window pairs without shifting later states", () => {
    const parsed = parseRateLimit(
        new Headers({
            "x-rate-limit-rules": "client",
            "x-rate-limit-client": "malformed,100:60:60,1000:3600:3600",
            "x-rate-limit-client-state": "8:5:0,95:60:0",
        }),
    );
    expect(parsed.rules).toEqual([
        {
            rule: "client",
            maxHits: 100,
            periodSeconds: 60,
            restrictionSeconds: 60,
            currentHits: 95,
            currentPeriodSeconds: 60,
            currentRestrictionSeconds: 0,
        },
    ]);
});

it("keeps absent rate-limit headers optional", () => {
    expect(parseRateLimit(new Headers())).toEqual({
        policy: undefined,
        retryAfterSeconds: undefined,
        rules: [],
    });
});
