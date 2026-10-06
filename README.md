# Path of Exile tools

A Vite+ and pnpm monorepo containing:

| Package | Purpose |
| --- | --- |
| `apps/poe.boats` | React Router app on Cloudflare Workers, with Better Auth and MySQL |
| `packages/poe-api-client` | Typed Path of Exile API client |
| `packages/poe-stash-ingest` | DuckDB ingestor that pushes hourly summaries to poe.boats |
| `packages/poe-stash-tracker` | Local SQLite stash tracker |
| `packages/poe-game-data` | Extract and validate PoE 1/2 item bases, mods, weights, text, and images |

## Crafting workbench

Open `/1/crafting` or `/2/crafting` to calculate crafting odds, simulate conditional processes, or emulate crafting with undo/redo and spending. Select a base and item level, choose target modifiers (including tier-or-better alternatives), then choose a crafting method. Projects can be saved locally or imported/exported as JSON. The PoE 1 calculator also compares fossil combinations by attempts and custom currency costs.

The current item and crafting setup are saved automatically in this browser, separately for each game and client build. Reloading restores the draft with fresh history, spending and results. Disable `Automatically save this draft` under `Save, load, and export` to remove the automatic draft and stop saving it. Named projects are kept independently.

Expand `Actions history` beside Undo and Redo to browse recent item changes. The newest entries appear first, with the current state and undone actions marked. The list keeps the latest 100 changes and their starting state for this session. `Clear history and spending` retains the current item as a new starting state.

`Last changes` compares the current history state with the preceding item. It shows added and removed explicit modifiers, implicits and enchantments, plus before/after values for changed rolls or modifier status. Displayed effects include the current item's catalyst and modifier scaling. Undo and Redo move this comparison with the item; loading a project or clearing history starts a new baseline.

PoE 1 Cluster Jewels have a size-specific passive-type selector backed by the extracted client tables. The selected type determines the notable pool and its weights. Set the starting passive count or leave it unknown; crafting retains that setup. English item copies and project/library JSON preserve the passive type, count and any recorded Jewel sockets. The socket layout supplies capacity, not a probability distribution for generating socket counts. Expand a notable's passive effects in the modifier list or item card to read its build-extracted benefits when allocated.

Both games support combined positive and negative modifier-tag filters. Every included tag must match and every excluded tag must be absent. Remove filters individually or clear them together. Filtered weight shares appear alongside the full-pool shares; filtering the list does not change the crafting method or its eligible pool.

Use `Item inventory` to organize snapshots into named tabs. Create or rename tabs under `Manage inventory tabs`, and move snapshots with their tab picker. Removing a tab moves its items to Unfiled. Tabs are included in automatic drafts and saved/exported projects; crafting donor and socketed-Jewel pickers still show compatible items from every tab.

Choose `Shared library` under `Inventory storage` to keep items across projects and base changes. Libraries are stored separately for each game and client build in this browser. Both inventories feed the donor and Jewel pickers; choosing an item copies its snapshot into the project. Export the library separately to back it up or transfer it. Import validates every item against the current extracted build and previews replacement before changing the stored library. Read/write errors preserve existing records, and concurrent changes from another browser tab require review before retrying a write.

Item import accepts English game copies and Path of Building text for both games, including numeric ranges with an explicit `{range:...}` fraction from zero to one and Prefix/Suffix crafting blueprints. Blueprint IDs and roll positions are resolved from the build, and any rendered summary must agree, including merged hybrid stats. Preview the selected rolls before importing. Modifier identities, eligibility and roll bounds are validated against the extracted build; imported items support calculations, crafting, history and saves.

Enable `Combine crafting steps` to calculate or apply a complete process. Add condition-only checks or use an editable currency-sequence preset to skip unnecessary crafts. Item conditions support rarity, affix-count ranges, open slots and stat-value totals. Stat totals can count explicit modifiers, implicits or both, including catalyst and modifier effects; they use extracted stat units. All process steps count toward the configured limit.

`Create process from calculator` copies the selected method and all requirements into one step, finishing on a match and restarting with the current item on a miss. The existing step limit bounds retries, and each restart includes the entered starting-item cost. If a process already exists, the control is explicitly labeled `Replace process from calculator`. Conversion retains item history, prices and run settings without starting a job.

