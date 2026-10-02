import { Link } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { RecombinatorSimulator } from "~/components/recombinator/simulator";

export function meta() {
    return [
        { title: "Recombinator Simulator · POE.BOATS" },
        {
            name: "description",
            content:
                "Plan multi-step Path of Exile recombinations and calculate the odds of every modifier outcome.",
        },
    ];
}

export default function RecombinatorPage() {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section={<span className="hidden sm:inline">Recombinator</span>} />
            <main className="container mx-auto flex-1 space-y-6 px-4 py-8">
                <Link to="/1/" className="text-sm text-muted-foreground hover:text-foreground">
                    ← Path of Exile 1 tools
                </Link>
                <RecombinatorSimulator />
            </main>
            <AppFooter />
        </div>
    );
}
