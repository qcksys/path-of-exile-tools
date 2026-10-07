# Retained crafting rules

`index.json` lists immutable revisions and the latest revision for each game/era. Each revision pins
the exact client build, extracted source hashes, complete catalog hash, engine identifier, engine
bundle hash, and reviewed method availability. Projects store the revision reference. Market quotes
remain independent of the rules revision.

`catalogs/*.json.gz` contains complete catalog snapshots, deduplicated by the hash of the uncompressed
JSON. `engines/*.mjs` contains self-contained browser-safe implementation bundles, including their
schema validation and graph calculation. These artifacts are retained in Git. Old bundles do not
import mutable current engine code. Their `.d.mts` files describe the stable execution interface.
The initial r1 and r2 bundles use the same extracted catalogs; r2 is the finalized publication build.
Revision r3 adds natural essence NNN transfers and essence-exclusive modifier handling to the PoE 1
crafting adapter. It uses the same empirical count/selection model as the existing recombinator and
does not change the PoE 2 crafting rules. Both older implementations remain executable; adopting r3
is explicit for existing drafts.

Revision r4 adds prepared Incursion glove suffixes to item validation and the existing exclusive
recombination model. It does not add them to natural currency rolls. The workbench exposes the three
elemental suffixes as prepared modifiers. Their canonical identities and values come from the
retained game catalog; eligibility and transfer behavior follow the user's example and the craft
author's [3.29 Incursion glove transfer example](https://note.com/txfshow/n/ncaec3c437629?hl=en).
That example supports the workflow, not a new probability measurement. The 59% one-affix regression
comes from the existing empirical model. Retained r3 still refuses these prepared donors. PoE 2 r4
publishes the shared implementation without changing its game mechanics.

Revision r5 adds an optional `applyWhen` query to graph crafting steps in both games. The query
checks the first input before spending currency or acquiring a second input. A non-match routes
that same item unchanged; an unknown match stops the estimate. Existing result routes, output
requirements, recovery limits and item accounting still apply. Results count skipped visits and
identify skipped trace entries. This supports preparing only missing affixes without reapplying a
craft to an already-ready item. Game crafting probabilities are unchanged. Revisions r1–r4 remain
executable and refuse this new field; existing projects adopt r5 only by explicit selection.

The application build runs `vp run game-data:history` to verify and materialize every retained artifact
under `public/game-data/history`, and generate the server's static runtime imports. This step never
rebuilds an old implementation. The generated public files can be recreated from the retained archive.
Hashed artifacts receive immutable cache headers; the small index is revalidated to discover corrections.
The build also creates `/game-data/history/worker.mjs`, the current worker bootstrap that loads a
project's retained implementation. This bootstrap and the index use revalidation rather than immutable
caching; the executable rules remain pinned to the hashed engine module.

To publish a new era or correction, from this app directory:

1. Extract/materialize the reviewed game package using the game-data pipeline and run
   `vp run game-data:crafting`.
2. Update `releases.json`: choose the game, era, new revision, client-build prefix, notes and available
   mechanics. Availability is reviewed explicitly; an old record remaining in game files does not
   establish that a mechanic is still usable. PoE 2's initial label deliberately identifies client
   4.5 rather than guessing a public league/version name.
3. If executable behavior or the implementation bundle changes, assign a new `CRAFTING_GRAPH_ENGINE`
   identifier in `app/lib/crafting-graph-validation.ts`. Retain all existing bundles. Data-only
   corrections can reuse an unchanged implementation.
4. Run `vp run game-data:publish-history`. It builds a standalone engine, validates the catalog,
   writes new immutable artifacts, advances the selected eras' latest pointers, and regenerates
   materialized assets and static imports. Re-publishing identical inputs is idempotent. Reusing a
   revision for different data/configuration or an engine name for different bytes is refused.
5. Review and commit the archive/index changes with the source changes. Run the ruleset, graph,
   transport-parity tests, typecheck and app build. Keep regression fixtures for historical behavior.

Run one publisher at a time. The index is replaced atomically after artifacts have been written.
Materialization verifies hashes and refuses altered files. A missing/corrupt artifact or unsupported
engine produces an explicit failure; it never falls back to the current catalog or implementation.

The worker fetches only the selected catalog and engine after resolving the project against the
published index. It verifies artifact sizes/hashes and imports only the resulting same-origin hashed
module. HTTP/MCP use the same retained module through generated static imports. Project JSON cannot
provide an executable module URL. Correction discovery leaves drafts unchanged; adoption is explicit
and validates the project's inputs and methods with the selected implementation before returning it.

This archive preserves normalized catalogs and executable rules. Regenerating source extraction still
requires retaining the game-data pipeline's raw snapshots and provenance separately. No production
stash-event archive is introduced here.
