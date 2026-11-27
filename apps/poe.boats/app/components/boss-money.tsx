import { CurrencyLabel } from "~/components/currency-label";
import { marketNumber } from "~/lib/market-number";

export function bossMoney(
    divine: number | null,
    value: number | null,
    priced: number | null = null,
) {
    const amount = value ?? priced;
    if (amount === null) return "Unknown";
    const useDivine = divine !== null && divine > 0 && Math.abs(amount) >= divine;
    return (
        <span
            className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
            title={`${marketNumber(amount)} Chaos Orbs`}
        >
            {value === null ? "≥ " : ""}
            {marketNumber(useDivine ? amount / divine : amount)}
            <CurrencyLabel
                currency={useDivine ? "divine" : "chaos"}
                label={useDivine ? "Divine Orbs" : "Chaos Orbs"}
                game="poe1"
                iconOnly
            />
        </span>
    );
}
