# @poe-tools/api-client

## 0.2.0

### Minor Changes

- Introduce `@poe-tools/api-client`: a typed, JSDoc-annotated client for the Path of Exile GGG Developer API built on `ky`. Covers full OAuth 2.1 (authorization-code + PKCE, client-credentials, refresh, revoke, introspect), every REST endpoint in the developer reference (profile, leagues, ladders, PvP, characters, stashes, guild stashes, league accounts, item filters, public stash stream, currency exchange), `X-Rate-Limit-*` parsing, and a Vite+ `pack` build pipeline with `~/*` path alias.
