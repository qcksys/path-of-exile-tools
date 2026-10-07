/**
 * Type definitions for the Path of Exile GGG Developer API.
 *
 * Response field names preserve the exact casing used by the API (often
 * `snake_case`) so that the JSON returned by `fetch` can be used
 * directly without any transformation step.
 *
 * @see https://www.pathofexile.com/developer/docs/reference
 */

/* -------------------------------------------------------------------------- */
/*  Common                                                                    */
/* -------------------------------------------------------------------------- */

/** Game realm. Most PoE1 endpoints default to `pc` when omitted. */
export type Realm = "pc" | "xbox" | "sony" | "poe2";

export type LeagueType = "main" | "event" | "season";

export type FilterType = "Normal" | "Ruthless";

export type LadderSort = "xp" | "depth" | "depthsolo" | "ancestor" | "time" | "score" | "class";

/** Character class filter used by ladder queries (0–6). */
export type CharacterClassFilter = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */

export interface Profile {
    uuid: string;
    name: string;
    locale?: string;
    realm?: Realm;
    guild?: {
        name: string;
    };
    twitch?: {
        name: string;
        stream?: {
            name: string;
            image: string;
            status: string;
        };
    };
}

/* -------------------------------------------------------------------------- */
/*  Item                                                                      */
/* -------------------------------------------------------------------------- */

export interface ItemMod {
    description: string;
    flags?: {
        fractured?: boolean;
        mutated?: boolean;
        crafted?: boolean;
        desecrated?: boolean;
        vestigial?: boolean;
    };
}

export interface ItemProperty {
    name: string;
    values: Array<[string, number]>;
    /**
     * DisplayMode:
     * - `0` — Name should be followed by values
     * - `1` — Values should be followed by name
     * - `2` — Progress bar
     * - `3` — Values should be inserted into the string by index
     * - `4` — Separator
     */
    displayMode?: number;
    /** Rounded to 2 decimal places. */
    progress?: number;
    type?: number;
    suffix?: string;
}

export interface ItemSocket {
    group: number;
    attr?: "S" | "D" | "I" | "G" | "A" | "DV";
    sColour?: "R" | "G" | "B" | "W" | "A" | "DV";
}

export interface ItemInfluences {
    elder?: boolean;
    shaper?: boolean;
    searing?: boolean;
    tangled?: boolean;
    crusader?: boolean;
    redeemer?: boolean;
    hunter?: boolean;
    warlord?: boolean;
}

export interface ItemExtended {
    category?: string;
    subcategories?: string[];
    prefixes?: number;
    suffixes?: number;
}

/**
 * Equipment, inventory and stash item. The API's item object is a
 * catch-all; most fields are optional depending on context.
 */
export interface Item {
    verified: boolean;
    w: number;
    h: number;
    icon: string;
    support?: boolean;
    stackSize?: number;
    maxStackSize?: number;
    league?: string;
    id?: string;
    gemSockets?: string[];
    influences?: ItemInfluences;
    memoryItem?: boolean;
    mutated?: boolean;
    builtInSupport?: boolean;
    monsterLevel?: number;
    abyssJewel?: boolean;
    delve?: boolean;
    fractured?: boolean;
    synthesised?: boolean;
    sockets?: ItemSocket[];
    socketedItems?: Item[];
    name: string;
    typeLine: string;
    baseType: string;
    rarity?: "Normal" | "Magic" | "Rare" | "Unique" | "Currency" | "Gem" | "Relic";
    identified: boolean;
    itemLevel?: number;
    ilvl?: number;
    note?: string;
    forum_note?: string;
    lockedToCharacter?: boolean;
    lockedToAccount?: boolean;
    duplicated?: boolean;
    split?: boolean;
    corrupted?: boolean;
    doubleCorrupted?: boolean;
    sanctified?: boolean;
    unmodifiable?: boolean;
    properties?: ItemProperty[];
    requirements?: ItemProperty[];
    additionalProperties?: ItemProperty[];
    nextLevelRequirements?: ItemProperty[];
    utilityMods?: string[];
    enchantMods?: string[];
    implicitMods?: Array<string | ItemMod>;
    explicitMods?: Array<string | ItemMod>;
    craftedMods?: string[];
    fracturedMods?: string[];
    scourgeMods?: string[];
    crucibleMods?: string[];
    logbookMods?: unknown[];
    descrText?: string;
    flavourText?: string[];
    prophecyText?: string;
    isRelic?: boolean;
    foilVariation?: number;
    replica?: boolean;
    /** Deprecated by the API; retained for historical payloads. */
    frameType?: number;
    /** Optional here so historical payloads remain replayable. */
    frameTypeId?: string;
    artFilename?: string;
    hybrid?: {
        isVaalGem?: boolean;
        baseTypeName: string;
        properties?: ItemProperty[];
        explicitMods?: string[];
        secDescrText?: string;
    };
    extended?: ItemExtended;
    inventoryId?: string;
    socket?: number;
    colour?: string;
    x?: number;
    y?: number;
}

