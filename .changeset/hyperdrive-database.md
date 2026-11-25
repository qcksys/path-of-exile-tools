---
"poe-boats": patch
---

Connect through Hyperdrive when the Worker environment binds one. With a `HYPERDRIVE` binding, requests and the scheduled exchange capture use it through mysql2 and ignore `DATABASE_URL`; environments without one connect as before. The deploy job can reach a database behind Cloudflare Access: when the GitHub environment sets `DATABASE_ACCESS_HOSTNAME`, migrations run through `cloudflared access tcp` with the environment's service token. The ingest Compose file adds a MySQL service for the dev receiver and a tunnel connector for it.
