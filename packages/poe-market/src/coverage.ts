import type {
    ItemCondition,
    ItemQuery,
    ItemRecord,
    NumericRange,
    SourcePreparationProfile,
} from "@poe-tools/item-query";
import { itemRarity, matchItem, matchItemCondition } from "@poe-tools/item-query";
import type { MarketCohort } from "./cohorts.ts";
import type { CohortPriceReference } from "./reference.ts";

export function isDisplayEquivalentCohort(cohort: MarketCohort) {
    return (
        cohort.id.startsWith("donor-family:") &&
        ["isolated-modifier", "transfer-donor"].includes(cohort.purpose)
    );
}

export function sameSourcePreparation(
    left: SourcePreparationProfile | undefined,
    right: SourcePreparationProfile | undefined,
) {
    return left === undefined || right === undefined
        ? left === right
        : left.kind === right.kind &&
              (left.kind !== "fractured-fossil-v1" ||
                  (right.kind === "fractured-fossil-v1" && left.fractureId === right.fractureId)) &&
              left.crafted === right.crafted &&
              left.enchanted === right.enchanted;
}

function within(actual: NumericRange, required: NumericRange) {
    return (
        (actual.min ?? -Infinity) >= (required.min ?? -Infinity) &&
        (actual.max ?? Infinity) <= (required.max ?? Infinity)
    );
}
function subset(actual: string[] | undefined, required: string[] | undefined) {
    return required === undefined || (actual?.every((value) => required.includes(value)) ?? false);
}
function implies(actual: ItemCondition, required: ItemCondition, item: ItemRecord): boolean {
    if (actual.kind === "base" && required.kind === "base") {
        if (actual.field === required.field) return subset(actual.values, required.values);
        return (
            actual.field === "baseType" &&
            actual.values.every((name) => name === item.item.baseType) &&
            required.field === "baseId" &&
            !item.facts.baseTypeAmbiguous &&
            !!item.facts.baseId &&
            required.values.includes(item.facts.baseId)
        );
    }
    if (actual.kind === "rarity" && required.kind === "rarity")
        return subset(actual.values, required.values);
    if (actual.kind === "flag" && required.kind === "flag")
        return actual.field === required.field && actual.value === required.value;
    if (actual.kind === "influence" && required.kind === "influence")
        return subset(actual.values, required.values);
    if (actual.kind === "range" && required.kind === "range") {
        if (actual.field === required.field) return within(actual.value, required.value);
        return (
            actual.field === "links" &&
            required.field === "sockets" &&
            required.value.max === undefined &&
            (actual.value.min ?? 0) >= (required.value.min ?? 0)
        );
    }
    if (actual.kind === "stat" && required.kind === "stat")
        return (
            actual.id === required.id &&
            actual.scope === required.scope &&
            within(actual.value, required.value)
        );
    if (actual.kind === "mod" && required.kind === "mod") {
        const { count: _actualCount, ...actualPredicate } = actual;
        const { count: _requiredCount, ...requiredPredicate } = required;
        if (
            required.count.max !== undefined &&
            JSON.stringify(actualPredicate) !== JSON.stringify(requiredPredicate)
        )
            return false;
        return (
            subset(actual.ids, required.ids) &&
            subset(actual.names, required.names) &&
            (!required.tier || (!!actual.tier && within(actual.tier, required.tier))) &&
            (!required.side || actual.side === required.side) &&
            (required.fractured === undefined || actual.fractured === required.fractured) &&
            (required.crafted === undefined || actual.crafted === required.crafted) &&
            within(actual.count, required.count)
        );
    }
    return false;
}

