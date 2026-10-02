<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Project-Specific Tooling

This project uses **Biome** (not Oxlint/Oxfmt) for linting and formatting. The root `package.json` exposes Biome-backed scripts:

- `vp run lint` → `biome check` (lint only, no writes)
- `vp run format` → `biome check --write --unsafe` (lint + format, applies fixes)
- `vp run ready` → the full validation gate defined in `package.json`; set `APP_ENV=test` to use inert credentials

Do **not** use `vp lint` / `vp fmt` / `vp check` for this repo — those invoke Vite+'s built-in Oxlint/Oxfmt and will disagree with Biome's rules. The `vp run <script>` form is required to hit the custom Biome scripts (see "Built-in Commands vs Scripts" above).

## Always use Vite+ (`vp`) for all tooling

**Never** invoke `npx`, `pnpm exec`, `pnpm dlx`, `yarn`, or a raw package binary directly. Always go through Vite+:

- To run a local binary (e.g. `biome`, `tsc`, `vitest` directly) use `vp exec <bin> [args]`.
- To run a binary that isn't installed, use `vp dlx <pkg>`.
- To run a package-manager command, use `vp pm <cmd>`; dependency operations go through `vp add` / `vp remove` / `vp update`.
- To run a project script, use `vp run <script>`.

This applies even for read-only/diagnostic commands — e.g. use `vp exec biome check --max-diagnostics=200`, not `npx biome`.
