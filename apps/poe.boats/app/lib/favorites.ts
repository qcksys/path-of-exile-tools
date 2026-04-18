import { z } from "zod";
import { loadFromStorage, saveToStorage } from "~/lib/storage-utils";

const FAVORITES_KEY = "poe-idol-planner-favorite-mods";

const FAVORITES_SCHEMA = z.object({
    modIds: z.array(z.string()),
});

type FavoritesData = z.infer<typeof FAVORITES_SCHEMA>;

const DEFAULT_FAVORITES: FavoritesData = { modIds: [] };

// Default favorite mods - valuable generic mods that most players want
// These IDs correspond to mods in idol-modifiers.json
export const DEFAULT_FAVORITE_MOD_PATTERNS = [
    "quantity", // Increased Quantity of Items found
    "rarity", // Increased Rarity of Items found
    "pack_size", // Increased Pack Size
    "magic_monster", // Additional Magic Monsters
    "rare_monster", // Additional Rare Monsters
];

export function loadFavorites(): string[] {
    return loadFromStorage(FAVORITES_KEY, FAVORITES_SCHEMA, DEFAULT_FAVORITES).modIds;
}

export function saveFavorites(modIds: string[]): void {
    saveToStorage(FAVORITES_KEY, { modIds } satisfies FavoritesData);
}

export function addFavorite(modId: string): string[] {
    const current = loadFavorites();
    if (current.includes(modId)) return current;
    const updated = [...current, modId];
    saveFavorites(updated);
    return updated;
}

export function removeFavorite(modId: string): string[] {
    const current = loadFavorites();
    const updated = current.filter((id) => id !== modId);
    saveFavorites(updated);
    return updated;
}

export function toggleFavorite(modId: string): {
    favorites: string[];
    isFavorite: boolean;
} {
    const current = loadFavorites();
    const isFavorite = current.includes(modId);
    const updated = isFavorite ? current.filter((id) => id !== modId) : [...current, modId];
    saveFavorites(updated);
    return { favorites: updated, isFavorite: !isFavorite };
}
