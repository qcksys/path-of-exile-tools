import { type TDatabase, workerDatabaseCacheScopes } from "~/db/client";

export async function exchangePricingCache(
    db: TDatabase,
    realm: string,
    league: string,
    hour: number,
    revision: string | undefined,
) {
    const scope = workerDatabaseCacheScopes.get(db);
    if (!scope || !revision || typeof caches === "undefined") return undefined;
    const store = await caches.open("exchange-pricing-v1").catch(() => undefined);
    if (!store) return undefined;
    const key = new URL(`https://${scope.host}/exchange-pricing/v1`);
    key.search = new URLSearchParams({
        db: scope.source,
        realm,
        league,
        hour: String(hour),
        revision,
    }).toString();
    return { store, key };
}

export type ExchangePricingCache = NonNullable<Awaited<ReturnType<typeof exchangePricingCache>>>;

function partKey(cache: ExchangePricingCache, part: string) {
    const key = new URL(cache.key);
    key.searchParams.set("part", part);
    return key.href;
}

export function readExchangeValue<T>(cache: ExchangePricingCache, part: string) {
    return cache.store
        .match(partKey(cache, part))
        .then((response) => response?.json<T>())
        .catch(() => undefined);
}

export function writeExchangeValue(cache: ExchangePricingCache, part: string, value: unknown) {
    // Coverage invalidates growing digests. Bound the age of same-count corrections, too.
    return cache.store
        .put(
            partKey(cache, part),
            Response.json(value, { headers: { "Cache-Control": "max-age=300" } }),
        )
        .then(
            () => true,
            () => false,
        );
}

export async function cachedExchangeValue<T>(
    cache: ExchangePricingCache | undefined,
    part: string,
    load: () => Promise<T>,
) {
    if (!cache) return { value: await load(), status: "bypass" };
    const hit = await readExchangeValue<T>(cache, part);
    if (hit !== undefined) return { value: hit, status: "hit" };
    const value = await load();
    const stored = await writeExchangeValue(cache, part, value);
    return { value, status: stored ? "miss" : "bypass" };
}