export function cohortPriceCoverage(
    cohort: MarketCohort,
    item: ItemRecord,
    requirements: ItemQuery,
    assumption?: CohortPriceReference["assumption"],
    sourcePreparation?: SourcePreparationProfile,
) {
    const reasons: string[] = [];
    const { sourcePreparation: cohortPreparation, ...query } = cohort.query;
    if (
        !sameSourcePreparation(sourcePreparation, cohortPreparation) ||
        matchItem(item, query) !== "match"
    )
        reasons.push("The configured item does not definitely match this cohort.");
    if (
        sourcePreparation?.kind === "fractured-fossil-v1" &&
        (item.facts.modifiers.filter((mod) => mod.side !== "implicit").length !== 1 ||
            !item.facts.modifiers.some(
                (mod) => mod.id === sourcePreparation.fractureId && mod.fractured,
            ))
    )
        reasons.push("Source preparation requires a template containing only its sole fracture.");
    if (
        sourcePreparation?.kind === "scour-v1" &&
        (itemRarity(item.item) !== "Normal" ||
            item.facts.prefixes !== 0 ||
            item.facts.suffixes !== 0 ||
            item.facts.modifiers.some(
                (mod) => mod.side !== "implicit" || mod.fractured || mod.crafted,
            ))
    )
        reasons.push(
            "Scouring source preparation requires a Normal template with only native implicits.",
        );
    if (item.game !== requirements.game)
        reasons.push("Item and requirements belong to different games.");
    const conditions = cohort.query.groups.flatMap((group) =>
        group.type === "and" ? group.filters : [],
    );
    const guaranteed = conditions.map((condition) => {
        if (
            !assumption ||
            !isDisplayEquivalentCohort(cohort) ||
            condition.kind !== "mod" ||
            !condition.ids ||
            condition.ids.length < 2
        )
            return condition;
        const representatives = item.facts.modifiers.filter(
            (mod) => mod.id && condition.ids!.includes(mod.id),
        );
        if (representatives.length !== 1) return condition;
        return { ...condition, ids: [representatives[0]!.id!] };
    });
    const guarantees = (required: ItemCondition) =>
        guaranteed.some((actual) => implies(actual, required, item));
    if (
        item.facts.baseTypeAmbiguous &&
        (!item.facts.baseId ||
            !guarantees({ kind: "base", field: "baseId", values: [item.facts.baseId] }))
    )
        reasons.push(
            "The cohort does not distinguish the canonical variants sharing this base name.",
        );
    if (
        !guarantees({ kind: "base", field: "baseType", values: [item.item.baseType] }) &&
        !(
            item.facts.baseId &&
            guarantees({ kind: "base", field: "baseId", values: [item.facts.baseId] })
        )
    )
        reasons.push("The cohort does not guarantee the configured base.");
    const rarity = itemRarity(item.item);
    if (!rarity || !guarantees({ kind: "rarity", values: [rarity] }))
        reasons.push("The cohort does not guarantee the configured rarity.");
    for (const field of ["ilvl", "prefixes", "suffixes"] as const) {
        const value =
            field === "ilvl" ? (item.item.ilvl ?? item.item.itemLevel) : item.facts[field];
        if (
            value === undefined ||
            !guarantees({ kind: "range", field, value: { min: value, max: value } })
        )
            reasons.push(`The cohort does not guarantee the configured ${field}.`);
    }
    for (const field of [
        "identified",
        "corrupted",
        "mirrored",
        "fractured",
        "synthesised",
    ] as const) {
        const match = matchItemCondition(item, { kind: "flag", field, value: true });
        if (match === "unknown" || !guarantees({ kind: "flag", field, value: match === "match" }))
            reasons.push(`The cohort does not guarantee the configured ${field} state.`);
    }
    const excluded = cohort.query.groups.flatMap((group) =>
        group.type === "not" ? group.filters : [],
    );
    const noInfluences =
        guarantees({ kind: "flag", field: "influenced", value: false }) ||
        excluded.some(
            (filter) => filter.kind === "flag" && filter.field === "influenced" && filter.value,
        );
    for (const influence of new Set([
        "shaper",
        "elder",
        "crusader",
        "redeemer",
        "hunter",
        "warlord",
        ...Object.keys(item.item.influences ?? {}),
    ])) {
        const required = item.item.influences?.[influence] === true;
        const covered = required
            ? guarantees({ kind: "influence", values: [influence] })
            : noInfluences ||
              excluded.some(
                  (filter) => filter.kind === "influence" && filter.values.includes(influence),
              );
        if (!covered) reasons.push("The cohort does not guarantee the configured influences.");
    }
    const sockets = item.facts.socketCount ?? item.item.sockets?.length ?? 0;
    const links =
        [6, 5, 4, 3, 2].find(
            (min) =>
                matchItemCondition(item, { kind: "range", field: "links", value: { min } }) ===
                "match",
        ) ?? 0;
    for (const [field, minimum] of [
        ["sockets", sockets],
        ["links", links],
    ] as const) {
        if (minimum <= (field === "links" ? 1 : 0)) continue;
        const requirement: ItemCondition = { kind: "range", field, value: { min: minimum } };
        if (!guaranteed.some((condition) => implies(condition, requirement, item)))
            reasons.push(`The cohort does not guarantee the configured ${field}.`);
    }
    for (const group of requirements.groups) {
        if (group.type !== "and") {
            reasons.push(
                "Automatic pricing does not yet prove coverage of this logical query group.",
            );
            continue;
        }
        if (
            group.filters.some(
                (condition) => !guaranteed.some((actual) => implies(actual, condition, item)),
            )
        )
            reasons.push("The cohort does not guarantee every output requirement.");
    }
    if (!item.facts.modifiersComplete)
        reasons.push("The configured item's modifier identities are incomplete.");
    for (const modifier of item.facts.modifiers.filter((mod) => mod.side !== "implicit")) {
        if (!modifier.id) {
            reasons.push("A configured modifier has no canonical identity.");
            continue;
        }
        const requirement: ItemCondition = {
            kind: "mod",
            ids: [modifier.id],
            count: { min: 1 },
            // A canonical identity fixes the stat ranges; tier labels depend on the base and source.
            ...(modifier.fractured ? { fractured: true } : {}),
        };
        if (!guaranteed.some((condition) => implies(condition, requirement, item)))
            reasons.push("The cohort does not price every configured explicit modifier.");
    }
    return { covered: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function cohortBaseTypes(cohort: MarketCohort): string[] | null {
    for (const group of cohort.query.groups) {
        if (group.type !== "and") continue;
        const base = group.filters.find(
            (condition) => condition.kind === "base" && condition.field === "baseType",
        );
        if (base?.kind === "base") return base.values;
    }
    return null;
}
