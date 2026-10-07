import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { breachlords, graspingMailSource, mixedBreachRings } from "~/lib/crafting-grasping";
import type { CraftingMethod } from "~/schemas/crafting";
import { controlClass } from "./method-picker";

export function GraspingOptions({
    method,
    onChange,
}: {
    method: Extract<CraftingMethod, { kind: "generate" }>;
    onChange: (method: CraftingMethod) => void;
}) {
    const rings = method.breachRings ?? mixedBreachRings;
    return (
        <div className="space-y-2 rounded-md border p-3">
            <Label className="block space-y-1 text-xs">
                Grasping Mail recipe
                <FormSelect
                    className={controlClass}
                    value={rings === "legacy" ? "legacy" : "modern"}
                    onValueChange={(selectedValue) =>
                        onChange({
                            ...method,
                            breachRings: selectedValue === "legacy" ? "legacy" : mixedBreachRings,
                        })
                    }
                >
                    <FormSelectItem value="modern">60 Breachlord rings</FormSelectItem>
                    <FormSelectItem value="legacy">60 legacy Breach Rings</FormSelectItem>
                </FormSelect>
            </Label>
            {rings !== "legacy" ? (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        {breachlords.map((lord) => (
                            <Label key={lord} className="block space-y-1 text-xs">
                                {lord} rings
                                <Input
                                    className={controlClass}
                                    type="number"
                                    min={0}
                                    max={60}
                                    step={1}
                                    value={rings[lord]}
                                    onChange={(event) =>
                                        onChange({
                                            ...method,
                                            breachRings: {
                                                ...rings,
                                                [lord]: Number(event.target.value),
                                            },
                                        })
                                    }
                                />
                            </Label>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {Object.values(rings).reduce((sum, count) => sum + count, 0)} / 60 rings.
                        Each ring type weights its Breachlord's pool.
                    </p>
                </>
            ) : null}
            <p className="text-xs text-muted-foreground" role="note">
                Uses{" "}
                <a className="underline" href={graspingMailSource} target="_blank" rel="noreferrer">
                    PoE Wiki weights
                </a>
                . The modeled chance of 1, 2 or 3 Breach modifiers is approximately 50%, 33% or 17%.
                Remaining affixes use the ordinary rare-item model. Set the generated rare item
                price to the total recipe cost.
            </p>
        </div>
    );
}
