import { loadEnvFile } from "node:process";
import {
    createClient,
    createOAuthClient,
    type PoeApiClient,
    type Realm,
} from "@poe-tools/api-client";

try {
    loadEnvFile(".env");
} catch {
    // .env is optional — env vars may already be set in the shell
}

function requireEnv(key: string): string {
    const v = process.env[key];
    if (!v) {
        throw new Error(`Missing required env var: ${key}. Copy .env.example to .env.`);
    }
    return v;
}

const CLIENT_ID = requireEnv("POE_CLIENT_ID");
const CLIENT_SECRET = requireEnv("POE_CLIENT_SECRET");
const CONTACT = requireEnv("POE_USER_AGENT_CONTACT");
const VERSION = process.env.POE_CLIENT_VERSION ?? "0.0.0";

export const LEAGUE = requireEnv("POE_LEAGUE");
// GGG docs: realm accepts `xbox`, `sony`, or `poe2`. PoE1 PC is the implicit
// default and MUST be omitted from the path — sending `/pc` returns 404.
const rawRealm = (process.env.POE_REALM ?? "pc").toLowerCase();
export const REALM: Realm | undefined = rawRealm === "pc" ? undefined : (rawRealm as Realm);

const userAgentParts = { clientId: CLIENT_ID, version: VERSION, contact: CONTACT };

const oauth = createOAuthClient({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    userAgent: userAgentParts,
});

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
        return tokenCache.token;
    }
    const res = await oauth.getClientCredentialsToken({
        scope: ["service:psapi", "service:cxapi", "service:leagues"],
    });
    // expires_in can be null for client-credentials — fall back to 55 min so we still rotate.
    const ttlSeconds = res.expires_in ?? 55 * 60;
    tokenCache = {
        token: res.access_token,
        expiresAt: Date.now() + ttlSeconds * 1000,
    };
    return tokenCache.token;
}

export function createPoeClient(): PoeApiClient {
    return createClient({
        userAgent: userAgentParts,
        token: getAccessToken,
        realm: REALM,
        onRateLimit: (info) => {
            for (const r of info.rules) {
                if (r.currentHits >= r.maxHits * 0.8) {
                    console.warn(
                        `rate-limit ${r.rule}: ${r.currentHits}/${r.maxHits} in ${r.periodSeconds}s`,
                    );
                }
            }
        },
    });
}
