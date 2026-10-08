import { useEffect, useState } from "react";
import { type ItemPresentations, itemPresentationsSchema } from "~/lib/item-presentation";

const catalogs = new Map<string, Promise<ItemPresentations>>();
const empty: ItemPresentations = {};

export function useItemPresentations(game?: "poe1" | "poe2") {
    const selectedGame =
        game ??
        (typeof window !== "undefined" && window.location.pathname.startsWith("/2/")
            ? "poe2"
            : "poe1");
    const [loaded, setLoaded] = useState<{ game: string; items: ItemPresentations }>();
    useEffect(() => {
        let active = true;
        let pending = catalogs.get(selectedGame);
        if (!pending) {
            pending = fetch(`/game-data/items-${selectedGame}.json`).then(async (response) => {
                if (!response.ok) throw new Error("Item artwork catalog unavailable");
                return itemPresentationsSchema.parse(await response.json());
            });
            catalogs.set(selectedGame, pending);
        }
        pending
            .then((catalog) => {
                if (active) setLoaded({ game: selectedGame, items: catalog });
            })
            .catch(() => {
                catalogs.delete(selectedGame);
            });
        return () => {
            active = false;
        };
    }, [selectedGame]);
    return loaded?.game === selectedGame ? loaded.items : empty;
}
