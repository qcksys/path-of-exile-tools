import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import type { InventoryIdol } from "~/schemas/inventory";

interface DragOffset {
    x: number;
    y: number;
}

interface DragSource {
    inventoryIdol: InventoryIdol;
    placementId?: string;
    offset?: DragOffset;
}

interface DndContextValue {
    draggedItem: InventoryIdol | null;
    sourcePlacementId: string | null;
    dragOffset: DragOffset;
    setDraggedItem: (item: InventoryIdol | null, placementId?: string, offset?: DragOffset) => void;
    isDragging: boolean;
}

const DND_CONTEXT = createContext<DndContextValue | null>(null);

const DEFAULT_OFFSET: DragOffset = { x: 0, y: 0 };

export function DndProvider({ children }: { children: ReactNode }) {
    const [dragSource, setDragSource] = useState<DragSource | null>(null);

    const setDraggedItem = useCallback(
        (item: InventoryIdol | null, placementId?: string, offset?: DragOffset) => {
            if (item) {
                setDragSource({
                    inventoryIdol: item,
                    placementId,
                    offset: offset ?? DEFAULT_OFFSET,
                });
            } else {
                setDragSource(null);
            }
        },
        [],
    );

    return (
        <DND_CONTEXT.Provider
            value={{
                draggedItem: dragSource?.inventoryIdol ?? null,
                sourcePlacementId: dragSource?.placementId ?? null,
                dragOffset: dragSource?.offset ?? DEFAULT_OFFSET,
                setDraggedItem,
                isDragging: dragSource !== null,
            }}
        >
            {children}
        </DND_CONTEXT.Provider>
    );
}

export function useDnd(): DndContextValue {
    const context = useContext(DND_CONTEXT);
    if (!context) {
        throw new Error("useDnd must be used within a DndProvider");
    }
    return context;
}
