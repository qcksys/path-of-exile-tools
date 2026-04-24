import changelogHtml from "virtual:markdown/idol-planner-changelog";
import { AppHeader } from "~/components/idol-planner/app-header";
import type { Route } from "./+types/changelog";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Changelog | Idol Planner - POE.BOATS" },
    {
      name: "description",
      content: "View the changelog for POE Idol Planner",
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
          dangerouslySetInnerHTML={{ __html: changelogHtml }}
        />
      </main>
    </>
  );
}
