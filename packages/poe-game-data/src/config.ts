import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { readJson } from "./io.ts";

export const gameSchema = z.enum(["poe1", "poe2"]);
export type Game = z.infer<typeof gameSchema>;
export const hosts = { poe1: "patch.poecdn.com", poe2: "patch-poe2.poecdn.com" } as const;
export const sourceSchema = z.strictObject({
    patch: z.string(),
    directory: z.string().min(1).optional(),
});
export type SourceConfig = z.infer<typeof sourceSchema>;
export const configSchema = z
    .strictObject({ poe1: sourceSchema.optional(), poe2: sourceSchema.optional() })
    .superRefine((config, ctx) => {
        if (!config.poe1 && !config.poe2)
            ctx.addIssue({ code: "custom", message: "Configure at least one game" });
        for (const game of gameSchema.options) {
            const source = config[game];
            if (source && !validPatch(game, source.patch))
                ctx.addIssue({
                    code: "custom",
                    path: [game, "patch"],
                    message: `Invalid ${game} patch version`,
                });
        }
    });
export type Config = z.infer<typeof configSchema>;

export function validPatch(game: Game, patch: string) {
    return new RegExp(`^${game === "poe1" ? 3 : 4}(?:\\.\\d+){2,5}$`).test(patch);
}

export async function loadConfig(path: string): Promise<Config> {
    const config = configSchema.parse(await readJson(path));
    for (const source of Object.values(config)) {
        if (!source?.directory) continue;
        source.directory = resolve(dirname(path), source.directory);
        if (!(await stat(source.directory)).isDirectory())
            throw new Error(`Not a directory: ${source.directory}`);
    }
    return config;
}
