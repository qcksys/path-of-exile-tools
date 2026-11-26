import { Link } from "react-router";
import { GAME_TOOLS } from "~/data/game-tools";
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
            <nav aria-label="Path of Exile 2 tools" className="flex flex-wrap justify-center gap-4">
                {GAME_TOOLS["2"].map((tool) => (
                    <Link
                        key={tool.to}
                        to={tool.to}
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        {tool.label}
                    </Link>
                ))}
            </nav>
        </main>
    );
}
