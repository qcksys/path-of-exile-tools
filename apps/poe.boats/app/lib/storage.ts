import { z } from "zod";
import type { IdolModifier } from "~/schemas/idol";
import {
    type IdolPlacement,
    IdolPlacementSchema,
    type IdolSet,
    IdolSetSchema,
} from "~/schemas/idol-set";
import { type InventoryIdol, InventoryIdolSchema } from "~/schemas/inventory";
import {
    createEmptyStorage,
    STORAGE_VERSION,
    type StorageData,
    StorageSchema,
} from "~/schemas/storage";

const STORAGE_KEY = "poe-idol-planner-data";

// Derived from IdolSetSchema - validates only the required basic fields
const IDOL_SET_BASIC_FIELDS_SCHEMA = IdolSetSchema.pick({
    id: true,
    name: true,
    createdAt: true,
    updatedAt: true,
});

// Derived from StorageSchema - allows unknown set items for granular validation
const RAW_STORAGE_SCHEMA = StorageSchema.extend({
    sets: z.array(z.unknown()),
});

function reportValidationError(
    message: string,
    invalidData: unknown,
    context: Record<string, unknown> = {},
): void {
    console.warn({
        message,
        invalidData: JSON.stringify(invalidData, null, 2).slice(0, 10000),
        ...context,
    });
}

interface LegacyModifier extends IdolModifier {
    valueRange?: { min: number; max: number };
    mechanic?: string;
}

interface LegacyPlacement extends IdolPlacement {
    tab?: string;
}

interface LegacySet extends Omit<IdolSet, "placements" | "inventory"> {
    activeTab?: string;
    placements: LegacyPlacement[];
    inventory: Array<{
        id: string;
        idol: {
            id: string;
            baseType: string;
            itemLevel: number;
            rarity: string;
            name?: string;
            implicit?: { text: string; value: number };
            prefixes: LegacyModifier[];
            suffixes: LegacyModifier[];
            corrupted: boolean;
        };
        importedAt: number;
        source: string;
        usageCount: number;
    }>;
}

function migrateModifier(mod: LegacyModifier): IdolModifier {
    const isMatchedMod =
        mod.modId.startsWith("prefix_") ||
        mod.modId.startsWith("suffix_") ||
        mod.modId.startsWith("unique_");

    return {
        modId: mod.modId,
        type: mod.type,
        text: isMatchedMod ? undefined : mod.text,
        rolledValue: mod.rolledValue,
        tier: mod.tier,
    };
}

function migratePlacement(placement: LegacyPlacement): IdolPlacement {
    return {
        id: placement.id,
        inventoryIdolId: placement.inventoryIdolId,
        position: placement.position,
    };
}

function migrateInventoryIdol(invIdol: LegacySet["inventory"][number]): InventoryIdol {
    return {
        id: invIdol.id,
        idol: {
            id: invIdol.idol.id,
            baseType: invIdol.idol.baseType,
            itemLevel: invIdol.idol.itemLevel,
            rarity: invIdol.idol.rarity,
            name: invIdol.idol.name,
            implicit: invIdol.idol.implicit,
            prefixes: invIdol.idol.prefixes.map(migrateModifier),
            suffixes: invIdol.idol.suffixes.map(migrateModifier),
        },
        importedAt: invIdol.importedAt,
        source: invIdol.source,
        usageCount: invIdol.usageCount,
    } as InventoryIdol;
}

function migrateSet(set: LegacySet): IdolSet {
    return {
        id: set.id,
        name: set.name,
        createdAt: set.createdAt,
        updatedAt: set.updatedAt,
        placements: set.placements.map(migratePlacement),
        inventory: set.inventory.map(migrateInventoryIdol),
        mapDevice: set.mapDevice,
        unlockedConditions: set.unlockedConditions,
    } as IdolSet;
}

function migrateStorage(parsed: unknown): StorageData | null {
    if (!parsed || typeof parsed !== "object") {
        return null;
    }

    const data = parsed as {
        version?: number;
        sets?: LegacySet[];
        activeSetId?: string | null;
    };

    if (data.version === STORAGE_VERSION) {
        return null;
    }

    if (data.version === 4) {
        console.log({ message: "Migrating storage from v4 to v5" });
        const migrated: StorageData = {
            version: STORAGE_VERSION,
            sets: data.sets?.map(migrateSet) ?? [],
            activeSetId: data.activeSetId ?? null,
        };
        return migrated;
    }

    return null;
}

