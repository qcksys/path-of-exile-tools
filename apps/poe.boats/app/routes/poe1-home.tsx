import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { GAME_TOOLS } from "~/data/game-tools";
import type { SiteHandle } from "~/routes/layouts/site";
import type { Route } from "./+types/poe1-home";

export const handle = { section: "Path of Exile 1" } satisfies SiteHandle;

export function meta(): Route.MetaDescriptors {
    return [{ title: "Path of Exile 1 · POE.BOATS" }];
}

export default function Poe1Home() {
    return (
        <main className="container mx-auto flex max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-12">
            <h1 className="font-heading text-4xl font-bold tracking-tight">Path of Exile 1</h1>
            <nav
                aria-label="Path of Exile 1 tools"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
                {GAME_TOOLS["1"].map((tool) => (
                    <Link
                        key={tool.to}
                        to={tool.to}
                        className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <tool.icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="font-semibold text-primary">{tool.label}</span>
                        <ArrowRight
                            className="ml-auto size-4 shrink-0 text-primary"
                            aria-hidden="true"
                        />
                    </Link>
                ))}
            </nav>
        </main>
    );
}
