import { Anvil, ArrowRightLeft, ChartNoAxesCombined, Combine, Grid2X2, type LucideIcon, Swords, Trophy } from "lucide-react";

export type ToolGame = "1" | "2";

type GameTool = {
    to: string;
    label: string;
    icon: LucideIcon;
    sectionPath?: string;
};

export const GAME_TOOLS: Record<ToolGame, readonly GameTool[]> = {
    "1": [
        { to: "/1/crafting", label: "Crafting Calculator", icon: Anvil },
        { to: "/1/idol-planner", label: "Idol Planner", icon: Grid2X2 },
        { to: "/1/arbitrage", label: "Vendor Recipe Arbitrage", icon: ArrowRightLeft },
        { to: "/1/boss-rota", label: "Boss Rota Profits", icon: Swords },
        { to: "/1/recombinator", label: "Recombinator Simulator", icon: Combine },
        { to: "/1/market/currency", sectionPath: "/1/market", label: "Season market", icon: ChartNoAxesCombined },
        { to: "/1/collectors", label: "Collector Gallery", icon: Trophy },
    ],
    "2": [
        { to: "/2/crafting", label: "Crafting Calculator", icon: Anvil },
        { to: "/2/market/currency", sectionPath: "/2/market", label: "Exchange Prices", icon: ChartNoAxesCombined },
        { to: "/2/arbitrage", label: "Reforging Arbitrage", icon: ArrowRightLeft },
    ],
};
