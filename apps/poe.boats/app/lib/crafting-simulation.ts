import type {
    CraftingCatalog,
    CraftingItem,
    CraftingMethod,
    CraftingProject,
    CraftingTarget,
} from "../schemas/crafting";
import { craftingProjectSchema } from "../schemas/crafting";
import { usesAllflame } from "./crafting-allflame";
import { type AffixDistribution, CraftingAffixDistribution } from "./crafting-distributions";
import {
    BenchCraftConflict,
    type CraftingCost,
    CraftingEngine,
    type CraftingRandom,
    seededRandom,
    type Weighted,
} from "./crafting-engine";
import { processBranches } from "./crafting-flow";
import { validateInventory } from "./crafting-inventory";
import {
    addCraftingRoutes,
    type CraftingRoutes,
    copyCraftingRoutes,
    emptyCraftingRoute,
    emptyCraftingRoutes,
} from "./crafting-routes";
import { targetNeedsValues } from "./crafting-targets";

export type CraftingTrialCost = {
    spending: Record<string, number>;
    baseItems?: number;
    baseSpending?: number;
    total: number | null;
    unpriced: string[];
};

export type CraftingResult = {
    kind: "exact" | "exact-process" | "sampled" | "process";
    trials: number;
    successes: number;
    probability: number;
    interval: [number, number];
    attempts: number | null;
    attempts95: number | null;
    totalActions: number;
    totalSteps?: number;
    timeouts: number;
    errors: Record<string, number>;
    spending: Record<string, number>;
    baseItems?: number;
    baseSpending?: number;
    meanCost: number | null;
    costPerSuccess: number | null;
    unpriced: string[];
    affixes: Record<string, number>;
    samples: { trial: number; item: CraftingItem; success: boolean; cost?: CraftingTrialCost }[];
    successCosts?: { cheapest: number | null; costliest: number | null; unpriced: number };
    sampleStorage?: CraftingProject["sampleStorage"];
    successDistribution?: AffixDistribution[];
    routes?: CraftingRoutes;
    simulationLimit?: CraftingProject["simulationLimit"];
    stopReason?: "trials" | "successes" | "actions";
    unfinished?: ReturnType<CraftingProcess["result"]>;
};

export function hasCraftingRequirements(target: CraftingTarget) {
    return Boolean(
        target.expression ||
            target.groups.length ||
            target.openPrefixes ||
            target.openSuffixes ||
            target.openAffixes ||
            target.rarity ||
            target.corrupted !== undefined ||
            target.mirrored !== undefined ||
            target.split !== undefined ||
            target.sanctified !== undefined ||
            target.waystoneTier ||
            target.mapTier ||
            target.sockets ||
            target.linkedSockets ||
            target.jewelSocket !== undefined ||
            target.socketedJewel !== undefined ||
            target.catalyst ||
            target.quality ||
            Object.keys(target.baseDefences ?? {}).length ||
            Object.keys(target.properties ?? {}).length ||
            target.memoryStrands ||
            target.intangibility ||
            target.intentions ||
            target.influences?.length ||
            target.affixCount ||
            target.prefixCount ||
            target.suffixCount ||
            target.unrevealedCount ||
            target.stats?.length ||
            target.anointments?.length ||
            target.enchantments?.length ||
            target.grantedPassives?.length,
    );
}

export function probabilitySummary(probability: number) {
    return {
        attempts: probability > 0 ? 1 / probability : null,
        attempts95:
            probability === 1
                ? 1
                : probability > 0
                  ? Math.ceil(Math.log(0.05) / Math.log1p(-probability))
                  : null,
    };
}

export function wilsonInterval(successes: number, trials: number): [number, number] {
    if (!trials) return [0, 1];
    const p = successes / trials;
    const z = 1.959963984540054;
    const denominator = 1 + (z * z) / trials;
    const center = (p + (z * z) / (2 * trials)) / denominator;
    const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials)) / denominator;
    return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

class DecisionNeeded extends Error {
    constructor(readonly weights: number[]) {
        super("An unvisited random decision");
    }
}
export class ExactCalculationLimit extends Error {}

