import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { dbContext } from "~/context";
import { getPriceCache } from "~/db/queries/idol-planner.queries";
import { useTranslations } from "~/i18n";
import { computeSetHash, findDuplicateSet } from "~/lib/set-hash";
import {
    buildShareUrl,
    calculateScarabCost,
    extractMechanics,
    extractScarabIds,
    extractScarabNames,
    formatMetaDescription,
    loadShare,
} from "~/lib/share";
import { loadStorage, saveStorage } from "~/lib/storage";
import type { IdolSet } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";
import { DEFAULT_LEAGUE } from "~/schemas/league";
import type { ScarabPricesData } from "~/schemas/scarab";
import type { SharedSet } from "~/schemas/share";
import type { Route } from "./+types/share.$id";

export async function loader({ params, request, context }: Route.LoaderArgs) {
    const shareId = params.id;
    if (!shareId) {
        return { sharedSet: null, prices: null, shareUrl: null };
    }

    const db = context.get(dbContext);
    const sharedSet = await loadShare(db, shareId);

    let prices: ScarabPricesData | null = null;
    if (sharedSet) {
        const cached = await getPriceCache(db, DEFAULT_LEAGUE);
        if (cached?.prices) {
            prices = {
                league: DEFAULT_LEAGUE,
                prices: cached.prices,
                updatedAt: cached.rowUpdatedAt?.toISOString() ?? new Date().toISOString(),
            };
        }
    }

    const shareUrl = buildShareUrl(request.url, shareId);

    return { sharedSet, prices, shareUrl };
}

export function meta({ loaderData }: Route.MetaArgs) {
    const { sharedSet, prices, shareUrl } = loaderData;

    if (!sharedSet) {
        return [
            { title: "Set Not Found - POE Idol Planner" },
            {
                name: "description",
                content: "This shared set may have expired or does not exist.",
            },
            { property: "og:title", content: "Set Not Found - POE Idol Planner" },
            {
                property: "og:description",
                content: "This shared set may have expired or does not exist.",
            },
            { property: "og:type", content: "website" },
            { property: "og:site_name", content: "POE.BOATS" },
            { name: "twitter:card", content: "summary" },
        ];
    }

    const setName = sharedSet.set.name;
    const title = `${setName} - POE Idol Planner`;

    const mechanics = extractMechanics(sharedSet);
    const scarabNames = extractScarabNames(sharedSet, "en");
    const scarabIds = extractScarabIds(sharedSet);
    const cost = calculateScarabCost(scarabIds, prices);
    const description = formatMetaDescription(mechanics, scarabNames, cost);

    return [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "POE.BOATS" },
        ...(shareUrl ? [{ property: "og:url", content: shareUrl }] : []),
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
    ];
}

type LoadState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "loaded"; data: SharedSet }
    | { status: "duplicate"; data: SharedSet; existingSet: IdolSet };

