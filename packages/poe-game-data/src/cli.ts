import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option, positiveInteger, runCli } from "@poe-tools/cli";
import { z } from "zod";
import { gameSchema, loadConfig } from "./config.ts";
import { exportCraftingData } from "./crafting-data.ts";
import { exportCraftingRecipes } from "./crafting-recipes.ts";
import {
    commitDataPackages,
    dataPackages,
    materializePackage,
    verifyDataPackage,
} from "./distribute.ts";
import { modPool } from "./model.ts";
import { counts, packageDirectory, replay, run, verify } from "./pipeline.ts";
import { discoverVersion } from "./versions.ts";

const gamesOption = () =>
    new Option("--game <game>", "game to process")
        .choices(["poe1", "poe2", "both"])
        .default("both");
const selectedGames = (value: string) =>
    value === "both" ? gameSchema.options : [gameSchema.parse(value)];
const print = (result: unknown) => console.log(JSON.stringify(result, null, 2));
function required(value: string | undefined, name: string) {
    if (!value) throw new Error(`Missing --${name}`);
    return value;
}

export function createProgram() {
    const program = new Command()
        .name("extract")
        .description("Extract, package, and inspect PoE client data");
    program
        .command("crafting-data")
        .description("Extract crafting rules and recipes for the packaged client builds")
        .addOption(gamesOption())
        .option("--source <path>", "installed client or extracted raw directory")
        .option("--schema <path>", "saved DAT schema; omit to download")
        .action(async (options) => {
            for (const game of selectedGames(options.game))
                print(
                    await exportCraftingData(
                        resolve(packageDirectory, "..", dataPackages[game]),
                        options,
                    ),
                );
        });
    program
        .command("crafting")
        .description("Export essence and bench recipes for the committed PoE 1 client build")
        .action(async () =>
            print(await exportCraftingRecipes(resolve(packageDirectory, "../poe-1-data"))),
        );
    program
        .command("versions")
        .description("Discover current client builds")
        .addOption(gamesOption())
        .action(async (options) => {
            print(
                Object.fromEntries(
                    await Promise.all(
                        selectedGames(options.game).map(async (game) => [
                            game,
                            { patch: await discoverVersion(game) },
                        ]),
                    ),
                ),
            );
        });
    program
        .command("run")
        .description("Extract snapshots and generate tracked data packages")
        .option("--config <path>", "pipeline configuration file")
        .addOption(gamesOption())
        .option("--schema <path>", "saved DAT schema; omit to download")
        .option("--output <path>", "snapshot output directory", "data")
        .option("--commit", "commit generated data packages", false)
        .action(async (options) => {
            const config = await loadConfig(required(options.config, "config"));
            const selected = selectedGames(options.game);
            const games =
                options.game === "both" ? selected.filter((game) => config[game]) : selected;
            const snapshots = await run(config, options.output, games, options.schema);
            const packages = [];
            for (const snapshot of snapshots) packages.push(await materializePackage(snapshot));
            print({
                snapshots,
                packages,
                ...(options.commit ? await commitDataPackages(packages) : {}),
            });
        });
    program
        .command("package")
        .description("Generate a data package from a verified snapshot")
        .option("--snapshot <path>", "snapshot directory")
        .option("--commit", "commit the generated package", false)
        .action(async (options) => {
            const packaged = await materializePackage(required(options.snapshot, "snapshot"));
            print({ ...packaged, ...(options.commit ? await commitDataPackages([packaged]) : {}) });
        });
    program
        .command("verify-packages")
        .description("Verify committed JSON, schemas, and release metadata")
        .addOption(gamesOption())
        .action(async (options) => {
            print(
                Object.fromEntries(
                    await Promise.all(
                        selectedGames(options.game).map(async (game) => [
                            game,
                            await verifyDataPackage(
                                resolve(packageDirectory, "..", dataPackages[game]),
                            ),
                        ]),
                    ),
                ),
            );
        });
    program
        .command("verify")
        .description("Verify a saved extraction snapshot")
        .option("--snapshot <path>", "snapshot directory")
        .action(async (options) =>
            print(counts((await verify(required(options.snapshot, "snapshot"))).data)),
        );
    program
        .command("replay")
        .description("Replay extraction offline using saved inputs")
        .option("--snapshot <path>", "snapshot directory")
        .option("--output <path>", "snapshot output directory", "data")
        .action(async (options) =>
            print(await replay(required(options.snapshot, "snapshot"), options.output)),
        );
    program
        .command("inspect")
        .description("Inspect the eligible modifier pool for an item base")
        .option("--snapshot <path>", "snapshot directory")
        .option("--base <id>", "base metadata path")
        .option("--item-level <level>", "item level (1–100)", positiveInteger, 100)
        .option(
            "--existing <id>",
            "existing modifier ID; repeat for multiple modifiers",
            (value: string, previous: string[]) => [...previous, value],
            [],
        )
        .action(async (options) => {
            const level = z.number().int().min(1).max(100).parse(options.itemLevel);
            const id = required(options.base, "base");
            const { manifest, data } = await verify(required(options.snapshot, "snapshot"));
            const base = data.base_items[id];
            if (!base) throw new Error(`Unknown base: ${id}`);
            print({
                game: manifest.game,
                patch: manifest.patch,
                base: { id, ...base },
                item_level: level,
                weight_provenance: manifest.weight_provenance,
                pool: modPool(base, data.mods, level, options.existing),
            });
        });
    return program;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = await runCli(createProgram());
}
