import { Link } from "react-router";
import { useTranslations } from "~/i18n";

export function AppFooter({ source }: { source?: string } = {}) {
    const t = useTranslations();

    return (
        <footer className="border-border border-t bg-background/50 py-3">
            <div className="container mx-auto flex items-center justify-center px-4">
                <p className="text-muted-foreground text-sm">
                    {source ? (
                        source
                    ) : (
                        <>
                            {t("footer.dataFrom")}{" "}
                            <a
                                href="https://poedb.tw"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline-offset-4 hover:underline"
                            >
                                poedb.tw
                            </a>
                        </>
                    )}
                </p>
                <Link
                    to="/integrations"
                    className="ml-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    API &amp; MCP
                </Link>
                <Link
                    to="/server-status"
                    className="ml-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    Server status
                </Link>
            </div>
            <p className="container mx-auto mt-2 px-4 text-center text-muted-foreground text-sm">
                {t("footer.disclaimer")}
            </p>
        </footer>
    );
}
