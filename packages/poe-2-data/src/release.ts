import { z } from "zod";
import { dataPackageManifestSchema } from "./schemas.js";

export const game = "poe2";
export const version = "0.5.5-build.10";
export const clientBuild = "0.5.5.10";
export const manifestSchema = dataPackageManifestSchema.safeExtend({
    game: z.literal(game),
    version: z.literal(version),
    client_build: z.literal(clientBuild),
});
export type Manifest = z.infer<typeof manifestSchema>;