export function calculateExact(
    engine: CraftingEngine,
    input: CraftingItem,
    method: CraftingMethod,
    targetInput: CraftingTarget,
    limit = 2000,
) {
    const item = engine.validateItem(input);
    const target = engine.validateTarget(targetInput);
    return enumerateExact(
        (random) => engine.matches(engine.apply(item, method, random, [target]).item, target),
        limit,
        targetNeedsValues(target),
    );
}

function enumerateExact(
    run: (random: CraftingRandom, probability: number) => boolean,
    limit: number,
    rollValues = false,
) {
    const branches = [{ path: [] as number[], probability: 1 }];
    let probability = 0;
    let states = 0;
    while (branches.length) {
        if (++states > limit)
            throw new ExactCalculationLimit("Exact enumeration exceeded the state limit.");
        const branch = branches.pop()!;
        let index = 0;
        const random: CraftingRandom = {
            pick<T>(choices: Weighted<T>[]): T {
                const positive = choices.filter((choice) => choice.weight > 0);
                if (!positive.length) throw new Error("No eligible outcomes for this craft.");
                if (positive.length === 1) return positive[0]!.value;
                const choice = branch.path[index++];
                if (choice === undefined)
                    throw new DecisionNeeded(positive.map((entry) => entry.weight));
                return positive[choice]!.value;
            },
            integer(min, max) {
                if (!rollValues || min === max) return Math.floor((min + max) / 2);
                const count = max - min + 1;
                if (count > limit)
                    throw new ExactCalculationLimit("Exact value rolls exceeded the state limit.");
                return random.pick(
                    Array.from({ length: count }, (_, index) => ({
                        value: min + index,
                        weight: 1,
                    })),
                );
            },
        };
        try {
            if (run(random, branch.probability)) probability += branch.probability;
        } catch (error) {
            if (error instanceof ExactCalculationLimit) throw error;
            if (!(error instanceof DecisionNeeded)) {
                if (!branch.path.length) throw error;
                throw new Error(
                    "This craft has an invalid outcome; no probability estimate was produced.",
                    { cause: error },
                );
            }
            const total = error.weights.reduce((a, b) => a + b, 0);
            if (branches.length + error.weights.length + states > limit)
                throw new ExactCalculationLimit("Exact enumeration exceeded the state limit.");
            for (const [choice, weight] of error.weights.entries())
                branches.push({
                    path: [...branch.path, choice],
                    probability: (branch.probability * weight) / total,
                });
        }
    }
    return { probability: Math.min(1, Math.max(0, probability)), states };
}

export class CraftingProcess {
    item: CraftingItem;
    actions = 0;
    spending: Record<string, number> = {};
    error?: string;
    private routes = emptyCraftingRoutes();
    private lastStep?: string;
    private baseItems = 1;
    private attempts = 0;
    private destination: string;
    private steps: Map<string, CraftingProject["steps"][number]>;

    constructor(
        private engine: CraftingEngine,
        private project: CraftingProject,
        private random: CraftingRandom,
    ) {
        if (!project.steps.length) throw new Error("Add at least one crafting step.");
        this.item = project.item;
        this.steps = new Map(project.steps.map((step) => [step.id, step]));
        this.destination = project.steps[0]!.id;
    }

    get done() {
        return this.terminal || this.attempts >= this.project.maxActions;
    }

    private get terminal() {
        return this.destination === "success" || this.destination === "failure";
    }

