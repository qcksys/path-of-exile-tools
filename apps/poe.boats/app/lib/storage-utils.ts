import { toast } from "sonner";
import type { z } from "zod";

/**
 * Load data from localStorage with Zod schema validation.
 * Returns the default value if:
 * - Running on server (SSR)
 * - No stored data exists
 * - Stored data fails validation (shows toast notification)
 */
export function loadFromStorage<T>(key: string, schema: z.ZodType<T>, defaultValue: T): T {
    if (typeof window === "undefined") return defaultValue;

    try {
        const stored = localStorage.getItem(key);
        if (!stored) return defaultValue;

        const parsed = JSON.parse(stored);
        const result = schema.safeParse(parsed);
        if (result.success) {
            return result.data;
        }
        // Schema validation failed
        const shortKey = key.replace("poe-idol-planner-", "");
        toast.error("Failed to load settings", {
            description: `Invalid data in "${shortKey}". Using defaults.`,
        });
    } catch {
        // JSON parse error
        const shortKey = key.replace("poe-idol-planner-", "");
        toast.error("Failed to load settings", {
            description: `Corrupted data in "${shortKey}". Using defaults.`,
        });
    }
    return defaultValue;
}

/**
 * Save data to localStorage.
 * No-op on server (SSR).
 */
export function saveToStorage<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Remove data from localStorage.
 * No-op on server (SSR).
 */
export function removeFromStorage(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
}
