import { z } from "zod";
import { dataPackageManifestSchema } from "./schemas.js";

export const game = "poe1";
export const version = "3.30.0-build.2.2";
export const clientBuild = "3.30.0.2.2";
export const manifestSchema = dataPackageManifestSchema.safeExtend({
    game: z.literal(game),
    version: z.literal(version),
    client_build: z.literal(clientBuild),
});
export type Manifest = z.infer<typeof manifestSchema>;
