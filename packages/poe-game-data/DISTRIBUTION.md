# Committed data packages

| Package | Client build | Package version | JSON files |
| --- | --- | --- | ---: |
| `@qcksys/poe-1-data` | `3.29.3.3` | `3.29.3-build.3` | 179 |
| `@qcksys/poe-2-data` | `4.5.5.4` | `4.5.5-build.4` | 186 |

Each package commits every canonical normalized JSON file: bases, modifiers, stats, tags, tag details, item classes, per-class base subsets, and parsed item metadata. This is all data produced by the current normalization pipeline, not every client DAT table or a full crafting simulator. Duplicate `.min.json` files and binary images stay in the local snapshot. The initial JSON totals approximately 55.9 MB for PoE 1 and 35.1 MB for PoE 2 before compression.

The package root exports standalone Zod schemas, inferred TypeScript types, validation helpers, and exact release metadata. JSON files have typed subpath exports so TypeScript does not infer enormous literal types. Zod is the only runtime dependency; consumers do not need the extractor, WASM codecs, a client installation, or network access. See the [PoE 1](../poe-1-data/README.md) and [PoE 2](../poe-2-data/README.md) package guides for imports.

## Version rule

Versions are derived from the client build ID. Three numeric components remain unchanged; additional components become `-build.<components>`. For example, `3.27.0` maps to `3.27.0`, and `3.29.3.3` maps to `3.29.3-build.3`. This uses [SemVer prerelease syntax](https://semver.org/#spec-item-9), preserving distinct, ordered fourth components. The label is not a claim that the game itself is a prerelease. The exact build remains in `manifest.json` and the `clientBuild` export.

Pin exact versions: these versions follow game builds rather than independent schema compatibility. Changesets ignores these packages; do not independently bump their versions. Once a version is published to a registry, its contents are immutable; a correction for the same build needs an explicit release-version policy before publication.

## Generate and commit

From the repository root:

```sh
# Extract both games, update their tracked packages, and commit only those packages.
vp run @poe-tools/game-data#extract run --config pipeline.local.json --commit

# Or package an existing verified snapshot without extracting again.
vp run @poe-tools/game-data#extract package --snapshot data/poe1/snapshots/<id> --commit

# Validate committed data without needing raw snapshots or network access.
vp run @poe-tools/game-data#extract verify-packages
vp run --filter '@qcksys/poe-*-data' build
vp run --filter '@qcksys/poe-*-data' typecheck
vp run --filter '@qcksys/poe-*-data' test
```

Command paths resolve from `packages/poe-game-data`. `run` generates tracked packages after extraction succeeds for all selected games. Omit `--commit` to leave generated files as a working-tree diff. `--commit` refuses an occupied Git index, verifies packages again, and stages only the selected `packages/poe-1-data` / `packages/poe-2-data` directories. It never pushes or publishes to npm. Repeating the same generation is deterministic; unchanged packages produce no new commit.

If extraction succeeds but packaging fails, fix the error and retry `package` using the saved snapshot. A write interrupted partway through is detected by verification; rerun generation from the snapshot. `replay` remains an extraction-only operation.

## Integrity and schema maintenance

`manifest.json` records the game, exact client build, derived package version, snapshot-manifest hash, DAT-schema hash, extractor fingerprint, canonical Zod-schema hash, and SHA-256/byte length of every data file. These hashes detect local drift; they do not authenticate a publisher.

Package schemas are generated from `poe-game-data/src/model.ts`. Verification detects stale schema copies, release constants, declarations, missing/extra files, invalid JSON values, and broken core references. Generation removes obsolete data files for the selected game. Do not hand-edit generated outputs. Git attributes preserve LF bytes so Windows checkout does not invalidate hashes.

CI validates every committed JSON file and its hash, checks relationships, compiles typed consumer examples, and runs package imports against the built exports. The initial manifests reference the verified extraction snapshots created by the preceding pipeline revision; their extractor hashes intentionally identify that original revision. Raw snapshots are not required to consume or validate committed packages, but are required to reproduce extraction.

## Local tarballs

Create a distributable tarball with `vp pm pack --filter @qcksys/poe-1-data` (or the PoE 2 name). Packing builds JavaScript and declarations and includes static JSON, TypeScript source, and notices. The repository contains data and schema source; `dist/` and tarballs are ignored. The package manager resolves workspace catalog dependencies when packing. No npm publication is part of this pipeline.

Game content belongs to Grinding Gear Games. Third-party notices accompany both packages. PoE 2 client spawn weights are client eligibility data, not Craft of Exile's empirical relative weights.
