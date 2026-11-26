import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Hook for state that persists to localStorage with SSR-safe hydration.
 *
 * Handles the common pattern of:
 * 1. Initialize with default value (SSR-safe)
 * 2. Load from storage on mount
 * 3. Auto-save to storage when state changes (after hydration)
 *
 * @param loadFn Function to load state from storage
 * @param saveFn Function to save state to storage
 * @param defaultValue Default value used during SSR and initial render
 * @returns Tuple of [state, setState, isHydrated]
 */
export function useStorageState<T>(
    loadFn: () => T,
    saveFn: (value: T) => void,
    defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
    const [state, setState] = useState<T>(defaultValue);
    const [isHydrated, setIsHydrated] = useState(false);
    const confirmed = useRef(defaultValue);
    const restoring = useRef(false);

    // Load from storage on mount
    // biome-ignore lint/correctness/useExhaustiveDependencies: Only run once
    useEffect(() => {
        const loaded = loadFn();
        confirmed.current = loaded;
        setState(loaded);
        setIsHydrated(true);
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Persist changes to the value, including the initial hydrated value.
    useEffect(() => {
        if (!isHydrated) return;
        if (restoring.current && Object.is(state, confirmed.current)) {
            restoring.current = false;
            return;
        }
        try {
            saveFn(state);
            confirmed.current = state;
            restoring.current = false;
        } catch (error) {
            restoring.current = true;
            setState(() => confirmed.current);
            toast.error("Failed to save changes", {
                description: error instanceof Error ? error.message : undefined,
            });
        }
    }, [state, isHydrated]);

    return [state, setState, isHydrated];
}
