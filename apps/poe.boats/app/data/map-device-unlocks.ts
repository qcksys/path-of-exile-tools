export interface MapDeviceUnlock {
    id: string;
    name: string;
    positions: Array<{ x: number; y: number }>;
}

export const MAP_DEVICE_UNLOCKS: MapDeviceUnlock[] = [
    {
        id: "tier16",
        name: "Complete a Tier 16+ Map",
        positions: [{ x: 1, y: 0 }],
    },
    {
        id: "elderGuardian",
        name: "Defeat an Elder Guardian",
        positions: [{ x: 2, y: 0 }],
    },
    {
        id: "shaperGuardian",
        name: "Defeat a Shaper Guardian",
        positions: [{ x: 3, y: 0 }],
    },
    {
        id: "atlas100",
        name: "Complete 100 Atlas Bonus Objectives",
        positions: [{ x: 4, y: 0 }],
    },
    {
        id: "atlas115",
        name: "Complete 115 Atlas Bonus Objectives",
        positions: [{ x: 5, y: 0 }],
    },
    {
        id: "atlas20",
        name: "Complete 20 Atlas Bonus Objectives",
        positions: [{ x: 5, y: 1 }],
    },
    {
        id: "atlas60",
        name: "Complete 60 Atlas Bonus Objectives",
        positions: [{ x: 0, y: 5 }],
    },
    {
        id: "elderShaper",
        name: "Defeat The Elder in The Shaper's Realm",
        positions: [{ x: 0, y: 6 }],
    },
    {
        id: "maven",
        name: "Defeat The Maven",
        positions: [{ x: 1, y: 6 }],
    },
    {
        id: "eaterOfWorlds",
        name: "Defeat The Eater of Worlds",
        positions: [{ x: 2, y: 6 }],
    },
    {
        id: "searingExarch",
        name: "Defeat The Searing Exarch",
        positions: [{ x: 3, y: 6 }],
    },
    {
        id: "shaper",
        name: "Defeat The Shaper",
        positions: [{ x: 4, y: 6 }],
    },
];

export function getUnlockById(id: string): MapDeviceUnlock | undefined {
    return MAP_DEVICE_UNLOCKS.find((u) => u.id === id);
}

export function getAllUnlockIds(): string[] {
    return MAP_DEVICE_UNLOCKS.map((u) => u.id);
}

export function getLockedPositions(unlockedConditions: string[]): Set<string> {
    const unlockedSet = new Set(unlockedConditions);
    const lockedPositions = new Set<string>();

    for (const unlock of MAP_DEVICE_UNLOCKS) {
        if (!unlockedSet.has(unlock.id)) {
            for (const pos of unlock.positions) {
                lockedPositions.add(`${pos.x},${pos.y}`);
            }
        }
    }

    return lockedPositions;
}

export function isPositionLocked(x: number, y: number, unlockedConditions: string[]): boolean {
    const lockedPositions = getLockedPositions(unlockedConditions);
    return lockedPositions.has(`${x},${y}`);
}
