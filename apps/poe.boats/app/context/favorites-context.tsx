import { createContext, type ReactNode, useCallback, useContext } from "react";
import { useStorageState } from "~/hooks/use-storage-state";
import { loadFavorites, saveFavorites } from "~/lib/favorites";
import { editFavorites } from "~/operations/preferences";

interface FavoritesContextValue {
    favorites: string[];
    isHydrated: boolean;
    addFavorite: (modId: string) => void;
    removeFavorite: (modId: string) => void;
    toggleFavorite: (modId: string) => void;
    isFavorite: (modId: string) => boolean;
}

const FAVORITES_CONTEXT = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
    const [favorites, setFavorites, isHydrated] = useStorageState(loadFavorites, saveFavorites, []);

    const addFavorite = useCallback(
        (modId: string) => {
            setFavorites((prev) => editFavorites(prev, modId, "add"));
        },
        [setFavorites],
    );

    const removeFavorite = useCallback(
        (modId: string) => {
            setFavorites((prev) => editFavorites(prev, modId, "remove"));
        },
        [setFavorites],
    );

    const toggleFavorite = useCallback(
        (modId: string) => {
            setFavorites((prev) => editFavorites(prev, modId, "toggle"));
        },
        [setFavorites],
    );

    const isFavorite = useCallback((modId: string) => favorites.includes(modId), [favorites]);

    return (
        <FAVORITES_CONTEXT.Provider
            value={{
                favorites,
                isHydrated,
                addFavorite,
                removeFavorite,
                toggleFavorite,
                isFavorite,
            }}
        >
            {children}
        </FAVORITES_CONTEXT.Provider>
    );
}

export function useFavorites(): FavoritesContextValue {
    const context = useContext(FAVORITES_CONTEXT);
    if (!context) {
        throw new Error("useFavorites must be used within a FavoritesProvider");
    }
    return context;
}
