import { CraftingPage } from "./page";
export function meta() {
    return [
        { title: "PoE 2 Crafting Calculator, Simulator & Emulator · POE.BOATS" },
        {
            name: "description",
            content:
                "Calculate crafting odds, simulate processes and craft items with build-extracted Path of Exile 2 data.",
        },
    ];
}
export default function Poe2Crafting() {
    return <CraftingPage game="poe2" />;
}
