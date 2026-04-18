import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { z } from "zod";
import leaguesData from "~/data/leagues.json";
import { loadFromStorage, saveToStorage } from "~/lib/storage-utils";
import {
    DEFAULT_LEAGUE,
    DEFAULT_REALM,
    type League,
    type Realm,
    RealmSchema,
} from "~/schemas/league";

const STORAGE_KEY = "poe-idol-planner-league";

const LEAGUE_SETTINGS_SCHEMA = z.object({
    league: z.string(),
    realm: RealmSchema,
});

type LeagueSettings = z.infer<typeof LEAGUE_SETTINGS_SCHEMA>;

const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
    league: DEFAULT_LEAGUE,
    realm: DEFAULT_REALM,
};

interface LeagueContextValue {
    league: string;
    realm: Realm;
    leagues: League[];
    setLeague: (league: string) => void;
    setRealm: (realm: Realm) => void;
    isHydrated: boolean;
}

const LEAGUE_CONTEXT = createContext<LeagueContextValue | null>(null);

function loadLeagueSettings(): LeagueSettings {
    return loadFromStorage(STORAGE_KEY, LEAGUE_SETTINGS_SCHEMA, DEFAULT_LEAGUE_SETTINGS);
}

function saveLeagueSettings(settings: LeagueSettings): void {
    saveToStorage(STORAGE_KEY, settings);
}

export function LeagueProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<LeagueSettings>({
        league: DEFAULT_LEAGUE,
        realm: DEFAULT_REALM,
    });
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        const loaded = loadLeagueSettings();
        const leaguesForRealm = leaguesData.result.filter((l) => l.realm === loaded.realm);
        const leagueExists = leaguesForRealm.some((l) => l.id === loaded.league);
        if (!leagueExists && leaguesForRealm.length > 0) {
            loaded.league = leaguesForRealm[0].id;
        }
        setSettings(loaded);
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!isHydrated) return;
        saveLeagueSettings(settings);
    }, [settings, isHydrated]);

    const leagues = leaguesData.result.filter((l) => l.realm === settings.realm) as League[];

    const setLeague = useCallback((league: string) => {
        setSettings((prev) => ({ ...prev, league }));
    }, []);

    const setRealm = useCallback((realm: Realm) => {
        setSettings((prev) => {
            const leaguesForRealm = leaguesData.result.filter((l) => l.realm === realm);
            const currentLeagueExists = leaguesForRealm.some((l) => l.id === prev.league);
            return {
                realm,
                league: currentLeagueExists
                    ? prev.league
                    : (leaguesForRealm[0]?.id ?? DEFAULT_LEAGUE),
            };
        });
    }, []);

    return (
        <LEAGUE_CONTEXT.Provider
            value={{
                league: settings.league,
                realm: settings.realm,
                leagues,
                setLeague,
                setRealm,
                isHydrated,
            }}
        >
            {children}
        </LEAGUE_CONTEXT.Provider>
    );
}

export function useLeague(): LeagueContextValue {
    const context = useContext(LEAGUE_CONTEXT);
    if (!context) {
        throw new Error("useLeague must be used within a LeagueProvider");
    }
    return context;
}
