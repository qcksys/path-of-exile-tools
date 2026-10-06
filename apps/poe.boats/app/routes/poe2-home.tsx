import { Link } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";

export default function Poe2Home() {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section="Path of Exile 2" />
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
                        to="/2/arbitrage"
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Reforging Arbitrage
                    </Link>
                </nav>
            </main>
            <AppFooter />
        </div>
    );
}
