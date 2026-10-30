import { BarChart, type BarSeriesOption, LineChart, type LineSeriesOption } from "echarts/charts";
import {
    DataZoomComponent,
    type DataZoomComponentOption,
    GridComponent,
    type GridComponentOption,
    LegendComponent,
    type LegendComponentOption,
    TooltipComponent,
    type TooltipComponentOption,
} from "echarts/components";
import { type ComposeOption, init, use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

export type ChartOption = ComposeOption<
    | BarSeriesOption
    | LineSeriesOption
    | DataZoomComponentOption
    | GridComponentOption
    | LegendComponentOption
    | TooltipComponentOption
>;

use([
    BarChart,
    LineChart,
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    TooltipComponent,
    SVGRenderer,
]);

export { init };