    advance() {
        if (this.done) return;
        if (this.destination === "restart") {
            this.item = this.project.item;
            this.baseItems++;
            this.destination = this.project.steps[0]!.id;
        }
        const step = this.steps.get(this.destination)!;
        this.lastStep = step.id;
        this.routes[step.id] ??= emptyCraftingRoute();
        const route = this.routes[step.id];
        route.visits++;
        this.attempts++;
        try {
            if (step.method) {
                const result = usesAllflame(step.method)
                    ? this.engine.prepareAllflame(this.item, step.method, this.random)
                    : this.engine.apply(this.item, step.method, this.random);
                if (result.item.allflameCopies) {
                    const branches = processBranches(step);
                    let selected = 0;
                    let best = Number.POSITIVE_INFINITY;
                    for (const [index, copy] of result.item.allflameCopies.entries()) {
                        const rank = branches.findIndex((branch) =>
                            this.engine.matches(copy, branch.condition),
                        );
                        const route = branches[rank];
                        if (
                            rank >= 0 &&
                            rank < best &&
                            route?.destination !== "failure" &&
                            route?.destination !== "restart"
                        ) {
                            selected = index;
                            best = rank;
                        }
                    }
                    result.item = this.engine.chooseAllflame(result.item, selected);
                }
                this.item = result.item;
                for (const cost of result.cost) {
                    this.spending[cost.id] = (this.spending[cost.id] ?? 0) + cost.amount;
                    route.spending[cost.id] = (route.spending[cost.id] ?? 0) + cost.amount;
                }
                this.actions++;
            }
            const branch = processBranches(step).find((entry) =>
                this.engine.matches(this.item, entry.condition),
            );
            if (branch) route.passed++;
            else route.failed++;
            if (step.branches && branch) {
                route.branches ??= Object.create(null);
                route.branches![branch.id] =
                    (Object.hasOwn(route.branches!, branch.id) ? route.branches![branch.id]! : 0) +
                    1;
            }
            this.destination = branch?.destination ?? step.onFailure;
        } catch (error) {
            if (error instanceof DecisionNeeded || error instanceof ExactCalculationLimit)
                throw error;
            if (error instanceof BenchCraftConflict) {
                this.item = error.item;
                for (const cost of error.cost) {
                    this.spending[cost.id] = (this.spending[cost.id] ?? 0) + cost.amount;
                    route.spending[cost.id] = (route.spending[cost.id] ?? 0) + cost.amount;
                }
                if (error.cost.length) this.actions++;
            }
            this.error = error instanceof Error ? error.message : String(error);
            route.errors++;
            this.destination = "failure";
        }
    }

    result() {
        return {
            item: this.item,
            actions: this.actions,
            steps: this.attempts,
            spending: { ...this.spending },
            baseItems: this.baseItems,
            routes: copyCraftingRoutes(this.routes),
            lastStep: this.lastStep,
            nextStep: this.done
                ? undefined
                : this.destination === "restart"
                  ? this.project.steps[0]!.id
                  : this.destination,
            error: this.error,
            timeout: this.done && !this.terminal,
            success:
                this.destination === "success" &&
                this.engine.matches(this.item, this.project.target),
        };
    }
}

export function calculateProcessExact(
    engine: CraftingEngine,
    input: CraftingProject,
    limit = 2000,
): CraftingResult {
    const project = validateProject(engine.catalog, input);
    const spending: Record<string, number> = {};
    const errors: Record<string, number> = {};
    const routes = emptyCraftingRoutes();
    let actions = 0;
    let baseItems = 0;
    let timeouts = 0;
    let work = 0;
    const exact = enumerateExact(
        (random, probability) => {
            const process = new CraftingProcess(engine, project, random);
            while (!process.done) {
                if (++work > limit * 10)
                    throw new ExactCalculationLimit("Exact process exceeded the action limit.");
                process.advance();
            }
            const result = process.result();
            addCraftingRoutes(routes, result.routes, probability);
            for (const [id, amount] of Object.entries(result.spending))
                spending[id] = (spending[id] ?? 0) + amount * probability;
            actions += result.actions * probability;
            baseItems += result.baseItems * probability;
            if (result.timeout) timeouts += probability;
            if (result.error) errors[result.error] = (errors[result.error] ?? 0) + probability;
            return result.success;
        },
        limit,
        targetNeedsValues(project.target) ||
            project.steps.some((step) =>
                processBranches(step).some((branch) => targetNeedsValues(branch.condition)),
            ),
    );
    const unpriced = Object.keys(spending).filter((id) => project.prices[id] === undefined);
    const baseSpending = project.baseCost === undefined ? undefined : baseItems * project.baseCost;
    const meanCost = unpriced.length
        ? null
        : Object.entries(spending).reduce(
              (total, [id, amount]) => total + amount * project.prices[id]!,
              baseSpending ?? 0,
          );
    return {
        kind: "exact-process",
        routes,
        trials: exact.states,
        successes: 0,
        probability: exact.probability,
        interval: [exact.probability, exact.probability],
        ...probabilitySummary(exact.probability),
        totalActions: actions,
        timeouts,
        errors,
        spending,
        baseItems,
        baseSpending,
        meanCost,
        costPerSuccess:
            meanCost !== null && exact.probability > 0 ? meanCost / exact.probability : null,
        unpriced,
        affixes: {},
        samples: [],
    };
}

