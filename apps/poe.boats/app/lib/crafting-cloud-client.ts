export async function craftingCloudRequest(path: string, input?: unknown, signal?: AbortSignal) {
    const response = await fetch(`/api/v1/crafting${path}`, {
        method: input === undefined ? "GET" : "POST",
        ...(input === undefined
            ? {}
            : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
        cache: "no-store",
        signal,
    });
    if (!response.ok) {
        if (response.status === 401)
            throw new Error("Sign in again to sync. Local drafts are preserved.");
        if (response.status === 409)
            throw new Error("Cloud drafts changed elsewhere. Refresh to review both versions.");
        if (response.status === 413)
            throw new Error(
                "These drafts exceed the cloud size limit. Export a backup before reducing the workspace.",
            );
        if (response.status === 404) throw new Error("The saved project or share is unavailable.");
        throw new Error(
            "Cloud storage is unavailable. Local drafts are preserved; retry when connected.",
        );
    }
    return response.json() as Promise<unknown>;
}
