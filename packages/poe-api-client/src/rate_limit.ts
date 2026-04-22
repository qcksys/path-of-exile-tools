/**
 * Parse GGG rate-limit response headers.
 *
 * Every response from `api.pathofexile.com` carries a set of
 * `X-Rate-Limit-*` headers describing the policy that applies and the
 * current state against each rule. Exceeding limits repeatedly can get a
 * client's access revoked, so well-behaved clients inspect these headers
 * and throttle themselves.
 *
 * @see https://www.pathofexile.com/developer/docs/index
 */

export interface RateLimitRule {
  /** Rule name, e.g. `ip`, `account`, `client`. */
  rule: string;
  /** Maximum number of hits allowed in the period. */
  maxHits: number;
  /** Period, in seconds, over which hits are counted. */
  periodSeconds: number;
  /** Duration, in seconds, a client is blocked after exceeding the rule. */
  restrictionSeconds: number;
  /** Current number of hits against the rule. */
  currentHits: number;
  /** Current period, in seconds (as reported by the server). */
  currentPeriodSeconds: number;
  /** Remaining restriction time, in seconds. */
  currentRestrictionSeconds: number;
}

export interface RateLimitInfo {
  /** Value of `X-Rate-Limit-Policy`, if present. */
  policy?: string;
  /** Parsed rules, one per entry in `X-Rate-Limit-Rules`. */
  rules: RateLimitRule[];
  /** Value of `Retry-After`, in seconds, if the server sent one. */
  retryAfterSeconds?: number;
}

function parseTriple(raw: string | null): [number, number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(":").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined;
  return parts as [number, number, number];
}

export function parseRateLimit(headers: Headers): RateLimitInfo {
  const policy = headers.get("x-rate-limit-policy") ?? undefined;
  const rulesHeader = headers.get("x-rate-limit-rules");
  const retryAfter = headers.get("retry-after");

  const rules: RateLimitRule[] = [];
  if (rulesHeader) {
    for (const rule of rulesHeader
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean)) {
      const limit = parseTriple(headers.get(`x-rate-limit-${rule}`));
      const state = parseTriple(headers.get(`x-rate-limit-${rule}-state`));
      if (!limit || !state) continue;
      rules.push({
        rule,
        maxHits: limit[0],
        periodSeconds: limit[1],
        restrictionSeconds: limit[2],
        currentHits: state[0],
        currentPeriodSeconds: state[1],
        currentRestrictionSeconds: state[2],
      });
    }
  }

  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;

  return {
    policy,
    rules,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
  };
}