`Final item property conditions` adds defence, physical/elemental/chaos/total DPS, attack-speed, critical-chance, shield-block, resistance-total and flat-life requirements in both games. The item preview shows these values after modifiers, quality, enchantments and socketed augments. Elemental Resistance sums fire, cold and lightning; Total Resistance also includes chaos. Flat Life and resistance totals include PoE 1 Harvest quality-enchantment bonuses. Flat Life excludes attributes and passive skills. Enter missing raw PoE 1 defence rolls before using final-defence conditions. DPS represents the weapon alone, excluding skills and character bonuses.

`Show process flow` opens an editable diagram with conditional routes, loops and a selectable entry step. Use `Add conditional route` to give a step several independently edited conditions. Routes run from top to bottom after the craft; the first match chooses the destination, and `No route matched` sets the fallback. Reorder routes to change priority, or remove every route to use only the fallback. Step names, descriptions, route order and positions are saved with the project. Exact calculations, sampled simulations and emulated runs show each step's visits, route counts, errors and currency spending per attempt. Presentation edits retain results; changing the process invalidates them.

Process pricing can include a custom starting-item cost in chaos. Each trial counts its initial item and each restart that restores it; ordinary loops keep using the current item. Exact and sampled totals include these costs. The emulator retains base quantities through undo/redo and reuses the current item across successive runs. Leaving the price blank excludes base costs.

`Stop simulation after` can use a trial count, successful-item target or simulation-action limit in both games. Every process step counts toward the action limit, including condition checks. Targeted runs also keep a maximum trial count and per-trial step bound. If an action limit interrupts a process, its item and spending remain inspectable separately and are not counted as a failed trial. Limits persist in projects and automatic drafts. `Calculate odds` retains its ordinary exact calculation or fixed-trial sampling; outcome-based stopping reports descriptive results without the fixed-trial confidence interval.

`Until stopped` runs continuously without a trial target. Stop simulation retains the last reported batch; changing the setup or leaving the workbench cancels the worker. Per-trial step bounds and outcome-storage limits still apply. The setting persists, but reloading does not restart the run. Calculator trials remain finite and independent of this simulation setting.

`Store outcomes` retains successful items or all completed outcomes up to a chosen limit (1–1,000), or disables storage. Existing projects keep the ten-outcome preview. Stored items can be paged through and loaded into the emulator. Optional successful-item distribution tables count every success independently of storage, grouping modifier tiers with average tier, count and presence. Modifier identities and tier ranks come from the extracted build.

Each retained outcome shows its trial cost and consumed currency quantities. Successful-trial cost summaries report the cheapest and costliest observed craft across all successes, including unstored items. Restarts within a trial include replacement bases; ordinary loops reuse the current base. Missing currency prices keep the affected total and full successful range unknown. Separate failures and unfinished trials do not enter that range, while their spending remains in the existing reports.

Both games include ordinary Strongbox crafting. Select a named, level-specific variant and use its extracted modifier pool in calculations, processes or manual crafts. PoE 2 supports tiered currencies and compatible affix omens, including Sanctification. Encounter properties are displayed separately from affixes. Vaal Orbs mark the box corrupted under the reference model; dropped contents, special encounters and Atlas changes are not simulated.

Catalogs are generated from the verified client-build packages. Crafting data extraction, modeled rules, supported methods and remaining parity work are documented in [the crafting implementation checklist](docs/crafting-implementation.md). PoE 2 odds use client weights and are not empirical server probabilities.

PoE 1 supports Allflame crafting for compatible currencies, essences and stackable resonators. Enable `Use Allflame crafting` to preview ghostly copies and keep one, or calculate and simulate target-driven selection. Sulphur costs, class factors, outcome counts and intangibility ranges come from the extracted build. Pending choices survive JSON save/load; selecting a copy records one set of ingredients and the sulphur cost. Intangibility and prior-imprint invalidation follow the labeled Craft of Exile model. Tzamoto's Ducat resets intangibility or destroys the item; Kishara's Ducat keeps one explicit modifier per copy. Both automatically use Allflame and work in all three modes. Other special Ducat operations remain under development.

Both games support required and excluded modifier groups, combined with all/any/minimum group matching. Calculations, process conditions and the PoE 1 fossil optimizer share these requirements; saved projects retain exclusion settings.

Use `Add combined condition` to nest AND/OR/NOT requirements, including modifiers, item properties and numeric rolls. Select a branch in the modifier browser's `Requirement destination` picker. Process conditions can copy the complete target and then be edited independently; calculations, simulations and saves retain the same logic.

