# Automatic dev ingestion deployment

Successful pushes to `dev` publish `ghcr.io/qcksys/poe-stash-ingest:<commit>` and
promote the `dev` tag after all validation jobs and the Cloudflare receiver deployment
succeed. The image also runs the network-isolated ingestion fixture before publication.
A run whose commit is no longer the head of `dev` cannot move the deployment tag.
Pull requests and `main` never publish the dev image.

On `hub`, a user systemd timer checks the tag every two minutes. It resolves the tag to
an immutable digest, validates Compose, gracefully replaces the two workers, and checks
container health plus successful cycles acknowledged by the dev receiver. Only then is
`deployment.json` updated with the current and previous digests. The updater takes an
exclusive lock and retains the existing data and secret files. A pull failure leaves
the running stack alone; a failed rollout exits unsuccessfully and preserves the last
successful deployment record. It does not automatically roll back potentially migrated
DuckDB data. The timer retries failures, and the journal records the error.

Rollout verification requests `/api/v1/server/status?view=workers` to check worker
health and progress without waiting for coverage aggregates. All image, successful
cycle, freshness and deadline checks still apply.

The image is built only from the Dockerfile's source allowlist. Set the GHCR package to
public after its first publication, matching this public repository, so hub can pull it
without a GitHub credential. Alternatively, authenticate Docker on the host using a
dedicated `read:packages` credential. Never put registry or ingestion credentials in Git.

## Host installation

The deployed directory is `/home/prae/poe-ingest`. It contains these files:

```text
poe-ingest/
  compose.yaml
  update.py
  config/pc.env
  config/poe2.env
  secrets/pc_client_secret
  secrets/pc_ingest_token
  secrets/poe2_client_secret
  secrets/poe2_ingest_token
  data/pc/market.duckdb
  data/poe2/market.duckdb
  enabled
  deployment.json
```

Use a Docker-capable Linux account with Python 3.11 or newer and Docker Compose 2.24
or newer. The worker runs as UID 1000; its two data directories and secret files must
be readable by that UID. Use mode 700 for configuration/secret directories and 600 for
their files. Resolve the credentials through the host's secret manager before starting.

Each env file uses the variables in
[`docker.env.schema`](../../packages/poe-stash-ingest/docker.env.schema), except the
two credential values are replaced by these file references:

```dotenv
POE_CLIENT_SECRET_FILE=/run/secrets/poe_client_secret
POE_BOATS_INGEST_TOKEN_FILE=/run/secrets/poe_boats_ingest_token
POE_BOATS_INGEST_URL=https://dev.poe.boats/api/stash-ingest
PS_LOCAL_DB=/data/market.duckdb
PS_MEMORY_LIMIT=1GB
PS_THREADS=2
INGEST_STATUS_FILE=/data/status.json
INGEST_PAGES=5
INGEST_CURRENCY=true
INGEST_CURRENCY_HOURS=1
```

Preserve the existing client ID, contact and version. The PC worker uses `POE_REALM=pc`,
`INGEST_LEAGUE=Allflame`, and `INGEST_WORKER_ID=hub-dev-pc-allflame`. The second uses
`POE_REALM=poe2`, `INGEST_LEAGUE=Forbidden Rites`, and
`INGEST_WORKER_ID=hub-dev-poe2-forbidden-rites`. Update these scopes deliberately when
leagues change; retain each league's own database.

Stop the original workers and copy each entire `/data` directory, including any WAL,
before starting hub. Verify checksums. Never run both copies against the same receiver.
The updater refuses to bootstrap missing/empty databases or run before the `enabled`
file exists. For a new scope, initialize its database and choose its initial cursor
explicitly using the [ingestion runbook](../../docs/ingestion-server.md).

Copy this directory's Compose and Python files into `~/poe-ingest`, and install the
two unit files in `~/.config/systemd/user/`. Then run as the deployment account:

```sh
loginctl enable-linger "$USER"
systemctl --user daemon-reload
touch ~/poe-ingest/enabled
systemctl --user enable --now poe-ingest-update.timer
systemctl --user start poe-ingest-update.service
journalctl --user -u poe-ingest-update.service -n 50 --no-pager
```

Linger keeps the timer active after logout and starts it at boot. The existing unrelated
hub Compose project is not involved. Host Compose/updater changes need to be installed
from a reviewed revision; automatic updates replace the ingestion image.
Deploy receiver support for `view=workers` before installing this updater on the host.

## Operation

Check `systemctl --user list-timers poe-ingest-update.timer`, the service journal, and
[`dev` server status](https://dev.poe.boats/server-status). A successful rollout must
produce new healthy worker cycles on the receiver; a running container alone is insufficient.

To pause deployment, stop the timer and any active updater service. This leaves the
ingestion containers running. To roll back, first check database compatibility, then
set `INGEST_IMAGE` to `previousImage` from `deployment.json` and run
`docker compose -f ~/poe-ingest/compose.yaml up -d --wait`. Keep the timer stopped until
the release is repaired. Restore incompatible database backups into separate directories
before switching. Do not use `down --volumes` or clear cursors.

Image and data retention are separate: this updater deletes neither archives nor Docker
images. Monitor free space and arrange off-host data backups as described in the runbook.

## Data and archive volumes

Each worker keeps its live database in `~/poe-ingest/data/<realm>` and writes daily Parquet
archives of old rows to `/backups`, mounted from `~/poe-ingest/backups/<realm>` (see
[Archiving old data](../../packages/poe-stash-ingest/README.md#archiving-old-data)). Give each
folder its own filesystem so neither can fill the root filesystem. On hub:

| Folder | Device | Why |
| --- | --- | --- |
| `data` | `ubuntu-vg/poe-data`, 300 GB on the NVMe SSD | DuckDB makes many random reads and writes |
| `backups` | `/dev/sda1`, the 1 TB hard disk | archives are written once, in order, and rarely read |

The archive disk is mounted with `nofail`, so a failed disk does not stop the host booting:

```sh
UUID=<sda1 UUID> /home/prae/poe-ingest/backups ext4 defaults,noatime,nofail,x-systemd.device-timeout=15s 0 2
```

Create `backups/pc` and `backups/poe2` owned by UID 1000 on the mounted disk before installing
this Compose file; otherwise Docker creates them owned by root and the worker reports a failed
delivery stage on each archive attempt. `PS_ARCHIVE_MAX_GB` (hub's PC worker: 250) must stay
below the space the live database can use on its own filesystem.

Run the updater tests on Linux with:

```sh
python3 -m unittest discover -s deploy/ingest -p 'test_*.py' -v
```
