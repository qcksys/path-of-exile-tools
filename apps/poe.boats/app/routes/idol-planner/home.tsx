import { BookOpen, Share2 } from "lucide-react";
import { useState } from "react";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { IdolEditor } from "~/components/idol-planner/idol-editor";
import { IdolGrid } from "~/components/idol-planner/idol-grid";
import { ImportModal } from "~/components/idol-planner/import-modal";
import { InventoryPanel } from "~/components/idol-planner/inventory-panel";
import { LeagueSelector } from "~/components/idol-planner/league-selector";
import { LocaleSwitcher } from "~/components/idol-planner/locale-switcher";
import { MapDeviceComponent } from "~/components/idol-planner/map-device";
import { ModsSearchModal } from "~/components/idol-planner/mods-search-modal";
import { SetTabs } from "~/components/idol-planner/set-tabs";
import { ShareModal } from "~/components/idol-planner/share-modal";
import { StatsSummary } from "~/components/idol-planner/stats-summary";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { ClipboardProvider, useClipboard } from "~/context/clipboard-context";
import { DndProvider } from "~/context/dnd-context";
import { FavoritesProvider } from "~/context/favorites-context";
import { LeagueProvider } from "~/context/league-context";
import { ScarabPricesProvider } from "~/context/scarab-prices-context";
import { TradeSettingsProvider } from "~/context/trade-settings-context";
import { usePlannerState } from "~/hooks/use-planner-state";
import { useTranslations } from "~/i18n";
import type { IdolInstance } from "~/schemas/idol";
import type { InventoryIdol } from "~/schemas/inventory";
import type { Route } from "./+types/home";

export function meta() {
    return [
        { title: "Idol Planner - POE.BOATS" },
        {
            name: "description",
            content: "Plan your idol configurations for Path of Exile Legacy of Phrecia event",
        },
    ];
}

export function loader(_args: Route.LoaderArgs) {
    return {};
}

