FROM node:24-bookworm-slim

RUN npm install --global pnpm@10.32.1
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/poe-api-client/package.json packages/poe-api-client/package.json
COPY packages/poe-cli/package.json packages/poe-cli/package.json
COPY packages/poe-item-query/package.json packages/poe-item-query/package.json
COPY packages/poe-market/package.json packages/poe-market/package.json
COPY packages/poe-stash-ingest/package.json packages/poe-stash-ingest/package.json
RUN pnpm --filter @poe-tools/stash-ingest... install --prod --frozen-lockfile --ignore-scripts

COPY packages/poe-api-client/src packages/poe-api-client/src
COPY packages/poe-cli/src packages/poe-cli/src
COPY packages/poe-game-data/src/render-stat-text.ts packages/poe-game-data/src/render-stat-text.ts
COPY packages/poe-game-data/src/translation-formats.ts packages/poe-game-data/src/translation-formats.ts
COPY packages/poe-item-query/src packages/poe-item-query/src
COPY packages/poe-market/src packages/poe-market/src
COPY packages/poe-market/data packages/poe-market/data
COPY packages/poe-stash-ingest/src packages/poe-stash-ingest/src
COPY packages/poe-stash-ingest/docker.env.schema packages/poe-stash-ingest/.env.schema
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /workspace/packages/poe-stash-ingest
ENV NODE_OPTIONS="--conditions=source" VARLOCK_TELEMETRY_DISABLED=1 CI=true
ENTRYPOINT ["node", "src/container.ts"]
