import changelogHtml from "virtual:markdown/changelog";
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
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
            <article
                className="prose prose-neutral dark:prose-invert max-w-none"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is compiled from a trusted markdown file at build time
                // biome-ignore lint/style/useNamingConvention: React's dangerouslySetInnerHTML requires __html
                dangerouslySetInnerHTML={{ __html: changelogHtml }}
            />
        </main>
    );
}
