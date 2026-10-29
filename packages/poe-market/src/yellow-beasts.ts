import data from "../data/yellow-beasts-poe1.json" with { type: "json" };

/** The market item key and base type under which PoE 1 lists every yellow beast species together. */
export const yellowBeastMarket = "Yellow Beast";
/** Species that can fill a recipe's generic rare sacrifices, which stash listings key by name. */
export const yellowBeastNames: readonly string[] = data.names;
/** Every capturable species: the generic ones and those recipes name or the game disables. */
export const bestiaryNames: readonly string[] = [...data.names, ...data.excludedNames];
const names = new Set(yellowBeastNames);

export function isYellowBeast(name: string) {
    return names.has(name);
}
