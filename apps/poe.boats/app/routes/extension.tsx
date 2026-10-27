import type { SiteHandle } from "~/routes/layouts/site";
import type { Route } from "./+types/extension";

export const handle = { section: "Browser extension" } satisfies SiteHandle;

export function meta(): Route.MetaDescriptors {
    return [
        { title: "Trade Pricing extension · POE.BOATS" },
        {
            name: "description",
            content:
                "How the poe.boats Trade Pricing browser extension prices crafting steps from the official trade site, and what it collects.",
        },
    ];
}

export default function Extension(_props: Route.ComponentProps) {
    return (
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
            <article className="prose prose-neutral dark:prose-invert max-w-none">
                <h1>poe.boats Trade Pricing</h1>
                <p>
                    A browser extension for Chrome and Firefox that prices the steps of a crafting
                    project from the official Path of Exile trade site, so you can see at which step
                    buying an item is cheaper than crafting it. Store listings are not published
                    yet.
                </p>

                <h2>How it works</h2>
                <ol>
                    <li>
                        On a crafting project, open <strong>Buy-in prices</strong> and choose{" "}
                        <strong>Price steps</strong>. poe.boats builds an official trade search for
                        each step's item requirements.
                    </li>
                    <li>
                        The extension opens a pathofexile.com trade tab, or uses one you have open,
                        and runs the searches there as that page. Your browser attaches your
                        pathofexile.com sign-in itself; the extension never reads it, and it never
                        reaches poe.boats.
                    </li>
                    <li>
                        Searches run one at a time and follow the trade site's published rate
                        limits. Any error stops the run. Runs start only when you click; nothing
                        runs in the background or on a schedule.
                    </li>
                    <li>
                        poe.boats checks each listing against the step and prices the step at the
                        cheapest matching instant-buyout listing. In-person listings are used only
                        if you turn them on for a project.
                    </li>
                </ol>

                <h2>Privacy policy</h2>
                <h3>What the extension collects</h3>
                <p>
                    From the trade listings it fetches for you: the price and currency, when the
                    item was listed, and the item's properties (base, item level, modifiers, sockets
                    and flags). Seller account names, character names, stash names and whisper
                    messages are removed on the trade page before anything else happens.
                </p>
                <h3>Where it goes</h3>
                <p>
                    Listings are passed only to the poe.boats page that started the pricing run.
                    That page saves each step's price, and the item of the cheapest matching
                    listing, in your crafting project: in your browser, or in your poe.boats account
                    if you chose account storage. Listing prices are not added to poe.boats' shared
                    market data.
                </p>
                <h3>What it does not do</h3>
                <ul>
                    <li>It does not read cookies, passwords, browsing history or other sites.</li>
                    <li>It does not send anything to servers other than pathofexile.com.</li>
                    <li>It does not make trade requests you did not start.</li>
                </ul>
                <h3>Storage and permissions</h3>
                <p>
                    If you close poe.boats during a run, the extension keeps the fetched listings in
                    its own browser storage until the project opens again, for at most 7 days. It
                    needs the <code>storage</code> permission and access to the pathofexile.com
                    trade pages and the poe.boats site.
                </p>
                <h3>Contact</h3>
                <p>
                    Questions about this policy:{" "}
                    <a href="mailto:poe.boats@qcksys.com">poe.boats@qcksys.com</a>.
                </p>

                <p className="text-sm">
                    This product isn't affiliated with or endorsed by Grinding Gear Games in any
                    way.
                </p>
            </article>
        </main>
    );
}
