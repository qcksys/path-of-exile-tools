# Path of Exile tools

A Vite+ and pnpm monorepo containing:

| Package | Purpose |
| --- | --- |
| `apps/poe.boats` | React Router app on Cloudflare Workers, with Better Auth and MySQL |
| `packages/poe-api-client` | Typed Path of Exile API client |
| `packages/poe-stash-ingest` | DuckDB ingestor that pushes hourly summaries to poe.boats |
| `packages/poe-stash-tracker` | Local SQLite stash tracker |
| `packages/poe-game-data` | Extract and validate PoE 1/2 item bases, mods, weights, text, and images |

## Recombinator simulator

Open `/1/recombinator` from the Path of Exile 1 tools page. Search for a particular base, a generic armour attribute combination (STR, DEX, INT and their hybrids, per armour slot), or a weapon category such as Staff, Warstaff, One Hand Sword or Two Hand Sword. Generic choices use the tags shared by the generated bases in that category; only combinations present in the data are offered. Select up to three prefixes and three suffixes from the searchable list of natural, uninfluenced mods valid for that base and item level. Selecting a different base or level clears selected catalog mods. Custom modifiers remain available under the advanced accordion.

The catalog is exported from the committed `packages/poe-1-data` outputs, with hashes checked against the package manifest. App builds refresh it automatically. Run `pnpm --filter poe-boats game-data:recombinator` after regenerating that package to refresh `apps/poe.boats/public/game-data/recombinator-poe1.json` during development. No local extraction snapshot is required.

Connect items or earlier results in up to eight crafting steps. Load example creates a multi-step plan using actual catalog mods. Each step reports every modifier outcome, affix-count totals, and the probability of a selected target; failures from earlier steps remain in the calculation.

The interactive crafting tree maps all items and steps. Drag a source connector to a step's A or B connector to replace that input, select a step to inspect its outcomes, and pan or zoom to explore larger plans. Connections also stay synchronized with the input dropdowns.

Use identical labels for duplicate modifiers. To prevent different tiers of a modifier appearing together, enter a shared group, such as `T1 life | life` and `T2 life | life`. Toggle the star for exclusive modifiers or the disconnected-plug icon for NNN (non-native natural) modifiers; this updates every copy with the same label. Text entry also accepts `*` for exclusive and `!` for NNN. Manually marked NNN mods count toward the input pool but are excluded on both bases. Generated mods use the selected output base's eligibility. Every reference to a step represents a fresh independent run of that recipe, not reuse of a consumed item or retrying until success.

Each input can use a generated essence or exclusive bench recipe. Essence preparation normally isolates the forced mod. Enable **Keep input modifiers in prepared donor** to model rolling the essence until the selected natural mods also appear, then annulling unwanted mods. For example, select Flaring and zero to two suffixes on a Despot Axe, choose Screaming Essence of Torment, and enable this option to prepare Flaring plus the NNN spell-lightning prefix. Combined with a Merciless + Dictator's axe, triple-prefix odds are 30.6931%, versus 9.901% without NNN. These odds start after successful preparation; essence tier limits, rolling and annulling costs/chances are not calculated. Select an essence tier capable of rolling the desired mods.

The model follows [the linked 3.26 recombinator guide](https://codeberg.org/poe_notes/poe_notes/src/branch/main/Recombinators-dark-images.md) and its [empirical affix-count table](https://www.reddit.com/r/pathofexile/comments/1exyavx/325_updated_guide_to_recombinators/). The two columns that round to 101% are normalized. Ordinary modifier selection assumes equal weight per input copy. Exclusive-craft estimates use natural spawn weights, craft weight 1,000, and 50/50 affix order. Two one-mod magic items can each have an exclusive craft on the empty affix side, with at most one exclusive surviving. Crafting suffixes onto two single-prefix items keeps the two-prefix success chance at 33%; removing crafted mods after the step is optional. The isolated one-prefix plus one-suffix case has three equally likely non-empty outcomes. Fractures, influences, output item level, new modifiers and crafting costs are outside the model. Large plans stop with an explicit limit error instead of discarding outcomes.

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

The default `local` environment uses each package's dev record. The web app's hostname is `poe.boats.localhost` locally, `dev.poe.boats` in dev, and `poe.boats` in prod.

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

This serves at `https://poe.boats.localhost`. Register matching callback URLs with the OAuth providers.

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
