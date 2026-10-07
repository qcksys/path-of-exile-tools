import type { CohortHourly } from "./prices.ts";
import type { CohortPriceReference } from "./reference.ts";

export const adaptiveEquipmentPolicy = { minimumSellers: 10, maximumMovement: 0.1 } as const;

export function selectCohortPrice(
    row: CohortHourly,
    currency: string,
    window?: CohortPriceReference["window"],
) {
    const hourly = row.prices[currency];
    if (!hourly) return null;
    let selected = {
        ...hourly,
        listingCount: row.listingCount,
        unknownCount: row.unknownCount,
        windowStart: row.hour,
        hours: 1,
    };
    if (window !== "adaptive-v1") return selected;
    for (const hours of [6, 24] as const) {
        if (selected.sellers >= adaptiveEquipmentPolicy.minimumSellers) break;
        const wider = hourly.windows?.[hours];
        if (
            !wider ||
            wider.hourlyMedianMax / wider.hourlyMedianMin >
                1 + adaptiveEquipmentPolicy.maximumMovement
        )
            break;
        selected = { ...wider, windowStart: row.hour - (hours - 1) * 3600, hours };
    }
    return selected;
}
