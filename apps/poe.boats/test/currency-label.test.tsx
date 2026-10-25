// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { CurrencyLabel } from "~/components/currency-label";

const art = (file: string) => `https://www.pathofexile.com/image/Art/2DItems/Currency/${file}.png`;
const item = (name: string, file: string) => ({
    name,
    itemClass: "Stackable Currency",
    art: art(file),
    dropLevel: 1,
    requirements: null,
    implicits: [],
});

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
            Response.json({
                "Metadata/Items/Currency/CurrencyRerollRare": item(
                    "Chaos Orb",
                    "CurrencyRerollRare",
                ),
                "Metadata/Items/Currency/CurrencyModValues": item(
                    "Divine Orb",
                    "CurrencyModValues",
                ),
            }),
        ),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("shows the currency artwork beside the trade currency name", async () => {
    const { container } = render(<CurrencyLabel currency="chaos" game="poe1" />);
    await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")?.getAttribute("src")).toBe(art("CurrencyRerollRare"));
    expect(container.textContent).toBe("chaos");
});

it("resolves item ids and keeps the text for screen readers when only the icon shows", async () => {
    const { container } = render(
        <CurrencyLabel
            currency="Metadata/Items/Currency/CurrencyModValues"
            label="divine"
            iconOnly
        />,
    );
    await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")?.getAttribute("src")).toBe(art("CurrencyModValues"));
    expect(screen.getByText("divine").className).toContain("sr-only");
});

it("falls back to visible text for currencies without artwork", async () => {
    const { container } = render(
        <>
            <CurrencyLabel currency="chaos" />
            <CurrencyLabel currency="gold" iconOnly />
        </>,
    );
    await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector('[data-currency="gold"] img')).toBeNull();
    expect(screen.getByText("gold").className).not.toContain("sr-only");
});
