import ky, { HTTPError, type KyInstance } from "ky";
import { PoeApiError, type PoeErrorBody } from "./errors.ts";
import { parseRateLimit, type RateLimitInfo } from "./rate-limit.ts";
import type {
  AccountLeaguesResponse,
  CharacterClassFilter,
  CharacterResponse,
  CharactersResponse,
  CurrencyExchangeSnapshot,
  EventLadderResponse,
  GuildStashesResponse,
  GuildStashResponse,
  ItemFilter,
  ItemFilterInput,
  ItemFilterResponse,
  ItemFiltersResponse,
  LadderResponse,
  LadderSort,
  League,
  LeagueAccountResponse,
  LeagueResponse,
  LeaguesResponse,
  LeagueType,
  Profile,
  ProfileResponse,
  PublicStashPage,
  PvpLadderResponse,
  PvpMatch,
  PvpMatchesResponse,
  PvpMatchResponse,
  Realm,
  StashesResponse,
  StashResponse,
  StashTab,
} from "./types.ts";
import { buildUserAgent, type UserAgentParts } from "./user-agent.ts";

/**
 * Base URL of the Path of Exile Developer API.
 *
 * OAuth authorization lives on a different host — see {@link "./oauth.ts"}.
 */
export const POE_API_BASE_URL = "https://api.pathofexile.com";

/** Provider for the current OAuth access token. */
export type TokenProvider = string | (() => string | Promise<string>);

export interface ClientOptions {
  /** User-Agent identity required by GGG. Passed as parts or a pre-formatted string. */
  userAgent: UserAgentParts | string;
  /** OAuth bearer token, or a (possibly async) getter that returns one. */
  token: TokenProvider;
  /** Default realm inserted into path segments. Omit for endpoints that default to `pc`. */
  realm?: Realm;
  /** Override the API base URL (for testing / mocking). */
  baseUrl?: string;
  /** Called after every response with parsed rate-limit headers. */
  onRateLimit?: (info: RateLimitInfo) => void;
  /** Escape hatch: provide a fully custom `ky` instance. `userAgent` and `token` are still applied. */
  ky?: KyInstance;
}

/* -------------------------------------------------------------------------- */
/*  Path + query helpers                                                      */
/* -------------------------------------------------------------------------- */

