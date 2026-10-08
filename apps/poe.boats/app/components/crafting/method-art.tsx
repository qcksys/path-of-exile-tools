import { CatalogItemArt } from "~/components/item-art";
import type { CraftingCatalog, CraftingMethod } from "~/schemas/crafting";

export function MethodArt({
    method,
    game,
}: {
    method: CraftingMethod;
    game: CraftingCatalog["game"];
}) {
    const ids =
        method.kind === "fossils"
            ? [method.resonator, ...method.ids]
            : "id" in method && method.id.startsWith("Metadata/Items/")
              ? [method.id]
              : [];
    if ("omens" in method) ids.push(...(method.omens ?? []));
    return ids.length ? (
        <span className="inline-flex shrink-0 flex-wrap items-center gap-1 align-middle">
            {[...new Set(ids)].map((id) => (
                <CatalogItemArt key={id} id={id} game={game} />
            ))}
        </span>
    ) : null;
}
