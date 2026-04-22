# @poe-tools/api-client

Typed TypeScript client for the [Path of Exile Developer API](https://www.pathofexile.com/developer/docs/reference), built on [`ky`](https://github.com/sindresorhus/ky).

Covers:

- **OAuth 2.1** — authorization-code (with PKCE), client-credentials, refresh, revoke, introspect.
- **All REST endpoints** documented in the reference (profile, leagues, ladders, PvP, characters, stashes, guild stashes, league accounts, item filters, public stash stream, currency exchange).
- **Rate-limit parsing** — every `X-Rate-Limit-*` header is parsed and exposed via `onRateLimit` and on thrown errors.
- **Runtime** — Node / Bun / Cloudflare Workers (any environment with `fetch` + `WebCrypto`).

## Install

The package is already wired into the workspace. From another workspace package, depend on it by name:

```jsonc
// apps/your-app/package.json
"dependencies": {
    "@poe-tools/api-client": "workspace:*"
}
```

## Auth: authorization-code + PKCE

```ts
import {
  buildAuthorizeUrl,
  createOAuthClient,
  createPkcePair,
  createState,
} from "@poe-tools/api-client";

const oauth = createOAuthClient({
  clientId: "my-app",
  clientSecret: process.env.POE_CLIENT_SECRET, // omit for public clients
  userAgent: {
    clientId: "my-app",
    version: "1.0.0",
    contact: "me@example.com",
  },
});

// --- step 1: redirect the user ---
const pkce = await createPkcePair();
const state = createState();
// Persist { state, pkce.codeVerifier } in a session store.
const authorizeUrl = buildAuthorizeUrl({
  clientId: "my-app",
  redirectUri: "https://my-app.example/oauth/callback",
  scope: ["account:profile", "account:characters"],
  state,
  codeChallenge: pkce.codeChallenge,
});

// --- step 2: exchange the code on callback ---
const token = await oauth.exchangeAuthorizationCode({
  code: req.query.code,
  redirectUri: "https://my-app.example/oauth/callback",
  codeVerifier: pkce.codeVerifier,
});
```

## Auth: client-credentials (service scopes)

```ts
const token = await oauth.getClientCredentialsToken({
  scope: ["service:leagues", "service:psapi"],
});
```

## Calling the API

```ts
import { createClient, isRateLimited } from "@poe-tools/api-client";

const poe = createClient({
  userAgent: {
    clientId: "my-app",
    version: "1.0.0",
    contact: "me@example.com",
  },
  token: async () => (await store.get()).accessToken, // async getter supports refresh
  onRateLimit: (info) => console.log(info.rules),
});

try {
  const profile = await poe.profile.get();
  const characters = await poe.account.characters();
  const character = await poe.account.character("MyCharacter");
  const ladder = await poe.league.ladder("Standard", { limit: 20 });
} catch (err) {
  if (isRateLimited(err)) {
    // err.rateLimit.retryAfterSeconds tells you how long to wait
  }
  throw err;
}
```

## Endpoint map

| Group        | Methods                                                                   | Scope                            |
| ------------ | ------------------------------------------------------------------------- | -------------------------------- |
| `profile`    | `get`                                                                     | `account:profile`                |
| `league`     | `list`, `get`, `ladder`, `eventLadder`                                    | `service:leagues[:ladder]`       |
| `pvp`        | `list`, `get`, `ladder`                                                   | `service:pvp_matches[:ladder]`   |
| `account`    | `leagues`, `characters`, `character`, `stashes`, `stash`, `leagueAccount` | `account:*`                      |
| `guild`      | `stashes`, `stash`                                                        | `account:guild:stashes`          |
| `itemFilter` | `list`, `get`, `create`, `update`                                         | `account:item_filter`            |
| `public`     | `stashTabs`, `currencyExchange`                                           | `service:psapi`, `service:cxapi` |

For endpoints not yet modeled, use the raw `ky` instance: `poe.http.get("some-new-endpoint").json()`.
