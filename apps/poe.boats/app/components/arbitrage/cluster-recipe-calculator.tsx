import { Form, useNavigation } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { CatalogItemArt } from "~/components/item-art";
import { LocalTime } from "~/components/local-time";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    CLUSTER_RECIPE_INPUTS,
    CLUSTER_RECIPE_SIZES,
    CLUSTER_RECIPE_SOURCE,
    clusterRecipeBand,
} from "~/data/cluster-jewel-recipe";
import { usePendingSearchParams } from "~/hooks/use-pending-search-params";
import type { calculateClusterRecipe } from "~/lib/cluster-recipe";
import type { ClusterRecipeMarketData } from "~/services/cluster-recipe.server";

const formatNumber = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });
const formatPercent = new Intl.NumberFormat("en", {
    style: "percent",
    maximumSignificantDigits: 2,
});
const bandLabel = ({ min, max }: { min: number; max: number }) =>
    max === 100 ? `${min}+` : `${min}–${max}`;

export function ClusterRecipeCalculator({
    data,
    buffer,
    setBuffer,
    validBuffer,
    result,
}: {
    data: ClusterRecipeMarketData;
    buffer: string;
    setBuffer: (buffer: string) => void;
    validBuffer: boolean;
    result: ReturnType<typeof calculateClusterRecipe> | null;
}) {
    const { league, itemLevel, snapshot, error } = data;
    const navigation = useNavigation();
    const pending = usePendingSearchParams();
    const bands = CLUSTER_RECIPE_SIZES[0]!.bands;
    const band = clusterRecipeBand(itemLevel);
    const selectedLevel = pending?.get("clusterIlvl") ?? String(band.min);
    const chaos = <CurrencyLabel currency="chaos" game="poe1" />;
    const value = (amount: number | null) =>
        amount === null ? (
            "—"
        ) : (
            <>
                {formatNumber.format(amount)} {chaos}
            </>
        );

    return (
        <Card id="cluster-jewel-rerolls" className="scroll-mt-20">
            <CardHeader>
                <CardTitle>5-for-1 Cluster Jewel rerolls</CardTitle>
                <CardDescription>
                    Expected value of selling five Cluster Jewels for a random one of the same size,
                    priced from captured merchant-tab asks · All values in {chaos}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-4">
                    <Form method="get" className="flex flex-wrap items-end gap-3">
                        {league ? (
                            <Input
                                type="hidden"
                                name="league"
                                value={pending?.get("league") ?? league}
                            />
                        ) : null}
                        <Field className="w-56">
                            <FieldLabel htmlFor="cluster-item-level">
                                Lowest input item level
                            </FieldLabel>
                            <Select
                                name="clusterIlvl"
                                key={selectedLevel}
                                defaultValue={selectedLevel}
                                items={bands.map((entry) => ({
                                    value: String(entry.min),
                                    label: bandLabel(entry),
                                }))}
                            >
                                <SelectTrigger id="cluster-item-level" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {bands.map((entry) => (
                                            <SelectItem key={entry.min} value={String(entry.min)}>
                                                {bandLabel(entry)}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Button type="submit" variant="outline">
                            {navigation.state !== "idle" ? "Loading prices…" : "Load prices"}
                        </Button>
                    </Form>
                    <Field className="w-56" data-invalid={!validBuffer}>
                        <FieldLabel htmlFor="cluster-buffer">Cluster recipe buffer (%)</FieldLabel>
                        <Input
                            id="cluster-buffer"
                            type="number"
                            min="0"
                            max="99"
                            step="0.1"
                            value={buffer}
                            onChange={(event) => setBuffer(event.target.value)}
                            aria-invalid={!validBuffer}
                        />
                        <FieldDescription>Enter 0–99.</FieldDescription>
                    </Field>
                </div>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>
                        Sell five Cluster Jewels of the same size and rarity, all magic or all rare,
                        to a vendor. The new jewel has a new enchantment and modifiers and the
                        lowest input item level, so every input must be item level {band.min}+ for
                        this band. Five normal jewels return only a Scroll of Wisdom.{" "}
                        <a
                            href={CLUSTER_RECIPE_SOURCE}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4"
                        >
                            Wiki recipe
                        </a>
                    </p>
                    <p>
                        Every rollable enchantment and passive count is assumed equally likely,
                        because spawn weights are not published. Removed enchantments are left out.
                        An outcome with no ask in the last 24 hours counts as worth nothing. Markets
                        merge normal, magic and rare jewels.
                    </p>
                </div>
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Cluster Jewel prices unavailable</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}
                {result ? (
                    <>
                        <Table aria-label="Cluster Jewel recipe estimates">
                            <TableCaption>
                                Expected value = average outcome ask after the buffer. Profit
                                compares it with {CLUSTER_RECIPE_INPUTS} of the cheapest priced
                                outcome market. Recycling keeps outputs at or above the ask shown
                                and crafts again with the rest.
                            </TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Expected value</TableHead>
                                    <TableHead>Break-even input</TableHead>
                                    <TableHead>Profit at cheapest</TableHead>
                                    <TableHead>Output beats cost</TableHead>
                                    <TableHead>With recycling</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.sizes.map((size) => (
                                    <TableRow key={size.baseType}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <CatalogItemArt name={size.baseType} game="poe1" />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">
                                                        {size.baseType}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {size.pricedCount} of {size.outcomeCount}{" "}
                                                        outcomes priced
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>{value(size.expectedValue)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {value(size.expectedValueWithoutTop)} without the
                                                best outcome · median {value(size.medianValue)}
                                            </div>
                                        </TableCell>
                                        <TableCell>{value(size.breakEvenInput)} / jewel</TableCell>
                                        <TableCell>
                                            {size.profit === null ? (
                                                "—"
                                            ) : (
                                                <>
                                                    <Badge
                                                        variant={
                                                            size.profit > 0
                                                                ? "default"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {value(size.profit)}
                                                    </Badge>
                                                    <div className="text-xs text-muted-foreground">
                                                        {value(size.cost)} for{" "}
                                                        {CLUSTER_RECIPE_INPUTS} ×{" "}
                                                        {value(size.cheapestInput)}
                                                    </div>
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {size.chanceAboveCost === null
                                                ? "—"
                                                : formatPercent.format(size.chanceAboveCost)}
                                        </TableCell>
                                        <TableCell>
                                            <div>{value(size.recycled.breakEvenInput)} / jewel</div>
                                            {size.recycled.below > 0 ? (
                                                <div className="text-xs text-muted-foreground">
                                                    Re-feed outputs under{" "}
                                                    {value(size.recycled.below)}
                                                </div>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {result.sizes.map((size) => (
                            <details key={size.baseType} className="text-sm">
                                <summary className="cursor-pointer">
                                    {size.baseType} outcomes ({size.outcomeCount})
                                </summary>
                                <Table aria-label={`${size.baseType} outcomes`}>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Enchantment</TableHead>
                                            <TableHead>Passives</TableHead>
                                            <TableHead>Ask</TableHead>
                                            <TableHead>Listings</TableHead>
                                            <TableHead>Share of value</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {size.outcomes.map((outcome) => (
                                            <TableRow key={outcome.id}>
                                                <TableCell className="whitespace-normal">
                                                    {outcome.label}
                                                </TableCell>
                                                <TableCell>{outcome.passives}</TableCell>
                                                <TableCell>
                                                    {outcome.value === null
                                                        ? "Unpriced"
                                                        : value(outcome.value)}
                                                </TableCell>
                                                <TableCell>{outcome.listingCount}</TableCell>
                                                <TableCell>
                                                    {formatPercent.format(outcome.share)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </details>
                        ))}
                        <p className="text-xs text-muted-foreground">
                            Item level band {bandLabel(band)} · Newest ask:{" "}
                            <LocalTime at={Date.parse(snapshot!.fetchedAt!)} seconds />
                        </p>
                    </>
                ) : null}
            </CardContent>
        </Card>
    );
}
