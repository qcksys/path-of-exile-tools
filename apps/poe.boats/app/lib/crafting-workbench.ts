import type { CraftingCatalog, CraftingItem, CraftingProject } from "../schemas/crafting";
import {
    type CraftingEmulationCommand,
    type CraftingItemEdit,
    craftingItemEditSchema,
} from "../schemas/crafting-workbench";
import { usesAllflame } from "./crafting-allflame";
import {
    BenchCraftConflict,
    type CraftingCost,
    CraftingEngine,
    seededRandom,
} from "./crafting-engine";
import { setCraftingFlag } from "./crafting-flags";
import {
    type CraftingResult,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    ExactCalculationLimit,
    hasCraftingRequirements,
    probabilitySummary,
    validateProject,
} from "./crafting-simulation";

export function editCraftingStartingItem(
    engine: CraftingEngine,
    input: CraftingItemEdit,
): CraftingItem {
    const command = craftingItemEditSchema.parse(input);
    switch (command.kind) {
        case "create":
            return engine.createItem(command.baseId, command.level);
        case "validate":
            return engine.validateItem(command.item);
        case "add-mod":
            return engine.addStartingMod(
                command.item,
                command.id,
                seededRandom(command.seed),
                command.source,
            );
        case "flag":
            return setCraftingFlag(engine, command.item, command.flag, command.enabled);
        case "passive":
            return engine.setStartingPassive(command.item, command.id);
    }
}

export function emulateCraftingItem(
    engine: CraftingEngine,
    input: CraftingItem,
    command: CraftingEmulationCommand,
    seed: number,
): { item: CraftingItem; cost: CraftingCost[]; actions: number; error?: string } {
    const item = engine.validateItem(input);
    const random = seededRandom(seed);
    switch (command.kind) {
        case "select-unrevealed":
            return { item: engine.selectUnrevealed(item, command.index), cost: [], actions: 0 };
        case "prepare-reveal":
            return {
                ...engine.prepareReveal(
                    item,
                    { kind: "reveal", preferred: [], omens: command.omens },
                    random,
                ),
                actions: 1,
            };
        case "reroll-reveal":
            return { item: engine.rerollReveal(item, random), cost: [], actions: 1 };
        case "choose-revealed":
            return { item: engine.chooseRevealed(item, command.id, random), cost: [], actions: 1 };
        case "choose-allflame":
            return {
                item: engine.chooseAllflame(item, command.index),
                cost: item.allflameCost ?? [],
                actions: 1,
            };
        case "apply": {
            try {
                const result = usesAllflame(command.method)
                    ? engine.prepareAllflame(item, command.method, random)
                    : engine.apply(item, command.method, random);
                return {
                    item: result.item,
                    cost: result.item.allflameCopies ? [] : result.cost,
                    actions: result.item.allflameCopies ? 0 : 1,
                };
            } catch (error) {
                if (!(error instanceof BenchCraftConflict) || !error.cost.length) throw error;
                return { item: error.item, cost: error.cost, actions: 1, error: error.message };
            }
        }
    }
}

function exactResult(engine: CraftingEngine, project: CraftingProject): CraftingResult {
    if (project.useProcess) return calculateProcessExact(engine, project);
    const exact = calculateExact(engine, project.item, project.method, project.target);
    const spending: Record<string, number> = {};
    for (const cost of engine.costs(project.method, project.item))
        spending[cost.id] = (spending[cost.id] ?? 0) + cost.amount;
    const unpriced = Object.keys(spending).filter((id) => project.prices[id] === undefined);
    const meanCost = unpriced.length
        ? null
        : Object.entries(spending).reduce(
              (sum, [id, amount]) => sum + amount * project.prices[id]!,
              0,
          );
    return {
        kind: "exact",
        trials: exact.states,
        successes: 0,
        probability: exact.probability,
        interval: [exact.probability, exact.probability],
        ...probabilitySummary(exact.probability),
        totalActions: 1,
        timeouts: 0,
        errors: {},
        spending,
        meanCost,
        costPerSuccess:
            meanCost !== null && exact.probability > 0 ? meanCost / exact.probability : null,
        unpriced,
        affixes: {},
        samples: [],
    };
}

export class CraftingWorkbenchCalculation {
    private exact?: CraftingResult;
    private simulation?: CraftingSimulation;

    constructor(
        catalog: CraftingCatalog,
        input: CraftingProject,
        mode: "calculate" | "sample" | "process",
    ) {
        const project = validateProject(catalog, input);
        if (!hasCraftingRequirements(project.target))
            throw new Error("Add at least one target requirement.");
        if (mode === "calculate") {
            try {
                this.exact = exactResult(new CraftingEngine(catalog), project);
                return;
            } catch (error) {
                if (!(error instanceof ExactCalculationLimit)) throw error;
            }
        }
        this.simulation = new CraftingSimulation(
            catalog,
            mode === "calculate" ? { ...project, simulationLimit: undefined } : project,
            mode === "process" || project.useProcess,
        );
    }

    get done() {
        return this.exact !== undefined || this.simulation!.done;
    }

    runBatch(size = 100) {
        for (let i = 0; i < size && !this.done; i++) this.simulation!.runTrial();
        return this.done;
    }

    result() {
        return this.exact ?? this.simulation!.result();
    }
}