Both games expose build-extracted raw base defences and inclusive defence requirements. PoE 1 Sacred Orbs reroll those values using a labeled independent uniform model, with exact odds, retry processes, spending and history. Raw rolls persist in saves, imprints and workbench item text; the preview also calculates final defences after quality and modifiers.

PoE 2 Essence of the Abyss supports the Mark → desecrate → reveal sequence, including fractured Marks, Echoes rerolls and saved reveal choices. Replacing a fractured Mark removes its fracture and preserves other affixes. The Mark's outcome weights and class rules come from the build; its higher-tier floor and replacement behavior are separately labeled reference-model rules.

PoE 2 reveals use Craft of Exile's modeled 80%/15%/5% split for one, two or three Abyss-exclusive choices, followed by ordinary choices. Modifier eligibility and weights come from the build. The same rule supports Lich guarantees, Breach bones, Putrefaction and Echoes in calculations, processes and the emulator; the source-count probabilities are labeled as modeled assumptions.

Ordinary PoE 2 desecration uses the reference's removal-before-side-selection order. Hidden outcomes remain valid when no reveal choices exist; the workbench explains the empty pool, and failed reveal steps retain earlier spending. Unavailable Lich tags fall back to the remaining pools. Save pending reveals as JSON to retain their state.

Putrefaction also retains corruption, hidden slots and spending when reveals are unavailable. An exhausted slot does not prevent selecting and revealing another eligible slot. Unresolved slots remain in JSON saves, history and process outcomes.

PoE 1 beast recipes can add a modifier to rare maps or equipment with the recipe's influence. These recipes use the ordinary weighted pool at the item's level, preserve Memory Strands, and charge the entered price for one complete recipe.

The Black Mórrigan maximum-socket recipe uses extracted base capacities in calculations, processes and the emulator. It retains the item's modifiers, quality, Memory Strands and imprint checkpoint. The workbench labels the modeled item-level behavior and prices the complete beast recipe.

Both games support fresh normal, magic and rare item generation in calculations, conditional processes and the emulator. Generation keeps the base and level, resets crafting state and uses extracted native properties and modifier pools. Replacement-item prices are separate from starting-item prices. Rare Grasping Mail generation remains unavailable until its special Breach weights can be sourced.

PoE 1 supports the five extracted socket-link bench recipes and maximum-link beastcraft, with linked-socket requirements, corrupted bench costs, starting-link editing and item-text/JSON persistence. Bench recipes retain their guaranteed first group while unresolved remaining connections stay unknown. Calculations report probabilities only when those guarantees settle the requirement; random linking and socket-colour distributions remain unimplemented.

The random metamod beastcraft supports exact odds and crafting processes. Filling the suffix slots forces Suffixes Cannot Be Changed, allowing a following Scouring or Harvest craft to preserve them. Metamod records and class restrictions come from the build; selection among eligible outcomes uses a labeled equal-chance model.

PoE 2's Cadigan's Epiphany converts augment sockets on eligible gloves into one permanent Jewel socket, using its build-extracted effect and restrictions. Inventory Jewels can be inserted and removed without currency costs. Conversion and socket contents support targets, processes, history and saves. Jewel effects remain separate from equipment affixes; character and passive-tree radius effects are not calculated.

PoE 2 special bases start with their extracted sockets. Corona Amulet, Grasping Ring and Stalking Belt use helmet, glove and boot augment effects respectively, subject to each augment's jewellery restrictions. Grasping Ring supports Serle's Triumph and a seventh affix in calculations, processes and the emulator. Native three-socket bases are also supported.

PoE 1 Blighted and Blight-ravaged Maps support oil anointments in all three crafting modes. Set the existing map type, select up to three or nine oils, and use oil effects in stat requirements. Repeated oils, replacement recipes, Tainted/Reflective Oil costs, item text, history and saves use the same engine. Map properties, limits and all 13 oil recipes come from the extracted build.

PoE 1's crafting workbench can recombine an inventory donor with the current item in calculations, processes and the emulator. It preserves the selected base's properties and exact modifier rolls, handles transferred tiers above the resulting item level, and records service and donor costs. This uses the existing researched unpredictable-recombination model with build-extracted modifiers, weights and eligible classes. Natural and ordinary influenced modifiers, fractures and supported unveiled bench crafts are available. Influence and Memory Strands stay with the surviving base; fractures can only remain on their own input and may still be lost. Elevated modifiers and other unresolved inputs are rejected.

## Recombinator simulator

