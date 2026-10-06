import type { SupportedLocale } from "~/i18n/types";
import { resolveModText } from "~/lib/mod-text-resolver";
import type { InventoryIdol } from "~/schemas/inventory";

export function searchIdolInventory(
    inventory: InventoryIdol[],
    query: string,
    locale: SupportedLocale = "en",
) {
    if (!query) return inventory;
    const text = query.toLowerCase();
    return inventory.filter(
        ({ idol }) =>
            idol.name?.toLowerCase().includes(text) ||
            idol.baseType.toLowerCase().includes(text) ||
            [...idol.prefixes, ...idol.suffixes].some((mod) =>
                resolveModText(mod, locale).toLowerCase().includes(text),
            ),
    );
}
