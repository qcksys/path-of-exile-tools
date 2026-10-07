import { z } from "zod";
import type { TDatabase } from "~/db/client";
import type { LoadedCraftingRevision } from "~/lib/crafting-ruleset-loader";
import type { AppSession } from "~/lib/session.server";
import type { CraftingCatalog } from "~/schemas/crafting";
import type { CraftingRuleset, CraftingRulesetIndex } from "~/schemas/crafting-rulesets";
import type { RecombinatorCatalog } from "~/schemas/recombinator-catalog";
import { OperationError } from "./errors";

export interface OperationContext {
    db: TDatabase;
    loadCatalog: () => Promise<RecombinatorCatalog>;
    loadWorkbenchCatalog: (game: "poe1" | "poe2") => Promise<CraftingCatalog>;
    loadCraftingRulesets: () => Promise<CraftingRulesetIndex>;
    loadCraftingRevision: (ruleset: CraftingRuleset) => Promise<LoadedCraftingRevision>;
    origin: string;
    caller: AppSession["user"] | null;
}

export interface Operation {
    name: string;
    family: string;
    path: string;
    method: "get" | "post";
    description: string;
    ui: string;
    access: "public" | "account";
    readOnly: boolean;
    input: z.ZodObject;
    output: z.ZodObject;
    execute: (input: unknown, context: OperationContext) => Promise<Record<string, unknown>>;
}

export function defineOperation<I extends z.ZodObject, O extends z.ZodObject>(
    definition: Omit<Operation, "input" | "output" | "execute"> & {
        input: I;
        output: O;
        execute: (
            input: z.output<I>,
            context: OperationContext,
        ) => z.input<O> | Promise<z.input<O>>;
    },
): Operation {
    return {
        ...definition,
        async execute(input, context) {
            if (definition.access === "account" && !context.caller)
                throw new OperationError("Authentication required.", 401);
            const result = await definition.execute(definition.input.parse(input), context);
            const output = definition.output.safeParse(result);
            if (!output.success)
                throw new Error(`Invalid result from ${definition.name}.`, { cause: output.error });
            return output.data;
        },
    };
}

export const EmptySchema = z.object({});
export const OkSchema = z.object({ ok: z.literal(true) });
export const IdSchema = z.string().min(1).max(100);
