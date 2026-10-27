import { expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import { authServer } from "~/lib/auth.server";

vi.mock("varlock/env", () => ({ ENV: { ENVIRONMENT: "local" } }));

it("gives Better Auth a Drizzle table for every model its plugins write", async () => {
    const env = {
        URL: "poe-boats.localhost",
        BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
    } as CloudflareBindings;
    const auth = authServer({ env, db: createDbConnection("mysql://inert:inert@localhost/inert") });

    // Every auth API call awaits the schema check first; a request without a session cookie never reaches the database.
    await expect(auth.api.getSession({ headers: new Headers() })).resolves.toBeNull();
});
