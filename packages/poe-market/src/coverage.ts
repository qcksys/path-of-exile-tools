import type { ItemCondition, ItemQuery, ItemRecord, NumericRange } from "@poe-tools/item-query";
import { matchItem, matchItemCondition } from "@poe-tools/item-query";
import type { MarketCohort } from "./cohorts.ts";
import type { CohortPriceReference } from "./reference.ts";

export function isDisplayEquivalentCohort(cohort: MarketCohort) {
    return (
        cohort.id.startsWith("donor-family:") &&
        ["isolated-modifier", "transfer-donor"].includes(cohort.purpose)
    );
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
) {
    const reasons: string[] = [];
    if (matchItem(item, cohort.query) !== "match")
        reasons.push("The configured item does not definitely match this cohort.");
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
            ...(modifier.tier !== undefined
                ? { tier: { min: modifier.tier, max: modifier.tier } }
                : {}),
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
