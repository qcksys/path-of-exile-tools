import { createContext, type ReactNode, useCallback, useContext } from "react";
import leaguesData from "~/data/leagues.json";
import { useStorageState } from "~/hooks/use-storage-state";
import { loadFromStorage, saveToStorage } from "~/lib/storage-utils";
import { LeagueSettingsSchema, resolveLeagueSettings } from "~/operations/preferences";
import { DEFAULT_LEAGUE, DEFAULT_REALM, type League, type Realm } from "~/schemas/league";

const STORAGE_KEY = "poe-idol-planner-league";

type LeagueSettings = { league: string; realm: Realm };

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
    return resolveLeagueSettings(
        loadFromStorage(STORAGE_KEY, LeagueSettingsSchema, DEFAULT_LEAGUE_SETTINGS),
    );
}

function saveLeagueSettings(settings: LeagueSettings): void {
    saveToStorage(STORAGE_KEY, settings);
}

export function LeagueProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings, isHydrated] = useStorageState(
        loadLeagueSettings,
        saveLeagueSettings,
        DEFAULT_LEAGUE_SETTINGS,
    );

    const leagues = leaguesData.result.filter((l) => l.realm === settings.realm) as League[];

    const setLeague = useCallback(
        (league: string) => {
            setSettings((prev) => resolveLeagueSettings({ ...prev, league }));
        },
        [setSettings],
    );

    const setRealm = useCallback(
        (realm: Realm) => {
            setSettings((prev) => resolveLeagueSettings({ ...prev, realm }));
        },
        [setSettings],
    );

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
