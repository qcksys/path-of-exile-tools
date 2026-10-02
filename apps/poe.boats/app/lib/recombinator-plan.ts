import { ZodError } from "zod";
import {
    parseAffixes,
    type RecombinatorPlan,
    recombinatorPlanSchema,
} from "~/schemas/recombinator";

export type RecombinatorDraft = {
    items: { id: string; name: string; prefixes: string; suffixes: string }[];
    steps: RecombinatorPlan["steps"];
};

export const exampleRecombinatorDraft: RecombinatorDraft = {
    items: [
        { id: "a", name: "Life + fire", prefixes: "T1 life", suffixes: "T1 fire resistance" },
        { id: "b", name: "Armour + cold", prefixes: "T1 armour", suffixes: "T1 cold resistance" },
        { id: "c", name: "Life + cold", prefixes: "T1 life", suffixes: "T1 cold resistance" },
        {
            id: "d",
            name: "Evasion + lightning",
            prefixes: "T1 evasion",
            suffixes: "T1 lightning resistance",
        },
    ],
    steps: [
        { id: "first", name: "Build first pair", left: "a", right: "b" },
        { id: "second", name: "Build second pair", left: "c", right: "d" },
        { id: "finish", name: "Combine both results", left: "first", right: "second" },
    ],
};

export function parseRecombinatorDraft(draft: RecombinatorDraft): RecombinatorPlan {
    try {
        return recombinatorPlanSchema.parse({
            items: draft.items.map(({ id, name, prefixes, suffixes }, index) => {
                try {
                    return {
                        id,
                        name,
                        item: {
                            prefixes: parseAffixes(prefixes),
                            suffixes: parseAffixes(suffixes),
                        },
                    };
                } catch {
                    throw new Error(
                        `Item ${index + 1} (${name}): use a modifier label, optionally followed by | group. Labels and groups must be 1–80 characters.`,
                    );
                }
            }),
            steps: draft.steps,
        });
    } catch (error) {
        if (!(error instanceof ZodError)) throw error;
        throw new Error(
            error.issues
                .map((issue) => {
                    const [collection, index, ...fields] = issue.path;
                    const location =
                        typeof index === "number"
                            ? `${collection === "items" ? "Item" : "Step"} ${index + 1}`
                            : "Plan";
                    const field = fields.filter((value) => value !== "item").join(" ");
                    return `${location}${field ? ` ${field}` : ""}: ${issue.message}`;
                })
                .join("\n"),
        );
    }
}
