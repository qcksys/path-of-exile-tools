import { ItemName } from "~/components/item-art";
import type { VendorRecipe } from "~/schemas/arbitrage";

export function RecipeItems({
    recipe,
    artName,
}: {
    recipe: Pick<VendorRecipe, "input" | "output" | "game">;
    artName?: string;
}) {
    const game = recipe.game === "2" ? "poe2" : "poe1";
    return (
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1">
                {recipe.input.quantity} ×{" "}
                <ItemName name={recipe.input.name} artName={artName} game={game} />
            </span>
            <span>{" → "}</span>
            <span className="inline-flex items-center gap-1">
                {recipe.output.quantity} ×{" "}
                <ItemName name={recipe.output.name} artName={artName} game={game} />
            </span>
        </span>
    );
}
