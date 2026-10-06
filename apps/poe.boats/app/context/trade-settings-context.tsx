import { createContext, type ReactNode, useCallback, useContext } from "react";
import { useStorageState } from "~/hooks/use-storage-state";
import {
    DEFAULT_TRADE_SETTINGS,
    loadTradeSettings,
    saveTradeSettings,
    type TradeSettings,
} from "~/lib/trade-settings";
import { updateTradeSettings } from "~/operations/preferences";

interface TradeSettingsContextValue {
    settings: TradeSettings;
    isHydrated: boolean;
    updateSettings: (updates: Partial<TradeSettings>) => void;
}

const TRADE_SETTINGS_CONTEXT = createContext<TradeSettingsContextValue | null>(null);

export function TradeSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings, isHydrated] = useStorageState(
        loadTradeSettings,
        saveTradeSettings,
        DEFAULT_TRADE_SETTINGS,
    );

    const updateSettings = useCallback(
        (updates: Partial<TradeSettings>) => {
            setSettings((prev) => updateTradeSettings(prev, updates));
        },
        [setSettings],
    );

    return (
        <TRADE_SETTINGS_CONTEXT.Provider
            value={{
                settings,
                isHydrated,
                updateSettings,
            }}
        >
            {children}
        </TRADE_SETTINGS_CONTEXT.Provider>
    );
}

export function useTradeSettings(): TradeSettingsContextValue {
    const context = useContext(TRADE_SETTINGS_CONTEXT);
    if (!context) {
        throw new Error("useTradeSettings must be used within a TradeSettingsProvider");
    }
    return context;
}
