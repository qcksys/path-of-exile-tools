import type { Scarab } from "~/schemas/scarab";

export function canSelectScarab(scarab: Scarab, usage: number, currentId: string | null) {
    return usage - (scarab.id === currentId ? 1 : 0) < scarab.limit;
}
