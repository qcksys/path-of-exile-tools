import { Mail } from "lucide-react";
import { Link } from "react-router";
import { siGithub } from "simple-icons";
import { LocaleSwitcher } from "~/components/idol-planner/locale-switcher";
import { ModeToggle } from "~/components/idol-planner/mode-toggle";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useTranslations } from "~/i18n";

export function AppHeader() {
    const t = useTranslations();

    return (
        <header className="sticky top-0 z-50 border-border border-b bg-background/90 backdrop-blur">
            <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Link to="/idol-planner" className="shrink-0 font-bold text-accent text-lg">
                        {t.app.title}
                    </Link>
                    <span className="hidden shrink-0 rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs sm:inline">
                        {t.app.subtitle}
                    </span>
                    <Link
                        to="/idol-planner/changelog"
                        className="hidden text-muted-foreground text-sm hover:text-foreground md:inline"
                    >
                        {t.nav.changelog}
                    </Link>
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
                                    render={<a href="mailto:poe@qcksys.com" />}
                                />
                            }
                        >
                            <Mail className="h-5 w-5" />
                        </TooltipTrigger>
                        <TooltipContent>{t.footer.emailMe}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    render={
                                        <a
                                            href="https://github.com/qcksys/poe-idol-planner"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        />
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
                        <TooltipContent>{t.nav.github}</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </header>
    );
}
