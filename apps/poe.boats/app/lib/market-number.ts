export function marketNumber(value: number): string {
    return new Intl.NumberFormat("en", {
        ...(value !== 0 && Math.abs(value) < 1
            ? { maximumSignificantDigits: 4 }
            : { maximumFractionDigits: 2 }),
    }).format(value);
}
