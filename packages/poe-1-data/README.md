# @qcksys/poe-1-data

Static normalized PoE 1 client data, committed with standalone Zod schemas and TypeScript types. See `manifest.json` for the exact client build, package version, provenance, and file hashes.

```ts
import { baseItemsSchema, modsSchema, clientBuild } from "@qcksys/poe-1-data";
import basesJson from "@qcksys/poe-1-data/data/base_items.json" with { type: "json" };
import modsJson from "@qcksys/poe-1-data/data/mods.json" with { type: "json" };

const bases = baseItemsSchema.parse(basesJson);
const mods = modsSchema.parse(modsJson);
console.log(clientBuild, Object.keys(bases).length, Object.keys(mods).length);
```

Import only the JSON datasets you need. The package root exports schemas, types, validation helpers, and release metadata; it does not load the data automatically. Typed JSON exports avoid inferring hundreds of thousands of literal properties in TypeScript.

| JSON path | Schema |
| --- | --- |
| `data/base_items.json`, `data/base_items/<class>.json` | `baseItemsSchema` |
| `data/mods.json` | `modsSchema` |
| `data/stats.json` | `statsSchema` |
| `data/tags.json` | `tagsSchema` |
| `data/item_classes.json` | `itemClassesSchema` |
| `data/tag_details.json` | `tagDetailsSchema` |
| `data/Metadata/**/*.json` | `itemMetadataSchema` |
| `manifest.json` | `manifestSchema` |

`schemaForDataFile(path)` selects a schema for a path relative to `data/`. `validateDataset` checks relationships between the five core datasets. All extracted normalized JSON is included once; duplicate minified JSON, raw binaries, and images remain in the local extraction snapshot. This is the pipeline's bases/mods/stats dataset, not every game table or a complete crafting simulator.

Versions are derived from client builds: three components stay unchanged; remaining components become `-build.<components>` (for example `3.29.3.3` becomes `3.29.3-build.3`). Pin an exact version: this follows client releases, not an independent promise of schema compatibility. The exact build remains in `clientBuild` and the manifest. npm treats `-build.N` as a prerelease identifier.

Regenerate through [the extraction pipeline](../poe-game-data/README.md#committed-data-packages). Do not edit generated data, schemas, declarations, or manifests manually. Zod is the only runtime dependency. Build with `vp run @qcksys/poe-1-data#build`; create a local tarball with `vp pm pack --filter @qcksys/poe-1-data`. No registry publication is performed by extraction.

Game content belongs to Grinding Gear Games. See [third-party notices](THIRD_PARTY_NOTICES.md).