export function validateProject(catalog: CraftingCatalog, input: unknown): CraftingProject {
    const project = craftingProjectSchema.parse(input);
    if (project.game !== catalog.game || project.patch !== catalog.patch)
        throw new Error("The project was saved for a different game or client build.");
    const engine = new CraftingEngine(catalog);
    engine.validateItem(project.item);
    validateInventory(engine, project.inventory, project.inventoryTabs);
    engine.validateTarget(project.target);
    engine.validateMethod(project.method);
    const ids = new Set(project.steps.map((step) => step.id));
    if (
        ids.size !== project.steps.length ||
        ["success", "failure", "restart"].some((id) => ids.has(id))
    )
        throw new Error("Step IDs must be unique and cannot use terminal names.");
    for (const step of project.steps) {
        for (const branch of processBranches(step)) engine.validateTarget(branch.condition);
        if (step.method) engine.validateMethod(step.method);
        for (const next of [
            ...processBranches(step).map((branch) => branch.destination),
            step.onFailure,
        ])
            if (!["success", "failure", "restart"].includes(next) && !ids.has(next))
                throw new Error(`Unknown step destination: ${next}`);
    }
    return project;
}

export class CraftingSimulation {
    readonly engine: CraftingEngine;
    readonly project: CraftingProject;
    private random: CraftingRandom;
    private trials = 0;
    private successes = 0;
    private actions = 0;
    private steps = 0;
    private baseItems = 0;
    private timeouts = 0;
    private errors: Record<string, number> = {};
    private spending: Record<string, number> = {};
    private affixes: Record<string, number> = {};
    private samples: CraftingResult["samples"] = [];
    private cheapest: number | null = null;
    private costliest: number | null = null;
    private unpricedSuccesses = 0;
    private distribution?: CraftingAffixDistribution;
    private routes = emptyCraftingRoutes();

    constructor(
        catalog: CraftingCatalog,
        input: CraftingProject,
        readonly process = input.useProcess,
    ) {
        this.project = validateProject(catalog, input);
        this.engine = new CraftingEngine(catalog);
        if (this.project.successDistribution)
            this.distribution = new CraftingAffixDistribution(this.engine);
        this.random = seededRandom(input.seed);
        if (process && !input.steps.length) throw new Error("Add at least one crafting step.");
    }

    private unfinished?: ReturnType<CraftingProcess["result"]>;

    get stopReason(): CraftingResult["stopReason"] {
        const limit = this.project.simulationLimit;
        if (limit?.kind === "manual") return undefined;
        if (limit?.kind === "successes" && this.successes >= limit.count) return "successes";
        if (limit?.kind === "actions" && this.steps + (this.unfinished?.steps ?? 0) >= limit.count)
            return "actions";
        return this.trials >= this.project.iterations ? "trials" : undefined;
    }

    get done() {
        return this.stopReason !== undefined;
    }

    private charge(cost: CraftingCost[]) {
        const spending: Record<string, number> = {};
        for (const entry of cost) {
            this.spending[entry.id] = (this.spending[entry.id] ?? 0) + entry.amount;
            spending[entry.id] = (spending[entry.id] ?? 0) + entry.amount;
        }
        return spending;
    }

