import { describe, expect, it } from "vite-plus/test";
import { readWikiRecipeRows } from "../scripts/wiki-recipe-tables";

describe("wiki recipe tables", () => {
    it("expands shared wisdom outputs without mixing adjacent recipes", () => {
        const rows = readWikiRecipeRows(`<table>
            <tr><td rowspan="3">4x Scroll of Wisdom<span class="hoverbox__display">Tooltip</span></td><td>1x Blacksmith's Whetstone</td></tr>
            <tr><td>1x Orb of Alteration</td></tr>
            <tr><td>1x Orb of Transmutation</td></tr>
            <tr><td>1x Something else</td><td>5x Inputs</td></tr>
        </table>`);
        expect(rows).toEqual([
            ["4x Scroll of Wisdom", "1x Blacksmith's Whetstone"],
            ["4x Scroll of Wisdom", "1x Orb of Alteration"],
            ["4x Scroll of Wisdom", "1x Orb of Transmutation"],
            ["1x Something else", "5x Inputs"],
        ]);
    });
});
