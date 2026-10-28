/** Large amounts shortened (1.2K, 3.4M); small ones as `marketNumber`. */
export function marketCompactNumber(value: number): string {
    if (Math.abs(value) < 1000) return marketNumber(value);
    return new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

/** A price to at most two decimal places, or "< 0.01" for a positive amount below that. */
export function marketPriceNumber(value: number): string {
    if (value > 0 && value < 0.01) return "< 0.01";
    return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

export function marketNumber(value: number): string {
    return new Intl.NumberFormat("en", {
        ...(value !== 0 && Math.abs(value) < 1
            ? { maximumSignificantDigits: 4 }
            : { maximumFractionDigits: 2 }),
    }).format(value);
}
