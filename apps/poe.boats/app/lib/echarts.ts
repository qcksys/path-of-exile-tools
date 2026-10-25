import { BarChart, type BarSeriesOption, LineChart, type LineSeriesOption } from "echarts/charts";
import {
    GridComponent,
    type GridComponentOption,
    TooltipComponent,
    type TooltipComponentOption,
} from "echarts/components";
import { type ComposeOption, init, use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

export type ChartOption = ComposeOption<
    BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption
>;

use([BarChart, LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export { init };
