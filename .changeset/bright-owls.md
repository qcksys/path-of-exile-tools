---
"poe-boats": minor
---

Add a PoE 1 recombinator simulator with editable items, an interactive crafting tree, full outcome probabilities, and target modifier filtering. Include icons and toggles for exclusive and NNN modifiers. Model duplicate modifiers and shared mod groups using the linked 3.26 guide, with explicit assumptions for uncertain selection weights, base-transfer restrictions, and unsupported exclusive combinations.

Use generated PoE 1 package data for searchable item bases and valid natural modifiers. Support generic armour attribute combinations and weapon categories, filter mods by item level and shared groups, and use actual mods in the example plan. Refresh the catalog during builds and use shadcn/ui controls throughout the recombinator.

Add essence NNN donor preparation and exclusive bench crafts to each recombination input, using recipe mappings exported from the same client build. Track output bases and exclude incompatible natural mods after counting the input pool. Support the opposite-side exclusive-craft setup for one-mod magic items, optional removal of crafted mods after each step, and filtering target odds by output base. Essence donor odds start after rerolling and isolating the forced mod; exclusive-craft odds are explicitly estimates.

Allow essence donors to retain selected natural modifiers alongside the forced mod, including Flaring and up to two suffixes for the physical axe setup. Support exclusive bench crafts on the same affix side of two one-mod magic inputs without changing the desired pair's 33% odds. Validate retained donor slots and groups and clarify that preparation odds and costs are excluded.
