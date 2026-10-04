import { useTranslations } from "~/i18n";

export function AppFooter() {
    const t = useTranslations();

    return (
        <footer className="border-border border-t bg-background/50 py-3">
            <div className="container mx-auto flex items-center justify-center px-4">
                <p className="text-muted-foreground text-sm">
                    {t("footer.dataFrom")}{" "}
                    <a
                        href="https://poe.ninja"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline-offset-4 hover:underline"
                    >
                        poe.ninja
                    </a>
                    {" & "}
                    <a
                        href="https://poedb.tw"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline-offset-4 hover:underline"
                    >
                        poedb.tw
                    </a>
                </p>
                <a
                    href="/integrations"
                    className="ml-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    API &amp; MCP
                </a>
            </div>
        </footer>
    );
}
