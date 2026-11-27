import { expect, it } from "vite-plus/test";
import { fractionScale, rotaValueScale } from "~/lib/rota-value-scale";

it("colours finite values by magnitude regardless of row order and excludes unknowns", () => {
    const scale = rotaValueScale([30, null, 10, 20]);
    expect(scale(10)).toEqual(fractionScale(0));
    expect(scale(20)).toEqual(fractionScale(0.5));
    expect(scale(30)).toEqual(fractionScale(1));
    expect(scale(10)).not.toEqual(scale(30));
    expect(scale(15)).not.toEqual(scale(10));
    expect(scale(null)).toBeUndefined();
    expect(rotaValueScale([4, 4, null])(4)).toBeUndefined();
    expect(rotaValueScale([undefined, Number.NaN])(0)).toBeUndefined();
});

it("centres signed results on zero even with one-sided or asymmetric data", () => {
    const scale = rotaValueScale([-10, 0, 100], 0);
    expect(scale(-10)).toEqual(fractionScale(0));
    expect(scale(0)).toBeUndefined();
    expect(scale(100)).toEqual(fractionScale(1));
    expect(scale(-5)?.color).toContain("50%");
    expect(scale(25)?.color).toContain("25%");
    expect(rotaValueScale([3, 6], 0)(3)?.color).toContain("--chart-3");
    expect(rotaValueScale([-4, -2], 0)(-2)?.color).toContain("--chart-5");
});
