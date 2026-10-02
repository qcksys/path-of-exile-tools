import { Mail } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { siGithub } from "simple-icons";
import { LocaleSwitcher } from "~/components/idol-planner/locale-switcher";
import { ModeToggle } from "~/components/idol-planner/mode-toggle";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useTranslations } from "~/i18n";

type AppHeaderProps = {
    section?: ReactNode;
    sectionBadge?: ReactNode;
    tools?: ReactNode;
};

export function AppHeader({ section, sectionBadge, tools }: AppHeaderProps = {}) {
    const t = useTranslations();

    return (
        <header className="sticky top-0 z-50 border-border border-b bg-background/90 backdrop-blur">
            <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Link to="/" className="flex shrink-0 items-center gap-2">
                        <img
                            src="/logo.avif"
                            alt=""
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded"
                        />
                        <span className="font-bold text-foreground text-lg">POE.BOATS</span>
                    </Link>
                    {section && (
                        <>
                            <span className="text-muted-foreground">/</span>
                            <span className="shrink-0 font-medium">{section}</span>
                        </>
                    )}
                    {sectionBadge && (
                        <span className="hidden shrink-0 rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs sm:inline">
                            {sectionBadge}
                        </span>
                    )}
                    <Link
                        to="/changelog"
                        className="hidden text-muted-foreground text-sm hover:text-foreground md:inline"
                    >
                        {t("nav.changelog")}
                    </Link>
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    {tools}
                    <span className="hidden sm:inline">
                        <LocaleSwitcher />
                    </span>
                    <ModeToggle />
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="hidden sm:inline-flex"
                                    render={
                                        <a href="mailto:contact@poe.boats" aria-label="Email">
                                            <span className="sr-only">Email</span>
                                        </a>
                                    }
                                />
                            }
                        >
                            <Mail className="h-5 w-5" />
                        </TooltipTrigger>
                        <TooltipContent>{t("footer.emailMe")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    render={
                                        <a
                                            href="https://github.com/praetoros/path-of-exile-tools"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label="GitHub"
                                        >
                                            <span className="sr-only">GitHub</span>
                                        </a>
                                    }
                                />
                            }
                        >
                            <svg
                                role="img"
                                viewBox="0 0 24 24"
                                className="h-5 w-5 fill-current"
                                aria-label="GitHub"
                            >
                                <path d={siGithub.path} />
                            </svg>
                        </TooltipTrigger>
                        <TooltipContent>{t("nav.github")}</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </header>
    );
}
