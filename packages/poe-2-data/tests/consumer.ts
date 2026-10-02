import {
    baseItemsSchema,
    clientBuild,
    manifestSchema,
    modsSchema,
    version,
} from "@qcksys/poe-2-data";
import belts from "@qcksys/poe-2-data/data/base_items/Belt.json" with { type: "json" };
import bases from "@qcksys/poe-2-data/data/base_items.json" with { type: "json" };
import metadata from "@qcksys/poe-2-data/data/Metadata/Items/Item.json" with { type: "json" };
import mods from "@qcksys/poe-2-data/data/mods.json" with { type: "json" };
import manifest from "@qcksys/poe-2-data/manifest.json" with { type: "json" };

const base = baseItemsSchema.parse(bases)[Object.keys(bases)[0]!];
const mod = modsSchema.parse(mods)[Object.keys(mods)[0]!];
if (!base || !mod || !Object.keys(belts).length || !Object.keys(metadata).length)
    throw new Error("Missing data");
if (manifestSchema.parse(manifest).client_build !== clientBuild || manifest.version !== version)
    throw new Error("Release mismatch");

function checkTypes() {
    // @ts-expect-error JSON exports must retain their domain types.
    const invalid: string = mods.example!.required_level;
    return invalid;
}
void checkTypes;
export const summary = {
    clientBuild,
    version,
    bases: Object.keys(bases).length,
    mods: Object.keys(mods).length,
};
