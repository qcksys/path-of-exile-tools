# SpicySushiPoE Allflame samples

Reviewed on 23 October 2026. The scope is the latest PoE 1 crafting series,
Allflame 3.29; the subsequent September/October uploads are PoE 2.
Sources were reviewed through the original YouTube transcripts, descriptions,
creator comments and item frames, rather than inferred from video titles.

| Published (YouTube AU) | Source | Craft |
| --- | --- | --- |
| 28 July 2026 | [RF Scorching Ray shield](https://www.youtube.com/watch?v=wKOcQsTjy1U) | Heat-attuned Tower Shield: maximum resistance, life recovery on block, reduced critical damage, additional totem and spell block. |
| 30 July 2026 | [Magic find RF helmet](https://www.youtube.com/watch?v=KtDT7HPZqYs) | Elder Royal Burgonet: Horror, elevated Burning Damage, rarity and life. |
| 9 August 2026 | [Luminary mercenary chest](https://www.youtube.com/watch?v=V_wM_RXkSho) | Conquest Lamellar: fractured Breach critical chance, Abyss socket, Onslaught and armour/evasion. |
| 13 August 2026 | [Luminary boots and shield](https://www.youtube.com/watch?v=Y95F6-ZUDiw) | Leviathan Greaves with socketed minion levels and elevated Spectre levels; a separate Heat-attuned block shield. |
| 27 August 2026 | [Allflame crafting highlights](https://www.youtube.com/watch?v=4erFis5vy7Y) | Vestigial Luminary and Spark gloves. Reviewed, but their corrupted-item crafting and extra implicit transfer are not supported by the retained simulator. |

## Source observations

- **RF shield:** 0:14–4:45 combines a Shaper Heat-attuned receiver with life
  recovery and an evasion donor carrying +3 maximum resistance and non-native
  suffixes. 5:09–6:35 protects suffixes, reforges critical and then influence for
  the totem prefix. 6:35–8:58 blocks flat armour before the Allflame Foulborn
  Exalted Orb, accepts spell block, and converts maximum lightning resistance to
  fire. The video accidentally finishes at item level 85; the sample uses 86.
- **RF helmet:** 4:27 shows an Elder Royal Burgonet with the Horror suffix and
  an Elder Vaal Mask with level 20 Burning Damage, suppression and Dexterity.
  4:35–5:38 adds a sacrificial influence modifier and elevates Burning Damage.
  5:38–7:33 reforges drop for prefix rarity. 7:35–9:15 uses a flat-armour block
  and Allflame Foulborn exalts, settling on T4 life. The Helical Ring after 10:15
  is a failed fracture attempt, not a completed recipe.
- **Mercenary chest:** 0:51–9:58 isolates and transfers the Breach suffix, then
  fractures it. Sushi's pinned correction recommends Pantheon Aspect Ducats on
  both recombination inputs instead of the Intelligence approach shown; it
  explicitly excludes Bestiary aspects. 10:16–11:01 uses Hollow, Glyphic,
  Jagged and Fundamental fossils for the Abyss socket/Onslaught suffixes.
  11:01–13:56 finishes armour/evasion prefixes with Eldritch crafting and an
  8% defence tailoring enchantment.
- **Boots:** 0:33–2:45 transfers +2 socketed minion gems onto Leviathan Greaves
  with non-native donors. 2:45–3:52 unveils movement speed and adds Elder
  influence. 4:00–6:08 reforges minion for Spectre levels, obtains another Elder
  modifier, then uses Allflame Dominance. 6:11–8:24 uses locks to settle on T2
  resistance; previewing locks is outside the graph's automatic policy.
- **Luminary shield:** 8:30–11:31 prepares block and reduced-critical-damage
  receiver prefixes/suffixes and a spell-block/recovery donor.
  11:31–12:23 adds Pantheon aspects and converts the donor's Strength to
  Dexterity before recombination. The demonstrated shield accepts T2 block.
- **Gloves:** 0:54–4:13 and 6:43–8:46 depend on vestigial Hands of the High
  Templar behavior, repeated corruption, and crafting while corrupted.
  19:10–20:40 explicitly says Allflame cannot be used on that item. A normal
  uncorrupted glove graph would not reproduce this craft, so none is substituted.

Samples use the shared graph operations for the UI, HTTP and MCP. Prepared
inputs are explicit purchases with unknown prices, not free successful crafting
steps. Video-era prices are not current estimates. Optional perfect divines,
socket colours and lock previews are not assumed to succeed for free.

## Modeled checkpoints and differences

The five samples target the demonstrated affix combinations, using catalog item
levels and tiers. They are editable examples, not a price claim or a replay of
every action in the videos.

- **RF shield** buys the three finished Shaper suffixes, already converted to
  maximum fire resistance. It models the totem reforge, prefix cleanup, flat
  armour block, T1 spell-block Foulborn slam and crafted life.
- **RF helmet** buys the Horror/Burning Damage recombination result. It models
  sacrificial influence, elevation, protected prefix scouring/reforges, T1 prefix
  rarity, the blocked T4+ life slam and crafted rare/unique rarity. Cleanup uses
  Allflame annuls to select surviving required modifiers. Rarity misses preserve
  the elevated suffixes where possible. It stops before the optional final armour slam.
- **Mercenary chest** in r11 buys Conquest Lamellar with the exact fractured Breach
  modifier through an explicit preparation profile. Four purchase alternatives
  distinguish crafted modifiers and enchantments. Each acquisition pays for its
  source, removes crafted modifiers when present (one Scouring), removes
  enchantments when present (three Scourings), performs the first four-fossil
  Allflame roll, and pays for a Lesser Eldritch Ichor followed by a Greater
  Eldritch Ember. The input template records only the known fracture; discarded
  affixes are not represented by invented modifier IDs. The first Allflame choice
  uses the downstream suffix preference, and a successful first roll skips the
  common fossil step. Failed suffix rolls continue through that paid retry step.
  Replacing both implicit tiers makes
  the Exarch dominant even when the starting item had a stronger Eater implicit;
  the following Eldritch crafts therefore change prefixes and preserve the
  finished suffixes. Both currencies are charged once per purchased item, while
  prefix retries reuse that state. It then models the Eldritch prefix loop,
  accepting T2+ flat and percent armour/evasion before crafted life. Quality,
  defence tailoring and perfect divines are omitted from this affix example.
  Every fresh purchase repeats the applicable cleanup and first-roll costs.
  Missing source or preparation prices leave the total unknown. Source quotes
  price the unprepared item only; the graph charges preparation separately.
  Existing saved r10 graphs retain their exact purchase and separate implicit
  steps. The r11 profile accepts only source listings that pass the shared
  preparation policy; it is not permission to bind an arbitrary fractured item.
- **Spectre boots** buy the transferred Delve prefix, unveiled movement speed,
  ordinary Spectre levels and sacrificial Elder stun avoidance. Elevation,
  crafted life and the T2+ elemental-resistance Foulborn slam are simulated.
  The graph repurchases on destructive misses instead of assuming lock previews.
- **Luminary shield** uses an equivalent pure-Intelligence Harmonic donor with
  non-native flat ES, mana and converted Dexterity, alongside the Shaper
  Heat-attuned receiver. Both Pantheon aspects, recombination and fresh donor
  purchases after misses are charged. The target accepts the video's T2 attack
  and spell block, T1 critical reduction, +3 maximum fire resistance and recovery.

The new Delve and Pantheon mechanics require retained rules revision r10. Allflame
copies, sulphur and intangibility use that engine's existing rules. Source prices
remain unknown until entered or explicitly bound to compatible market evidence.
The fractured chest has a distinct cohort definition. Market text-model format 4
can classify separate fractured modifier text when the affix counts and complete
catalog interpretation establish its identity. Earlier model formats retain their
previous behavior. The solver does not infer identities from mixed fracture
representations. Unresolved ambiguity remains unpriced; a compatible published
observation is still required to bind a price.
