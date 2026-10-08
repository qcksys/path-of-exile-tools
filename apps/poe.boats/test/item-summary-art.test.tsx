// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { GraspingOptions } from "~/components/crafting/grasping-options";
import { StatsSummary } from "~/components/idol-planner/stats-summary";
import { SCARABS } from "~/data/scarab-data";
import { breachlords, mixedBreachRings } from "~/lib/crafting-grasping";
import { createEmptyMapDevice } from "~/schemas/scarab";

vi.mock("~/hooks/use-item-presentations", () => ({
    useItemPresentations: () => ({
        ring: { name: "Breach Ring", art: "breach-ring.png" },
    }),
}));
vi.mock("~/i18n", () => ({
    useLocale: () => "en",
    useTranslations: () => (key: string) => key,
}));
vi.mock("~/context/scarab-prices-context", () => ({
    useScarabPrices: () => ({ getPrice: () => null }),
}));
afterEach(cleanup);

it("shows Breach Ring artwork while preserving labelled recipe inputs", () => {
    const changed = vi.fn();
    const { container } = render(
        <GraspingOptions
            method={{ kind: "generate", id: "rare", breachRings: mixedBreachRings }}
            onChange={changed}
        />,
    );
    expect(container.querySelectorAll('img[src="breach-ring.png"]').length).toBeGreaterThanOrEqual(
        5,
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "Xoph rings" }), {
        target: { value: "20" },
    });
    expect(changed).toHaveBeenCalledWith({
        kind: "generate",
        id: "rare",
        breachRings: { ...mixedBreachRings, [breachlords[0]]: 20 },
    });
});

it("identifies each scarab beside its effect summary", () => {
    const scarab = SCARABS.find((entry) => entry.image)!;
    const mapDevice = createEmptyMapDevice();
    mapDevice.slots[0]!.scarabId = scarab.id;
    render(<StatsSummary placements={[]} inventory={[]} mapDevice={mapDevice} />);
    expect(screen.getByRole("img", { name: scarab.name.en }).getAttribute("src")).toBe(
        scarab.image,
    );
});
