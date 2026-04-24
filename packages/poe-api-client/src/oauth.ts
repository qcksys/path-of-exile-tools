import ky, { type KyInstance } from "ky";
import { buildUserAgent, type UserAgentParts } from "./user_agent.ts";

/**
 * OAuth 2.1 helpers for the Path of Exile Developer API.
 *
 * The GGG authorization server lives on `www.pathofexile.com` (not the API
 * host), and uses three endpoints:
 *
 *   - `GET  /oauth/authorize`         — user-facing consent screen
 *   - `POST /oauth/token`             — token issuance / refresh
 *   - `POST /oauth/token/revoke`      — revoke a token (`oauth:revoke`)
 *   - `POST /oauth/token/introspect`  — inspect a token (`oauth:introspect`)
 *
 * Authorization Code + PKCE is required for public clients;
 * Client Credentials is used for server-to-server access to `service:*`
 * scopes.
 *
 * @see https://www.pathofexile.com/developer/docs/authorization
 */

export const OAUTH_AUTHORIZE_URL = "https://www.pathofexile.com/oauth/authorize";
export const OAUTH_TOKEN_URL = "https://www.pathofexile.com/oauth/token";
export const OAUTH_REVOKE_URL = "https://www.pathofexile.com/oauth/token/revoke";
export const OAUTH_INTROSPECT_URL = "https://www.pathofexile.com/oauth/token/introspect";

/* -------------------------------------------------------------------------- */
/*  Response shapes                                                           */
/* -------------------------------------------------------------------------- */

export interface TokenResponse {
    access_token: string;
    /** Seconds until access_token expires. `null` for client-credentials tokens. */
    expires_in: number | null;
    token_type: "bearer";
    scope: string;
    username?: string;
    /** GGG account UUID (omitted for client-credentials tokens). */
    sub?: string;
    /** Present for authorization_code and refresh_token grants. */
    refresh_token?: string;
}

export interface IntrospectResponse {
    active: boolean;
    scope?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    exp?: number;
    iat?: number;
    sub?: string;
}

/* -------------------------------------------------------------------------- */
/*  PKCE                                                                      */
/* -------------------------------------------------------------------------- */

export interface PkcePair {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlEncode(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i] ?? 0;
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        const triplet = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
        out += BASE64URL_ALPHABET[(triplet >> 18) & 0x3f];
        out += BASE64URL_ALPHABET[(triplet >> 12) & 0x3f];
        if (b1 !== undefined) out += BASE64URL_ALPHABET[(triplet >> 6) & 0x3f];
        if (b2 !== undefined) out += BASE64URL_ALPHABET[triplet & 0x3f];
    }
    return out;
}

function randomBytes(length: number): Uint8Array {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
}

/**
 * Generate a PKCE `code_verifier` / `code_challenge` pair using SHA-256.
 *
 * The verifier is 32 bytes of CSPRNG output (well above RFC 7636's
 * minimum), base64url-encoded. Keep the verifier; send the challenge on
 * the `/authorize` redirect.
 */
export async function createPkcePair(): Promise<PkcePair> {
    const verifierBytes = randomBytes(32);
    const codeVerifier = base64UrlEncode(verifierBytes);
    const verifierAscii = new TextEncoder().encode(codeVerifier);
    const hashBuf = await crypto.subtle.digest("SHA-256", verifierAscii);
    const codeChallenge = base64UrlEncode(new Uint8Array(hashBuf));
    return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

/** Generate an opaque, random `state` parameter for CSRF protection. */
export function createState(byteLength = 16): string {
    return base64UrlEncode(randomBytes(byteLength));
}

/* -------------------------------------------------------------------------- */
/*  Authorize URL                                                             */
/* -------------------------------------------------------------------------- */

export interface AuthorizeUrlParams {
    clientId: string;
    redirectUri: string;
    /** Space- or array-delimited list of requested scopes. */
    scope: string | string[];
    state: string;
    codeChallenge: string;
    codeChallengeMethod?: "S256";
    /** Optional UI hints passed through to the server. */
    prompt?: "login" | "consent" | "none";
}

/**
 * Construct the URL to which a user-agent should be redirected to begin
 * the Authorization Code flow.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
    const url = new URL(OAUTH_AUTHORIZE_URL);
    const scope = Array.isArray(params.scope) ? params.scope.join(" ") : params.scope;
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", params.state);
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", params.codeChallengeMethod ?? "S256");
    if (params.prompt) url.searchParams.set("prompt", params.prompt);
    return url.toString();
}

/* -------------------------------------------------------------------------- */
/*  OAuth client                                                              */
/* -------------------------------------------------------------------------- */

export interface OAuthClientOptions {
    /** OAuth `client_id` issued by GGG. Required for every grant. */
    clientId: string;
    /** OAuth `client_secret`. Required for confidential clients. Omit for public (PKCE-only) clients. */
    clientSecret?: string;
    /** User-Agent parts to advertise on every token request. Required by GGG. */
    userAgent: UserAgentParts | string;
    /** Optional custom `ky` instance (e.g. pre-configured with a retry policy). */
    ky?: KyInstance;
}

function userAgentString(ua: UserAgentParts | string): string {
    return typeof ua === "string" ? ua : buildUserAgent(ua);
}

function tokenBody(
    params: Record<string, string | undefined>,
    opts: OAuthClientOptions,
): URLSearchParams {
    const body = new URLSearchParams();
    body.set("client_id", opts.clientId);
    if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) body.set(k, v);
    }
    return body;
}

