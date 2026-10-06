// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { SuccessDistribution } from "~/components/crafting/success-distribution";
import { CraftingAffixDistribution } from "~/lib/crafting-distributions";
import { seededRandom } from "~/lib/crafting-engine";
import { catalog, engine } from "./crafting-fixtures";

afterEach(cleanup);

it("groups fixed-value Cluster Jewel tiers without labeling the whole family as its first value", () => {
    const base = "Metadata/Items/Jewels/JewelPassiveTreeExpansionLarge";
    const item = engine.createItem(base);
    const speed = Object.entries(catalog.mods).filter(
        ([, mod]) =>
            mod.domain === "affliction_jewel" &&
            mod.type === "AfflictionJewelSmallPassivesGrantAttackSpeed",
    );
    expect(speed.length).toBeGreaterThan(1);
    const distribution = new CraftingAffixDistribution(engine);
    for (const [id] of speed) distribution.add(engine.addStartingMod(item, id, seededRandom(1)));
    const notable = engine.addStartingMod(item, "AfflictionNotableCalamitous", seededRandom(1));
    distribution.add(notable);
    render(
        <SuccessDistribution
            engine={engine}
            rows={distribution.result()}
            successes={speed.length + 1}
        />,
    );
    fireEvent.click(screen.getByText("Affix distribution on success"));
    expect(
        screen.getByRole("rowheader", {
            name: "Added Small Passive Skills also grant: #% increased Attack Speed",
        }),
    ).toBeDefined();
    expect(
        screen.getByRole("rowheader", { name: "1 Added Passive Skill is Calamitous" }),
    ).toBeDefined();
    const suffixes = within(screen.getByRole("table", { name: "Suffixes" }));
    expect(suffixes.getByText("2.00")).toBeDefined();
    expect(suffixes.getByText("75.0%")).toBeDefined();
});

it("reports missing tier ranks instead of presenting a partial average", () => {
    render(
        <SuccessDistribution
            engine={engine}
            successes={3}
            rows={[
                {
                    key: "life",
                    modId: "IncreasedLife1",
                    side: "prefix",
                    essence: false,
                    count: 3,
                    items: 3,
                    tierTotal: 2,
                    ranked: 2,
                },
            ]}
        />,
    );
    fireEvent.click(screen.getByText("Affix distribution on success"));
    expect(screen.getByRole("cell", { name: "—" })).toBeDefined();
    expect(screen.getByText(/cannot rank every observed modifier/)).toBeDefined();
    expect(screen.getByRole("cell", { name: "100.0%" })).toBeDefined();
});

it("describes an empty distribution without invalid numeric output", () => {
    render(<SuccessDistribution engine={engine} successes={0} rows={[]} />);
    fireEvent.click(screen.getByText("Affix distribution on success"));
    expect(screen.getByText("No revealed affixes on successful items.")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
});
