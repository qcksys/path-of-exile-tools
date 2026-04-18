import { useEffect, useState } from "react";

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

    // Load from storage on mount
    // biome-ignore lint/correctness/useExhaustiveDependencies: Only run once
    useEffect(() => {
        const loaded = loadFn();
        setState(loaded);
        setIsHydrated(true);
    }, []);

    // Save to storage when state changes (after hydration)
    // biome-ignore lint/correctness/useExhaustiveDependencies: Only run once
    useEffect(() => {
        if (isHydrated) {
            saveFn(state);
        }
    }, [state, isHydrated]);

    return [state, setState, isHydrated];
}