Open `/1/recombinator` from the Path of Exile 1 tools page. Search for a particular base, a generic armour attribute combination (STR, DEX, INT and their hybrids, per armour slot), or a weapon category such as Staff, Warstaff, One Hand Sword or Two Hand Sword. Generic choices use the tags shared by the generated bases in that category; only combinations present in the data are offered. Select up to three prefixes and three suffixes from the searchable list of natural, uninfluenced mods valid for that base and item level. Selecting a different base or level clears selected catalog mods. Custom modifiers remain available under the advanced accordion.

The catalog is exported from the committed `packages/poe-1-data` outputs, with hashes checked against the package manifest. Eligible equipment classes come from the build's `RecombinableClasses` table in `crafting-data.json`; the exporter checks that supplement's build and source identities too. App builds refresh it automatically. Run `pnpm --filter poe-boats game-data:recombinator` after regenerating that package to refresh `apps/poe.boats/public/game-data/recombinator-poe1.json` during development. No local extraction snapshot is required.

Connect items or earlier results in up to eight crafting steps. Load example creates a multi-step plan using actual catalog mods. Each step reports every modifier outcome, affix-count totals, and the probability of a selected target; failures from earlier steps remain in the calculation.

The interactive crafting tree maps all items and steps. Drag a source connector to a step's A or B connector to replace that input, select a step to inspect its outcomes, and pan or zoom to explore larger plans. Connections also stay synchronized with the input dropdowns.

Use identical labels for duplicate modifiers. To prevent different tiers of a modifier appearing together, enter a shared group, such as `T1 life | life` and `T2 life | life`. Toggle the star for exclusive modifiers or the disconnected-plug icon for NNN (non-native natural) modifiers; this updates every copy with the same label. Text entry also accepts `*` for exclusive and `!` for NNN. NNN markers are annotations only: odds assume the modifier is eligible on both bases. Every reference to a step represents a fresh independent run of that recipe, not reuse of a consumed item or retrying until success.