/* -------------------------------------------------------------------------- */
/*  Character                                                                 */
/* -------------------------------------------------------------------------- */

export interface PassiveJewelData {
    type: string;
    radius?: number;
    radiusMin?: number;
    radiusVisual?: string;
    subgraph?: {
        groups: Record<string, unknown>;
        nodes?: Record<string, unknown>;
    };
}

export interface CharacterPassives {
    hashes: number[];
    hashes_ex: number[];
    mastery_effects: Record<string, number>;
    specialisations?: Record<string, unknown>;
    skill_overrides?: Record<string, unknown>;
    bandit_choice?: string;
    pantheon_major?: string;
    pantheon_minor?: string;
    jewel_data?: Record<string, PassiveJewelData>;
    quest_stats?: unknown[];
    alternate_ascendancy?: string;
}

export interface CharacterSummary {
    /** A _unique_ 64 digit hexadecimal string. */
    id: string;
    name: string;
    realm: Realm;
    class: string;
    league?: string;
    level: number;
    experience: number;
    ruthless?: boolean;
    expired?: boolean;
    deleted?: boolean;
    current?: boolean;
    lastActive?: boolean;
}

/**
 * > The character requested including their equipment, inventory, and passive
 * > skill information.
 */
export interface Character extends CharacterSummary {
    equipment?: Item[];
    skills?: Item[];
    inventory?: Item[];
    rucksack?: Item[];
    jewels?: Item[];
    passives?: CharacterPassives;
    metadata?: {
        version?: string;
    };
}

/* -------------------------------------------------------------------------- */
/*  League                                                                    */
/* -------------------------------------------------------------------------- */

export interface LeagueRule {
    /** Examples: `Hardcore`, `NoParties` (SSF). */
    id: string;
    name: string;
    description?: string;
}

export interface LeagueCategory {
    id: string;
    current?: boolean;
}

