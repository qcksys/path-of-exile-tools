import type { IngestPayload } from "#src/shared/remote/types.ts";

const DEFAULT_BATCH_SIZE = 500;

export function requireRemoteEnv(): { url: string; token: string } {
    const url = process.env.POE_BOATS_INGEST_URL;
    const token = process.env.POE_BOATS_INGEST_TOKEN;
    if (!url) throw new Error("POE_BOATS_INGEST_URL is not set.");
    if (!token) throw new Error("POE_BOATS_INGEST_TOKEN is not set.");
    return { url, token };
}

export async function push(payload: IngestPayload, opts?: { dryRun?: boolean }): Promise<void> {
    if (opts?.dryRun) {
        console.log(`[dry-run] would push ${payload.rows.length} ${payload.stream} rows to remote`);
        return;
    }
    const { url, token } = requireRemoteEnv();

    const batches: IngestPayload[] = [];
    for (let i = 0; i < payload.rows.length; i += DEFAULT_BATCH_SIZE) {
        const slice = payload.rows.slice(i, i + DEFAULT_BATCH_SIZE);
        // The discriminated-union spread lands here; TS needs the assertion to
        // see that {stream, rows: <Slice>} satisfies IngestPayload again.
        batches.push({ ...payload, rows: slice } as IngestPayload);
    }

    for (const [i, batch] of batches.entries()) {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(batch),
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(
                `push ${batch.stream} batch ${i + 1}/${batches.length} failed: ` +
                    `${res.status} ${res.statusText} ${body.slice(0, 200)}`,
            );
        }
        const receipt = (await res.json()) as { written?: number };
        if (receipt.written !== batch.rows.length)
            throw new Error(`push ${batch.stream}: receiver did not acknowledge the full batch`);
        console.log(
            `pushed ${batch.stream} batch ${i + 1}/${batches.length} (${batch.rows.length} rows)`,
        );
    }
}
