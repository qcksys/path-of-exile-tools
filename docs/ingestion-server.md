# Ingestion server and local stack

The app receives hourly summaries and worker heartbeats. Each ingestion worker owns one
DuckDB database for one realm/league scope. The app uses MySQL for permanent history.
The local setup below runs MySQL and ingestion in Docker and the actual built Cloudflare
app on the host. It does not write to the remote dev database.

## Local prerequisites

- Docker with Compose 2.24 or newer, Node 24.12 or newer, and the repository's Vite+ / pnpm setup.
- Install dependencies with `vp install` from the repository root.
- Complete the [1Password setup](../README.md#environment-configuration) for real public-stash access.
- Allow at least 2 GB for each worker, plus MySQL and Docker/WSL overhead. The worker
  is capped at 2 GB and one CPU; DuckDB defaults to a 1 GB buffer limit and two threads.
  Budget for all other containers before starting another worker.
- Keep space for the DuckDB file, its WAL and temporary spill files, plus backups.
  Data volume depends on the league and captured traffic; measure growth during the first day.

## Start the local database and app

From the repository root in PowerShell:

```powershell
docker compose -f compose.local.yaml up -d --wait mysql
$env:APP_ENV = 'test'
$env:VARLOCK_TELEMETRY_DISABLED = '1'
$env:WRANGLER_LOG_PATH = './.wrangler/logs'
$env:DATABASE_URL = 'mysql://poe_local:local-development-only@127.0.0.1:13306/poe_local'
vp run poe-boats#db:migrate
vp run poe-boats#build
vp run poe-boats#dev:local
```

Keep that terminal running. Open `http://127.0.0.1:4173/server-status`.
The app and database listen on loopback. `dev:local` uses inert OAuth credentials;
account sign-in is unavailable, while public UI, HTTP, MCP and ingestion run against
real local MySQL. `LOCAL_PORT`, `LOCAL_DATABASE_URL` and `LOCAL_INGEST_TOKEN` override
the local runner defaults. These local defaults must not be used for a public deployment.
Rebuild and restart the app after source edits.

## Start collection and a three-week exchange backfill

In a second PowerShell terminal at the repository root:

```powershell
$env:APP_ENV = 'local'
$env:VARLOCK_TELEMETRY_DISABLED = '1'
$env:COMPOSE_PROJECT_NAME = 'poe-local'
$env:POE_BOATS_INGEST_URL = 'http://host.docker.internal:4173/api/stash-ingest'
$env:POE_BOATS_INGEST_TOKEN = 'ci-only-ingest-token'
$env:INGEST_LEAGUE = 'Allflame'
$env:INGEST_WORKER_ID = 'local-allflame-pc'
$env:INGEST_PAGES = '5'
$env:INGEST_CURRENCY_HOURS = '72'
$env:INGEST_CURRENCY_FROM_HOUR = [string]([long]([math]::Floor([DateTimeOffset]::UtcNow.AddDays(-21).ToUnixTimeSeconds() / 3600) * 3600))
vp run '@poe-tools/stash-ingest#docker:up'
docker compose -p poe-local logs -f ingest
```

Use a league that existed throughout the requested interval. The initial exchange hour
is used only when no exchange cursor exists. Each cycle fetches at most the configured
number of hours, then delivers completed summaries; restarts resume committed progress.
An unavailable upstream snapshot is an error, never invented or silently skipped history.

Public-stash pagination is different: it has no historical-time lookup. A new database
starts from the oldest available cursor unless explicitly seeded. To start from current
listings, follow the [cursor procedure](../packages/poe-stash-ingest/README.md#docker-compose-local-pipeline)
after deliberately choosing to skip that backlog. Never advance a populated database's
cursor merely to make it appear caught up. Listing timestamps are capture times, not past
sale dates. Exchange backfill does not recreate weeks of equipment observations.

Workers also deliver cursor/capture-time checkpoints and one compressed response per UTC day.
The receiver migration adds `stash_checkpoint` and `stash_daily_sample`; apply it and update the
receiver before upgrading workers. The [capture and diagnostic commands](../packages/poe-stash-ingest/README.md#durable-forward-capture-and-diagnostic-checkpoints)
retain selected crafting observations and validate daily samples. Historical cursor restoration and its
upload endpoints have been removed. Existing observations, samples and summaries are preserved.

The worker archives crafting-relevant items from its configured league as compressed JSON in its
persistent DuckDB database: selected good bases, uniques, currency-tier materials/cards, and potential
donors with special modifiers or crafting flags. It retains unpriced candidates and all their fields,
plus empty/private changes for previously tracked stashes. Ordinary low-tier items and other leagues
are filtered out. This is a generated capture policy, not a complete-game archive; regenerate it with
market cohorts after game-data changes. Identical filtered responses share one compressed body;
each capture time is retained. Archive writes commit before price processing, and an archive write failure
prevents cursor advancement. Processing failures leave an unprocessed archived observation.
Successful backlogged cycles continue after 1.2 seconds instead of waiting a minute between batches.

Archive retention has no automatic age/size cap. The price-table prune command does not delete it.
Plan disk space for sustained source volume, monitor actual volume growth and free space, and back
up the persistent data directory off the ingestion server. This setup uses local disk; automatic
object-storage replication is not configured. Loss of the only copy loses those raw observations.
With the worker stopped, run `capture-status` using the existing one-off container command setup
to see archived page counts, unprocessed pages, capture times and compressed payload bytes.

For replay investigations, `probe-replay --day YYYY-MM-DD --league Allflame --pages 10` compares
full and selected-field hashes across following pages without writing market data. It separates
changed selected fields from records absent in the inspected range, and estimates hash-only sample
storage. These diagnostics cannot restore or publish historical prices.

## Verify progress

- `/server-status` shows workers, stage, per-cycle counters, next exchange snapshot,
  last successful cycle and stored coverage. It refreshes every 30 seconds.
- `GET /api/v1/server/status` and MCP `get_server_status` expose the same data.
  Optional `realm` and `league` filters select a scope.
- Three weeks means at least 504 distinct hourly snapshots in the intended interval.
  Check first/latest hours and distinct hour counts; a date span alone can conceal gaps.
- `docker compose -p poe-local ps` shows container health.
  `docker stats --no-stream` shows actual memory use against limits.
- A missing heartbeat is flagged after three minutes. A running stage without committed
  progress is flagged after ten minutes. Failed stages remain visible while retrying.
  Detailed errors stay in worker logs; the public page omits raw cursors and credentials.

## Stop, resume and upgrade

```powershell
docker compose -p poe-local stop ingest
docker compose -p poe-local start ingest
```

Stop the ingestion worker before stopping the app or database. It attempts to finish the active
cycle; Docker terminates it after the two-minute grace period if necessary. Committed cursors
survive an interrupted cycle, and unacknowledged summaries are retried after restart.
Never run two writers against one DuckDB volume. `docker compose down` retains named volumes;
`down --volumes` deletes them.

For an upgrade, record the current Git commit and image ID, stop the worker, back up its
entire `/data` directory, and back up MySQL. Review/apply app migrations, rebuild/start the
app, then rebuild/start ingestion with the same project name and credentials. Confirm
heartbeats, advancing cursors and newly delivered hours before declaring the upgrade complete.
For rollback, restore the prior app/worker image only if its schema is compatible; otherwise
restore matching database backups into separate volumes and verify them before switching.

## Backups and moving a worker

With the worker stopped, `docker cp <container>:/data <backup-directory>` copies DuckDB,
its WAL and status file. Do not copy an actively written database. Preserve the realm,
league, image/commit, target URL and secret references alongside the backup, without secrets.
Use `mysqldump --single-transaction` or your database service's snapshot facility for MySQL.
Test a restore into a separate volume/database; retaining an untested backup is insufficient.

Keep the source worker stopped while moving its database to another machine. Reuse the
saved cursor; do not start the replacement with a fresh cursor. The delivery ledger belongs
to its receiver: when copying capture to a different receiver, replay summaries from the
copy rather than resetting the original worker's delivery state.

## Unattended ingestion server

For a Linux server targeting the deployed app, install Docker Engine/Compose using Docker's
distribution instructions, clone a pinned repository revision, and supply the variables in
`packages/poe-stash-ingest/docker.env.schema` through a secret manager. Compose consumes
`POE_CLIENT_SECRET` and `POE_BOATS_INGEST_TOKEN` from the launching environment and mounts
them as files; the values are not baked into the image. The ingest token must match the
receiver's `STASH_INGEST_TOKEN`. Apply receiver migrations before starting the worker.

Interactive 1Password desktop authorization is unsuitable for unattended redeployments.
Use a least-privilege 1Password service account via `OP_SERVICE_ACCOUNT_TOKEN`, or inject
the resolved values from the host's secret manager. Keep bootstrap credentials out of Git,
shell history and command arguments. Confirm secret resolution works without a desktop login
before relying on restart automation.

Use a distinct `COMPOSE_PROJECT_NAME` and `INGEST_WORKER_ID` per worker and retain its volume.
Docker restarts crashed containers with `unless-stopped`; an unhealthy running container
does not automatically restart. Monitor heartbeat age, failed stages, disk growth, free space
and backup age. Set host alerts for these conditions. Check logs and source rate limits
before restarting a slow worker. The documented prune command only removes eligible working-table
rows after verifying summary delivery; filtered source archives and remote hourly history remain.
