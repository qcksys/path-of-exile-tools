import { Link } from "react-router";
import type { SiteHandle } from "~/routes/layouts/site";
import type { Route } from "./+types/poe2-home";

export const handle = { section: "Path of Exile 2" } satisfies SiteHandle;

export function meta(): Route.MetaDescriptors {
    return [{ title: "Path of Exile 2 · POE.BOATS" }];
}

export default function Poe2Home() {
    return (
        <main className="container mx-auto flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
            <h1 className="font-heading text-4xl font-bold tracking-tight">Path of Exile 2</h1>
            <nav className="flex gap-4">
                <Link
                    to="/2/crafting"
                    className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Crafting Calculator
                </Link>
                <Link
                    to="/2/market/currency"
                    className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Exchange Prices
                </Link>
                <Link
                    to="/2/arbitrage"
                    className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Reforging Arbitrage
                </Link>
            </nav>
        </main>
    );
}
