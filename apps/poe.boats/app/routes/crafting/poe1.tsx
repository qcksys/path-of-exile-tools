import { CraftingPage } from "./page";
export function meta() {
    return [
        { title: "PoE 1 Crafting Calculator, Simulator & Emulator · POE.BOATS" },
        {
            name: "description",
            content:
                "Calculate crafting odds, simulate processes and craft items with build-extracted Path of Exile 1 data.",
        },
    ];
}
export default function Poe1Crafting() {
    return <CraftingPage game="poe1" />;
}
