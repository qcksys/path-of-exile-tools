import { useState } from "react";
import { RecipeItems } from "~/components/arbitrage/recipe-items";
import { CatalogItemArt } from "~/components/item-art";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { MANUAL_VENDOR_RECIPES } from "~/data/manual-vendor-recipes";
import { calculateRecipeScenario } from "~/lib/arbitrage";
import { RecipeScenarioSchema } from "~/schemas/arbitrage";

const numberFormat = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });
const recipeArtwork: Record<string, string> = {
    "1:manual:magic": "Plate Vest",
    "1:manual:rare": "Plate Vest",
    "1:manual:corrupted": "Plate Vest",
    "1:manual:life-flasks": "Small Life Flask",
    "1:manual:mana-flasks": "Small Mana Flask",
    "1:manual:hybrid-flasks": "Small Hybrid Flask",
    "1:manual:maps": "Dunes Map",
    "1:manual:scarabs": "Cartography Scarab of Escalation",
    "1:manual:catalysts": "Fertile Catalyst",
    "1:manual:ultimatums": "Inscribed Ultimatum",
    "1:manual:tattoos": "Tattoo of the Ngamahu Firewalker",
    "1:manual:runegrafts": "Runegraft of the River",
};

export function ManualRecipeCalculator() {
    const [recipeId, setRecipeId] = useState(MANUAL_VENDOR_RECIPES[0].id);
    const [inputCost, setInputCost] = useState("");
    const [outputValue, setOutputValue] = useState("");
    const [buffer, setBuffer] = useState("0");
    const recipe = MANUAL_VENDOR_RECIPES.find((item) => item.id === recipeId)!;
    const parsed = RecipeScenarioSchema.safeParse({
        inputCost: inputCost.trim() ? Number(inputCost) : Number.NaN,
        outputValue: outputValue.trim() ? Number(outputValue) : Number.NaN,
        buffer: buffer.trim() ? Number(buffer) : Number.NaN,
    });
    const result = parsed.success ? calculateRecipeScenario(parsed.data) : null;
    const money = (value: number) => `${numberFormat.format(value)} chaos`;

    return (
        <Card>
            <CardHeader>
                <CardTitle>3-for-1 and 5-for-1 item recipes</CardTitle>
                <CardDescription>
                    Evaluate exact items using your own prices. These recipes are separate from the
                    automatic currency rankings because item rolls, variants, or outcomes affect
                    value.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <Field className="max-w-lg">
                    <FieldLabel htmlFor="manual-recipe">Recipe to evaluate</FieldLabel>
                    <Select
                        value={recipeId}
                        items={MANUAL_VENDOR_RECIPES.map((item) => ({
                            value: item.id,
                            label: item.name,
                        }))}
                        onValueChange={(id) => {
                            if (!id || !MANUAL_VENDOR_RECIPES.some((item) => item.id === id))
                                return;
                            setRecipeId(id);
                            setInputCost("");
                            setOutputValue("");
                        }}
                    >
                        <SelectTrigger id="manual-recipe" className="w-full">
                            <CatalogItemArt
                                name={recipeArtwork[recipe.id] ?? recipe.input.name}
                                game="poe1"
                            />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MANUAL_VENDOR_RECIPES.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                    <CatalogItemArt
                                        name={recipeArtwork[item.id] ?? item.input.name}
                                        game="poe1"
                                    />
                                    {item.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <div className="flex flex-col items-start gap-2">
                    <Badge variant="secondary">
                        {recipe.outcome === "random" ? "Random outcome" : "Check exact items"}
                    </Badge>
                    <p className="font-medium">
                        <RecipeItems
                            recipe={{ ...recipe, game: "1" }}
                            artName={recipeArtwork[recipe.id]}
                        />
                    </p>
                    <p className="text-sm text-muted-foreground">{recipe.conditions}</p>
                    <p className="text-xs text-muted-foreground">
                        Artwork illustrates the item type. Check your exact inputs and the vendor
                        preview.
                    </p>
                    <a
                        href={recipe.source}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline underline-offset-4"
                    >
                        Wiki recipe and restrictions
                    </a>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <Field>
                        <FieldLabel htmlFor="manual-cost">
                            Total cost of {recipe.input.quantity} inputs (chaos)
                        </FieldLabel>
                        <Input
                            id="manual-cost"
                            type="number"
                            min="0"
                            step="any"
                            value={inputCost}
                            onChange={(event) => setInputCost(event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="manual-value">
                            Estimated output sale price (chaos)
                        </FieldLabel>
                        <Input
                            id="manual-value"
                            type="number"
                            min="0"
                            step="any"
                            value={outputValue}
                            onChange={(event) => setOutputValue(event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="manual-buffer">Item recipe buffer (%)</FieldLabel>
                        <Input
                            id="manual-buffer"
                            type="number"
                            min="0"
                            max="99"
                            step="0.1"
                            value={buffer}
                            onChange={(event) => setBuffer(event.target.value)}
                        />
                    </Field>
                </div>
                <p className="text-sm text-muted-foreground">
                    Enter the cost of the entire input batch and the sale price of one specific
                    output. For random recipes this is an outcome scenario, not expected profit: no
                    outcome probabilities or average rolls are assumed.
                </p>
                {result ? (
                    <div
                        role="status"
                        aria-label="Item recipe estimate"
                        className="grid gap-3 sm:grid-cols-3"
                    >
                        <p>
                            Scenario profit: <strong>{money(result.profit)}</strong>
                        </p>
                        <p>
                            Scenario ROI: <strong>{numberFormat.format(result.roi)}%</strong>
                        </p>
                        <p>
                            Break-even sale price: <strong>{money(result.breakEven)}</strong>
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Enter a positive total input cost, a non-negative sale price, and a buffer
                        from 0 to 99.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
