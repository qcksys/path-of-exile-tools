# Automatic dev ingestion deployment

Successful pushes to `dev` publish `ghcr.io/qcksys/poe-stash-ingest:<commit>` and
promote the `dev` tag after all validation jobs and the Cloudflare receiver deployment
succeed. The image also runs the network-isolated ingestion fixture before publication.
A run whose commit is no longer the head of `dev` cannot move the deployment tag.
Pull requests and `main` never publish the dev image.

On the ingestion host, a user systemd timer checks the tag every two minutes. It resolves the tag to
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
public after its first publication, matching this public repository, so the host can pull it
without a GitHub credential. Alternatively, authenticate Docker on the host using a
dedicated `read:packages` credential. Never put registry or ingestion credentials in Git.

## Host installation

The deployed directory is `~/poe-ingest` in the deployment account's home. It contains these files:

```text
poe-ingest/
  compose.yaml
  update.py
  config/pc.env
  config/poe2.env
  secrets/pc_client_secret
  secrets/pc_ingest_token
  secrets/pc_b2_application_key
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

The PC worker also uploads its raw page archive (`/backups/raw`, see
[Raw page archive](../../packages/poe-stash-ingest/README.md#raw-page-archive)) to Backblaze B2.
Use a private bucket per environment; its application key needs `listBuckets` and
`writeFiles` on it. Keep the key ID and key as `B2_KEY_ID` and `B2_APPLICATION_KEY` in the
environment's ingestor 1Password item. Write the key to the secret file from a machine
signed in to 1Password:

```sh
op read "op://<vault>/<ingest item>/B2_APPLICATION_KEY" | ssh <host> 'umask 077; cat > ~/poe-ingest/secrets/pc_b2_application_key'
```

and add to `config/pc.env`, with the key ID from the same item:

```dotenv
B2_KEY_ID=<application key ID>
B2_APPLICATION_KEY_FILE=/run/secrets/b2_application_key
B2_BUCKET=<bucket>
B2_PREFIX=psapi/pc/
```

The secret file must exist before this Compose file is installed, even while upload is off.
Without `B2_KEY_ID` the worker still archives raw pages locally.

Both workers also archive every exchange digest they fetch in `/backups/raw/cxapi`, uploaded below
`$B2_PREFIX` as `cxapi/<YYYY>/<MM>/<DD>/<HH>.ndjson.zst`. The `poe2` worker reads the same key file;
give `config/poe2.env` the same `B2_*` lines with its own prefix, such as `B2_PREFIX=poe2/`.

The `pc-capture` service runs the [separate capture process](../../packages/poe-stash-ingest/README.md#separate-capture-process).
It holds the stream cursor and seals and uploads raw hours; the `pc` worker reads the archive with
`PS_SEPARATE_CAPTURE=true`. The updater replaces it with the other services and `--wait` checks its
health, but only `pc` and `poe2` are verified for successful cycles. To move a running host to this
Compose file, roll out an image that has the `capture` command first, then:

```sh
docker compose -f ~/poe-ingest/compose.yaml stop pc
# Install the new compose.yaml, keeping a copy of the old one.
docker compose -f ~/poe-ingest/compose.yaml up -d --wait
```

On first start, the worker records the end of the raw archive as its position and gives capture its
saved cursor, so no page is skipped or read twice. Keep the `pc` worker stopped until the new file is
in place. To go back, stop both services, restore the old file and start it: the old worker fetches
from its database cursor, which is behind by whatever it had not yet read from the archive, and any
pages it did not read stay only in the archive.

### Capture fallback

With `CAPTURE_LEASE_URL` in `config/pc.env`, `pc-capture` fetches only while it holds the capture
lease, and a Cloudflare Container captures the stream while this host is away. When the host
returns, `pc-capture` appends the Container's pages to its archive before it fetches again, so the
`pc` worker reads one stream. See [`apps/capture-lease`](../../apps/capture-lease/README.md) for how
the lease works and how to deploy its Worker.

The Compose file mounts `secrets/pc_capture_lease_token`, so that file must exist before this
Compose file is installed, even while the lease is off. Leave it empty until the Worker is deployed:

```sh
touch ~/poe-ingest/secrets/pc_capture_lease_token
chmod 600 ~/poe-ingest/secrets/pc_capture_lease_token
```

To turn the fallback on:

1. Deploy the Worker and check that `GET /status` answers.
2. Write its `CAPTURE_LEASE_TOKEN` to the secret file from a machine that has it, for example
   `printf %s "$TOKEN" | ssh <host> 'umask 077; cat > ~/poe-ingest/secrets/pc_capture_lease_token'`.
3. Add `CAPTURE_LEASE_URL=https://<custom domain>` to `config/pc.env`, using the Worker's custom
   domain rather than its `workers.dev` address, which changes if the account's subdomain does.
4. `docker compose -f ~/poe-ingest/compose.yaml up -d --no-deps pc-capture`.
5. Check the capture log for `capture lease: holding`, and `GET /status` for `"holder": "home"` and a
   cursor.

From then on, `pc-capture` stops fetching once it has not reached the Worker for a minute, and
`/server-status` shows a failed `stash` stage for it.