interface ValidationStats {
    removedSets: number;
    removedInventoryItems: number;
    removedPlacements: number;
}

function validateSetGranularly(rawSet: unknown, stats: ValidationStats): IdolSet | null {
    if (!rawSet || typeof rawSet !== "object") {
        stats.removedSets++;
        reportValidationError("Removed invalid set (not an object)", rawSet);
        return null;
    }

    const set = rawSet as Record<string, unknown>;

    // Validate basic set structure using Zod schema
    const basicFieldsResult = IDOL_SET_BASIC_FIELDS_SCHEMA.safeParse({
        id: set.id,
        name: set.name,
        createdAt: set.createdAt,
        updatedAt: set.updatedAt,
    });

    if (!basicFieldsResult.success) {
        stats.removedSets++;
        reportValidationError("Removed invalid set (missing basic fields)", rawSet, {
            setId: set.id,
            zodErrors: basicFieldsResult.error.issues,
        });
        return null;
    }

    const basicFields = basicFieldsResult.data;

    // Validate inventory items individually
    const rawInventory = Array.isArray(set.inventory) ? set.inventory : [];
    const validInventory: InventoryIdol[] = [];
    const validInventoryIds = new Set<string>();

    for (const item of rawInventory) {
        const result = InventoryIdolSchema.safeParse(item);
        if (result.success) {
            validInventory.push(result.data);
            validInventoryIds.add(result.data.id);
        } else {
            stats.removedInventoryItems++;
            const itemId =
                item && typeof item === "object" ? (item as Record<string, unknown>).id : "unknown";
            reportValidationError("Removed invalid inventory item", item, {
                itemId,
                setId: basicFields.id,
                zodErrors: result.error.issues,
            });
        }
    }

    // Validate placements individually, also removing those referencing invalid inventory
    const rawPlacements = Array.isArray(set.placements) ? set.placements : [];
    const validPlacements: IdolPlacement[] = [];

    for (const placement of rawPlacements) {
        const result = IdolPlacementSchema.safeParse(placement);
        if (result.success) {
            // Also check if the referenced inventory item exists
            if (validInventoryIds.has(result.data.inventoryIdolId)) {
                validPlacements.push(result.data);
            } else {
                stats.removedPlacements++;
                reportValidationError(
                    "Removed placement referencing invalid inventory",
                    placement,
                    {
                        placementId: result.data.id,
                        inventoryIdolId: result.data.inventoryIdolId,
                        setId: basicFields.id,
                    },
                );
            }
        } else {
            stats.removedPlacements++;
            const placementId =
                placement && typeof placement === "object"
                    ? (placement as Record<string, unknown>).id
                    : "unknown";
            reportValidationError("Removed invalid placement", placement, {
                placementId,
                setId: basicFields.id,
                zodErrors: result.error.issues,
            });
        }
    }

    // Build the set with validated components and try to parse the whole thing
    const reconstructedSet = {
        id: basicFields.id,
        name: basicFields.name,
        createdAt: basicFields.createdAt,
        updatedAt: basicFields.updatedAt,
        placements: validPlacements,
        inventory: validInventory,
        mapDevice: set.mapDevice,
        unlockedConditions: set.unlockedConditions,
        contentHash: set.contentHash,
    };

    const finalResult = IdolSetSchema.safeParse(reconstructedSet);
    if (finalResult.success) {
        return finalResult.data;
    }

    // If final validation fails, the set has some other structural issue
    stats.removedSets++;
    reportValidationError("Removed set after reconstruction failed", rawSet, {
        setId: basicFields.id,
        zodErrors: finalResult.error.issues,
    });
    return null;
}

