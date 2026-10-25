import type { BarSeriesOption } from "echarts/charts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
    ModifierFrequencyChart,
    modifierFrequencyChartOption,
} from "~/components/crafting/modifier-frequency-chart";
import { init } from "~/lib/echarts";

const rows = [
    { id: "life", text: "+(70-79) to maximum Life", share: 62.5 },
    { id: "hybrid", text: "+12% to Armour\n+8 to maximum Life", share: 12.25 },
];

describe("modifier frequency chart", () => {
    it("plots each modifier's share of trials on a percentage scale in rank order", () => {
        const option = modifierFrequencyChartOption(rows);
        const chart = init(null, null, { renderer: "svg", ssr: true, width: 720, height: 120 });
        chart.setOption(option);
        const svg = chart.renderToSVGString();
        chart.dispose();
        expect(svg).toContain("62.5%");
        expect(svg).toContain("12.3%");
        expect(svg).toContain(">100%<");
        expect((option.series as BarSeriesOption[])[0]!.data).toEqual([62.5, 12.25]);
        expect(option.yAxis).toMatchObject({
            inverse: true,
            data: ["+(70-79) to maximum Life", "+12% to Armour / +8 to maximum Life"],
        });
    });
    it("lists exact modifier text and shares for screen readers", () => {
        const markup = renderToStaticMarkup(<ModifierFrequencyChart rows={rows} />);
        expect(markup).toContain('role="img"');
        expect(markup).toContain("+(70-79) to maximum Life: 62.5%");
        expect(markup).toContain("+8 to maximum Life: 12.3%");
    });
});
