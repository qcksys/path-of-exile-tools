import changelogHtml from "virtual:markdown/changelog";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import type { Route } from "./+types/changelog";

export function meta(): Route.MetaDescriptors {
    return [
        { title: "Changelog | POE.BOATS" },
        {
            name: "description",
            content: "Release notes for POE.BOATS",
        },
    ];
}

export default function Changelog(_props: Route.ComponentProps) {
    return (
        <>
            <AppHeader />
            <main className="mx-auto max-w-3xl px-4 py-8">
                <article
                    className="prose prose-neutral dark:prose-invert max-w-none"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is compiled from a trusted markdown file at build time
                    // biome-ignore lint/style/useNamingConvention: React's dangerouslySetInnerHTML requires __html
                    dangerouslySetInnerHTML={{ __html: changelogHtml }}
                />
            </main>
            <AppFooter />
        </>
    );
}
