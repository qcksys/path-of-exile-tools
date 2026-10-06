export const relationalPlaceholders: Record<string, string> = {
    mod_value_to_item_class: "&lt;random item class&gt;",
    tempest_mod_text: "&lt;random Tempest modifier&gt;",
    display_indexable_support: "&lt;random Support Gem&gt;",
    display_indexable_non_active_support: "&lt;random Support Gem (without Active Skill)&gt;",
    display_indexable_skill: "&lt;random Skill&gt;",
    affliction_reward_type: "&lt;Delirium reward&gt;",
    passive_hash: "&lt;random Passive Skill&gt;",
    passive_keystone_index: "&lt;Keystone Passive Skill&gt;",
    mages_legacy_index: "Legacy of &lt;Utility Flask&gt;",
};

export function specificity(rule: { conditions: string[] }) {
    return rule.conditions.reduce(
        (score, condition) =>
            score + 3 - (condition.match(/#/g)?.length ?? 0) - (condition === "#" ? 1 : 0),
        0,
    );
}

const divisors: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    ten: 10,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
    fifty: 50,
    one_hundred: 100,
    one_thousand: 1000,
};
export function numericHandler(name: string, value: number): number | undefined {
    if (name === "subtract_one") return value - 1;
    if (name === "add_one") return value + 1;
    if (name === "invert_chance") return 100 - value;
    if (name === "negate") return -value;
    if (name === "double") return value * 2;
    if (name === "negate_and_double") return value * -2;
    if (name === "times_one_point_five") return value * 1.5;
    if (name === "times_twenty") return value * 20;
    if (name === "multiply_by_ten") return value * 10;
    if (name === "multiply_by_one_hundred") return value * 100;
    if (name === "plus_two_hundred") return value + 200;
    if (name === "multiplicative_damage_modifier") return value + 100;
    if (name === "multiplicative_permyriad_damage_modifier") return value / 100 + 100;
    if (name === "old_leech_percent") return value / 5;
    if (name === "old_leech_permyriad") return value / 500;
    if (name === "permyriad_per_minute_to_%_per_second") return value / 6000;
    const percent = /^(\d+)%_of_value$/.exec(name)?.[1];
    if (percent) return (value * Number(percent)) / 100;
    if (name === "milliseconds_to_seconds_halved") return value / 500;
    if (name === "divide_by_twenty_then_double_0dp") return value / 10;
    const division = /^divide_by_(.+?)(?:_([012])dp(?:_if_required)?|_and_negate)?$/.exec(name);
    let divisor = division?.[1] ? divisors[division[1]] : undefined;
    if (name.startsWith("milliseconds_to_seconds")) divisor = 1000;
    if (name.startsWith("per_minute_to_per_second")) divisor = 60;
    if (name === "deciseconds_to_seconds" || name === "locations_to_metres") divisor = 10;
    if (!divisor) return undefined;
    return (value / divisor) * (name.endsWith("and_negate") ? -1 : 1);
}

export function matchesCondition(condition: string, value: number): boolean {
    if (condition.startsWith("!")) return !matchesCondition(condition.slice(1), value);
    if (condition === "#") return true;
    if (condition.includes("|")) {
        const [min, max] = condition.split("|");
        return (min === "#" || value >= Number(min)) && (max === "#" || value <= Number(max));
    }
    return value === Number(condition);
}

export function formatStatNumber(value: number, handler: string) {
    const fractional = [
        "per_minute_to_per_second",
        "permyriad_per_minute_to_%_per_second",
    ].includes(handler);
    const dp = /_([012])dp/.exec(handler)?.[1] ?? (fractional ? "1" : undefined);
    if (dp === "0") return String(Math.trunc(value));
    if (dp === undefined) return String(Number(value.toPrecision(6)));
    const factor = 10 ** Number(dp);
    const scaled = value * factor;
    const rounded =
        scaled % 1 === 0.5
            ? (Math.floor(scaled) % 2 === 0 ? Math.floor(scaled) : Math.ceil(scaled)) / factor
            : value;
    const formatted = rounded.toFixed(Number(dp));
    return handler.endsWith("_if_required") || fractional ? String(Number(formatted)) : formatted;
}

export function translationStatId(id: string) {
    return id === "corrosive_shroud_maximum_stored_poison_damage"
        ? "virtual_plague_bearer_maximum_stored_poison_damage"
        : id;
}
