import { type DragEvent, useCallback, useMemo, useState } from "react";
import { IdolCardMini } from "~/components/idol-planner/idol-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { useDnd } from "~/context/dnd-context";
import { IDOL_BASES, type IdolBaseKey } from "~/data/idol-bases";
import { getLockedPositions, MAP_DEVICE_UNLOCKS } from "~/data/map-device-unlocks";
import { useTranslations } from "~/i18n";
import { GRID_HEIGHT, GRID_WIDTH, isCellValid } from "~/lib/grid-utils";
import { cn } from "~/lib/utils";
import type { IdolInstance } from "~/schemas/idol";
import type { IdolPlacement } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";

const CELL_SIZE = 64;

interface IdolGridProps {
    placements: IdolPlacement[];
    inventory: InventoryIdol[];
    unlockedConditions?: string[];
    onPlaceIdol?: (inventoryIdolId: string, x: number, y: number) => void;
    onMoveIdol?: (placementId: string, x: number, y: number) => void;
    onRemoveIdol?: (placementId: string) => void;
    onIdolClick?: (idol: IdolInstance, placementId: string) => void;
}

interface GridCell {
    occupied: boolean;
    placementId?: string;
    idol?: IdolInstance;
    isOrigin: boolean;
    isValid: boolean;
    isLocked: boolean;
    lockReason?: string;
}

function getLockReason(x: number, y: number): string | undefined {
    for (const unlock of MAP_DEVICE_UNLOCKS) {
        for (const pos of unlock.positions) {
            if (pos.x === x && pos.y === y) {
                return unlock.name;
            }
        }
    }
    return undefined;
}

function createEmptyGrid(unlockedConditions: string[] = []): GridCell[][] {
    const lockedPositions = getLockedPositions(unlockedConditions);
    return Array.from({ length: GRID_HEIGHT }, (_, y) =>
        Array.from({ length: GRID_WIDTH }, (_, x) => {
            const posKey = `${x},${y}`;
            const isLocked = lockedPositions.has(posKey);
            return {
                occupied: false,
                isOrigin: false,
                isValid: isCellValid(x, y),
                isLocked,
                lockReason: isLocked ? getLockReason(x, y) : undefined,
            };
        }),
    );
}

function populateGrid(
    placements: IdolPlacement[],
    inventory: InventoryIdol[],
    unlockedConditions: string[] = [],
): GridCell[][] {
    const grid = createEmptyGrid(unlockedConditions);

    for (const placement of placements) {
        const inventoryIdol = inventory.find((i) => i.id === placement.inventoryIdolId);
        if (!inventoryIdol) continue;

        const idol = inventoryIdol.idol;
        const base = IDOL_BASES[idol.baseType as IdolBaseKey];
        const { x, y } = placement.position;

        for (let dy = 0; dy < base.height; dy++) {
            for (let dx = 0; dx < base.width; dx++) {
                const cellY = y + dy;
                const cellX = x + dx;
                if (cellY < GRID_HEIGHT && cellX < GRID_WIDTH) {
                    grid[cellY][cellX] = {
                        occupied: true,
                        placementId: placement.id,
                        idol,
                        isOrigin: dx === 0 && dy === 0,
                        isValid: grid[cellY][cellX].isValid,
                        isLocked: grid[cellY][cellX].isLocked,
                        lockReason: grid[cellY][cellX].lockReason,
                    };
                }
            }
        }
    }

    return grid;
}
// Creates a custom drag image element for an idol
function createDragImage(
    idol: IdolInstance,
    cellSize: number,
): { element: HTMLDivElement; cleanup: () => void } {
    const base = IDOL_BASES[idol.baseType as IdolBaseKey];
    const width = base.width * cellSize;
    const height = base.height * cellSize;

    // Create container
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.zIndex = "9999";
    container.style.pointerEvents = "none";

    // Create the idol visual
    const idolDiv = document.createElement("div");
    idolDiv.style.width = `${width}px`;
    idolDiv.style.height = `${height}px`;
    idolDiv.style.borderRadius = "4px";
    idolDiv.style.border = "2px solid";
    idolDiv.style.overflow = "hidden";
    idolDiv.style.position = "relative";
    idolDiv.style.opacity = "0.9";

    // Set border color based on rarity
    const rarityColors: Record<string, string> = {
        normal: "#c8c8c8",
        magic: "#8888ff",
        rare: "#ffff77",
        unique: "#af6025",
    };
    idolDiv.style.borderColor = rarityColors[idol.rarity] || rarityColors.normal;

    // Add idol image
    const img = document.createElement("img");
    img.src = base.image;
    img.style.position = "absolute";
    img.style.inset = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    idolDiv.appendChild(img);

    container.appendChild(idolDiv);
    document.body.appendChild(container);

    return {
        element: container,
        cleanup: () => {
            // Delay cleanup to ensure drag image is captured
            setTimeout(() => {
                document.body.removeChild(container);
            }, 0);
        },
    };
}

