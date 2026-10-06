import type { CraftingBranch, CraftingStep } from "../schemas/crafting";

type FlowConnection = {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
};

export const processStepId = (id: string) => `step:${id}`;
export const processDestinationId = (id: string) =>
    ["success", "failure", "restart"].includes(id) ? id : processStepId(id);
export const processStepName = (step: CraftingStep, index: number) =>
    step.name?.trim() || `Step ${index + 1}`;

export function processBranches(step: CraftingStep): CraftingBranch[] {
    return (
        step.branches ?? [{ id: "pass", condition: step.condition, destination: step.onSuccess }]
    );
}

export function withProcessBranches(step: CraftingStep, branches: CraftingBranch[]): CraftingStep {
    return {
        ...step,
        condition: branches[0]?.condition ?? step.condition,
        onSuccess: branches[0]?.destination ?? step.onSuccess,
        branches,
    };
}

export function copyProcessStep(step: CraftingStep, index: number): CraftingStep {
    const copy = structuredClone(step);
    copy.id = `step-${crypto.randomUUID()}`;
    copy.name = `${processStepName(step, index).slice(0, 113)} (copy)`;
    const destination = (id: string) => (id === step.id ? copy.id : id);
    copy.onSuccess = destination(copy.onSuccess);
    copy.onFailure = destination(copy.onFailure);
    if (copy.branches)
        copy.branches = copy.branches.map((branch) => ({
            ...branch,
            destination: destination(branch.destination),
        }));
    if (copy.position) copy.position = { x: copy.position.x + 40, y: copy.position.y + 40 };
    return copy;
}

export function removeProcessStep(steps: CraftingStep[], id: string) {
    return steps
        .filter((step) => step.id !== id)
        .map((step) => ({
            ...step,
            onSuccess: step.onSuccess === id ? "failure" : step.onSuccess,
            onFailure: step.onFailure === id ? "failure" : step.onFailure,
            ...(step.branches
                ? {
                      branches: step.branches.map((branch) => ({
                          ...branch,
                          destination: branch.destination === id ? "failure" : branch.destination,
                      })),
                  }
                : {}),
        }));
}

export function validProcessConnection(steps: CraftingStep[], connection: FlowConnection) {
    const targetStep = steps.some((step) => processStepId(step.id) === connection.target);
    if (connection.targetHandle !== "in") return false;
    if (connection.source === "start") return connection.sourceHandle === "next" && targetStep;
    return (
        steps.some(
            (step) =>
                processStepId(step.id) === connection.source &&
                (connection.sourceHandle === "fail" ||
                    processBranches(step).some((branch) => branch.id === connection.sourceHandle)),
        ) &&
        (targetStep || ["success", "failure", "restart"].includes(connection.target))
    );
}

export function connectProcessSteps(steps: CraftingStep[], connection: FlowConnection) {
    if (!validProcessConnection(steps, connection))
        throw new Error("Connect a step's route output to a step or terminal input.");
    const target = steps.find((step) => processStepId(step.id) === connection.target);
    if (connection.source === "start") return [target!, ...steps.filter((step) => step !== target)];
    return steps.map((step) => {
        if (processStepId(step.id) !== connection.source) return step;
        const destination = target?.id ?? connection.target;
        if (connection.sourceHandle === "fail") return { ...step, onFailure: destination };
        if (!step.branches) return { ...step, onSuccess: destination };
        return withProcessBranches(
            step,
            step.branches.map((branch) =>
                branch.id === connection.sourceHandle ? { ...branch, destination } : branch,
            ),
        );
    });
}
