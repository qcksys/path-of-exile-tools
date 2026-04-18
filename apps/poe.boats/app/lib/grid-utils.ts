import { getIdolBaseOrDefault, IDOL_BASES, type IdolBaseKey } from "~/data/idol-bases";
import type { IdolPlacement } from "~/schemas/idol-set";
import type { InventoryIdol } from "~/schemas/inventory";

export const GRID_WIDTH = 6;
export const GRID_HEIGHT = 7;

// Invalid cells (blocked) based on POE idol inventory layout
export const INVALID_CELLS: Set<string> = new Set([
    "0,0",
    "1,2",
    "1,3",
    "1,4",
    "2,3",
    "3,3",
    "4,3",
    "4,2",
    "4,4",
    "5,6",
]);

export function isCellValid(x: number, y: number): boolean {
    return !INVALID_CELLS.has(`${x},${y}`);
}

export interface Position {
    x: number;
    y: number;
}

export function createOccupancyGrid(): boolean[][] {
    return Array.from({ length: GRID_HEIGHT }, () =>
        Array.from({ length: GRID_WIDTH }, () => false),
    );
}

export function buildOccupancyGrid(
    placements: IdolPlacement[],
    inventory: InventoryIdol[],
    excludePlacementId?: string,
): boolean[][] {
    const grid = createOccupancyGrid();
    const filteredPlacements = placements.filter((p) => p.id !== excludePlacementId);

    for (const placement of filteredPlacements) {
        const invIdol = inventory.find((i) => i.id === placement.inventoryIdolId);
        if (!invIdol) continue;

        const base = getIdolBaseOrDefault(invIdol.idol.baseType);
        if (!base) continue;
        const { x, y } = placement.position;

        for (let dy = 0; dy < base.height; dy++) {
            for (let dx = 0; dx < base.width; dx++) {
                const cellY = y + dy;
                const cellX = x + dx;
                if (cellY < GRID_HEIGHT && cellX < GRID_WIDTH) {
                    grid[cellY][cellX] = true;
                }
            }
        }
    }

    return grid;
}

export function checkCanPlace(
    grid: boolean[][],
    baseType: IdolBaseKey,
    position: Position,
): boolean {
    const base = IDOL_BASES[baseType];
    const { x, y } = position;

    if (x < 0 || y < 0) {
        return false;
    }

    if (x + base.width > GRID_WIDTH || y + base.height > GRID_HEIGHT) {
        return false;
    }

    for (let dy = 0; dy < base.height; dy++) {
        for (let dx = 0; dx < base.width; dx++) {
            const cellX = x + dx;
            const cellY = y + dy;
            // Check both occupancy and cell validity
            if (grid[cellY][cellX] || !isCellValid(cellX, cellY)) {
                return false;
            }
        }
    }

    return true;
}
