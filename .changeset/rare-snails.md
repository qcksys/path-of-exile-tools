---
"poe-boats": minor
---

Follow the 3.30.0 patch notes. NPC vendors no longer sell Orbs of Chance, an Orb of Scouring costs 4 Orbs of Fusing (previously 4 Orbs of Chance), and the 3-for-1 scarab recipe is gone because scarabs were removed from the game. The Scouring price cites the patch notes until the wiki's Vendor page shows it; `validate-vendor-recipes --resume` keeps that row and checks it against the wiki on each run.

PoE 1 crafting catalogs from client 3.30 apply the new rules; 3.29 catalogs keep the old ones:

- An Orb of Annulment can remove attack and caster modifiers while "Cannot roll Attack Modifiers" or "Cannot roll Caster Modifiers" is on the item.
- A recombination result keeps the item level of the base it lands on instead of an average of both inputs.
- Recombination decides how many prefixes and suffixes to keep from only the modifiers that can roll on the chosen base. The counts for 1–3 modifiers are still the 3.29 measurements, because the patch notes say the new ones are lower on average but do not give them.
- The three Incursion glove suffixes are no longer accepted or offered as prepared modifiers, because 3.30 removed every source of Incursion Architect modifiers on magic and rare items.

Recombinator plans (`calculate_recombinator`) take an optional `patch` with the client build whose rules apply; plans built from the catalog fill it in, and a plan without it uses the 3.29 rules.
