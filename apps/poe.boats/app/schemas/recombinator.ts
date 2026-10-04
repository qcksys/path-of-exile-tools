import { z } from "zod";
import { catalogBaseSchema } from "./recombinator-catalog";

const labelSchema = z.string().trim().min(1).max(80);

export const recombinatorAffixSchema = z.object({
    id: z.string().trim().min(1).max(256),
    label: z.string().min(1).max(2000).optional(),
    group: z.string().trim().min(1).max(256),
    groups: z.array(z.string().min(1).max(256)).min(1).optional(),
    exclusive: z.boolean(),
    nonNative: z.boolean().default(false),
    spawn: z.array(z.tuple([z.string(), z.number().nonnegative()])).optional(),
    crafted: z.boolean().optional(),
});

const affixesSchema = z.array(recombinatorAffixSchema).max(3);
const preparationSchema = z.object({
    kind: z.enum(["essence", "bench"]),
    side: z.enum(["prefixes", "suffixes"]),
    affix: recombinatorAffixSchema,
    itemClasses: z.array(z.string()).min(1),
    keepInputMods: z.boolean().optional(),
});

export const recombinatorItemSchema = z
    .object({
        prefixes: affixesSchema,
        suffixes: affixesSchema,
        base: catalogBaseSchema.optional(),
    })
    .superRefine((item, ctx) => {
        for (const side of ["prefixes", "suffixes"] as const) {
            const groups = item[side].flatMap(affixGroups);
            if (new Set(groups).size !== groups.length) {
                ctx.addIssue({
                    code: "custom",
                    path: [side],
                    message: "An item cannot have two modifiers in the same mod group.",
                });
            }
        }
        if ([...item.prefixes, ...item.suffixes].filter((affix) => affix.exclusive).length > 1) {
            ctx.addIssue({
                code: "custom",
                message: "The guide supports at most one exclusive modifier per item.",
            });
        }
    });

export const recombinatorPlanSchema = z
    .object({
        items: z
            .array(z.object({ id: labelSchema, name: labelSchema, item: recombinatorItemSchema }))
            .min(2)
            .max(12),
        steps: z
            .array(
                z.object({
                    id: labelSchema,
                    name: labelSchema,
                    left: labelSchema,
                    right: labelSchema,
                    leftPreparation: preparationSchema.optional(),
                    rightPreparation: preparationSchema.optional(),
                    removeCrafted: z.boolean().optional(),
                }),
            )
            .min(1)
            .max(8),
    })
    .superRefine((plan, ctx) => {
        const ids = new Set<string>();
        const definitions = new Map<string, string>();
        for (const entry of [...plan.items, ...plan.steps]) {
            if (ids.has(entry.id)) {
                ctx.addIssue({ code: "custom", message: "Items and steps need unique IDs." });
            }
            if ("left" in entry && (!ids.has(entry.left) || !ids.has(entry.right))) {
                ctx.addIssue({
                    code: "custom",
                    message: `${entry.name}: choose an item or an earlier step for both inputs.`,
                });
            }
            ids.add(entry.id);
        }
        const prepared = plan.steps
            .flatMap((step) => [step.leftPreparation, step.rightPreparation])
            .flatMap((preparation) =>
                preparation
                    ? [
                          {
                              prefixes: preparation.side === "prefixes" ? [preparation.affix] : [],
                              suffixes: preparation.side === "suffixes" ? [preparation.affix] : [],
                          },
                      ]
                    : [],
            );
        for (const item of [...plan.items.map((entry) => entry.item), ...prepared]) {
            for (const side of ["prefixes", "suffixes"] as const) {
                for (const affix of item[side]) {
                    const definition = JSON.stringify([
                        side,
                        affix.group,
                        affixGroups(affix).toSorted(),
                        affix.exclusive,
                        affix.nonNative,
                        affix.spawn,
                        affix.crafted ?? false,
                    ]);
                    const previous = definitions.get(affix.id);
                    if (previous && previous !== definition) {
                        ctx.addIssue({
                            code: "custom",
                            message: `“${affix.id}” must use the same affix type, group and modifier flags on every item.`,
                        });
                    }
                    definitions.set(affix.id, definition);
                }
            }
        }
    });

export type RecombinatorAffix = z.infer<typeof recombinatorAffixSchema>;
export type RecombinatorItem = z.infer<typeof recombinatorItemSchema>;
export type RecombinatorPlan = z.infer<typeof recombinatorPlanSchema>;

export function affixGroups(affix: RecombinatorAffix): string[] {
    return [...new Set([affix.group, ...(affix.groups ?? [])])];
}

export function sharesAffixGroup(left: RecombinatorAffix, right: RecombinatorAffix): boolean {
    const groups = new Set(affixGroups(left));
    return affixGroups(right).some((group) => groups.has(group));
}

export function parseAffixes(text: string): RecombinatorAffix[] {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => {
            const flags = line.trim().match(/^[*!]+/)?.[0] ?? "";
            const exclusive = flags.includes("*");
            const nonNative = flags.includes("!");
            const value = line.trim().slice(flags.length).trim();
            const parts = value.split("|");
            if (parts.length > 2) throw new Error("Use one optional | group after each modifier.");
            const [id, group] = parts.map((part) => part.trim());
            return recombinatorAffixSchema.parse({
                id: labelSchema.parse(id),
                group: labelSchema.parse(group ?? id),
                exclusive,
                nonNative,
            });
        });
}
