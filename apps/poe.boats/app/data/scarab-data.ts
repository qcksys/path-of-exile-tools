import scarabsJson from "~/data/scarabs.json";
import { DEFAULT_LOCALE, type SupportedLocale } from "~/i18n/types";
import type { MapDeviceSlot, Scarab, ScarabsData } from "~/schemas/scarab";

const scarabsData = scarabsJson as ScarabsData;

export const SCARABS: Scarab[] = scarabsData.scarabs;

export const SCARAB_CATEGORIES: string[] = scarabsData.categories;

const scarabsById = new Map<string, Scarab>();
for (const scarab of SCARABS) {
    scarabsById.set(scarab.id, scarab);
}

export function getScarabById(id: string): Scarab | undefined {
    return scarabsById.get(id);
}

/** The scarabs in a map device's slots, skipping ids no longer in the scarab data. */
export function getSlotScarabs(slots: MapDeviceSlot[]): Scarab[] {
    return slots.flatMap((slot) => {
        const scarab = slot.scarabId ? scarabsById.get(slot.scarabId) : undefined;
        return scarab ? [scarab] : [];
    });
}

export function getScarabsByCategory(category: string): Scarab[] {
    return SCARABS.filter((s) => s.category === category);
}

export function getScarabName(scarab: Scarab, locale: SupportedLocale = DEFAULT_LOCALE): string {
    return scarab.name[locale] ?? scarab.name.en;
}

export function getScarabEffect(scarab: Scarab, locale: SupportedLocale = DEFAULT_LOCALE): string {
    return scarab.effect[locale] ?? scarab.effect.en;
}

export function searchScarabs(query: string, locale: SupportedLocale = DEFAULT_LOCALE): Scarab[] {
    const lowerQuery = query.toLowerCase();
    return SCARABS.filter(
        (s) =>
            getScarabName(s, locale).toLowerCase().includes(lowerQuery) ||
            getScarabEffect(s, locale).toLowerCase().includes(lowerQuery) ||
            s.category.toLowerCase().includes(lowerQuery),
    );
}