export default function SharePage({ loaderData }: Route.ComponentProps) {
    const t = useTranslations();
    const navigate = useNavigate();
    const { sharedSet: initialData } = loaderData;

    const [loadState, setLoadState] = useState<LoadState>(() => {
        if (initialData) {
            return { status: "loaded", data: initialData };
        }
        return { status: "error", message: "Share not found or expired" };
    });
    const [importing, setImporting] = useState(false);
    const [duplicateChecked, setDuplicateChecked] = useState(false);

    useEffect(() => {
        if (initialData) {
            setLoadState({ status: "loaded", data: initialData });
            setDuplicateChecked(false);
        }
    }, [initialData]);

    useEffect(() => {
        if (loadState.status === "loaded" && !duplicateChecked) {
            setDuplicateChecked(true);
            const storage = loadStorage();
            const tempSet: IdolSet = {
                ...loadState.data.set,
                inventory: loadState.data.idols,
            };
            const existingSet = findDuplicateSet(tempSet, storage.sets);
            if (existingSet) {
                setLoadState({
                    status: "duplicate",
                    data: loadState.data,
                    existingSet,
                });
            }
        }
    }, [loadState, duplicateChecked]);

    const handleImport = (forceImport = false) => {
        if (loadState.status !== "loaded" && loadState.status !== "duplicate") return;
        if (loadState.status === "duplicate" && !forceImport) return;

        setImporting(true);
        try {
            const storage = loadStorage();
            const { set: sharedSet, idols: sharedIdols } = loadState.data;

            const idolIdMap = new Map<string, string>();
            const newInventory: InventoryIdol[] = [];

            for (const idol of sharedIdols) {
                const newId = nanoid();
                idolIdMap.set(idol.id, newId);
                newInventory.push({
                    ...idol,
                    id: newId,
                    source: "shared",
                    importedAt: Date.now(),
                    usageCount: 0,
                });
            }

            const newSetId = nanoid();
            const importedSet: IdolSet = {
                ...sharedSet,
                id: newSetId,
                name: `${sharedSet.name} (Imported)`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                inventory: newInventory,
                placements: sharedSet.placements.map((p) => ({
                    ...p,
                    id: nanoid(),
                    inventoryIdolId: idolIdMap.get(p.inventoryIdolId) || p.inventoryIdolId,
                })),
            };

            importedSet.contentHash = computeSetHash(importedSet);

            storage.sets.push(importedSet);
            storage.activeSetId = newSetId;

            saveStorage(storage);

            navigate("/idol-planner", { replace: true });
        } catch (error) {
            console.log({
                message: "Import failed",
                error: error instanceof Error ? error.message : "Unknown error",
            });
            setImporting(false);
        }
    };

    const handleViewExisting = () => {
        if (loadState.status !== "duplicate") return;

        const storage = loadStorage();
        storage.activeSetId = loadState.existingSet.id;
        saveStorage(storage);
        navigate("/idol-planner", { replace: true });
    };

    if (loadState.status === "loading") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>{t("actions.loading")}</CardTitle>
                        <CardDescription>{t("share.fetching")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-center py-8">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loadState.status === "error") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-destructive">{t("errors.title")}</CardTitle>
                        <CardDescription>{loadState.message}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => navigate("/idol-planner")} className="w-full">
                            {t("share.goToPlanner")}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loadState.status === "duplicate") {
        const { set, idols } = loadState.data;
        const { existingSet } = loadState;

        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <Card className="w-full max-w-lg">
                    <CardHeader>
                        <CardTitle className="text-amber-600 dark:text-amber-400">
                            {t("share.duplicateFound")}
                        </CardTitle>
                        <CardDescription>{t("share.duplicateDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                            <h3 className="mb-2 font-semibold text-foreground text-lg">
                                {existingSet.name}
                            </h3>
                            <div className="space-y-1 text-muted-foreground text-sm">
                                <p>
                                    {existingSet.inventory.length} idol
                                    {existingSet.inventory.length !== 1 && "s"}
                                </p>
                                <p>
                                    {existingSet.placements.length} placement
                                    {existingSet.placements.length !== 1 && "s"}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-muted/50 p-4">
                            <p className="mb-2 text-muted-foreground text-sm">Incoming set:</p>
                            <h3 className="font-semibold text-accent">{set.name}</h3>
                            <div className="space-y-1 text-muted-foreground text-sm">
                                <p>
                                    {idols.length} idol
                                    {idols.length !== 1 && "s"}
                                </p>
                                <p>
                                    {set.placements.length} placement
                                    {set.placements.length !== 1 && "s"}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button
                                variant="outline"
                                onClick={handleViewExisting}
                                className="flex-1"
                            >
                                {t("share.viewExisting")}
                            </Button>
                            <Button
                                onClick={() => {
                                    handleImport(true);
                                }}
                                disabled={importing}
                                className="flex-1"
                            >
                                {importing ? t("share.importing") : t("share.importAnyway")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const { set, idols } = loadState.data;

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>{t("share.sharedSetTitle")}</CardTitle>
                    <CardDescription>{t("share.sharedSetDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/50 p-4">
                        <h3 className="mb-2 font-semibold text-accent text-lg">{set.name}</h3>
                        <div className="space-y-1 text-muted-foreground text-sm">
                            <p>
                                {idols.length} idol{idols.length !== 1 && "s"}
                            </p>
                            <p>
                                {set.placements.length} placement
                                {set.placements.length !== 1 && "s"}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-medium text-foreground text-sm">
                            {t("share.idolsInSet")}
                        </h4>
                        <ul className="max-h-40 space-y-1 overflow-y-auto">
                            {idols.map((idol) => (
                                <li key={idol.id} className="text-muted-foreground text-sm">
                                    &bull; {idol.idol.name || idol.idol.baseType} (
                                    {idol.idol.prefixes.length}P/
                                    {idol.idol.suffixes.length}S)
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => navigate("/idol-planner")}
                            className="flex-1"
                        >
                            {t("actions.cancel")}
                        </Button>
                        <Button
                            onClick={() => {
                                handleImport();
                            }}
                            disabled={importing}
                            className="flex-1"
                        >
                            {importing ? t("share.importing") : t("share.importSet")}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
