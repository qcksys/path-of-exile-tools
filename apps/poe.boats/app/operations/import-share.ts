import { z } from "zod";
import { computeSetHash, findDuplicateSet } from "~/lib/set-hash";
import { SharedSetSchema } from "~/schemas/share";
import { StorageSchema } from "~/schemas/storage";
import { duplicatePlannerSet, editPlanner } from "./planner";

export const ImportShareSchema = z.object({
    state: StorageSchema,
    shared: SharedSetSchema,
    force: z.boolean().default(false),
});
export const ImportShareResultSchema = z.object({
    state: StorageSchema,
    duplicateSetId: z.string().nullable(),
    importedSetId: z.string().nullable(),
});

export function importPlannerShare(
    input: z.input<typeof ImportShareSchema>,
): z.infer<typeof ImportShareResultSchema> {
    const { state, shared, force } = ImportShareSchema.parse(input);
    const source = { ...shared.set, inventory: shared.idols };
    const duplicate = findDuplicateSet(source, state.sets);
    if (duplicate && !force) return { state, duplicateSetId: duplicate.id, importedSetId: null };
    const set = duplicatePlannerSet(source);
    set.name = `${source.name.slice(0, 39)} (Imported)`;
    set.inventory = set.inventory.map((item) => ({
        ...item,
        source: "shared",
        importedAt: Date.now(),
    }));
    set.contentHash = computeSetHash(set);
    const result = editPlanner({ state, command: { action: "import", set } });
    return { state: result.state, duplicateSetId: duplicate?.id ?? null, importedSetId: set.id };
}
