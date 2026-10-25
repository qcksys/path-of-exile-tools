import { createHash } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import {
    rulesetAllowsConditionalSteps,
    rulesetAllowsPresetPreparation,
    rulesetAllowsScopedCraftPrices,
    rulesetAllowsSimpleCraft,
} from "../app/lib/crafting-rulesets";
import {
    purchaseSourceProfile,
    validateSourcePreparationRevision,
} from "../app/lib/crafting-source-preparation";
import { engine } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const r14 = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r14",
)!;
const r14Hashes = {
    "life-block-shield": "47323596ff7bf3185b87736636bde7aa41e0ff25b0b392f2dad5eac85ac0437c",
    "es-block-shield": "bb49b4ed8b5653151fd137ac62334983128ff5184bc601e6bbb51213c7729b53",
    "tailwind-boots": "62f8aa976d2803909623ff205c26eaf76eb152a54e8f61bc0ad934577999b5db",
    "physical-bow": "5e2e4db31c06a03fc05300e9f5a75ad2022c0a15f8ef6dd722770af21bdb9314",
    "elemental-bow": "9489e418205d5afebeb6d130695940ba080efc0c217f2dfc7a71648aa1723a1a",
    "suppression-chest": "ad6164d379eb6a6773bcbabc4342c26999f1c4947aad02f43f4c0fab614be27d",
    "global-defence-chest": "c275af3b9b4b63780560ccc9c5e594f3632e708f211dd8bf0019bc75606acf43",
    "rarity-helmet": "d9bd9440b3c3a7377cf585b44df74a8786b89ee31cc023d7c3dbc79151cd96cc",
    "energy-shield-chest": "ba9cac5d8aa110645bb27d8a044e2340a8e64f0446a66444a460e96754901b03",
    "strength-helical-ring": "28b04f7f2980e45a5a90eb3ae86f38e886af27955071b3bd8392f34966224507",
    "sushi-rf-totem-shield": "c6c97de5053745f5342be60ed633a95e874f194ae156dd2d6d4b5666776f20ca",
    "sushi-rf-helmet": "8ed0c69bf7b8eeae72e9c6ddf473425fe8f7ec9886f3335852304c4b27fb201a",
    "sushi-mercenary-chest": "64d3c2853543a3f8337480b2ec2d7097ab950f59e492af9dd3e5adc99061c4dd",
    "sushi-spectre-boots": "829337d3a7f54ab59ccba7fee0a1e4f6ab1fd8eae939b3391e76feb685e1332c",
    "sushi-luminary-shield": "6bad2cb29d8afbdd8995a1628a70b65fe442f18e699b7ab211300c96e0eab642",
};

it.each(craftingPresets)("preserves the complete r14 $id graph", ({ id }) => {
    const graph = projectFromPreset(engine, r14, id);
    graph.id = "historical-preset";
    expect(createHash("sha256").update(JSON.stringify(graph)).digest("hex")).toBe(r14Hashes[id]);
});

it.each(
    Array.from({ length: 15 }, (_, index) => index + 1),
)("retains capability boundaries for engine %s", (revision) => {
    const ruleset = { engine: `crafting-graph-${revision}` };
    expect(rulesetAllowsConditionalSteps(ruleset)).toBe(revision >= 5);
    expect(rulesetAllowsSimpleCraft(ruleset)).toBe(revision >= 7);
    expect(rulesetAllowsScopedCraftPrices(ruleset)).toBe(revision >= 8);
    expect(rulesetAllowsPresetPreparation(ruleset)).toBe(revision >= 9);
});

it("keeps every existing source preparation policy available in r15", () => {
    for (const { id } of craftingPresets) {
        const graph = projectFromPreset(engine, r14, id);
        for (const node of graph.nodes) {
            if (node.kind !== "acquire") continue;
            for (const alternative of node.alternatives) {
                if (alternative.kind !== "purchase" || !alternative.sourcePreparation) continue;
                expect(() =>
                    validateSourcePreparationRevision(
                        "crafting-graph-15",
                        purchaseSourceProfile(alternative),
                        alternative.item.baseId,
                    ),
                ).not.toThrow();
            }
        }
    }
});