export interface League {
    id: string;
    realm?: Realm;
    description?: string;
    category?: LeagueCategory;
    rules?: LeagueRule[];
    registerAt?: string;
    event?: boolean;
    url?: string;
    startAt?: string;
    endAt?: string;
    timedEvent?: boolean;
    scoreEvent?: boolean;
    delveEvent?: boolean;
    ancestorEvent?: boolean;
    leagueEvent?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Ladders                                                                   */
/* -------------------------------------------------------------------------- */

export interface LadderAccount {
    name: string;
    realm?: Realm;
    guild?: {
        id?: number;
        name: string;
        tag?: string;
    };
    challenges?: {
        set: string;
        completed: number;
        max: number;
    };
    twitch?: {
        name: string;
        stream?: {
            name: string;
            image: string;
            status: string;
        };
    };
}

export interface LadderCharacter {
    id: string;
    name: string;
    level: number;
    class: string;
    time?: number;
    score?: number;
    progress?: Record<string, unknown>;
    experience?: number;
    depth?: {
        default?: number;
        solo?: number;
    };
}

export interface LadderEntry {
    rank: number;
    dead?: boolean;
    retired?: boolean;
    ineligible?: boolean;
    public?: boolean;
    character: LadderCharacter;
    account?: LadderAccount;
}

/**
 * > Each ladder only contains the top 15000 entries. Attempting to fetch
 * > entries beyond this will return an empty result.
 */
export interface Ladder {
    total: number;
    cached_since?: string;
    entries: LadderEntry[];
}

/* -------------------------------------------------------------------------- */
/*  PvP                                                                       */
/* -------------------------------------------------------------------------- */

export interface PvpMatch {
    /** The match's name. */
    id: string;
    realm?: Realm;
    startAt?: string;
    endAt?: string;
    url?: string;
    description?: string;
    glickoRatings?: boolean;
    /** Always `true`. */
    pvp?: boolean;
    /** `Blitz`, `Swiss`, or `Arena`. */
    style?: string;
    registerAt?: string;
    /** Always `true` if present. */
    complete?: boolean;
    /** Always `true` if present. */
    upcoming?: boolean;
    /** Always `true` if present. */
    inProgress?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Stash                                                                     */
/* -------------------------------------------------------------------------- */

export interface StashMetadata {
    public?: boolean;
    folder?: boolean;
    colour?: string;
    map?: {
        section?: string;
        name?: string;
        image?: string;
    };
}

/**
 * > A list of all the account's stash tabs in the specified league. This
 * > includes sub-tabs and stash tabs in folders.
 */
export interface StashTab {
    /** A 10 digit hexadecimal string. */
    id: string;
    /** A 10 digit hexadecimal string. */
    parent?: string;
    folder?: boolean;
    name: string;
    type: string;
    index?: number;
    metadata?: StashMetadata;
    children?: StashTab[];
    items?: Item[];
}

/* -------------------------------------------------------------------------- */
/*  Item filter                                                               */
/* -------------------------------------------------------------------------- */

export interface ItemFilterValidation {
    valid: boolean;
    version?: string;
    validated?: string;
}

export interface ItemFilter {
    id: string;
    filter_name: string;
    realm: Realm;
    description?: string;
    version?: string;
    type: FilterType;
    /** Always `true` if present. */
    public?: boolean;
    /** Not present when listing all filters. */
    filter: string;
    /** Not present when listing all filters. */
    validation?: ItemFilterValidation;
}

/**
 * Body for `POST /item-filter` (create) and `POST /item-filter/{id}` (update).
 *
 * > Please note: A public filter cannot be made private again.
 */
export interface ItemFilterInput {
    filter_name: string;
    realm: Realm;
    description?: string;
    version?: string;
    type: FilterType;
    public?: boolean;
    filter: string;
}

/* -------------------------------------------------------------------------- */
/*  League account                                                            */
/* -------------------------------------------------------------------------- */

export interface LeagueAccount {
    atlas_passives?: {
        hashes?: number[];
    };
    atlas_passive_trees?: Array<{
        name: string;
        hashes: number[];
    }>;
}

/* -------------------------------------------------------------------------- */
/*  Public stash stream                                                       */
/* -------------------------------------------------------------------------- */

export interface PublicStashChange {
    /** A _unique_ 64 digit hexadecimal string. */
    id: string;
    public: boolean;
    accountName?: string;
    /** The name of the stash. */
    stash?: string;
    lastCharacterName?: string;
    stashType: string;
    /** The league's name. */
    league?: string;
    items: Item[];
}

/**
 * > A stream containing all public stashes in all leagues for the given realm.
 *
 * > Providing the `next_change_id` as the `id` query parameter serves as a
 * > way to paginate through current and newly listed stashes.
 *
 * > There is currently a 5-minute delay on results using this API.
 */
export interface PublicStashPage {
    next_change_id: string;
    stashes: PublicStashChange[];
}

/* -------------------------------------------------------------------------- */
/*  Currency exchange                                                         */
/* -------------------------------------------------------------------------- */

/**
 * > Each market (pair of two currencies) that has seen activity in the
 * > requested hour will be returned.
 */
export interface CurrencyMarket {
    league: string;
    /** Canonical base item IDs separated by a pipe, in upstream hash order. */
    market_id: string;
    market_pair?: string[];
    /** Keys are canonical base item IDs, including exchangeable essences and other items. */
    volume_traded: Record<string, number>;
    lowest_stock: Record<string, number>;
    highest_stock: Record<string, number>;
    lowest_ratio: Record<string, number>;
    highest_ratio: Record<string, number>;
}

/**
 * > This endpoint allows you to view aggregate Currency Exchange trade history,
 * > grouped into hourly digests.
 *
 * > Note that the responses from this endpoint are purely historical and that
 * > there isn't any way to get data from the current hour.
 *
 * > If the `next_change_id` is the same unix timestamp as the one you passed
 * > in, then you have reached the current end of the stream.
 *
 * > Be aware that we may, at a later date, remove old history entries.
 */
export interface CurrencyExchangeSnapshot {
    /**
     * Unix timestamp (seconds, hour-aligned) of the *next* hour to fetch.
     * Feed this back as the `id` query parameter on the next request to
     * paginate forward. When `next_change_id` equals the `id` you sent, the
     * stream has no newer hour yet — wait for the next hourly boundary.
     */
    next_change_id: number;
    markets: CurrencyMarket[];
}

/* -------------------------------------------------------------------------- */
/*  Response envelopes                                                        */
/* -------------------------------------------------------------------------- */

export interface LeaguesResponse {
    leagues: League[];
}
export interface LeagueResponse {
    league: League;
}
export interface LadderResponse {
    league: League;
    ladder: Ladder;
}
export interface EventLadderResponse {
    league: League;
    ladder: Ladder;
}
export interface PvpMatchesResponse {
    matches: PvpMatch[];
}
export interface PvpMatchResponse {
    match: PvpMatch;
}
export interface PvpLadderResponse {
    match: PvpMatch;
    ladder: Ladder;
}
export interface ProfileResponse {
    profile: Profile;
}
export interface AccountLeaguesResponse {
    leagues: League[];
}
export interface CharactersResponse {
    characters: CharacterSummary[];
}
export interface CharacterResponse {
    character: Character;
}
export interface StashesResponse {
    stashes: StashTab[];
}
export interface StashResponse {
    stash: StashTab;
}
export interface LeagueAccountResponse {
    league_account: LeagueAccount;
}
export interface GuildStashesResponse {
    stashes: StashTab[];
}
export interface GuildStashResponse {
    stash: StashTab;
}
export interface ItemFiltersResponse {
    filters: ItemFilter[];
}
export interface ItemFilterResponse {
    filter: ItemFilter;
}