    runTrial() {
        if (this.project.simulationLimit && this.done) return;
        let item = this.project.item;
        let successful = false;
        let spending: Record<string, number>;
        let baseItems: number | undefined;
        if (!this.process) {
            try {
                const result = this.engine.apply(item, this.project.method, this.random, [
                    this.project.target,
                ]);
                item = result.item;
                spending = this.charge(result.cost);
                this.actions++;
                successful = this.engine.matches(item, this.project.target);
            } catch (error) {
                if (!(error instanceof BenchCraftConflict)) throw error;
                item = error.item;
                spending = this.charge(error.cost);
                if (error.cost.length) this.actions++;
                this.errors[error.message] = (this.errors[error.message] ?? 0) + 1;
            }
            this.steps++;
        } else {
            const process = new CraftingProcess(this.engine, this.project, this.random);
            const limit = this.project.simulationLimit;
            let steps = 0;
            while (!process.done) {
                if (limit?.kind === "actions" && this.steps + steps >= limit.count) {
                    this.unfinished = process.result();
                    return;
                }
                process.advance();
                steps++;
            }
            const result = process.result();
            spending = result.spending;
            baseItems = result.baseItems;
            addCraftingRoutes(this.routes, result.routes);
            item = result.item;
            successful = result.success;
            this.actions += result.actions;
            this.steps += result.steps;
            this.baseItems += result.baseItems;
            for (const [id, amount] of Object.entries(result.spending))
                this.spending[id] = (this.spending[id] ?? 0) + amount;
            if (result.timeout) this.timeouts++;
            if (result.error) this.errors[result.error] = (this.errors[result.error] ?? 0) + 1;
        }
        this.trials++;
        const unpriced = Object.keys(spending).filter(
            (id) => this.project.prices[id] === undefined,
        );
        const baseSpending =
            baseItems !== undefined && this.project.baseCost !== undefined
                ? baseItems * this.project.baseCost
                : undefined;
        const cost: CraftingTrialCost = {
            spending,
            baseItems,
            baseSpending,
            unpriced,
            total: unpriced.length
                ? null
                : Object.entries(spending).reduce(
                      (total, [id, amount]) => total + amount * this.project.prices[id]!,
                      baseSpending ?? 0,
                  ),
        };
        if (successful) {
            this.successes++;
            this.distribution?.add(item);
            if (cost.total === null) this.unpricedSuccesses++;
            else {
                this.cheapest = Math.min(this.cheapest ?? cost.total, cost.total);
                this.costliest = Math.max(this.costliest ?? cost.total, cost.total);
            }
        }
        if (!item.destroyed)
            for (const mod of item.mods) this.affixes[mod.id] = (this.affixes[mod.id] ?? 0) + 1;
        const storage = this.project.sampleStorage;
        if (storage) {
            if (
                this.samples.length < storage.limit &&
                (storage.mode === "all" || (storage.mode === "successes" && successful))
            )
                this.samples.push({ trial: this.trials, item, success: successful, cost });
        } else if (
            this.samples.length < 10 ||
            (successful && !this.samples.some((sample) => sample.success))
        ) {
            if (this.samples.length >= 10) this.samples.pop();
            this.samples.push({ trial: this.trials, item, success: successful, cost });
        }
    }

    result(): CraftingResult {
        const probability = this.trials ? this.successes / this.trials : 0;
        const baseSpending =
            this.process && this.project.baseCost !== undefined
                ? this.baseItems * this.project.baseCost
                : undefined;
        const unpriced = Object.keys(this.spending).filter(
            (id) => this.project.prices[id] === undefined,
        );
        const total = Object.entries(this.spending).reduce(
            (sum, [id, amount]) => sum + amount * (this.project.prices[id] ?? 0),
            baseSpending ?? 0,
        );
        return {
            kind: this.process ? "process" : "sampled",
            trials: this.trials,
            successes: this.successes,
            probability,
            interval: wilsonInterval(this.successes, this.trials),
            ...probabilitySummary(probability),
            totalActions: this.actions,
            timeouts: this.timeouts,
            errors: { ...this.errors },
            spending: { ...this.spending },
            meanCost: !unpriced.length && this.trials ? total / this.trials : null,
            costPerSuccess: !unpriced.length && this.successes ? total / this.successes : null,
            unpriced,
            affixes: { ...this.affixes },
            samples: [...this.samples],
            successCosts: {
                cheapest: this.unpricedSuccesses ? null : this.cheapest,
                costliest: this.unpricedSuccesses ? null : this.costliest,
                unpriced: this.unpricedSuccesses,
            },
            ...(this.project.sampleStorage
                ? { sampleStorage: { ...this.project.sampleStorage } }
                : {}),
            ...(this.distribution ? { successDistribution: this.distribution.result() } : {}),
            ...(this.project.simulationLimit
                ? {
                      simulationLimit: { ...this.project.simulationLimit },
                      totalSteps: this.steps,
                      stopReason: this.stopReason,
                      unfinished: this.unfinished,
                  }
                : {}),
            ...(this.process
                ? {
                      routes: copyCraftingRoutes(this.routes),
                      baseItems: this.baseItems,
                      baseSpending,
                  }
                : {}),
        };
    }
}
