import { parseArgs } from "node:util";
import { z } from "zod";
import { gameSchema, loadConfig } from "./config.ts";
import { modPool } from "./model.ts";
import { counts, replay, run, verify } from "./pipeline.ts";
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
        },
    });
    if (values.help || !positionals.length) {
        console.log(
            "Usage: extract <versions|run|verify|replay|inspect> [options]\n\nversions --game poe1|poe2|both\nrun --config pipeline.local.json [--game both] [--schema schema.json] [--output data]\nverify --snapshot data/poe1/snapshots/<id>\nreplay --snapshot <path> [--output data]\ninspect --snapshot <path> --base Metadata/Items/... [--item-level 100] [--existing ModId]",
        );
        return;
    }
    if (positionals.length !== 1) throw new Error("Expected one command");
    const selected = values.game === "both" ? gameSchema.options : [gameSchema.parse(values.game)];
    const required = (value: string | undefined, option: string) => {
        if (!value) throw new Error(`Missing --${option}`);
        return value;
    };
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
            result = await run(config, values.output, games, values.schema);
            break;
        }
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
