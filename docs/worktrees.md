# Working in a git worktree

Parallel agent sessions run in worktrees under `.claude/worktrees/`. A worktree is a fresh checkout
that shares one `.git`. The problems below are repaired automatically; this file explains them for
when the repair does not run.

| Symptom | Cause | Repaired by |
| --- | --- | --- |
| Commits in a worktree run the main checkout's hooks, or none | An absolute `core.hooksPath` written per worktree | `prepare`, plus the `PreToolUse` hook on `git commit` |
| The session has none of the project's MCP servers | `.mcp.json` is generated and gitignored, and Claude Code reads it once, at session start | [`.worktreeinclude`](../.worktreeinclude); the `SessionStart` hook says so when it did not arrive |
| A package runs without the main checkout's local env overrides | `.env` and `.env.local` are gitignored | [`.worktreeinclude`](../.worktreeinclude) |
| Builds, type checks and tests fail with errors that look like source bugs | The worktree has no `node_modules` | By hand: `vp install` |

## The `core.hooksPath` override

Claude Code's worktree manager writes an absolute `core.hooksPath` into
`.git/worktrees/<name>/config.worktree`, pointing at the main checkout's `.vite-hooks/_`
([anthropics/claude-code#88747](https://github.com/anthropics/claude-code/issues/88747)). It
shadows the relative `.vite-hooks/_` in the shared `.git/config`. While it is set:

- `vp config` leaves it alone and installs no hook driver in the worktree, so `vp install` appears
  to succeed but the worktree has no `.vite-hooks/_` of its own.
- Commits run the main checkout's driver from whatever branch that checkout is on, or fail when the
  driver there is missing or cannot be dispatched from a backslashed path.

Check by scope, not by value:

```bash
git config --show-scope --get-all core.hooksPath
```

A `worktree` row means the override is live. A single `local .vite-hooks/_` row is correct. The
manual fix is `git config --worktree --unset core.hooksPath` followed by `vp install`. Do not
replace the override with a relative path, and do not unset with `--local`: that is the shared
config, so unsetting there breaks every checkout and leaves this one broken.

Two scripts repair it:

- [`scripts/prepare-worktree.ts`](../scripts/prepare-worktree.ts) runs first in `prepare`. It
  unsets the worktree override and replaces an absolute shared value with `.vite-hooks/_`, so the
  `vp config` that follows installs this checkout's driver.
- [`scripts/unset-worktree-hookspath.ts`](../scripts/unset-worktree-hookspath.ts) runs on
  `PreToolUse` for `Bash(git commit *)` and `PowerShell(git commit *)`. The desktop app writes the
  override again whenever it rebinds a session, which can happen after installation. The script
  clears the override only when this checkout has its own pre-commit driver, and otherwise asks
  you to run `vp install`, because unsetting without a driver would leave the commit with no hooks.
  It reports an absolute shared value but does not change it, since that file is shared with every
  checkout.

Two mistakes to avoid when diagnosing this:

- **Never ask `git config --worktree --get core.hooksPath`.** With `extensions.worktreeConfig` off
  it falls back to the local value and reports an override that is not there. Unsetting that value
  deletes the repository's own hooksPath. The scripts parse `--show-scope` for this reason.
- **The `if` belongs on the hook, not beside the matcher.** A matcher group in
  `.claude/settings.json` takes only `matcher` and `hooks`, so an `if` placed there is ignored and
  the hook runs on every shell call. Its value uses permission-rule syntax (`Bash(git commit *)`),
  not the matcher's regex.

## Gitignored files a worktree needs

[`.worktreeinclude`](../.worktreeinclude) lists files Claude Code and Codex copy from the main
checkout into each worktree they create, provided the files are also gitignored.

- `/.mcp.json` and `/.codex/config.toml` are the MCP configuration `vp run agents:sync` generates
  from `.agents/agents.json`. `.mcp.json` has to be copied rather than generated in the worktree,
  because Claude Code reads it once, at session start, before a fresh worktree has been installed.
  [`scripts/check-claude-mcp.ts`](../scripts/check-claude-mcp.ts) runs at `SessionStart` and names
  any declared server the file lacks, because a server Claude Code never loaded produces no error.
- `/.agents/local.json` holds optional MCP credentials the sync reads.
- `apps/*/.env`, `apps/*/.env.local`, `packages/*/.env` and `packages/*/.env.local` are local env
  overrides. Each package's committed `.env.schema` resolves its credentials from 1Password, but an
  override file still takes precedence over the schema, so a checkout that points a package
  elsewhere on purpose keeps doing so in its worktrees. `.dev.vars` is not copied: the varlock
  Cloudflare integration replaces it and stops `react-router typegen` and builds while one exists.

Deployment credentials and local databases (`data.db`, `data.duckdb`) are deliberately left out.

Three mechanics to know:

- **The copy comes from the main checkout.** Run `vp install` there (its `prepare` step runs
  `vp run agents:sync`), or a new worktree receives no MCP configuration.
- **It applies only to worktrees created after the entry was added.** Copy the file into an existing
  worktree by hand, or run `vp install` there and start a new session.
- **The file is read from the repository root**, so a `.worktreeinclude` inside a worktree does
  nothing.

The hook commands in `.claude/settings.json` are project-scoped, so Claude Code asks you to review
them the first time a session runs in this repository.
