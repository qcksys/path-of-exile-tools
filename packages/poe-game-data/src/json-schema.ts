import { z } from "zod";
import {
    type DataPackageManifest,
    dataFileSchemas,
    dataPackageManifestSchema,
    itemMetadataSchema,
    schemaForDataFile,
} from "./model.ts";

export function jsonSchemaPath(path: string): string {
    const schema = schemaForDataFile(path);
    const name =
        Object.entries(dataFileSchemas)
            .find(([, value]) => value === schema)?.[0]
            .replace(/\.json$/, "") ?? "item_metadata";
    return `json-schema/${name}.schema.json`;
}

export function generateJsonSchemas(
    release: Pick<DataPackageManifest, "game" | "version" | "client_build">,
) {
    const schemas = {
        ...Object.fromEntries(
            Object.entries(dataFileSchemas).map(([path, schema]) => [jsonSchemaPath(path), schema]),
        ),
        "json-schema/item_metadata.schema.json": itemMetadataSchema,
        "json-schema/manifest.schema.json": dataPackageManifestSchema.safeExtend({
            game: z.literal(release.game),
            version: z.literal(release.version),
            client_build: z.literal(release.client_build),
        }),
    };
    return Object.fromEntries(
        Object.entries(schemas).map(([path, schema]) => [
            path,
            {
                ...z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" }),
                $id: `urn:qcksys:${release.game}:${release.version}:${path.split("/").at(-1)}`,
                $comment:
                    "Generated from Zod. Cross-field refinements (such as min <= max) and dataset reference checks remain in the Zod validators.",
            },
        ]),
    );
}