function joinPath(segments: Array<string | undefined | null>): string {
  return segments
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function prunedSearchParams(
  params: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  HTTP instance                                                             */
/* -------------------------------------------------------------------------- */

async function resolveToken(token: TokenProvider): Promise<string> {
  return typeof token === "function" ? await token() : token;
}

function buildKy(options: ClientOptions): KyInstance {
  const userAgent =
    typeof options.userAgent === "string" ? options.userAgent : buildUserAgent(options.userAgent);

  const base =
    options.ky ??
    ky.create({
      baseUrl: options.baseUrl ?? POE_API_BASE_URL,
      headers: {
        "User-Agent": userAgent,
        accept: "application/json",
      },
      retry: {
        limit: 2,
        methods: ["get"],
        statusCodes: [408, 500, 502, 503, 504],
      },
    });

  return base.extend({
    hooks: {
      beforeRequest: [
        async ({ request }) => {
          const token = await resolveToken(options.token);
          request.headers.set("Authorization", `Bearer ${token}`);
        },
      ],
      afterResponse: [
        async ({ response }) => {
          const info = parseRateLimit(response.headers);
          options.onRateLimit?.(info);
          if (!response.ok) {
            let body: PoeErrorBody | string | undefined;
            try {
              body = (await response.clone().json()) as PoeErrorBody;
            } catch {
              try {
                body = await response.clone().text();
              } catch {
                body = undefined;
              }
            }
            throw new PoeApiError({
              status: response.status,
              statusText: response.statusText,
              response,
              body,
              rateLimit: info,
            });
          }
          return response;
        },
      ],
      beforeError: [
        ({ error }) => {
          // Translate any residual ky HTTPError (e.g. body-parse failures
          // that bypassed the afterResponse hook) into a PoeApiError.
          if (error instanceof HTTPError) {
            const info = parseRateLimit(error.response.headers);
            return new PoeApiError({
              status: error.response.status,
              statusText: error.response.statusText,
              response: error.response,
              body: undefined,
              rateLimit: info,
            });
          }
          return error;
        },
      ],
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Endpoint groups                                                           */
/* -------------------------------------------------------------------------- */

export interface ProfileApi {
  /** GET /profile — authenticated user profile. Scope: `account:profile`. */
  get(): Promise<Profile>;
}

export interface LeagueApi {
  /** GET /league — list leagues. Scope: `service:leagues`. */
  list(params?: {
    realm?: Realm;
    type?: LeagueType;
    limit?: number;
    offset?: number;
    season?: string;
  }): Promise<League[]>;
  /** GET /league/{league} — fetch a specific league. Scope: `service:leagues`. */
  get(league: string, params?: { realm?: Realm }): Promise<League>;
  /** GET /league/{league}/ladder — league ladder (PoE1). Scope: `service:leagues:ladder`. */
  ladder(
    league: string,
    params?: {
      realm?: Realm;
      sort?: LadderSort;
      limit?: number;
      offset?: number;
      class?: CharacterClassFilter;
    },
  ): Promise<LadderResponse>;
  /** GET /league/{league}/event-ladder — event ladder (PoE1). Scope: `service:leagues:ladder`. */
  eventLadder(
    league: string,
    params?: { realm?: Realm; limit?: number; offset?: number },
  ): Promise<EventLadderResponse>;
}

export interface PvpApi {
  /** GET /pvp-match — list PvP matches (PoE1). Scope: `service:pvp_matches`. */
  list(params?: {
    realm?: Realm;
    type?: string;
    season?: string;
    league?: string;
  }): Promise<PvpMatch[]>;
  /** GET /pvp-match/{match} — fetch a match (PoE1). Scope: `service:pvp_matches`. */
  get(match: string, params?: { realm?: Realm }): Promise<PvpMatch>;
  /** GET /pvp-match/{match}/ladder — match ladder (PoE1). Scope: `service:pvp_matches:ladder`. */
  ladder(
    match: string,
    params?: { realm?: Realm; limit?: number; offset?: number },
  ): Promise<PvpLadderResponse>;
}

export interface AccountApi {
  /** GET /account/leagues[/{realm}] — user's available leagues (PoE1). Scope: `account:leagues`. */
  leagues(realm?: Realm): Promise<League[]>;
  /** GET /character[/{realm}] — list characters. Scope: `account:characters`. */
  characters(realm?: Realm): Promise<CharactersResponse["characters"]>;
  /** GET /character[/{realm}]/{name} — fetch a specific character. Scope: `account:characters`. */
  character(name: string, realm?: Realm): Promise<CharacterResponse["character"]>;
  /** GET /stash[/{realm}]/{league} — list stash tabs (PoE1). Scope: `account:stashes`. */
  stashes(league: string, realm?: Realm): Promise<StashTab[]>;
  /** GET /stash[/{realm}]/{league}/{stash_id}[/{substash_id}] — stash contents (PoE1). Scope: `account:stashes`. */
  stash(
    league: string,
    stashId: string,
    params?: { substashId?: string; realm?: Realm },
  ): Promise<StashTab>;
  /** GET /league-account[/{realm}]/{league} — league-specific account data (PoE1). Scope: `account:league_accounts`. */
  leagueAccount(league: string, realm?: Realm): Promise<LeagueAccountResponse["league_account"]>;
}

export interface GuildApi {
  /** GET /guild[/{realm}]/stash/{league} — list guild stashes (PoE1). Scope: `account:guild:stashes`. */
  stashes(league: string, realm?: Realm): Promise<StashTab[]>;
  /** GET /guild[/{realm}]/stash/{league}/{stash_id}[/{substash_id}] — guild stash contents (PoE1). Scope: `account:guild:stashes`. */
  stash(
    league: string,
    stashId: string,
    params?: { substashId?: string; realm?: Realm },
  ): Promise<StashTab>;
}

export interface ItemFilterApi {
  /** GET /item-filter — list item filters. Scope: `account:item_filter`. */
  list(): Promise<ItemFilter[]>;
  /** GET /item-filter/{id} — fetch an item filter. Scope: `account:item_filter`. */
  get(id: string, params?: { validate?: boolean }): Promise<ItemFilter>;
  /** POST /item-filter — create an item filter. Scope: `account:item_filter`. */
  create(input: ItemFilterInput): Promise<ItemFilter>;
  /** POST /item-filter/{id} — update an item filter (partial). Scope: `account:item_filter`. */
  update(id: string, input: Partial<ItemFilterInput>): Promise<ItemFilter>;
}

export interface PublicApi {
  /**
   * GET /public-stash-tabs[/{realm}] — stream public stash changes.
   * Scope: `service:psapi`. Use the returned `next_change_id` as `id`
   * in the following call to paginate forward.
   */
  stashTabs(params?: { realm?: Realm; id?: string }): Promise<PublicStashPage>;
  /**
   * GET /currency-exchange[/{realm}][/{id}] — currency exchange snapshot.
   * Scope: `service:cxapi`.
   *
   * `id` is a unix timestamp (seconds, hour-aligned) identifying which
   * hourly digest to fetch. The endpoint is purely historical — the
   * in-progress current hour is not exposed.
   *
   * Pagination semantics (verified against the live API, 2026-04):
   *   - **Omitting `id`** returns the *oldest* archived hour, not the
   *     stream tail. Fresh consumers walking forward from there can face
   *     tens of thousands of hours of backlog. To jump to recent data,
   *     pass `id` near `now - 3600` (the previous completed hour).
   *   - **With `id=X`** the response describes hour `X` and sets
   *     `next_change_id` to the next hour to fetch (typically `X + 3600`).
   *     Feed `next_change_id` back as `id` on the next call to advance.
   *   - **Tail detection**: when `response.next_change_id === id`, you
   *     have reached the most recent completed hour. Wait until the
   *     next hourly boundary before polling again.
   *
   * @see CurrencyExchangeSnapshot
   */
  currencyExchange(params?: { realm?: Realm; id?: number }): Promise<CurrencyExchangeSnapshot>;
}

/* -------------------------------------------------------------------------- */
/*  Client                                                                    */
/* -------------------------------------------------------------------------- */

export interface PoeApiClient {
  /** Underlying `ky` instance, for endpoints not yet covered. */
  readonly http: KyInstance;
  readonly profile: ProfileApi;
  readonly league: LeagueApi;
  readonly pvp: PvpApi;
  readonly account: AccountApi;
  readonly guild: GuildApi;
  readonly itemFilter: ItemFilterApi;
  readonly public: PublicApi;
}

/**
 * Create a typed Path of Exile API client.
 *
 * @example
 * ```ts
 * const poe = createClient({
 *   userAgent: { clientId: "my-app", version: "1.0.0", contact: "me@example.com" },
 *   token: async () => (await loadCached()).accessToken,
 * });
 * const profile = await poe.profile.get();
 * ```
 */
export function createClient(options: ClientOptions): PoeApiClient {
  const http = buildKy(options);
  const defaultRealm = options.realm;

  const realm = (override?: Realm): Realm | undefined => override ?? defaultRealm;

  return {
    http,

    profile: {
      async get() {
        const data = await http.get("profile").json<ProfileResponse | Profile>();
        return "profile" in data ? data.profile : data;
      },
    },

    league: {
      async list(params) {
        const data = await http
          .get("league", {
            searchParams: prunedSearchParams({
              realm: params?.realm,
              type: params?.type,
              limit: params?.limit,
              offset: params?.offset,
              season: params?.season,
            }),
          })
          .json<LeaguesResponse | League[]>();
        return Array.isArray(data) ? data : data.leagues;
      },
      async get(league, params) {
        const data = await http
          .get(joinPath(["league", league]), {
            searchParams: prunedSearchParams({ realm: params?.realm }),
          })
          .json<LeagueResponse | League>();
        return "league" in data ? data.league : data;
      },
      async ladder(league, params) {
        return http
          .get(joinPath(["league", league, "ladder"]), {
            searchParams: prunedSearchParams({
              realm: params?.realm,
              sort: params?.sort,
              limit: params?.limit,
              offset: params?.offset,
              class: params?.class,
            }),
          })
          .json<LadderResponse>();
      },
      async eventLadder(league, params) {
        return http
          .get(joinPath(["league", league, "event-ladder"]), {
            searchParams: prunedSearchParams({
              realm: params?.realm,
              limit: params?.limit,
              offset: params?.offset,
            }),
          })
          .json<EventLadderResponse>();
      },
    },

    pvp: {
      async list(params) {
        const data = await http
          .get("pvp-match", {
            searchParams: prunedSearchParams({
              realm: params?.realm,
              type: params?.type,
              season: params?.season,
              league: params?.league,
            }),
          })
          .json<PvpMatchesResponse | PvpMatch[]>();
        return Array.isArray(data) ? data : data.matches;
      },
      async get(match, params) {
        const data = await http
          .get(joinPath(["pvp-match", match]), {
            searchParams: prunedSearchParams({ realm: params?.realm }),
          })
          .json<PvpMatchResponse | PvpMatch>();
        return "match" in data ? data.match : data;
      },
      async ladder(match, params) {
        return http
          .get(joinPath(["pvp-match", match, "ladder"]), {
            searchParams: prunedSearchParams({
              realm: params?.realm,
              limit: params?.limit,
              offset: params?.offset,
            }),
          })
          .json<PvpLadderResponse>();
      },
    },

    account: {
      async leagues(override) {
        const data = await http
          .get(joinPath(["account", "leagues", realm(override)]))
          .json<AccountLeaguesResponse | League[]>();
        return Array.isArray(data) ? data : data.leagues;
      },
      async characters(override) {
        const data = await http
          .get(joinPath(["character", realm(override)]))
          .json<CharactersResponse>();
        return data.characters;
      },
      async character(name, override) {
        const data = await http
          .get(joinPath(["character", realm(override), name]))
          .json<CharacterResponse>();
        return data.character;
      },
      async stashes(league, override) {
        const data = await http
          .get(joinPath(["stash", realm(override), league]))
          .json<StashesResponse | StashTab[]>();
        return Array.isArray(data) ? data : data.stashes;
      },
      async stash(league, stashId, params) {
        const data = await http
          .get(joinPath(["stash", realm(params?.realm), league, stashId, params?.substashId]))
          .json<StashResponse>();
        return data.stash;
      },
      async leagueAccount(league, override) {
        const data = await http
          .get(joinPath(["league-account", realm(override), league]))
          .json<LeagueAccountResponse>();
        return data.league_account;
      },
    },

    guild: {
      async stashes(league, override) {
        const data = await http
          .get(joinPath(["guild", realm(override), "stash", league]))
          .json<GuildStashesResponse | StashTab[]>();
        return Array.isArray(data) ? data : data.stashes;
      },
      async stash(league, stashId, params) {
        const data = await http
          .get(
            joinPath(["guild", realm(params?.realm), "stash", league, stashId, params?.substashId]),
          )
          .json<GuildStashResponse>();
        return data.stash;
      },
    },

    itemFilter: {
      async list() {
        const data = await http.get("item-filter").json<ItemFiltersResponse>();
        return data.filters;
      },
      async get(id, params) {
        const data = await http
          .get(joinPath(["item-filter", id]), {
            searchParams: prunedSearchParams({ validate: params?.validate }),
          })
          .json<ItemFilterResponse>();
        return data.filter;
      },
      async create(input) {
        const data = await http.post("item-filter", { json: input }).json<ItemFilterResponse>();
        return data.filter;
      },
      async update(id, input) {
        const data = await http
          .post(joinPath(["item-filter", id]), { json: input })
          .json<ItemFilterResponse>();
        return data.filter;
      },
    },

    public: {
      async stashTabs(params) {
        return http
          .get(joinPath(["public-stash-tabs", params?.realm]), {
            searchParams: prunedSearchParams({ id: params?.id }),
          })
          .json<PublicStashPage>();
      },
      async currencyExchange(params) {
        return http
          .get(
            joinPath([
              "currency-exchange",
              params?.realm,
              params?.id !== undefined ? String(params.id) : undefined,
            ]),
          )
          .json<CurrencyExchangeSnapshot>();
      },
    },
  };
}