interface PlacedIdolProps {
    placement: IdolPlacement;
    inventoryIdol: InventoryIdol;
    isHovered: boolean;
    isBeingDragged: boolean;
    onHoverStart: (placementId: string) => void;
    onHoverEnd: () => void;
    onIdolClick?: (idol: IdolInstance, placementId: string) => void;
    onRemoveIdol?: (placementId: string) => void;
    onDragStart: (placementId: string, offset: { x: number; y: number }) => void;
    onDragEnd: () => void;
}

function PlacedIdol({
    placement,
    inventoryIdol,
    isHovered,
    isBeingDragged,
    onHoverStart,
    onHoverEnd,
    onIdolClick,
    onRemoveIdol,
    onDragStart,
    onDragEnd,
}: PlacedIdolProps) {
    const idol = inventoryIdol.idol;
    const { x, y } = placement.position;

    const handleDragStart = useCallback(
        (e: React.DragEvent<HTMLButtonElement>) => {
            e.dataTransfer.effectAllowed = "move";
            const { element, cleanup } = createDragImage(idol, CELL_SIZE);
            e.dataTransfer.setDragImage(element, CELL_SIZE / 2, CELL_SIZE / 2);
            cleanup();
            onDragStart(placement.id, { x: 0, y: 0 });
        },
        [idol, placement.id, onDragStart],
    );

    const handleDragEnd = useCallback(() => {
        onDragEnd();
    }, [onDragEnd]);

    const handleMouseEnter = useCallback(() => {
        onHoverStart(placement.id);
    }, [placement.id, onHoverStart]);

    // Allow dragover when this idol is being dragged (for self-overlap drops)
    const handleDragOver = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (isBeingDragged) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
            }
        },
        [isBeingDragged],
    );

    // Allow drop to bubble to grid when this idol is being dragged
    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (isBeingDragged) {
                e.preventDefault();
                // Don't stopPropagation - let it bubble to grid's onDrop handler
            }
        },
        [isBeingDragged],
    );

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Hover detection for idol highlight
        <div
            className="absolute z-10"
            style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={onHoverEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <IdolCardMini
                idol={idol}
                cellSize={CELL_SIZE}
                onClick={onIdolClick ? () => onIdolClick(idol, placement.id) : undefined}
                onRemove={onRemoveIdol ? () => onRemoveIdol(placement.id) : undefined}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                isHovered={isHovered}
            />
        </div>
    );
}

interface EmptyCellProps {
    x: number;
    y: number;
    cell: GridCell;
    canDropHere: boolean;
    isDropPreview: boolean;
    canDropAtOrigin: boolean;
    onDrop: (x: number, y: number) => void;
}

function EmptyCell({
    x,
    y,
    cell,
    canDropHere,
    isDropPreview,
    canDropAtOrigin,
    onDrop,
}: EmptyCellProps) {
    const t = useTranslations();
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            if (canDropHere) {
                e.dataTransfer.dropEffect = "move";
                setIsDragOver(true);
            } else {
                e.dataTransfer.dropEffect = "none";
            }
        },
        [canDropHere],
    );

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent grid-level handler from also firing
            setIsDragOver(false);
            if (canDropHere) {
                onDrop(x, y);
            }
        },
        [canDropHere, onDrop, x, y],
    );

    if (!cell.isValid) {
        return (
            <div
                className="absolute border border-invalid bg-invalid/40"
                style={{
                    left: x * CELL_SIZE,
                    top: y * CELL_SIZE,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                }}
            />
        );
    }

    if (cell.isLocked) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <div
                                className="absolute flex items-center justify-center border border-amber-600/50 bg-amber-900/30 dark:border-amber-500/40 dark:bg-amber-950/40"
                                style={{
                                    left: x * CELL_SIZE,
                                    top: y * CELL_SIZE,
                                    width: CELL_SIZE,
                                    height: CELL_SIZE,
                                }}
                            />
                        }
                    >
                        <svg
                            className="h-5 w-5 text-amber-600 dark:text-amber-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            role="img"
                            aria-label="Locked"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                        <div className="font-medium">{t("grid.lockedSlot")}</div>
                        {cell.lockReason && (
                            <div className="text-muted-foreground text-xs">{cell.lockReason}</div>
                        )}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Drop target for drag-and-drop
        <div
            className={cn(
                "absolute border border-border bg-muted/30 transition-colors",
                isDragOver && canDropHere && "border-success bg-success/20",
                isDragOver && !canDropHere && "border-destructive bg-destructive/20",
                isDropPreview && canDropAtOrigin && "border-primary bg-primary/20",
                isDropPreview && !canDropAtOrigin && "border-destructive/50 bg-destructive/10",
                !isDragOver && !isDropPreview && "hover:border-primary/50 hover:bg-primary/10",
            )}
            style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        />
    );
}

