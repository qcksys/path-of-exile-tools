# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run test -r
```

- Build the monorepo:

```bash
vp run build -r
```

- Run the development server:

```bash
vp run dev
```

### Named `.localhost` URLs (Portless)

`apps/poe.boats` is configured to run through [Portless](https://portless.sh/),
which replaces port numbers with a stable HTTPS URL.

From `apps/poe.boats/`:

```bash
vp exec portless trust    # one-time: trust the local CA
vp run dev:portless       # serve at https://poe.boats.localhost
```

The app name is set in `apps/poe.boats/portless.json`.