function loadStorageGranularly(parsed: unknown): StorageData | null {
    // Use Zod to validate top-level structure (version + sets array exists)
    const rawResult = RAW_STORAGE_SCHEMA.safeParse(parsed);
    if (!rawResult.success) {
        return null;
    }

    const rawStorage = rawResult.data;
    const stats: ValidationStats = {
        removedSets: 0,
        removedInventoryItems: 0,
        removedPlacements: 0,
    };

    const validSets: IdolSet[] = [];
    for (const rawSet of rawStorage.sets) {
        const validSet = validateSetGranularly(rawSet, stats);
        if (validSet) {
            validSets.push(validSet);
        }
    }

    // Validate activeSetId references a valid set
    let activeSetId: string | null = null;
    if (rawStorage.activeSetId !== null) {
        if (validSets.some((s) => s.id === rawStorage.activeSetId)) {
            activeSetId = rawStorage.activeSetId;
        } else {
            console.warn({
                message: "activeSetId references invalid set, clearing",
                activeSetId: rawStorage.activeSetId,
            });
        }
    }

    // If nothing was removed, return null to use the standard validation path
    if (
        stats.removedSets === 0 &&
        stats.removedInventoryItems === 0 &&
        stats.removedPlacements === 0
    ) {
        return null;
    }

    console.warn({
        message: "Storage had invalid data, performed granular cleanup",
        removedSets: stats.removedSets,
        removedInventoryItems: stats.removedInventoryItems,
        removedPlacements: stats.removedPlacements,
        remainingSets: validSets.length,
    });

    return {
        version: STORAGE_VERSION,
        sets: validSets,
        activeSetId,
    };
}

function cleanupOrphanedReferences(data: StorageData): StorageData | null {
    let cleanedPlacements = 0;
    let activeSetIdCleared = false;

    const cleanedSets = data.sets.map((set) => {
        const inventoryIds = new Set(set.inventory.map((inv) => inv.id));
        const validPlacements = set.placements.filter((p) => {
            if (inventoryIds.has(p.inventoryIdolId)) {
                return true;
            }
            cleanedPlacements++;
            reportValidationError("Removed orphaned placement", p, {
                placementId: p.id,
                inventoryIdolId: p.inventoryIdolId,
                setId: set.id,
            });
            return false;
        });

        if (validPlacements.length !== set.placements.length) {
            return { ...set, placements: validPlacements };
        }
        return set;
    });

    // Check if activeSetId references a valid set
    let activeSetId = data.activeSetId;
    if (activeSetId !== null && !cleanedSets.some((s) => s.id === activeSetId)) {
        console.warn({
            message: "activeSetId references non-existent set, clearing",
            activeSetId,
        });
        activeSetId = null;
        activeSetIdCleared = true;
    }

    if (cleanedPlacements === 0 && !activeSetIdCleared) {
        return null;
    }

    console.warn({
        message: "Cleaned up orphaned references in valid storage",
        removedPlacements: cleanedPlacements,
        activeSetIdCleared,
    });

    return {
        ...data,
        sets: cleanedSets,
        activeSetId,
    };
}

export function loadStorage(): StorageData {
    if (typeof window === "undefined") {
        return createEmptyStorage();
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return createEmptyStorage();
        }

        const parsed = JSON.parse(raw);

        // Try migration first
        const migrated = migrateStorage(parsed);
        if (migrated) {
            const result = StorageSchema.safeParse(migrated);
            if (result.success) {
                const cleaned = cleanupOrphanedReferences(result.data);
                const finalData = cleaned ?? result.data;
                saveStorage(finalData);
                return finalData;
            }
            // Migration produced invalid data, try granular cleanup
            const granularMigrated = loadStorageGranularly(migrated);
            if (granularMigrated) {
                saveStorage(granularMigrated);
                return granularMigrated;
            }
        }

        // Try standard validation first (fast path for valid data)
        const result = StorageSchema.safeParse(parsed);
        if (result.success) {
            // Schema is valid but may have orphaned references
            const cleaned = cleanupOrphanedReferences(result.data);
            if (cleaned) {
                saveStorage(cleaned);
                return cleaned;
            }
            return result.data;
        }

        // Standard validation failed, try granular cleanup
        const granularResult = loadStorageGranularly(parsed);
        if (granularResult) {
            saveStorage(granularResult);
            return granularResult;
        }

        // Granular cleanup couldn't salvage anything useful
        reportValidationError("Storage validation failed completely, using empty storage", parsed);
        return createEmptyStorage();
    } catch (error) {
        console.error({ message: "Failed to load storage", error });
        return createEmptyStorage();
    }
}

export type SaveStorageResult = { success: true } | { success: false; error: string };

export function saveStorage(data: StorageData): SaveStorageResult {
    if (typeof window === "undefined") {
        return { success: true };
    }

    try {
        const result = StorageSchema.safeParse(data);
        if (!result.success) {
            const errorMessage = result.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", ");
            console.error("Storage validation failed, not saving:", result.error);
            return { success: false, error: errorMessage };
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to save storage:", error);
        return { success: false, error: message };
    }
}

export function clearStorage(): void {
    if (typeof window === "undefined") {
        return;
    }
    localStorage.removeItem(STORAGE_KEY);
}
