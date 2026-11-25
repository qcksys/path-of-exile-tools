// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { LocalTime } from "~/components/local-time";
import { browserTimeZone, formatTime } from "~/lib/local-time";

const AT = Date.UTC(2026, 10, 26, 3, 0, 5);

let root: Root | undefined;

afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    cleanup();
    vi.restoreAllMocks();
});

/** Hydrates server HTML with a client tree, collecting the errors React recovers from. */
async function hydrate(html: string, client: React.ReactNode) {
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recovered = vi.fn();
    await act(async () => {
        root = hydrateRoot(container, client, { onRecoverableError: recovered });
    });
    return { container, recovered };
}

it("formats an instant in the given time zone", () => {
    expect(formatTime(AT, "UTC")).toBe("2026-11-26 03:00 UTC");
    expect(formatTime(AT, "UTC", { seconds: true })).toBe("2026-11-26 03:00:05 UTC");
    // The zone's name depends on the language, so only the date and time are fixed.
    expect(formatTime(AT, "Asia/Kolkata")).toMatch(/^2026-11-26 08:30 \S+$/);
    expect(formatTime(Date.UTC(2026, 10, 26, 13, 30), "Australia/Sydney")).toMatch(
        /^2026-11-27 00:30 \S+$/,
    );
});

it("renders a skeleton on the server and the local time once hydrated, without a mismatch", async () => {
    const page = (
        <p>
            Data through <LocalTime at={AT} />
        </p>
    );
    const html = renderToString(page);
    expect(html).toContain('data-slot="local-time-skeleton"');
    expect(html).not.toContain("2026");
    const consoleError = vi.spyOn(console, "error");
    const { container, recovered } = await hydrate(html, page);
    expect(recovered).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(container.textContent).toBe(`Data through ${formatTime(AT, browserTimeZone())}`);
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
        "2026-11-26T03:00:05.000Z",
    );
});

it("reports the mismatch that formatting during the server render would cause", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { recovered } = await hydrate(
        "<p>2026-11-26 03:00 UTC</p>",
        <p>2026-11-26 14:00 AEDT</p>,
    );
    expect(recovered).toHaveBeenCalled();
});

it("shows the local time straight away when mounted after hydration", () => {
    const { container } = render(<LocalTime at={AT} seconds />);
    expect(container.textContent).toBe(formatTime(AT, browserTimeZone(), { seconds: true }));
});
