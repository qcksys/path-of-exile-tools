# Craft preset pricing after ingestion — 22 October 2026

Three agents rechecked all ten configured PoE 1 presets against
`https://dev.poe.boats`, using Allflame / PC, chaos prices, the deployed r8
ruleset, and the completed-hour cutoff `1792659600` (09:00 UTC). PoE 2 has no
configured craft presets; its Forbidden Rites exchange feed was checked
separately. The census contains 27 purchases and 77 craft nodes.

## Live coverage

All 27 equipment lookups returned HTTP 200 without truncation. Twenty-four
returned no captured matching cohort in the preceding 24 completed hours.
Three returned broad base-item prices that do not guarantee the configured
starting item. These are not safe estimates of the preset's purchase cost.

| Preset | Purchases | No matching captured cohort | Unsafe broad-base prices |
| --- | ---: | ---: | ---: |
| Life on block shield | 3 | 3 | 0 |
| Energy shield on block shield | 4 | 4 | 0 |
| Tailwind and Elusive boots | 2 | 2 | 0 |
| Physical bow | 3 | 3 | 0 |
| Elemental bow | 3 | 3 | 0 |
| Suppression chest | 2 | 1 | 1 |
| Global defence chest | 2 | 1 | 1 |
| Rarity helmet | 4 | 4 | 0 |
| Triple energy shield chest | 3 | 3 | 0 |
| Replica Alberon's strength-stacking Helical Ring | 1 | 0 | 1 |
| **Total** | **27** | **24** | **3** |

The two Necrotic Armour purchases received a 50-chaos broad-base median.
The Helical Ring received no default chaos price; opting into `exchange-v1`
converted a 57.5-divine median to 18,518.94 chaos. Both broad cohorts include
Normal, Magic and Rare items and item levels 85–100, whereas the presets
configure normal level-86 items. A base that needs scouring or cannot roll a
required modifier is not the configured prepared input. The Helical sample
also contains only two sellers; conversion does not increase confidence.

Fourteen of the 18 distinct exchange inputs have direct chaos prices.
Explicit `reference-currency-v1` conversion increases this to 17 of 18,
adding Awakener's Orb, Veiled Chaos Orb and Hunter's Exalted Orb. Screaming
Essence of Rage remains unknown: its latest observations have zero traded
volume. Older positive trading is historical evidence, not a current quote.

The imprint recipe costs 436 chaos only with the explicit Mountain Lynx
assumption for its additional rare beasts. Without that assumption, the
complete recipe remains unpriced. Recombination service costs require a
user-supplied assumption. No preset currently has a complete automatic
market valuation.

The broader catalog check returned 172/254 PoE 1 inputs and 376/530 PoE 2 inputs
with quotes, including valid recent observations. Comparing the official
completed-hour feeds with dev found no missing-but-traded audited input: all
142 PoE 1 and 328 PoE 2 audited IDs with positive volume in that hour had dev
quotes. The supported source lookup priced all 24 supported beast recipes and
Locus of Corruption; 13 level-sensitive beast recipes remain manual.

## Ingestion evidence

Both local workers were running and healthy with `restart: unless-stopped`.
Dev reported no failed stages and advancing cycles. Exchange coverage for
both games reached hour `1792656000` (08:00–09:00 UTC). Allflame equipment
coverage reached the same hour and increased from 586,259 to 604,720 rows,
an increase of 18,461 hourly cohort summaries. A public history read verified
actual listings in that hour. The stash worker is still catching up; this
does not establish a complete census of current listings.

The workers retain their separate DuckDB volumes. This audit used public API
reads and container health checks, without opening another database writer,
resetting cursors, or resolving credentials again.

## Cost completeness

Each preset completed three seeded simulation trials, with every discovered
input assigned a dummy unit price. All 30 trials succeeded, collectively
visiting every craft node, without undiscovered cost IDs or runtime errors.
This exercises bench removal, imprint recovery and retry paths. It checks
accounting completeness; the dummy prices are not market valuations.

## Fixes and capture limits

- Shared equipment coverage now requires the configured starting base, exact
  level, rarity, prefix/suffix counts, influences and supported flags. Lookup,
  binding and refresh use this check; a broad cohort cannot silently omit
  scouring or price a different modifier pool.
- Canonical exchange inputs retain access to captured history without a current
  quote, including after a failed lookup. Zero-volume rows show an unknown
  price, and viewing history does not change saved amounts.
- The two energy-shield chest purchases with added non-native essence modifiers
  now include that preparation in their purchase labels. The generated manifest
  changes only these two display names and its revision; all 50,449 cohort IDs
  and queries remain unchanged. Retained crafting history is unchanged.
- Two-Toned Boots variants share a display name but differ in native implicits
  and defences. The engine-aware shared guard refuses graph binding and refresh
  when base-name cohort evidence cannot establish the canonical variant. This
  affects both boot purchases even if a raw cohort fixture matches. Raw cohort
  browsing does not imply that applying the quote is safe.

The earlier 24/27 capture-fixture result uses optional modifier identity
metadata. Fixtures using only the documented raw description/flags shape
classify 16/27 at the configured rolls. The additional unresolved cases are
life-block recovery; ES-block flat, percent, flat/block and block donors;
the Redeemer boots donor; and two energy-shield chest NNN donors. Their displayed
values overlap multiple canonical identities. Some other rolls can disambiguate
these modifiers, so 16 is a fixture result rather than a permanent coverage
limit. The three elemental bow donors remain ambiguous in both fixture forms.
No uniquely identifiable classification failure was established, and no
identity was guessed to manufacture a price.

Live request and simulation evidence is retained in the local audit artifacts.

## Validation

- Workspace build and type checks pass; the final app build and TypeScript check
  also pass after the canonical-base guard.
- Biome reports no errors; existing warnings remain.
- All 42 market package tests pass. The Windows fork pool encountered missing
  temporary module files; the complete suite passed using the thread pool.
- All 32 Docker-backed ingestion integration tests pass, including exact-state
  delivery/binding and broad-pool refusal for binding, refresh and history.
- Four browser workflows pass: both games' exchange history and refresh,
  representative donor assumptions, and equipment binding/refresh/manual override.
- Focused exchange/source/workbench checks passed 40 tests across nine suites;
  shared market UI/parity checks passed 141 tests, with additional targeted
  transport and saved-price refusal cases after the final guard.

Deployment is gated by CI's build, types, unit, browser and MySQL suites. The
post-deployment verification repeats all 27 fixed-cutoff purchase lookups and
attempts to bind the three previously accepted broad-cohort quotes, which must
now be refused. Current worker progress and both exchange feeds are checked
separately from the fixed-cutoff pricing comparison.