To turn the fallback off, delete the Worker first (`vp exec wrangler delete` in
`apps/capture-lease`) while this host holds the lease, so that nothing can start the Container.
`pc-capture` stops fetching a minute later. Then remove `CAPTURE_LEASE_URL` and recreate
`pc-capture`; it continues from its own cursor. Removing the URL first would leave the Worker
waiting for renewals, and it would start the Container beside this host.

While the host is away, the receiver gets no stash hours. When it returns, `pc-capture` imports the
Container's segments and the `pc` worker processes them at their capture times, as after any
backlog. Importing stops while four hours wait to be sealed, so the archive disk needs room for
about four hours of raw pages, and sealing speed sets how fast a long outage is imported.

Preserve the existing client ID, contact and version. The PC worker uses `POE_REALM=pc`
and the second `POE_REALM=poe2`; each sets its current `INGEST_LEAGUE` and a unique
`INGEST_WORKER_ID` such as `<host>-dev-pc-<league>`. Update these scopes deliberately when
leagues change; retain each league's own database.

Stop the original workers and copy each entire `/data` directory, including any WAL,
before starting the new host. Verify checksums. Never run both copies against the same receiver.
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

Linger keeps the timer active after logout and starts it at boot. Other Compose projects
on the host are not involved. Host Compose/updater changes need to be installed
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

### Image pruning

Each deploy leaves the previous image on disk. Docker's containerd image store keeps it under its
digest, so it is not dangling and `docker image prune` without `--all` keeps it. The images of
every Compose project on the host build up this way until the root filesystem fills.
`docker-image-prune.timer` runs `docker image prune --all --filter until=24h` every morning. It
removes every image on the host, from any project, that no container uses (running or stopped) and
that was built more than a day ago. A rollback to `previousImage` pulls it from the registry again,
and an image that `docker run` starts on a schedule, such as the backup's rclone image, is pulled
again on its next run. Install the two unit files with the updater's:

```sh
systemctl --user daemon-reload
systemctl --user enable --now docker-image-prune.timer
systemctl --user start docker-image-prune.service   # a first prune now
journalctl --user -u docker-image-prune.service -n 20 --no-pager
```

### Compacting a worker database

