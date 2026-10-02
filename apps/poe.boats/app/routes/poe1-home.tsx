import { Link } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";

export default function Poe1Home() {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section="Path of Exile 1" />
            <main className="container mx-auto flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
                <h1 className="font-heading text-4xl font-bold tracking-tight">Path of Exile 1</h1>
                <nav className="flex flex-wrap justify-center gap-4">
                    <Link
                        to="/1/idol-planner"
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Idol Planner
                    </Link>
                    <Link
                        to="/1/arbitrage"
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Vendor Recipe Arbitrage
                    </Link>
                    <Link
                        to="/1/recombinator"
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Recombinator Simulator
                    </Link>
                    <Link
                        to="/1/market"
                        className="rounded-lg border border-border px-6 py-3 font-medium transition-colors hover:bg-muted"
                    >
                        Season market
                    </Link>
                </nav>
            </main>
            <AppFooter />
        </div>
    );
}