export interface AuthorizationCodeExchangeParams {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    /** Must match the scope requested at `/authorize` (space-separated). */
    scope?: string | string[];
}

export interface RefreshTokenParams {
    refreshToken: string;
}

export interface ClientCredentialsParams {
    /** Space- or array-delimited list of `service:*` scopes. */
    scope: string | string[];
}

export interface OAuthClient {
    /** Exchange an authorization code (with PKCE) for an access/refresh token pair. */
    exchangeAuthorizationCode(params: AuthorizationCodeExchangeParams): Promise<TokenResponse>;
    /** Trade a refresh token for a new access token (and usually a new refresh token). */
    refreshAccessToken(params: RefreshTokenParams): Promise<TokenResponse>;
    /** Acquire a service-scoped token using `client_credentials`. Requires a client secret. */
    getClientCredentialsToken(params: ClientCredentialsParams): Promise<TokenResponse>;
    /** Revoke an access or refresh token. Requires the `oauth:revoke` scope. */
    revokeToken(token: string): Promise<void>;
    /** Introspect a token. Requires the `oauth:introspect` scope. */
    introspectToken(token: string): Promise<IntrospectResponse>;
}

/** Create an {@link OAuthClient} bound to a specific application identity. */
export function createOAuthClient(options: OAuthClientOptions): OAuthClient {
    const http =
        options.ky ??
        ky.create({
            headers: {
                "User-Agent": userAgentString(options.userAgent),
                Accept: "application/json",
            },
        });

    const postForm = async <TValue>(url: string, body: URLSearchParams): Promise<TValue> =>
        http
            .post(url, {
                body,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            })
            .json<TValue>();

    return {
        async exchangeAuthorizationCode(params) {
            const scope = Array.isArray(params.scope) ? params.scope.join(" ") : params.scope;
            const body = tokenBody(
                {
                    grant_type: "authorization_code",
                    code: params.code,
                    redirect_uri: params.redirectUri,
                    code_verifier: params.codeVerifier,
                    scope,
                },
                options,
            );
            return postForm<TokenResponse>(OAUTH_TOKEN_URL, body);
        },

        async refreshAccessToken(params) {
            const body = tokenBody(
                {
                    grant_type: "refresh_token",
                    refresh_token: params.refreshToken,
                },
                options,
            );
            return postForm<TokenResponse>(OAUTH_TOKEN_URL, body);
        },

        async getClientCredentialsToken(params) {
            if (!options.clientSecret) {
                throw new Error(
                    "client_credentials grant requires clientSecret on the OAuth client.",
                );
            }
            const scope = Array.isArray(params.scope) ? params.scope.join(" ") : params.scope;
            const body = tokenBody(
                {
                    grant_type: "client_credentials",
                    scope,
                },
                options,
            );
            return postForm<TokenResponse>(OAUTH_TOKEN_URL, body);
        },

        async revokeToken(token) {
            const body = tokenBody({ token }, options);
            await http.post(OAUTH_REVOKE_URL, {
                body,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
        },

        async introspectToken(token) {
            const body = tokenBody({ token }, options);
            return postForm<IntrospectResponse>(OAUTH_INTROSPECT_URL, body);
        },
    };
}
