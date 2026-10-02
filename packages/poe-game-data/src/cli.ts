import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { gameSchema, loadConfig } from "./config.ts";
import {
    commitDataPackages,
    dataPackages,
    materializePackage,
    verifyDataPackage,
} from "./distribute.ts";
import { modPool } from "./model.ts";
import { counts, packageDirectory, replay, run, verify } from "./pipeline.ts";
import { discoverVersion } from "./versions.ts";

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            game: { type: "string", default: "both" },
            config: { type: "string" },
            output: { type: "string", default: "data" },
            schema: { type: "string" },
            snapshot: { type: "string" },
            base: { type: "string" },
            "item-level": { type: "string", default: "100" },
            existing: { type: "string", multiple: true, default: [] },
            help: { type: "boolean", short: "h" },
            commit: { type: "boolean", default: false },
        },
    });
    if (values.help || !positionals.length) {
        console.log(
            "Usage: extract <versions|run|package|verify|verify-packages|replay|inspect> [options]\n\nversions --game poe1|poe2|both\nrun --config pipeline.local.json [--game both] [--schema schema.json] [--output data] [--commit]\npackage --snapshot <path> [--commit]\nverify-packages [--game poe1|poe2|both]\nverify --snapshot data/poe1/snapshots/<id>\nreplay --snapshot <path> [--output data]\ninspect --snapshot <path> --base Metadata/Items/... [--item-level 100] [--existing ModId]",
        );
        return;
    }
    if (positionals.length !== 1) throw new Error("Expected one command");
    const selected = values.game === "both" ? gameSchema.options : [gameSchema.parse(values.game)];
    const required = (value: string | undefined, option: string) => {
        if (!value) throw new Error(`Missing --${option}`);
        return value;
    };
    if (values.commit && !["run", "package"].includes(positionals[0]!))
        throw new Error("--commit is only supported for run and package");
    let result: unknown;
    switch (positionals[0]) {
        case "versions":
            result = Object.fromEntries(
                await Promise.all(
                    selected.map(async (game) => [game, { patch: await discoverVersion(game) }]),
                ),
            );
            break;
        case "run": {
            const config = await loadConfig(required(values.config, "config"));
            const games =
                values.game === "both" ? selected.filter((game) => config[game]) : selected;
            const snapshots = await run(config, values.output, games, values.schema);
            const packages = [];
            for (const snapshot of snapshots) packages.push(await materializePackage(snapshot));
            result = {
                snapshots,
                packages,
                ...(values.commit ? await commitDataPackages(packages) : {}),
            };
            break;
        }
        case "package": {
            const packaged = await materializePackage(required(values.snapshot, "snapshot"));
            result = {
                ...packaged,
                ...(values.commit ? await commitDataPackages([packaged]) : {}),
            };
            break;
        }
        case "verify-packages":
            result = Object.fromEntries(
                await Promise.all(
                    selected.map(async (game) => [
                        game,
                        await verifyDataPackage(
                            resolve(packageDirectory, "..", dataPackages[game]),
                        ),
                    ]),
                ),
            );
            break;
        case "verify":
            result = counts((await verify(required(values.snapshot, "snapshot"))).data);
            break;
        case "replay":
            result = await replay(required(values.snapshot, "snapshot"), values.output);
            break;
        case "inspect": {
            const { manifest, data } = await verify(required(values.snapshot, "snapshot"));
            const id = required(values.base, "base");
            const base = data.base_items[id];
            if (!base) throw new Error(`Unknown base: ${id}`);
            const level = z.coerce.number().int().min(1).max(100).parse(values["item-level"]);
            result = {
                game: manifest.game,
                patch: manifest.patch,
                base: { id, ...base },
                item_level: level,
                weight_provenance: manifest.weight_provenance,
                pool: modPool(base, data.mods, level, values.existing),
            };
            break;
        }
        default:
            throw new Error(`Unknown command: ${positionals[0]}`);
    }
    console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