Deleted rows free space inside the database file, which later writes reuse, but the file does not
shrink (see [Archiving old data](../../packages/poe-stash-ingest/README.md#archiving-old-data)).
Copying it into a new file returns that space, and with an image on DuckDB 2.0 or later writes the
newer format, whose checkpoints also compact indexed tables. The copy needs free space on the data
volume for the live rows, and the worker is stopped while it runs. It rebuilds the keys' indexes in memory, so give it what the host can spare
with `--memory-limit` (default 4GB) and a container memory limit above that.

```sh
cd ~/poe-ingest
systemctl --user stop poe-ingest-update.timer
docker compose -f compose.yaml stop <realm>
export INGEST_IMAGE="$(python3 -c 'import json; print(json.load(open("deployment.json"))["image"])')"
mkdir data/<realm>-compact
docker run --rm --network none --user 1000:1000 --memory <container limit> \
  -v "$PWD/data/<realm>:/data:ro" -v "$PWD/data/<realm>-compact:/fresh" \
  "$INGEST_IMAGE" compact /data/market.duckdb /fresh/market.duckdb --memory-limit <size>
# Continue only if compact succeeded.
mv data/<realm> data/<realm>-before-compact
mv data/<realm>-compact data/<realm>
rm -rf data/<realm>/market.duckdb.tmp
# The container's health check reads the worker's last status.
cp -p data/<realm>-before-compact/status.json data/<realm>/
docker compose -f compose.yaml up -d --no-deps <realm>
systemctl --user start poe-ingest-update.timer
```

`compact` only reads the original. It fails if any table, index or key of the copy differs; then
delete `data/<realm>-compact` and restart the worker and timer on the original. An image
on DuckDB 1.x cannot open the new file, so to roll back past the upgrade, restore
`data/<realm>-before-compact` first. Delete that directory once the worker has run on the new file.

## Receiver database

The `mysql` service holds the dev receiver's MySQL database in `data/mysql`. The receiver Worker
reaches it through Hyperdrive, and Hyperdrive reaches it through the `mysql-tunnel` connector:

```text
Worker -> Hyperdrive -> Cloudflare Access -> tunnel hostname -> mysql-tunnel -> mysql:3306
```

- **Tunnel:** a remotely managed Cloudflare Tunnel whose one public hostname routes to
  `tcp://mysql:3306`. Its token is `secrets/mysql_tunnel_token`.
- **Access:** a self-hosted application on that hostname with one Service Auth policy, which
  includes two service tokens: one for Hyperdrive and one for CI. Nothing else can open it.
- **Hyperdrive:** a configuration with query caching off, because the receiver reads rows it has
  just written. Its ID goes in the Worker environment's `hyperdrive` binding; with a `HYPERDRIVE`
  binding the Worker ignores `DATABASE_URL`.
- **Migrations:** the deploy job opens the hostname with `cloudflared access tcp` when the GitHub
  environment sets the `DATABASE_ACCESS_HOSTNAME` variable and the `DATABASE_ACCESS_CLIENT_ID`
  and `DATABASE_ACCESS_CLIENT_SECRET` secrets. Its `DATABASE_URL` is then
  `mysql://poeboats:<password>@127.0.0.1:3306/poeboats`.

Both services run as UID 1000. Before installing this Compose file, create `data/mysql` owned by
that UID, and the three secret files with mode 600: `mysql_root_password`,
`mysql_poeboats_password` and `mysql_tunnel_token`. The image creates the `poeboats` user and
database on first start, from the password files.

The settings trade durability for write speed: no binary log, and commits reach the disk once a
second, so a host crash can lose the last second. Market rows can be delivered again from the
workers' archives; accounts and saved sets cannot, so back them up with `mysqldump` if the
environment holds any that matter.

### Backups

`backup_mysql.py`, run nightly by `poe-ingest-mysql-backup.timer`:

1. Dumps the `poeboats` schema with MySQL Shell (`util.dumpSchemas`, zstd chunks, one consistent
   snapshot while the workers keep writing) into `backups/mysql/<YYYYMMDDTHHMMSSZ>/`. A dump
   without MySQL Shell's `@.done.json` is deleted and the run fails.
2. Copies the dump with rclone to the PC worker's B2 bucket under `mysql/<name>`, with the worker's
   B2 key. That key needs `writeFiles`, `listFiles` and `deleteFiles` on the bucket, with no name
   prefix restriction.
3. Keeps the newest 7 dumps on the backup disk, and deletes B2 dumps older than 30 days.

There is no binary log, so a restore returns the database to the last dump. Create
`backups/mysql` owned by UID 1000 with mode 700 on the mounted archive disk, then install
`backup_mysql.py` and `test-mysql-restore.sh` beside `update.py`, and the two unit files with the
updater's:

```sh
systemctl --user daemon-reload
systemctl --user enable --now poe-ingest-mysql-backup.timer
systemctl --user start poe-ingest-mysql-backup.service   # a first backup now
journalctl --user -u poe-ingest-mysql-backup.service -n 20 --no-pager
```

To check that a dump restores, run `test-mysql-restore.sh <name>` from `~/poe-ingest`. It loads
the dump into a throwaway container beside the live one (with its data in
`data/mysql-restore-test`, deleted afterwards) and compares every table's row count with the
counts MySQL Shell recorded in the dump's `@.done.json`. A 0.7 GB dump of the dev data took about
five minutes.

To restore the live database, stop the workers and the updater timer, then:

```sh
cd ~/poe-ingest
docker exec poe-ingest-dev-mysql-1 sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" \
  mysql -uroot -h127.0.0.1 -e "drop database poeboats; set global local_infile = 1"'
docker run --rm -i --network poe-ingest-dev_default --user 1000:1000 --env HOME=/tmp \
  -v "$PWD/backups/mysql:/dump:ro" mysql:8.4 \
  mysqlsh --uri mysql://root@mysql:3306 --passwords-from-stdin --js \
  --execute 'util.loadDump("/dump/<name>", {threads: 4, progressFile: ""})' \
  < secrets/mysql_root_password
docker exec poe-ingest-dev-mysql-1 sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" \
  mysql -uroot -h127.0.0.1 -e "set global local_infile = 0"'
```

The dump recreates the schema; the `poeboats` user's grants survive the drop. `progressFile: ""`
stops MySQL Shell writing its progress file into the read-only dump folder. A dump held only in
B2 comes back first with `rclone copy b2:<bucket>/mysql/<name>` into `backups/mysql/<name>`.

To copy a database in, stop the workers and the updater timer first, so nothing writes to the old
database during the copy. Create the schema with the app's migrations, then load the data alone
(`mysqldump --no-create-info`) from the old database. Compare row counts before switching the
Worker over.

## Data and archive volumes

Each worker keeps its live database in `~/poe-ingest/data/<realm>` and writes daily Parquet
archives of old rows to `/backups`, mounted from `~/poe-ingest/backups/<realm>` (see
[Archiving old data](../../packages/poe-stash-ingest/README.md#archiving-old-data)). Give each
folder its own filesystem so neither can fill the root filesystem:

| Folder | Device | Why |
| --- | --- | --- |
| `data` | An SSD volume | DuckDB makes many random reads and writes |
| `backups` | A hard disk is enough | archives are written once, in order, and rarely read |

Mount the archive disk with `nofail`, so a failed disk does not stop the host booting:

```sh
UUID=<archive disk UUID> /home/<user>/poe-ingest/backups ext4 defaults,noatime,nofail,x-systemd.device-timeout=15s 0 2
```

Create `backups/pc` and `backups/poe2` owned by UID 1000 on the mounted disk before installing
this Compose file; otherwise Docker creates them owned by root and the worker reports a failed
delivery stage on each archive attempt. `PS_ARCHIVE_MAX_GB` must stay below the space the live
database can use on its own filesystem.

Run the updater tests on Linux with:

```sh
python3 -m unittest discover -s deploy/ingest -p 'test_*.py' -v
```
