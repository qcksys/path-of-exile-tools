/**
 * Pacing from the trade site's rate-limit headers, as described in GGG's developer docs:
 * `X-Rate-Limit-Rules` names the rules, `X-Rate-Limit-{rule}` lists `max:period:restriction`
 * windows and `X-Rate-Limit-{rule}-State` lists `hits:period:active restriction` for each window.
 */

type Window = { max: number; period: number; restriction: number };
type WindowState = { hits: number; period: number; restricted: number };
type Rule = { name: string; windows: Window[]; state: WindowState[] };
type Policy = { at: number; rules: Rule[] };

/** Smallest gap between two requests of the same kind, even when the headers allow more. */
export const MIN_GAP_MS = 1_500;

function triples(value: string | undefined) {
    return (value ?? "")
        .split(",")
        .map((part) => part.trim().split(":").map(Number))
        .filter(
            (parts): parts is [number, number, number] =>
                parts.length === 3 && parts.every((part) => Number.isFinite(part) && part >= 0),
        );
}

export function parseRateLimitRules(headers: Record<string, string>): Rule[] {
    const lower = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    return (lower["x-rate-limit-rules"] ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
        .map((name) => ({
            name,
            windows: triples(lower[`x-rate-limit-${name}`]).map(([max, period, restriction]) => ({
                max,
                period,
                restriction,
            })),
            state: triples(lower[`x-rate-limit-${name}-state`]).map(
                ([hits, period, restricted]) => ({ hits, period, restricted }),
            ),
        }));
}

/** Seconds from a `Retry-After` header, if present. */
export function retryAfterSeconds(headers: Record<string, string>) {
    const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === "retry-after");
    const seconds = Number(entry?.[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Tracks the latest limits per request kind (search and fetch have separate policies) and the
 * requests this extension made, and says how long to wait before the next request.
 */
export class RateLimiter {
    private readonly policies = new Map<string, Policy>();
    private readonly sent = new Map<string, number[]>();

    record(kind: string, headers: Record<string, string>, at: number) {
        const rules = parseRateLimitRules(headers);
        if (rules.length) this.policies.set(kind, { at, rules });
    }

    sentAt(kind: string, at: number) {
        const times = (this.sent.get(kind) ?? []).filter((time) => time > at - 3_600_000);
        times.push(at);
        this.sent.set(kind, times);
    }

    /** Milliseconds to wait before the next request of this kind. */
    waitMs(kind: string, now: number) {
        const sent = this.sent.get(kind) ?? [];
        const last = sent.at(-1);
        let wait = last === undefined ? 0 : last + MIN_GAP_MS - now;
        const policy = this.policies.get(kind);
        if (!policy) return Math.max(0, wait);
        for (const rule of policy.rules)
            for (const window of rule.windows) {
                const period = window.period * 1000;
                const state = rule.state.find((entry) => entry.period === window.period);
                if (state?.restricted)
                    wait = Math.max(wait, policy.at + state.restricted * 1000 - now);
                const ours = sent.filter((time) => time > now - period);
                const projected =
                    now - policy.at >= period
                        ? ours.length
                        : (state?.hits ?? 0) + sent.filter((time) => time > policy.at).length;
                const allowed = window.max > 2 ? window.max - 1 : window.max;
                if (projected + 1 > allowed)
                    wait = Math.max(wait, (ours[0] ?? policy.at) + period - now);
            }
        return Math.max(0, wait);
    }
}
