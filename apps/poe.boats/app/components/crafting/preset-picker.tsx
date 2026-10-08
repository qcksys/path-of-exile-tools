import { useState } from "react";
import { CatalogItemArt } from "~/components/item-art";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { listCraftingPresets } from "~/lib/crafting-presets";
import { type CraftingPresetId, craftingPresetIdSchema } from "~/schemas/crafting-presets";

const presetBases: Record<CraftingPresetId, string> = {
    "life-block-shield": "Heat-attuned Tower Shield",
    "es-block-shield": "Titanium Spirit Shield",
    "tailwind-boots": "Two-Toned Boots",
    "physical-bow": "Spine Bow",
    "elemental-bow": "Spine Bow",
    "suppression-chest": "Necrotic Armour",
    "global-defence-chest": "Necrotic Armour",
    "rarity-helmet": "Hubris Circlet",
    "energy-shield-chest": "Vaal Regalia",
    "strength-helical-ring": "Helical Ring",
};

export function CraftingPresetPicker({
    game,
    disabled,
    onCreate,
}: {
    game: "poe1" | "poe2";
    disabled: boolean;
    onCreate: (presetId: CraftingPresetId) => void;
}) {
    const presets = listCraftingPresets(game);
    const [selected, setSelected] = useState<CraftingPresetId>("life-block-shield");
    const preset = presets.find((entry) => entry.id === selected);
    if (!presets.length) return null;
    return (
        <Card>
            <CardHeader>
                <Badge variant="craft">{presets.length} editable examples</Badge>
                <CardTitle>Common crafts</CardTitle>
                <CardDescription>
                    Open an editable example in a new project tab. Prepared donors are purchases;
                    enter their prices and currency costs before comparing cost estimates.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <FieldGroup className="gap-3 sm:flex-row sm:items-end">
                    <Field>
                        <FieldLabel htmlFor="craft-preset">Crafting preset</FieldLabel>
                        <Select
                            items={presets.map((entry) => ({ value: entry.id, label: entry.name }))}
                            value={selected}
                            onValueChange={(value) => {
                                if (value) setSelected(craftingPresetIdSchema.parse(value));
                            }}
                        >
                            <SelectTrigger id="craft-preset" className="w-full">
                                <CatalogItemArt name={presetBases[selected]} game={game} />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {presets.map((entry) => (
                                        <SelectItem key={entry.id} value={entry.id}>
                                            <CatalogItemArt
                                                name={presetBases[entry.id]}
                                                game={game}
                                            />
                                            {entry.name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Button disabled={disabled} onClick={() => onCreate(selected)}>
                        Create from preset
                    </Button>
                </FieldGroup>
                <p className="text-sm text-muted-foreground">{preset?.description}</p>
            </CardContent>
        </Card>
    );
}
