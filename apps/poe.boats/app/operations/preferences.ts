import { z } from "zod";
import leagues from "~/data/leagues.json";
import { DEFAULT_TRADE_SETTINGS, TRADE_SETTINGS_SCHEMA } from "~/lib/trade-settings";
import { DEFAULT_LEAGUE, DEFAULT_REALM, RealmSchema } from "~/schemas/league";
import { defineOperation } from "./operation";

export const LeagueSettingsSchema = z.object({ league: z.string().max(100), realm: RealmSchema });
export function resolveLeagueSettings(input: z.input<typeof LeagueSettingsSchema>) {
    const settings = LeagueSettingsSchema.parse(input);
    const available = leagues.result.filter((league) => league.realm === settings.realm);
    return {
        ...settings,
        league: available.some((league) => league.id === settings.league)
            ? settings.league
            : (available[0]?.id ?? DEFAULT_LEAGUE),
    };
}

export function editFavorites(
    current: string[],
    modId: string,
    action: "add" | "remove" | "toggle",
) {
    const remove = action === "remove" || (action === "toggle" && current.includes(modId));
    return remove ? current.filter((id) => id !== modId) : [...new Set([...current, modId])];
}

export function updateTradeSettings(
    current: z.infer<typeof TRADE_SETTINGS_SCHEMA>,
    updates: Partial<z.infer<typeof TRADE_SETTINGS_SCHEMA>>,
) {
    return TRADE_SETTINGS_SCHEMA.parse({ ...current, ...updates });
}

const common = {
    family: "preferences",
    method: "post",
    access: "public",
    readOnly: true,
    ui: "/1/idol-planner",
} as const;
export const preferenceOperations = [
    defineOperation({
        ...common,
        path: "/league",
        name: "select_planner_league",
        description:
            "Resolve a supplied league and realm using the league selector's fallback rules. Returns settings to store in the caller's local state.",
        input: LeagueSettingsSchema,
        output: LeagueSettingsSchema,
        execute: resolveLeagueSettings,
    }),
    defineOperation({
        ...common,
        path: "/favorites",
        name: "edit_favorite_modifiers",
        description: "Add, remove, or toggle a favorite in supplied local settings.",
        input: z.object({
            favorites: z.array(z.string()).max(5000),
            modId: z.string().min(1).max(200),
            action: z.enum(["add", "remove", "toggle"]),
        }),
        output: z.object({ favorites: z.array(z.string()) }),
        execute: ({ favorites, modId, action }) => ({
            favorites: editFavorites(favorites, modId, action),
        }),
    }),
    defineOperation({
        ...common,
        path: "/trade",
        name: "update_trade_settings",
        description:
            "Apply and validate changes to the trade-search weight settings, returning updated local settings.",
        input: z.object({
            settings: TRADE_SETTINGS_SCHEMA.default(DEFAULT_TRADE_SETTINGS),
            updates: TRADE_SETTINGS_SCHEMA.partial(),
        }),
        output: TRADE_SETTINGS_SCHEMA,
        execute: ({ settings, updates }) => updateTradeSettings(settings, updates),
    }),
    defineOperation({
        ...common,
        method: "get",
        path: "/defaults",
        name: "get_planner_defaults",
        description: "Read the default league, realm, favorites, and trade settings.",
        input: z.object({}),
        output: z.object({
            league: LeagueSettingsSchema,
            favorites: z.array(z.string()),
            trade: TRADE_SETTINGS_SCHEMA,
        }),
        execute: () => ({
            league: { league: DEFAULT_LEAGUE, realm: DEFAULT_REALM },
            favorites: [],
            trade: DEFAULT_TRADE_SETTINGS,
        }),
    }),
];
