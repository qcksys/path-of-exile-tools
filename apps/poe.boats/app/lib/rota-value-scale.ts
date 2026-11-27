type Amount = number | null | undefined;

/** Net returns and differences use break-even as the midpoint. Other metrics use their observed range. */
export function rotaValueScale(values: Amount[], midpoint?: 0) {
    const finite = values.filter(
        (value): value is number => value != null && Number.isFinite(value),
    );
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    return (value: Amount) => {
        if (value == null || !Number.isFinite(value) || !finite.length) return undefined;
        let position: number;
        if (midpoint === 0) {
            if (value === 0) return undefined;
            position = value / Math.abs(value < 0 ? min : max);
        } else {
            if (min === max) return undefined;
            position = 2 * ((value - min) / (max - min)) - 1;
        }
        const endpoint = position < 0 ? "var(--chart-5)" : "var(--chart-3)";
        const percent = Math.round(100 * Math.min(1, Math.abs(position)));
        return { color: `color-mix(in oklab, var(--foreground), ${endpoint} ${percent}%)` };
    };
}

export type RotaValueScale = ReturnType<typeof rotaValueScale>;
export const fractionScale = rotaValueScale([0, 1]);
