import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import type { CraftingCatalog, CraftingMethod } from "~/schemas/crafting";
import { genesisEffect } from "../../../../../packages/poe-game-data/src/crafting-genesis";
import { controlClass } from "./method-picker";

export function GenesisOptions({
    catalog,
    method,
    onChange,
}: {
    catalog: CraftingCatalog;
    method: Extract<CraftingMethod, { kind: "genesis" }>;
    onChange: (method: CraftingMethod) => void;
}) {
    const passives = Object.entries(catalog.crafting.genesis!.passives).filter(
        ([, passive]) => passive.stats.length && passive.stats.every((stat) => genesisEffect(stat)),
    );
    const tiers = passives.filter(([, passive]) =>
        passive.stats.every((stat) => genesisEffect(stat)?.kind === "tier"),
    );
    const weights = passives.filter(([, passive]) =>
        passive.stats.some((stat) => genesisEffect(stat)?.kind === "weight"),
    );
    return (
        <section aria-label="Genesis Tree effects" className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
                Model one rare item of the selected base and item level, with up to four affixes
                within the base's limits. Apply the modifier effects allocated on your tree.
                Matching increases and reductions add together; tier rating removes the lowest
                eligible tiers without redistributing their weight.
            </p>
            <Label className="block space-y-1">
                Modifier tier rating bonuses
                <FormSelect
                    className={controlClass}
                    value={tiers.filter(([id]) => method.nodes.includes(id)).length}
                    onValueChange={(selectedValue) =>
                        onChange({
                            ...method,
                            nodes: [
                                ...method.nodes.filter(
                                    (id) => !tiers.some(([node]) => node === id),
                                ),
                                ...tiers.slice(0, Number(selectedValue)).map(([id]) => id),
                            ],
                        })
                    }
                >
                    {Array.from({ length: tiers.length + 1 }, (_, count) => count).map((count) => (
                        <FormSelectItem key={count} value={count}>
                            {count} bonuses · +
                            {tiers
                                .slice(0, count)
                                .reduce(
                                    (sum, [, passive]) =>
                                        sum +
                                        passive.stats.reduce((total, stat) => total + stat.min, 0),
                                    0,
                                )}{" "}
                            rating
                        </FormSelectItem>
                    ))}
                </FormSelect>
            </Label>
            <fieldset className="grid max-h-64 gap-2 overflow-y-auto rounded border p-3 sm:grid-cols-2">
                <legend className="px-1">Modifier chances</legend>
                {weights.map(([id, passive]) => (
                    <Label key={id} className="flex items-start gap-2 text-xs">
                        <Checkbox
                            checked={method.nodes.includes(id)}
                            onCheckedChange={(checked) =>
                                onChange({
                                    ...method,
                                    nodes: checked
                                        ? [...method.nodes, id]
                                        : method.nodes.filter((entry) => entry !== id),
                                })
                            }
                        />
                        {passive.text}
                    </Label>
                ))}
            </fieldset>
            <p className="text-xs text-muted-foreground">
                The result is conditional on this base and level. Price one such equipment item in
                the cost panel. Tree routing, base selection, extra rewards and other tree effects
                are outside this modifier calculation.
            </p>
        </section>
    );
}
