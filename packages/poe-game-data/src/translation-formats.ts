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
