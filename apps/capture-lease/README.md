# @poe-tools/capture-lease

A Cloudflare Worker that decides who captures the PoE 1 public stash stream: the home ingestion host
by default, or a Cloudflare Container while home is silent. Only the holder of the lease fetches, so
the stream is read once and its pages stay in capture order. The Container's pages are kept in R2
until home has appended them to its raw archive.

The stream cannot be read again (see
[Separate capture process](../../packages/poe-stash-ingest/README.md#separate-capture-process)), so
an outage of the only capture process loses every change made while it is down. With this Worker,
an outage of home costs about its first two minutes: the lease lapses, then the Container starts.

## How it works

The lease decisions are pure functions in
[`@poe-tools/market/capture-lease`](../../packages/poe-market/src/capture-lease.ts); the Durable
Object in [`src/index.ts`](src/index.ts) stores the state and acts on it.

1. Home's `capture` process renews the lease every 10 s and reports the cursor after its last synced
   page. It fetches only while its last successful renewal is under 60 s old.
2. The Durable Object checks every 30 s. Once home has been silent for 75 s (the lease and a 15 s
   margin for clocks that differ), it starts the Container from the ingest image with
   `CAPTURE_LEASE_ROLE=fallback`.
3. The Container takes the lease in a new epoch, continuing from home's last cursor. It writes pages
   to segments of at most 256 MB or 5 minutes, compresses each with zstd level 3 and uploads it
   here. Only then does it report the cursor after the segment's last page. If it dies, a new
   process starts in a new epoch from the last uploaded cursor; uploads from older epochs are
   refused.
4. When home returns, it downloads the segments in order and appends their pages to its spool,
   pausing while 4 hours wait to be sealed so that a long outage cannot fill its disk. Home keeps
   its latest spooled hour unsealed while it does not hold the lease, because the Container's pages
   may still belong to it.
5. Once home has imported every uploaded segment, the Container is told to release. It stops
   fetching, uploads its last pages and reports its final cursor. Home then imports the last segment
   and holds the lease again, continuing from that cursor, and deletes the segments it imported.

A new holder may fetch again a few pages its predecessor fetched but had not reported. The worker
already handles a page read twice. No page is skipped.

If home can reach GGG but not this Worker, it stops fetching once its lease lapses: two holders never
fetch at once, which would double the requests on one GGG client. `/server-status` then shows a
failed `stash` stage for the capture worker.

## Endpoints

Every request needs `Authorization: Bearer <CAPTURE_LEASE_TOKEN>`.

| Method and path | Use |
| --- | --- |
| `POST /lease` | Renew or take the lease (`captureLeaseRequestSchema`) |
| `GET /status` | The lease state and whether the Container runs |
| `PUT /segments/<epoch>/<sequence>` | The Container uploads a segment |
| `GET /segments?after=<key>` | Home lists segments, oldest first |
| `GET` / `DELETE /segments/<epoch>/<sequence>` | Home downloads, then deletes, an imported segment |

## Deploy

Containers need the Workers Paid plan. The image is built from
[`packages/poe-stash-ingest/Dockerfile`](../../packages/poe-stash-ingest/Dockerfile) when you deploy,
so Docker must be running, even for `--dry-run`. The Container uses the `durable_object` scheduling
policy: the Durable Object starts the image named `capture` at 1 vCPU, 3 GiB and 4 GB of disk. A
deploy does not restart a running Container; the next start uses the new image.

Create the R2 bucket that `bucket_name` in [`wrangler.jsonc`](wrangler.jsonc) names, keeping it
private:

```sh
cd apps/capture-lease
vp exec wrangler r2 bucket create <bucket>
```

Then set the secrets, using the home host's PC ingestion worker's values for the PoE and ingest
ones:

```sh
for name in CAPTURE_LEASE_TOKEN POE_CLIENT_ID POE_CLIENT_SECRET POE_USER_AGENT_CONTACT POE_CLIENT_VERSION POE_BOATS_INGEST_TOKEN; do
  vp exec wrangler secret put "$name"
done
vp run deploy:dev
```

`CAPTURE_LEASE_TOKEN` is a new random value, for example `openssl rand -hex 32`. The Worker is
served only on the custom domain in `routes`: a `workers.dev` address follows the account's
`workers.dev` subdomain, and renaming that subdomain once cut home off from the Worker, so neither
home nor the Container could hold the lease. Check the Worker before pointing home at it:

```sh
curl -H "Authorization: Bearer <token>" https://<custom domain>/status
```

A new Worker answers with `"holder": null`. Then set up the home host as
[the deployment runbook](../../deploy/ingest/README.md#capture-fallback) describes, with the custom
domain as `CAPTURE_LEASE_URL`. The Worker learns the address home uses and gives it to the
Container.

`vars` in `wrangler.jsonc` set the receiver URL and the worker ID that the Container reports its
status under (`<INGEST_WORKER_ID>-capture`).

## Costs

While home holds the lease, the Container does not run; home's renewals are about 260,000 Worker
requests a month. While the Container runs, it uses 1 vCPU, 3 GiB of memory and 4 GB of disk, and
its uploads count as Container egress.

## Checks

```sh
vp run @poe-tools/capture-lease#typecheck
vp run --filter @poe-tools/market test
```

The lease decisions are tested in `packages/poe-market/test/capture-lease.test.ts`, and the capture
modes against a stand-in for this Worker in `apps/poe.boats/test/capture-fallback.test.ts`.
