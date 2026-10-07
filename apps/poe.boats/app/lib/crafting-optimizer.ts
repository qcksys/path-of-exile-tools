import { z } from "zod";
import {
    type CraftingItem,
    type CraftingMethod,
    type CraftingTarget,
    fossilMethodSchema,
} from "../schemas/crafting";
import { type CraftingEngine, seededRandom } from "./crafting-engine";
import { wilsonInterval } from "./crafting-simulation";

export const fossilOptimizerSchema = z.object({
    fossils: z.array(z.string().min(1)).min(1).max(40),
    maxSockets: z.number().int().min(1).max(4),
    trials: z.number().int().min(100).max(100000),
    logic: z.enum(["additive", "multiplicative"]),
    allflame: z.literal(true).optional(),
    tangled: fossilMethodSchema.shape.tangled,
    partition: z
        .object({
            index: z.number().int().min(0),
            count: z.number().int().min(1).max(8),
        })
        .refine(({ index, count }) => index < count, "Partition index must be below its count.")
        .optional(),
});
export type FossilOptimizerOptions = z.infer<typeof fossilOptimizerSchema>;
const count = z.number().int().nonnegative();
const probability = z.number().min(0).max(1);
export const fossilCandidateSchema = z.object({
    index: count,
    method: fossilMethodSchema,
    probability,
    interval: z.tuple([probability, probability]),
    trials: count,
    successes: count,
    cost: z.number().nonnegative().nullable(),
    costPerSuccess: z.number().nonnegative().nullable(),
});
export const fossilOptimizationSchema = z.object({
    completed: count,
    total: count,
    failed: count,
    errors: z.array(z.string()),
    byAttempts: z.array(fossilCandidateSchema).max(20),
    byCost: z.array(fossilCandidateSchema).max(20),
});
export type FossilCandidate = z.infer<typeof fossilCandidateSchema>;
export type FossilOptimization = z.infer<typeof fossilOptimizationSchema>;

export function fossilCombinations(ids: string[], maximum: number) {
    const combinations: string[][] = [];
    const append = (chosen: string[], from: number) => {
        if (chosen.length) combinations.push(chosen);
        if (chosen.length >= maximum) return;
        for (let index = from; index < ids.length; index++)
            append([...chosen, ids[index]!], index + 1);
    };
    append([], 0);
    return combinations;
}

const byAttempts = (a: FossilCandidate, b: FossilCandidate) =>
    b.probability - a.probability ||
    (a.cost ?? Infinity) - (b.cost ?? Infinity) ||
    a.index - b.index;
const byCost = (a: FossilCandidate, b: FossilCandidate) =>
    a.costPerSuccess! - b.costPerSuccess! || a.index - b.index;

export function mergeFossilOptimizations(results: FossilOptimization[]): FossilOptimization {
    return {
        completed: results.reduce((sum, result) => sum + result.completed, 0),
        total: results.reduce((sum, result) => sum + result.total, 0),
        failed: results.reduce((sum, result) => sum + result.failed, 0),
        errors: [...new Set(results.flatMap((result) => result.errors))].sort(),
        byAttempts: results
            .flatMap((result) => result.byAttempts)
            .sort(byAttempts)
            .slice(0, 20),
        byCost: results
            .flatMap((result) => result.byCost)
            .sort(byCost)
            .slice(0, 20),
    };
}

export class FossilOptimizer {
    readonly options: FossilOptimizerOptions;
    readonly methods: Extract<CraftingMethod, { kind: "fossils" }>[];
    private completed = 0;
    private failed = 0;
    private errors = new Set<string>();
    private byAttempts: FossilCandidate[] = [];
    private byCost: FossilCandidate[] = [];
    private trial = 0;
    private successes = 0;
    private random;
    private indices: number[];

    constructor(
        private engine: CraftingEngine,
        private item: CraftingItem,
        private target: CraftingTarget,
        private prices: Record<string, number>,
        private seed: number,
        input: FossilOptimizerOptions,
    ) {
        this.options = fossilOptimizerSchema.parse(input);
        engine.validateItem(item);
        engine.validateTarget(target);
        if (engine.catalog.game !== "poe1" || !["normal", "rare"].includes(item.rarity))
            throw new Error("Fossil optimization requires a normal or rare PoE 1 item.");
        if (new Set(this.options.fossils).size !== this.options.fossils.length)
            throw new Error("Choose each fossil only once.");
        const available = new Set(engine.availableFossils(item).map((fossil) => fossil.id));
        if (this.options.fossils.some((id) => !available.has(id)))
            throw new Error("An included fossil cannot be used on this item.");
        const action =
            item.rarity === "normal" ? "delve_currency_upgrade" : "delve_currency_reroll";
        const allflameCurrencies = new Set(
            engine.catalog.crafting.allflame?.currencies.map((entry) => entry.currency),
        );
        const combinations = fossilCombinations(this.options.fossils, this.options.maxSockets);
        const partition = this.options.partition ?? { index: 0, count: 1 };
        this.indices = combinations
            .map((_, index) => index)
            .filter((index) => index % partition.count === partition.index);
        this.methods = this.indices.map((index) => {
            const ids = combinations[index]!;
            const resonator = engine.catalog.crafting.currencies.find(
                (currency) =>
                    currency.action === action &&
                    currency.id.endsWith(String(ids.length)) &&
                    (!this.options.allflame || allflameCurrencies.has(currency.id)),
            );
            if (!resonator) throw new Error("The build has no matching resonator.");
            const method: Extract<CraftingMethod, { kind: "fossils" }> = {
                kind: "fossils",
                ids,
                resonator: resonator.id,
                logic: this.options.logic,
                allflame: this.options.allflame,
                tangled: ids.some((id) => engine.fossil(id).randomOutcomes.length)
                    ? this.options.tangled
                    : undefined,
            };
            engine.validateMethod(method);
            return method;
        });
        this.random = seededRandom(seed);
    }

    runBatch(size = 100) {
        for (let count = 0; count < size && this.completed < this.methods.length; count++) {
            const method = this.methods[this.completed]!;
            try {
                const result = this.engine.apply(this.item, method, this.random, [this.target]);
                if (this.engine.matches(result.item, this.target)) this.successes++;
                this.trial++;
                if (this.trial < this.options.trials) continue;
                const probability = this.successes / this.trial;
                const costs = this.engine.costs(method, this.item);
                const cost = costs.every((entry) => this.prices[entry.id] !== undefined)
                    ? costs.reduce((sum, entry) => sum + this.prices[entry.id]! * entry.amount, 0)
                    : null;
                const candidate: FossilCandidate = {
                    index: this.indices[this.completed]!,
                    method,
                    probability,
                    trials: this.trial,
                    successes: this.successes,
                    interval: wilsonInterval(this.successes, this.trial),
                    cost,
                    costPerSuccess: probability > 0 && cost !== null ? cost / probability : null,
                };
                this.byAttempts = [...this.byAttempts, candidate].sort(byAttempts).slice(0, 20);
                if (candidate.costPerSuccess !== null)
                    this.byCost = [...this.byCost, candidate].sort(byCost).slice(0, 20);
            } catch (error) {
                this.failed++;
                this.errors.add(error instanceof Error ? error.message : String(error));
            }
            this.completed++;
            this.trial = 0;
            this.successes = 0;
            this.random = seededRandom(this.seed);
        }
        return this.completed === this.methods.length;
    }

    result(): FossilOptimization {
        return {
            completed: this.completed,
            total: this.methods.length,
            failed: this.failed,
            errors: [...this.errors].sort(),
            byAttempts: this.byAttempts,
            byCost: this.byCost,
        };
    }
}