function GridTabContent({
    placements,
    inventory,
    unlockedConditions = [],
    onIdolClick,
    onRemoveIdol,
    onPlaceIdol,
    onMoveIdol,
}: {
    placements: IdolPlacement[];
    inventory: InventoryIdol[];
    unlockedConditions?: string[];
    onIdolClick?: (idol: IdolInstance, placementId: string) => void;
    onRemoveIdol?: (placementId: string) => void;
    onPlaceIdol?: (inventoryIdolId: string, x: number, y: number) => void;
    onMoveIdol?: (placementId: string, x: number, y: number) => void;
}) {
    const { draggedItem, sourcePlacementId, dragOffset, setDraggedItem } = useDnd();
    const [hoveredPlacementId, setHoveredPlacementId] = useState<string | null>(null);
    const [dragHoverPosition, setDragHoverPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);

    const grid = useMemo(
        () => populateGrid(placements, inventory, unlockedConditions),
        [placements, inventory, unlockedConditions],
    );

    const inventoryMap = useMemo(() => {
        const map = new Map<string, InventoryIdol>();
        for (const inv of inventory) {
            map.set(inv.id, inv);
        }
        return map;
    }, [inventory]);

    const allPlacements = useMemo(() => placements, [placements]);

    const canPlaceAtPosition = useCallback(
        (x: number, y: number): boolean => {
            if (!draggedItem) return false;
            const base = IDOL_BASES[draggedItem.idol.baseType as IdolBaseKey];

            const originX = x - dragOffset.x;
            const originY = y - dragOffset.y;

            if (
                originX < 0 ||
                originY < 0 ||
                originX + base.width > GRID_WIDTH ||
                originY + base.height > GRID_HEIGHT
            ) {
                return false;
            }

            for (let dy = 0; dy < base.height; dy++) {
                for (let dx = 0; dx < base.width; dx++) {
                    const cell = grid[originY + dy]?.[originX + dx];
                    if (!cell?.isValid || cell?.isLocked) return false;
                    if (cell?.occupied) {
                        if (sourcePlacementId && cell.placementId === sourcePlacementId) {
                            continue;
                        }
                        return false;
                    }
                }
            }

            return true;
        },
        [draggedItem, grid, sourcePlacementId, dragOffset],
    );

    const getPreviewCells = useCallback((): Set<string> => {
        const cells = new Set<string>();
        if (!draggedItem || !dragHoverPosition) return cells;

        const base = IDOL_BASES[draggedItem.idol.baseType as IdolBaseKey];
        const originX = dragHoverPosition.x - dragOffset.x;
        const originY = dragHoverPosition.y - dragOffset.y;

        for (let dy = 0; dy < base.height; dy++) {
            for (let dx = 0; dx < base.width; dx++) {
                const cellX = originX + dx;
                const cellY = originY + dy;
                if (cellX >= 0 && cellX < GRID_WIDTH && cellY >= 0 && cellY < GRID_HEIGHT) {
                    cells.add(`${cellX},${cellY}`);
                }
            }
        }
        return cells;
    }, [draggedItem, dragHoverPosition, dragOffset]);

    const previewCells = useMemo(() => getPreviewCells(), [getPreviewCells]);

    const canDropAtOrigin = useMemo(() => {
        if (!draggedItem || !dragHoverPosition) return false;
        return canPlaceAtPosition(dragHoverPosition.x, dragHoverPosition.y);
    }, [draggedItem, dragHoverPosition, canPlaceAtPosition]);

    const handleDrop = useCallback(
        (x: number, y: number) => {
            if (!draggedItem) return;

            const originX = x - dragOffset.x;
            const originY = y - dragOffset.y;

            if (sourcePlacementId && onMoveIdol) {
                onMoveIdol(sourcePlacementId, originX, originY);
            } else if (onPlaceIdol) {
                onPlaceIdol(draggedItem.id, originX, originY);
            }
            setDragHoverPosition(null);
        },
        [draggedItem, sourcePlacementId, dragOffset, onPlaceIdol, onMoveIdol],
    );

    const handleIdolDragStart = useCallback(
        (placementId: string, offset: { x: number; y: number }) => {
            const placement = placements.find((p) => p.id === placementId);
            if (!placement) return;

            const invIdol = inventoryMap.get(placement.inventoryIdolId);
            if (!invIdol) return;

            setDraggedItem(invIdol, placementId, offset);
        },
        [placements, inventoryMap, setDraggedItem],
    );

    const handleIdolDragEnd = useCallback(() => {
        setDraggedItem(null);
        setDragHoverPosition(null);
    }, [setDraggedItem]);

    const handleGridDragOver = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            if (!draggedItem) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
            const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
            if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
                setDragHoverPosition({ x, y });
            }
        },
        [draggedItem],
    );

    const handleGridDragLeave = useCallback(() => {
        setDragHoverPosition(null);
    }, []);

    const handleGridDrop = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            if (!draggedItem || !dragHoverPosition) return;
            if (!canPlaceAtPosition(dragHoverPosition.x, dragHoverPosition.y)) return;
            handleDrop(dragHoverPosition.x, dragHoverPosition.y);
        },
        [draggedItem, dragHoverPosition, canPlaceAtPosition, handleDrop],
    );

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Grid drag tracking
        <div
            className="relative rounded-lg border border-border bg-card"
            style={{
                width: GRID_WIDTH * CELL_SIZE,
                height: GRID_HEIGHT * CELL_SIZE,
            }}
            onDragOver={handleGridDragOver}
            onDragLeave={handleGridDragLeave}
            onDrop={handleGridDrop}
        >
            {/* Render empty cells as base layer */}
            {grid.flatMap((row, y) =>
                row.map((cell, x) => {
                    if (cell.occupied) return null;
                    const cellKey = `${x},${y}`;
                    const isPreview = previewCells.has(cellKey);
                    return (
                        <EmptyCell
                            key={`cell-${x}-${y}`}
                            x={x}
                            y={y}
                            cell={cell}
                            canDropHere={canPlaceAtPosition(x, y)}
                            isDropPreview={isPreview}
                            canDropAtOrigin={canDropAtOrigin}
                            onDrop={handleDrop}
                        />
                    );
                }),
            )}

            {/* Render preview overlay for occupied cells when dragging self */}
            {sourcePlacementId &&
                grid.flatMap((row, y) =>
                    row.map((cell, x) => {
                        if (!cell.occupied) return null;
                        if (cell.placementId !== sourcePlacementId) return null;
                        const cellKey = `${x},${y}`;
                        if (!previewCells.has(cellKey)) return null;
                        return (
                            <div
                                key={`preview-${x}-${y}`}
                                className={cn(
                                    "pointer-events-none absolute z-20 border transition-colors",
                                    canDropAtOrigin
                                        ? "border-primary bg-primary/20"
                                        : "border-destructive/50 bg-destructive/10",
                                )}
                                style={{
                                    left: x * CELL_SIZE,
                                    top: y * CELL_SIZE,
                                    width: CELL_SIZE,
                                    height: CELL_SIZE,
                                }}
                            />
                        );
                    }),
                )}

            {/* Render placed idols as overlay layer */}
            {allPlacements.map((placement) => {
                const invIdol = inventoryMap.get(placement.inventoryIdolId);
                if (!invIdol) return null;

                return (
                    <PlacedIdol
                        key={placement.id}
                        placement={placement}
                        inventoryIdol={invIdol}
                        isHovered={hoveredPlacementId === placement.id}
                        isBeingDragged={sourcePlacementId === placement.id}
                        onHoverStart={setHoveredPlacementId}
                        onHoverEnd={() => setHoveredPlacementId(null)}
                        onIdolClick={onIdolClick}
                        onRemoveIdol={onRemoveIdol}
                        onDragStart={handleIdolDragStart}
                        onDragEnd={handleIdolDragEnd}
                    />
                );
            })}
        </div>
    );
}

export function IdolGrid({
    placements,
    inventory,
    unlockedConditions,
    onPlaceIdol,
    onMoveIdol,
    onRemoveIdol,
    onIdolClick,
}: IdolGridProps) {
    return (
        <div className="flex flex-col items-center">
            <GridTabContent
                placements={placements}
                inventory={inventory}
                unlockedConditions={unlockedConditions}
                onIdolClick={onIdolClick}
                onRemoveIdol={onRemoveIdol}
                onPlaceIdol={onPlaceIdol}
                onMoveIdol={onMoveIdol}
            />
        </div>
    );
}

export { CELL_SIZE };
