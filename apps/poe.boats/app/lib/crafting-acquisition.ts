import type {
    AcquisitionChoice,
    AcquisitionComparison,
    AcquisitionEstimate,
} from "../schemas/crafting-economy";

export function compareAcquisition(
    alternatives: readonly AcquisitionEstimate[],
    choice: AcquisitionChoice,
): AcquisitionComparison {
    if (new Set(alternatives.map((entry) => entry.id)).size !== alternatives.length)
        throw new Error("Acquisition alternatives must have unique IDs.");
    if (new Set(alternatives.map((entry) => entry.currency)).size > 1)
        throw new Error(
            "Convert acquisition estimates to the project's currency before comparing them.",
        );
    let selected: AcquisitionEstimate | undefined;
    if (choice.mode === "pinned") {
        selected = alternatives.find((entry) => entry.id === choice.alternativeId);
        if (!selected) throw new Error("The pinned acquisition alternative no longer exists.");
    } else {
        for (const alternative of alternatives) {
            if (alternative.expectedCost === null || alternative.missingPrices.length) continue;
            if (!selected || alternative.expectedCost < selected.expectedCost!)
                selected = alternative;
        }
    }
    return {
        choice,
        selectedId: selected?.id ?? null,
        alternatives: [...alternatives],
        incomplete: alternatives.some(
            (entry) => entry.expectedCost === null || entry.missingPrices.length > 0,
        ),
    };
}