function HomeContent() {
    const t = useTranslations();
    const { isHydrated, sets } = usePlannerState();
    const { clipboardIdol, clearClipboard } = useClipboard();
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [modsSearchOpen, setModsSearchOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingIdol, setEditingIdol] = useState<InventoryIdol | null>(null);

    const handleSaveIdol = (idol: IdolInstance) => {
        if (editingIdol) {
            sets.updateIdol(editingIdol.id, idol);
        } else {
            sets.addIdols([idol], "manual");
        }
    };

    const handleIdolClick = (item: InventoryIdol) => {
        setEditingIdol(item);
        setEditorOpen(true);
    };

    const handleEditorOpenChange = (open: boolean) => {
        setEditorOpen(open);
        if (!open) {
            setEditingIdol(null);
        }
    };

    const handlePasteIdol = () => {
        if (clipboardIdol) {
            sets.addIdols([clipboardIdol], "manual");
            clearClipboard();
        }
    };

    if (!isHydrated) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-muted-foreground">{t.actions.loading}</div>
            </div>
        );
    }

    const activeSet = sets.activeSet;
    const inventory = activeSet?.inventory ?? [];

    return (
        <div className="flex h-screen flex-col overflow-hidden">
            <AppHeader
                section={t.app.idolPlanner}
                sectionBadge={t.app.subtitle}
                tools={
                    <span className="hidden sm:inline">
                        <LocaleSwitcher />
                    </span>
                }
            />

            <main className="container mx-auto flex min-h-0 flex-1 flex-col p-4">
                <SetTabs
                    sets={sets.sets}
                    activeSetId={sets.activeSetId}
                    onSelectSet={sets.selectSet}
                    onCreateSet={() => sets.createSet(t.idolSet.defaultName)}
                    onRenameSet={sets.renameSet}
                    onDuplicateSet={sets.duplicateSet}
                    onDeleteSet={sets.deleteSet}
                />

                <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[280px_1fr_260px] lg:overflow-visible xl:grid-cols-[400px_1fr_350px]">
                    <aside className="flex max-h-[50vh] min-h-0 flex-col gap-2 overflow-hidden lg:max-h-none">
                        <Card className="shrink-0">
                            <CardContent className="flex flex-col gap-2 p-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => setModsSearchOpen(true)}
                                >
                                    <BookOpen className="mr-1 h-4 w-4" />
                                    {t.inventory.browseMods || "Browse Mods"}
                                </Button>
                                <LeagueSelector />
                            </CardContent>
                        </Card>
                        <InventoryPanel
                            inventory={inventory}
                            onImportClick={() => setImportModalOpen(true)}
                            onCreateClick={() => setEditorOpen(true)}
                            onIdolClick={handleIdolClick}
                            onDuplicateIdol={sets.duplicateIdol}
                            onRemoveIdol={sets.removeIdol}
                            onRemoveIdols={sets.removeIdols}
                            onClearAll={sets.clearInventory}
                            onPasteIdol={handlePasteIdol}
                            hasClipboardIdol={!!clipboardIdol}
                        />
                    </aside>

                    <section className="flex flex-col items-center gap-4 overflow-x-auto">
                        <Button variant="outline" size="sm" onClick={() => setShareModalOpen(true)}>
                            <Share2 className="mr-1 h-4 w-4" />
                            {t.actions.share}
                        </Button>
                        {activeSet && (
                            <>
                                <div className="min-w-fit">
                                    <IdolGrid
                                        placements={activeSet.placements}
                                        inventory={inventory}
                                        unlockedConditions={activeSet.unlockedConditions}
                                        onPlaceIdol={(inventoryIdolId, x, y) =>
                                            sets.placeIdol(inventoryIdolId, { x, y })
                                        }
                                        onMoveIdol={(placementId, x, y) =>
                                            sets.moveIdol(placementId, { x, y })
                                        }
                                        onRemoveIdol={sets.removeIdolFromSet}
                                    />
                                </div>
                                <MapDeviceComponent
                                    mapDevice={activeSet.mapDevice}
                                    onSlotChange={sets.updateMapDeviceSlot}
                                    onCraftingOptionChange={sets.updateMapDeviceCraftingOption}
                                    unlockedConditions={activeSet.unlockedConditions}
                                    onUnlockedConditionsChange={sets.updateUnlockedConditions}
                                />
                            </>
                        )}
                    </section>

                    <aside className="max-h-[50vh] min-h-0 lg:max-h-none">
                        <StatsSummary
                            placements={activeSet?.placements ?? []}
                            inventory={inventory}
                            mapDevice={activeSet?.mapDevice}
                        />
                    </aside>
                </div>
            </main>

            <ImportModal
                open={importModalOpen}
                onOpenChange={setImportModalOpen}
                onImport={(idols) => sets.addIdols(idols, "clipboard")}
            />

            <ShareModal
                open={shareModalOpen}
                onOpenChange={setShareModalOpen}
                set={activeSet}
                inventory={inventory}
            />

            <ModsSearchModal open={modsSearchOpen} onOpenChange={setModsSearchOpen} />

            <IdolEditor
                open={editorOpen}
                onOpenChange={handleEditorOpenChange}
                onSave={handleSaveIdol}
                initialIdol={editingIdol?.idol ?? null}
            />

            <AppFooter />
        </div>
    );
}

export default function IdolPlannerHome(_props: Route.ComponentProps) {
    return (
        <LeagueProvider>
            <ScarabPricesProvider>
                <TradeSettingsProvider>
                    <FavoritesProvider>
                        <ClipboardProvider>
                            <DndProvider>
                                <HomeContent />
                            </DndProvider>
                        </ClipboardProvider>
                    </FavoritesProvider>
                </TradeSettingsProvider>
            </ScarabPricesProvider>
        </LeagueProvider>
    );
}
