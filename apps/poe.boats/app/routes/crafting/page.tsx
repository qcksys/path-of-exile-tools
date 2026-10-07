import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { CraftingProjects } from "~/components/crafting/projects";
import { CraftingWorkbench } from "~/components/crafting/workbench";
import { Button } from "~/components/ui/button";
import { useStorageState } from "~/hooks/use-storage-state";
import type { CraftingCatalog } from "~/schemas/crafting";

const fullscreenKey = "poe-boats:crafting:fullscreen";
function loadFullscreen() {
    try {
        return localStorage.getItem(fullscreenKey) === "true";
    } catch {
        return false;
    }
}
function saveFullscreen(value: boolean) {
    try {
        localStorage.setItem(fullscreenKey, String(value));
    } catch {
        // The current layout remains usable when browser storage is unavailable.
    }
}

export function CraftingPage({ game }: { game: "poe1" | "poe2" }) {
    const { mode = "calculate" } = useParams();
    const [catalog, setCatalog] = useState<CraftingCatalog>();
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [fullscreen, setFullscreen] = useStorageState(loadFullscreen, saveFullscreen, false);
    const fullscreenButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const loader = new Worker(
            new URL("../../lib/crafting-catalog.worker.ts", import.meta.url),
            { type: "module" },
        );
        setCatalog(undefined);
        setError("");
        loader.onmessage = ({
            data,
        }: MessageEvent<{ catalog?: CraftingCatalog; error?: string }>) => {
            if (data.catalog) setCatalog(data.catalog);
            else setError(data.error ?? "The crafting catalog could not be loaded.");
            loader.terminate();
        };
        loader.onerror = (event) => {
            setError(event.message || "The crafting catalog worker could not be started.");
            loader.terminate();
        };
        loader.postMessage({ game, reload: attempt > 0 });
        return () => loader.terminate();
    }, [game, attempt]);
    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: This page handles Escape after interactive descendants have handled it.
        <div
            className="flex min-h-screen flex-col"
            data-fullscreen={fullscreen}
            onKeyDown={(event) => {
                if (fullscreen && event.key === "Escape" && !event.defaultPrevented) {
                    setFullscreen(false);
                    fullscreenButton.current?.focus();
                }
            }}
        >
            <div hidden={fullscreen} className={fullscreen ? undefined : "contents"}>
                <AppHeader section="Crafting" />
            </div>
            <main
                className={`mx-auto w-full flex-1 space-y-6 px-4 py-6 sm:px-6 ${fullscreen ? "max-w-none" : "max-w-[1600px]"}`}
            >
                <div className="flex items-center justify-between gap-4">
                    <Link
                        to={`/${game === "poe1" ? 1 : 2}`}
                        hidden={fullscreen}
                        className="text-sm text-muted-foreground hover:text-foreground"
                    >
                        ← Path of Exile {game === "poe1" ? 1 : 2} tools
                    </Link>
                    <Button
                        ref={fullscreenButton}
                        className="ml-auto"
                        variant="outline"
                        aria-label="Fullscreen crafting"
                        aria-pressed={fullscreen}
                        onClick={() => setFullscreen((value) => !value)}
                    >
                        {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </Button>
                </div>
                {!["calculate", "simulate", "emulate", "projects"].includes(mode) ? (
                    <p>
                        Unknown crafting mode.{" "}
                        <Link to={`/${game === "poe1" ? 1 : 2}/crafting`}>Open the calculator</Link>
                        .
                    </p>
                ) : catalog && mode === "projects" ? (
                    <CraftingProjects key={catalog.game} catalog={catalog} />
                ) : catalog ? (
                    <CraftingWorkbench
                        key={`${catalog.game}:${catalog.patch}`}
                        catalog={catalog}
                        mode={mode}
                    />
                ) : (
                    <section
                        className="rounded-lg border border-border p-8"
                        role={error ? "alert" : "status"}
                    >
                        <h1 className="text-lg font-semibold">
                            {error
                                ? "Crafting data unavailable"
                                : "Loading build-extracted crafting data…"}
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {error || "Preparing item bases, modifiers, weights and recipes."}
                        </p>
                        {error ? (
                            <Button
                                className="mt-4"
                                variant="outline"
                                onClick={() => setAttempt(attempt + 1)}
                            >
                                Retry catalog
                            </Button>
                        ) : null}
                    </section>
                )}
            </main>
            <div hidden={fullscreen} className={fullscreen ? undefined : "contents"}>
                <AppFooter
                    source={`Game data extracted from the Path of Exile ${game === "poe1" ? 1 : 2} client${catalog ? ` · Build ${catalog.patch}` : ""}.`}
                />
            </div>
        </div>
    );
}
