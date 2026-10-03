import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { RecombinatorSimulator } from "~/components/recombinator/simulator";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
    type RecombinatorCatalog,
    recombinatorCatalogSchema,
} from "~/schemas/recombinator-catalog";

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
    const [catalog, setCatalog] = useState<RecombinatorCatalog>();
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setError(false);
        async function load() {
            try {
                const response = await fetch("/game-data/recombinator-poe1.json", {
                    signal: controller.signal,
                    cache: attempt > 0 ? "reload" : "no-cache",
                });
                if (!response.ok) throw new Error("Catalog request failed");
                const data = recombinatorCatalogSchema.parse(await response.json());
                if (active) setCatalog(data);
            } catch {
                if (active) setError(true);
            }
        }
        void load();
        return () => {
            active = false;
            controller.abort();
        };
    }, [attempt]);
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section={<span className="hidden sm:inline">Recombinator</span>} />
            <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
                <Button
                    variant="link"
                    nativeButton={false}
                    className="self-start"
                    render={<Link to="/1/" />}
                >
                    ← Path of Exile 1 tools
                </Button>
                {!catalog ? (
                    <Alert role={error ? "alert" : "status"}>
                        <AlertTitle>
                            {error ? "Item catalog unavailable" : "Loading item catalog…"}
                        </AlertTitle>
                        <AlertDescription>
                            {error
                                ? "The item catalog could not be loaded. Retry to select bases and modifiers."
                                : "Preparing equipment bases and valid modifiers."}
                            {error ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAttempt((value) => value + 1)}
                                >
                                    Retry catalog
                                </Button>
                            ) : null}
                        </AlertDescription>
                    </Alert>
                ) : (
                    <RecombinatorSimulator catalog={catalog} />
                )}
            </main>
            <AppFooter />
        </div>
    );
}
