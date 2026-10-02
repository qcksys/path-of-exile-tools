import { z } from "zod";
import { dataPackageManifestSchema } from "./schemas.js";

export const game = "poe2";
export const version = "4.5.5-build.4";
export const clientBuild = "4.5.5.4";
export const manifestSchema = dataPackageManifestSchema.safeExtend({
    game: z.literal(game),
    version: z.literal(version),
    client_build: z.literal(clientBuild),
});
export type Manifest = z.infer<typeof manifestSchema>;
