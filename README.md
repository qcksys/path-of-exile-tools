# Path of Exile tools

A Vite+ and pnpm monorepo containing:

| Package | Purpose |
| --- | --- |
| `apps/poe.boats` | React Router app on Cloudflare Workers, with Better Auth and MySQL |
| `packages/poe-api-client` | Typed Path of Exile API client |
| `packages/poe-stash-ingest` | DuckDB ingestor that pushes hourly summaries to poe.boats |
| `packages/poe-stash-tracker` | Local SQLite stash tracker |

## Install and validate

Install [Vite+](https://viteplus.dev/guide/) and use the Node version in `.node-version` (Node 24).

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

## Environment configuration

[Varlock](https://varlock.dev/) loads each package's `.env.schema`, validates values, and resolves secrets from [1Password](https://varlock.dev/plugins/1password/). `APP_ENV` selects `local` (the default), `test`, `dev`, or `prod`.

| Environment | 1Password item | Worker | Host |
| --- | --- | --- | --- |
| local | dev item below | local development | `poe.boats.localhost` |
| dev | `poe.boats dev` / `xjy43xo3efabt3ajhhr4ppp4o4` | `poe-dot-boats-dev` | `dev.poe.boats` |
| prod | `poe.boats prod` / `kkfrsrvqnifcjeagnhuwkwpgoe` | `poe-dot-boats-prod` | `poe.boats` |

Both items are in vault `cgq6s2pwrz5g3jcj6zoreqvjni`, tagged `QckSys/poe`. Populate the appropriate item with:

- `DATABASE_URL`: MySQL connection URL for that environment.
- `BETTER_AUTH_SECRET`: existing auth secret, at least 32 characters.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- `POE_CLIENT_ID`, `POE_CLIENT_SECRET`, and `POE_USER_AGENT_CONTACT`.
- `POE_BOATS_INGEST_TOKEN`: the same token is resolved as the worker's `STASH_INGEST_TOKEN`.
- `CLOUDFLARE_API_TOKEN`: deployment token with access to the configured Workers and custom domains.

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
