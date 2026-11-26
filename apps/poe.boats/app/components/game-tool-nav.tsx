import { useEffect, useRef } from "react";
import { Link, matchPath, useLocation, useMatch } from "react-router";
import { GAME_TOOLS } from "~/data/game-tools";

export function GameToolNav() {
    const { pathname } = useLocation();
    const game = useMatch("/:game/*")?.params.game;
    const tools = game === "1" || game === "2" ? GAME_TOOLS[game] : [];
    const active = tools.find((tool) =>
        matchPath({ path: tool.sectionPath ?? tool.to, end: false }, pathname),
    );
    const strip = useRef<HTMLUListElement>(null);
    const selected = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        if (!active || !strip.current || !selected.current) return;
        const { offsetLeft, offsetWidth } = selected.current;
        const { scrollLeft, clientWidth } = strip.current;
        if (offsetLeft < scrollLeft || offsetLeft + offsetWidth > scrollLeft + clientWidth)
            strip.current.scrollLeft = offsetLeft - (clientWidth - offsetWidth) / 2;
    }, [active]);

    if (!active) return null;
    return (
        <nav
            aria-label={`Path of Exile ${game} tools`}
            className="border-t border-border bg-background"
        >
            <div className="container mx-auto flex min-w-0 items-center gap-2 px-4">
                <Link
                    to={`/${game}/`}
                    aria-label={`Path of Exile ${game} overview`}
                    className="shrink-0 border-r border-border pr-3 text-sm font-semibold hover:text-primary"
                >
                    PoE {game}
                </Link>
                <ul ref={strip} className="relative flex min-w-0 gap-1 overflow-x-auto">
                    {tools.map((tool) => (
                        <li key={tool.to} className="shrink-0">
                            <Link
                                to={tool.to}
                                ref={tool === active ? selected : undefined}
                                aria-current={tool === active ? "page" : undefined}
                                className="flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-primary"
                            >
                                <tool.icon className="size-4" aria-hidden="true" />
                                {tool.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </nav>
    );
}