The model follows [the linked 3.26 recombinator guide](https://codeberg.org/poe_notes/poe_notes/src/branch/main/Recombinators-dark-images.md) and its [empirical affix-count table](https://www.reddit.com/r/pathofexile/comments/1exyavx/325_updated_guide_to_recombinators/). The two columns that round to 101% are normalized. Individual modifier selection assumes equal weight per input copy because actual selection weights are not established. The isolated one-prefix plus one-suffix case has three equally likely non-empty outcomes. Multiple exclusive modifiers in a pair, fractured/base-restricted modifiers, item-level/base inheritance, and crafting costs are outside the model. Large plans stop with an explicit limit error instead of discarding outcomes.

## Install and validate

Install [Vite+](https://viteplus.dev/guide/) and use the Node version in `.node-version` (Node 24). The game-data pipeline uses TypeScript, Zod, and locally loaded WASM codecs through the same workspace toolchain.

```sh
vp install --frozen-lockfile
```

Validation uses inert credentials from committed `.env.test` files and does not require 1Password or a database connection:

```powershell
$env:APP_ENV = "test"
vp run -r env:check
vp run ready
Remove-Item Env:APP_ENV
```

In a POSIX shell, prefix each command with `APP_ENV=test`. The ready task runs Biome, builds, type checks, and tests. Environment tests cover required credentials, dev/prod selection, and exclusion of 1Password credentials from the runtime configuration. The API client currently has no test cases.

## Local game data

The [game-data pipeline guide](packages/poe-game-data/README.md) covers GGPK, local bundles, and patch-CDN extraction for both games, repeatable snapshots, and comparison with PoEDB and Craft of Exile. The [research report](docs/research/poe-game-data-extraction.md) explains the formats and website provenance.

## Environment configuration

[Varlock](https://varlock.dev/) loads each package's `.env.schema`, validates values, and resolves secrets from [1Password](https://varlock.dev/plugins/1password/). `APP_ENV` selects `local` (the default), `test`, `dev`, or `prod`.

Each package has separate dev and prod records in vault `cgq6s2pwrz5g3jcj6zoreqvjni`, tagged `QckSys/poe`:

| Package | Dev record | Prod record |
| --- | --- | --- |
| App | `poe.boats app dev` / `xjy43xo3efabt3ajhhr4ppp4o4` | `poe.boats app prod` / `kkfrsrvqnifcjeagnhuwkwpgoe` |
| Ingestor | `poe.boats ingest dev` / `w7ykovvpq4qlhmnqleicnjtmxa` | `poe.boats ingest prod` / `zgoprixk57vs3ymsfveckbseui` |
| Tracker | `poe.boats tracker dev` / `nwju225vledjtkrfpv4m5dmra4` | `poe.boats tracker prod` / `mu2p7icozscnnpkzfqea7o7bza` |

The default `local` environment uses each package's dev record. The web app's hostname is `poe-boats.localhost` locally, `dev.poe.boats` in dev, and `poe.boats` in prod.

Populate the fields defined by each package's schema:

- App: `DATABASE_URL`, `BETTER_AUTH_SECRET` (at least 32 characters), Google and PoE client credentials, `STASH_INGEST_TOKEN`, and `LOG_LEVEL`.
- Ingestor and tracker: PoE client credentials, `POE_USER_AGENT_CONTACT`, `POE_CLIENT_VERSION`, and `POE_REALM`.
- Ingestor: `POE_BOATS_INGEST_URL` and `POE_BOATS_INGEST_TOKEN`. Its token must match the app record's `STASH_INGEST_TOKEN` for the target environment.
- Tracker: `POE_LEAGUE` and `POE_INGEST_ALL`.

Preserve existing auth and ingest secrets when migrating. Confirm which database each existing credential targets before copying it to an environment. Once values are safely stored and validated, remove the app's old `.dev.vars`; the Varlock Cloudflare integration replaces that mechanism. Existing ingestor `.env` files override schema values, so remove migrated credentials from those files as well.

For local development, install the 1Password CLI, sign in, and enable its desktop app integration. Local commands allow desktop authentication for every selected environment. The default `local` environment uses the dev item. Put local non-secret overrides in an ignored `.env.local` in the relevant package. Never commit plaintext secrets.

```sh
vp run -r env:check
vp run dev
```

For OAuth using the configured HTTPS hostname, run from `apps/poe.boats`:

```sh
vp exec portless trust
vp run dev:portless
```

Both `vp run dev` and `vp run dev:portless` use Portless and serve at `https://poe-boats.localhost`, including in Git worktrees. Register matching callback URLs with the OAuth providers.

## CI and deployments

[The GitHub workflow](.github/workflows/ci.yml) runs lint, builds, type checks, and application tests for pull requests and pushes to `dev` and `main`. Environment validation (`env:check`) and the environment configuration tests run locally through the commands above and are excluded from CI. Successful branch builds deploy as follows:

| Branch | GitHub environment | Cloudflare target |
| --- | --- | --- |
| `dev` | `dev` | `dev.poe.boats` |
| `main` | `prod` | `poe.boats` |

Each GitHub environment restricts deployment to its matching branch. Both deployments use the same repository secret, `CLOUDFLARE_API_TOKEN`. Set or update it locally with the GitHub CLI:

```sh
gh secret set CLOUDFLARE_API_TOKEN --repo qcksys/path-of-exile-tools
```

The command prompts for the token. Keep its source value in 1Password; no environment-specific GitHub copies are needed.

The workflow uses the official Vite+ setup action, a frozen pnpm lockfile, and commit-pinned actions. Builds use inert `.env.test` credentials with the selected environment's public hostname. GitHub does not access 1Password, validate deployment credentials, or synchronize app secrets.

Code deployments use [`wrangler deploy --keep-vars`](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy) to preserve the worker's existing variables and secrets. The committed Wrangler configuration still defines the environment's public hostname and name.

## Manage secrets locally

Use the 1Password desktop app and CLI on your machine. Authenticate Wrangler locally with `vp exec --filter poe-boats wrangler login`, or set `CLOUDFLARE_API_TOKEN` in your shell.

After populating the environment's 1Password item, run the corresponding local deployment:

```sh
vp run poe-boats#deploy:dev:cf
vp run poe-boats#deploy:prod:cf
```

These local commands use Varlock to validate and resolve the selected environment, then deploy the app and synchronize its variables and secrets. Run this once for each environment before its first CI deployment, and again when app secrets change. This also installs the Varlock runtime metadata required by the built worker. Keep that metadata with the other worker secrets; CI preserves it.

Add new runtime keys to `.env.schema` before syncing locally. Application credentials and the 1Password token are not stored in GitHub.

Database migrations are separate from deployment. Review the migration SQL and target database, select `APP_ENV=dev` or `APP_ENV=prod`, then run `vp run poe-boats#db:migrate` from a machine authenticated to 1Password. CI does not automatically apply database migrations.
