import { Link } from "react-router";
import { GAME_TOOLS } from "~/data/game-tools";
import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
    return [
        { title: "POE.BOATS · Path of Exile tools" },
        {
            name: "description",
            content:
                "Crafting calculators, market prices, arbitrage and idol planning for Path of Exile 1 and Path of Exile 2.",
        },
    ];
}

const Home = () => {
    return (
        <main className="container mx-auto flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
            <img src="/logo.avif" alt="POE.BOATS" width={80} height={80} className="rounded-lg" />
            <h1 className="font-heading text-4xl font-bold tracking-tight">POE.BOATS</h1>
            <p className="text-muted-foreground text-lg">
                Tools for Path of Exile 1 and Path of Exile 2.
            </p>
            <div className="grid w-full max-w-2xl items-start gap-4 sm:grid-cols-2">
                {(["1", "2"] as const).map((game) => (
                    <nav
                        key={game}
                        aria-label={`Path of Exile ${game} tools`}
                        className="rounded-xl border border-border bg-card p-2 text-left"
                    >
                        <h2>
                            <Link
                                to={`/${game}/`}
                                className="block rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Path of Exile {game}
                            </Link>
                        </h2>
                        <ul className="mt-2">
                            {GAME_TOOLS[game].map((tool) => (
                                <li key={tool.to}>
                                    <Link
                                        to={tool.to}
                                        className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm hover:bg-muted hover:text-primary"
                                    >
                                        <tool.icon
                                            aria-hidden="true"
                                            className="size-4 text-primary"
                                        />
                                        {tool.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                ))}
            </div>
        </main>
    );
};

export default Home;
