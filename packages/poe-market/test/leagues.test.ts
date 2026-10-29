import { expect, it } from "vite-plus/test";
import { marketLeagueTracked } from "../src/leagues.ts";

it("gives market features to trade leagues only", () => {
    for (const league of ["Allflame", "Hardcore Allflame", "Standard", "Hardcore", "Phrecia 2.0"])
        expect(marketLeagueTracked(league), league).toBe(true);
    for (const league of [
        "Ruthless Allflame",
        "HC Ruthless Allflame",
        "SSF Allflame",
        "HC SSF Allflame",
        "SSF Standard",
        "Solo Self-Found",
        "Chiba league (PL87141)",
        "Ruthless Limey Whelps (PL87210)",
    ])
        expect(marketLeagueTracked(league), league).toBe(false);
});
