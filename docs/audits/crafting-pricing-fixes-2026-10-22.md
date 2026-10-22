# Crafting pricing fixes — 22 October 2026

This follows the [initial pricing audit](crafting-pricing-2026-10-22.md). Three
agents implemented and cross-checked the changes below. This report records
implementation and local verification before deployment. Live deployment and
exchange refresh verification are separate.

| Audit gap | Implemented behavior |
| --- | --- |
| Stale and missing exchange data | The user confirmed there is no configured persistent worker. The existing app cron now collects six completed hours for PC PoE 1 and PoE 2 every 15 minutes, independently of scarab collection. Partial failures are retried idempotently. Equipment and exchange lookups require an observation within the latest 24 completed hours at the cutoff. |
| Exchange conversion misses available data | Two-leg conversions find a common hour and compatible window. Newer zero-volume or conflicting observations remain unknown. Equipment conversion restricts both direct and bridge lookup to the exact listing hour. |
| Hidden bench-removal cost | Shared cost discovery includes compatible removal recipes and costs observed during execution. The reproduced bench77→bench78 case exposes Scouring, can be priced in the editor, and calculates a complete total. |
| Preset purchase coverage | 26 generated exact definitions cover all 27 purchases across ten presets. Capture retains their bases and supports influenced raw listings. Fixtures populate 24 purchases; three ambiguous elemental bow donors remain unknown. |
| Standalone workbench lookup | Existing exchange and beast/temple sources now fill selected chaos-price fields explicitly. Bulk fill preserves manual amounts; copied estimates stay fixed until replaced. League controls stay synchronized and cancel pending quotes after scope changes. Starting-item cost remains separate. |
| Equipment listing currencies | Opt-in `exchange-v1` converts an hourly chaos/divine/exalted listing median using a matching-hour exchange quote. Saved references retain both sources. Native listing currency is preferred; combined confidence stays unknown; history shows raw listing medians. |
| Shared generated/service assumptions | New engine `crafting-graph-8`, published locally as r8 for both games, supports per-step overrides with shared-price fallback. Retries and acquisition comparisons use the same accounting. Old projects keep their original rules until explicitly upgraded. |
| Legacy resonators | New picker/optimizer selections use stackable identities. Loaded non-stackable identities remain visible and retain their exact IDs. Alchemical variants are labelled Ruthless / legacy; no display-name price substitution occurs. |

The committed cohort total is 50,449, up from 50,423. Exact preset definitions
preserve base, item level, rarity, influences, modifier identities and affix
counts. A definition is not evidence that a matching item is currently listed.
The elemental bow ambiguity cannot safely be resolved from the tested raw name,
tier or roll metadata; pricing it requires a manual assumption or better source
identity information.

## Verification

- Workspace builds and TypeScript checks pass.
- Biome reports no errors; existing warnings remain.
- Seven browser workflows pass, including equipment conversion consent and
  provenance, raw-currency history, both-game exchange refresh, beast sources,
  donor assumptions, manual overrides and explicit r8 adoption. The conversion
  screenshot was visually inspected.
- Focused regressions cover SQL freshness/cutoffs, partial scheduled writes,
  input visibility, all preset purchases, raw-listing ambiguity and per-step
  acquisition/retry accounting. Actual retained r7/r8 modules are exercised
  for both games, with original behavior preserved.
- The workspace run passed all package suites (308 tests, three skipped) and
  2,898 application tests. Five application failures in three suites exposed
  legacy resonator fixtures and the workbench league-control bug. After the
  corrections, all three suites passed together (20 tests); related fossil and
  HTTP/MCP suites also passed (158 tests across seven suites). The entire
  workspace suite was not repeated after those final corrections.
- Docker is not running, so Docker-backed MySQL integration tests have not run.
  Query regressions execute generated SQL through an in-memory adapter; they do
  not replace the MySQL integration suite.

## Activation and remaining data requirements

Deploy the app with its existing migrations and cron configuration to start
exchange collection. The collector requires Workers Paid and recovers a bounded
six-hour interval; longer historical gaps need explicit backfill. It uses the
existing database binding and adds no credential requirement.

Configure a persistent public-stash worker with the new cohort manifest to
collect equipment prices. No host was configured during this task. New cohorts
remain unpriced until matching observations are captured and delivered.

Untraded exchange items, the three ambiguous elemental donors, PoE 2 equipment,
level-sensitive beasts, unsupported prepared states, arbitrary output sale
values and service/gold/dust/time assumptions remain explicitly manual. Missing
prices are never treated as free.

See [price-source rules](../../apps/poe.boats/docs/crafting-price-sources.md) and
the [ingestion runbook](../ingestion-server.md) for source scope and operation.
