# Repository CLI conventions

`@poe-tools/cli` is a private workspace package shared by every custom CLI in this repository. It uses [Commander](https://github.com/tj/commander.js) for command parsing/help and [Clack](https://github.com/bombshell-dev/clack) for prompts.

Existing commands, flags, and package script names remain usable in automation. Add `--interactive` to a command to select or enter omitted arguments and options; explicit CLI values are preserved. `--no-interactive` disables prompts. A bare multi-command invocation opens a command picker on a terminal, or prints help when redirected or running in CI. Single-command scripts retain their existing no-argument behavior.

Prompts and interactive status messages go to stderr. Command results keep their existing stdout format, including the extractor's JSON. Cancellation exits with code 130 before the action executes. Interactive mode requires stdin and stderr terminals outside CI; otherwise it exits with an error. Help and invalid arguments are handled before credentials, databases, or network operations are loaded.

From the repository root:

```sh
vp run @poe-tools/game-data#extract run --interactive
vp run @poe-tools/game-data#extract versions --game poe2 --no-interactive
vp run @poe-tools/stash-tracker#ingest:ps 3 --interactive
```

| Area | Entry points |
| --- | --- |
| Game-data extraction | `poe-game-data/src/cli.ts`: versions, run, package, verify-packages, verify, replay, inspect |
| DuckDB ingestion | `poe-stash-ingest/src/cx/cli.ts`, `src/ps/cli.ts` |
| SQLite tracking | `poe-stash-tracker/src/cli.ts`: ingest-cx, ingest-ps, leagues, build-basemap |
| Website data tools | PoEDB idol/scarab converters, trade-stats and league fetchers, recombinator catalog export, vendor-recipe validation, locale checking |

Tracker scripts `ingest:cx`, `ingest:ps`, `leagues`, and `build:basemap` dispatch through the common tracker CLI. Their positional arguments are unchanged. Use `--help` for command-specific options; ingestion commands retain `-h` for the existing hour flag.

New entry points should build a `Command`, add actions, then assign `process.exitCode = await runCli(program)`. Import action dependencies inside the action when they load credentials or open resources. Numeric arguments can use `positiveInteger`. Prompt values use the same parsers and choices as CLI arguments.

Tests cover explicit/negated/repeated flags, parsing errors, command selection, cancellation, noninteractive execution, and credential-free help for every entry point.
