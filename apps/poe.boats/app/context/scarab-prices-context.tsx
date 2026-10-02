import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useLeague } from "~/context/league-context";
import { type ScarabPricesData, ScarabPricesDataSchema } from "~/schemas/scarab";

interface ScarabPricesState {
    data: ScarabPricesData | null;
    isLoading: boolean;
    error: string | null;
}

interface ScarabPricesContextValue {
    prices: ScarabPricesData["prices"] | null;
    isLoading: boolean;
    error: string | null;
    updatedAt: string | null;
    getPrice: (scarabId: string) => number | null;
    refetch: () => void;
}

const SCARAB_PRICES_CONTEXT = createContext<ScarabPricesContextValue | null>(null);

export function ScarabPricesProvider({ children }: { children: ReactNode }) {
    const { league, realm, isHydrated } = useLeague();
    const [state, setState] = useState<ScarabPricesState>({
        data: null,
        isLoading: false,
        error: null,
    });

    const fetchPrices = useCallback(async (leagueId: string) => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await fetch(
                `/1/idol-planner/api/prices/scarabs?league=${encodeURIComponent(leagueId)}`,
            );

            if (!response.ok) {
                if (response.status === 404) {
                    setState({
                        data: null,
                        isLoading: false,
                        error: null,
                    });
                    return;
                }
                throw new Error(`Failed to fetch prices: ${response.status}`);
            }

            const data = await response.json();
            const parsed = ScarabPricesDataSchema.safeParse(data);

            if (!parsed.success) {
                throw new Error("Invalid price data format");
            }

            setState({
                data: parsed.data,
                isLoading: false,
                error: null,
            });
        } catch (err) {
            setState({
                data: null,
                isLoading: false,
                error: err instanceof Error ? err.message : "Unknown error",
            });
        }
    }, []);

    useEffect(() => {
        if (!isHydrated) return;
        if (realm !== "pc") {
            setState({ data: null, isLoading: false, error: null });
            return;
        }
        fetchPrices(league);
    }, [league, realm, isHydrated, fetchPrices]);

    const getPrice = useCallback(
        (scarabId: string): number | null => {
            if (!state.data) return null;
            return state.data.prices[scarabId]?.chaosValue ?? null;
        },
        [state.data],
    );

    const refetch = useCallback(() => {
        fetchPrices(league);
    }, [fetchPrices, league]);

    return (
        <SCARAB_PRICES_CONTEXT.Provider
            value={{
                prices: state.data?.prices ?? null,
                isLoading: state.isLoading,
                error: state.error,
                updatedAt: state.data?.updatedAt ?? null,
                getPrice,
                refetch,
            }}
        >
            {children}
        </SCARAB_PRICES_CONTEXT.Provider>
    );
}

export function useScarabPrices(): ScarabPricesContextValue {
    const context = useContext(SCARAB_PRICES_CONTEXT);
    if (!context) {
        throw new Error("useScarabPrices must be used within a ScarabPricesProvider");
    }
    return context;
}
