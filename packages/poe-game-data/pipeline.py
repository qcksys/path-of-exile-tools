"""Extract versioned client datasets with RePoE, preserving source evidence."""

import argparse
from collections import Counter
import hashlib
import importlib
import importlib.util
from io import BytesIO
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
import tomllib
from urllib.request import urlopen
from urllib.error import HTTPError
from urllib.parse import quote, urlparse
from uuid import uuid4

PACKAGE = Path(__file__).resolve().parent
SCHEMA_URL = "https://github.com/poe-tool-dev/dat-schema/releases/download/latest/schema.min.json"
HOSTS = {"poe1": "patch.poecdn.com", "poe2": "patch-poe2.poecdn.com"}
MODULES = ("tags", "stats", "mods", "base_items", "item_classes")


def prepare_runtime():
    if os.name == "nt":
        cache = PACKAGE / ".cache" / "appdata"
        cache.mkdir(parents=True, exist_ok=True)
        os.environ["APPDATA"] = str(cache)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_asset_path(root, name):
    relative = Path(name.replace("\\", "/"))
    path = (root / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to(root.resolve()):
        raise ValueError(f"Asset path escapes the snapshot: {name}")
    return path


def load_config(path):
    config = read_json(path)
    if not isinstance(config, dict) or not config or set(config) - HOSTS.keys():
        raise ValueError("Configuration must contain poe1 and/or poe2 objects")
    for game, source in config.items():
        if not isinstance(source, dict) or set(source) - {"patch", "directory"}:
            raise ValueError(f"{game}: expected patch and optional directory")
        patch = source.get("patch", "")
        prefix = "3" if game == "poe1" else "4"
        if not isinstance(patch, str) or not re.fullmatch(rf"{prefix}(?:\.\d+){{2,5}}", patch):
            raise ValueError(f"{game}: supply an explicit {prefix}.x patch version")
        if "directory" in source:
            if not isinstance(source["directory"], str) or not source["directory"]:
                raise ValueError(f"{game}: directory must be a non-empty path")
            directory = (path.parent / source["directory"]).resolve()
            if not directory.is_dir():
                raise ValueError(f"Game installation directory does not exist: {directory}")
            source["directory"] = str(directory)
    return config


def source_location(game, source):
    return source.get("directory") or f"https://{HOSTS[game]}/{source['patch']}/"


def discover_version(game):
    host, port = (
        ("patch.pathofexile.com", 12995) if game == "poe1" else ("patch.pathofexile2.com", 13060)
    )
    with socket.create_connection((host, port), timeout=15) as connection:

        def receive(size):
            data = bytearray()
            while len(data) < size:
                part = connection.recv(size - len(data))
                if not part:
                    raise ValueError("Truncated response from the patch server")
                data.extend(part)
            return data

        connection.sendall(bytes([1, 6]))
        header = receive(35)
        if header[0] != 2:
            raise ValueError("Unexpected patch server protocol response")
        length = int.from_bytes(header[33:35], "big")
        if not 1 <= length <= 2048:
            raise ValueError("Invalid patch server URL length")
        url = urlparse(receive(length * 2).decode("utf-16-le"))
    if url.scheme != "https" or url.netloc != HOSTS[game]:
        raise ValueError(f"Unexpected patch CDN: {url.geturl()}")
    version = url.path.strip("/")
    prefix = "3" if game == "poe1" else "4"
    if not re.fullmatch(rf"{prefix}(?:\.\d+){{2,5}}", version):
        raise ValueError(f"Invalid patch version: {version}")
    return version


def first_weight(rules, tags, default):
    return next((rule["weight"] for rule in rules if rule["tag"] in tags), default)


def mod_pool(base, mods, item_level, existing=()):
    tags = set(base["tags"])
    groups = set()
    if len(existing) != len(set(existing)):
        raise ValueError("Existing modifier IDs must be unique")
    for key in existing:
        mod = mods[key]
        tags.update(mod["adds_tags"])
        groups.update(mod["groups"])
    pool = []
    for key, mod in mods.items():
        kind = mod["generation_type"]
        if (
            kind not in ("prefix", "suffix")
            or key in existing
            or mod["domain"] != base["domain"]
            or mod["is_essence_only"]
            or mod["required_level"] > item_level
            or (mod.get("maximum_level", 0) > 0 and item_level > mod["maximum_level"])
            or groups.intersection(mod["groups"])
        ):
            continue
        spawn = first_weight(mod["spawn_weights"], tags, 0)
        generation = first_weight(mod["generation_weights"], tags, 100)
        effective = spawn * generation / 100
        if effective > 0:
            pool.append(
                {
                    "id": key,
                    "text": mod["text"],
                    "stats": mod["stats"],
                    "affix": kind,
                    "spawn_weight": spawn,
                    "generation_percent": generation,
                    "effective_weight": effective,
                }
            )
    return sorted(pool, key=lambda row: row["id"])


def validate_dataset(directory):
    prepare_runtime()
    from RePoE.model.base_items import Model as BaseItems
    from pydantic import RootModel
    from RePoE.model.mods import ModsSchemaValue
    from RePoE.model.stats import Model as Stats
    from RePoE.model.tags import Model as Tags
    from RePoE.model.item_classes import Model as ItemClasses

    class Mod(ModsSchemaValue):
        maximum_level: int

    class Mods(RootModel[dict[str, Mod]]):
        pass

    bases = read_json(directory / "base_items.json")
    mods = read_json(directory / "mods.json")
    stats = read_json(directory / "stats.json")
    tags = read_json(directory / "tags.json")
    classes = read_json(directory / "item_classes.json")
    for model, data in (
        (BaseItems, bases),
        (Mods, mods),
        (Stats, stats),
        (Tags, tags),
        (ItemClasses, classes),
    ):
        model.model_validate(data)
        if not data:
            raise ValueError(f"Empty dataset: {model.__module__}")
    known_tags = set(tags)
    for key, base in bases.items():
        if base["item_class"] not in classes:
            raise ValueError(f"{key}: unresolved item class: {base['item_class']}")
        missing = set(base["implicits"]) - mods.keys()
        if missing:
            raise ValueError(f"{key}: unresolved implicit mods: {sorted(missing)}")
    for key, mod in mods.items():
        for stat in mod["stats"]:
            if stat["id"] not in stats or stat["min"] > stat["max"]:
                raise ValueError(f"{key}: invalid stat reference/range: {stat}")
        for rule in mod["spawn_weights"] + mod["generation_weights"]:
            if rule["tag"] not in known_tags or rule["weight"] < 0:
                raise ValueError(f"{key}: invalid weight: {rule}")
    return {
        "bases": len(bases),
        "mods": len(mods),
        "stats": len(stats),
        "spawn_weight_values": dict(
            sorted(Counter(w["weight"] for m in mods.values() for w in m["spawn_weights"]).items())
        ),
        "tags": len(tags),
        "mods_without_text": sum(not m["text"] for m in mods.values()),
        "mods_without_positive_spawn_weights": sum(
            not any(w["weight"] > 0 for w in m["spawn_weights"]) for m in mods.values()
        ),
    }


def create_file_system(game, source, raw):
    prepare_runtime()
    from PyPoE.poe.file.file_system import FileSystem
    from PyPoE.poe.file.bundle import Index

    class RecordingFileSystem(FileSystem):
        def __init__(self):
            self.cdn = "directory" not in source
            self.inputs = {}
            self.transports = {}
            if self.cdn:
                self.root_path = source_location(game, source)
                self.ggpk = None
                self.directory = None
                self.index = Index()
                self.index.read(self.download(Index.PATH))
            else:
                super().__init__(source["directory"])

        def download(self, name):
            cache = safe_asset_path(PACKAGE / ".cache" / "bundles" / game / source["patch"], name)
            if cache.exists():
                data = cache.read_bytes()
            else:
                with urlopen(
                    self.root_path + quote(name.replace("\\", "/")), timeout=120
                ) as response:
                    data = response.read()
                cache.parent.mkdir(parents=True, exist_ok=True)
                temporary = cache.with_name(f".{cache.name}-{uuid4().hex}")
                temporary.write_bytes(data)
                temporary.replace(cache)
            self.transports[name] = {"sha256": digest(data), "bytes": len(data)}
            return data

        def get_file(self, name):
            path = safe_asset_path(raw, name)
            if path.exists():
                return path.read_bytes()
            if self.cdn:
                try:
                    record = self.index.get_file_record(name)
                except FileNotFoundError:
                    try:
                        data = self.download(name)
                    except HTTPError as error:
                        if error.code == 404:
                            raise FileNotFoundError(name) from error
                        raise
                else:
                    if record.bundle.contents is None:
                        record.bundle.read(self.download(record.bundle.ggpk_path))
                    data = record.get_file()
            else:
                data = super().get_file(name)
            if isinstance(data, BytesIO):
                data = data.getvalue()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            self.inputs[path.relative_to(raw).as_posix()] = {
                "sha256": digest(data),
                "bytes": len(data),
            }
            return data

    return RecordingFileSystem()


def extract(game, source, snapshot):
    prepare_runtime()
    sys.dont_write_bytecode = True
    from PyPoE.poe.file.dat import RelationalReader

    generated = snapshot / "schema.py"
    command = [
        sys.executable,
        "-m",
        "PyPoE.poe.file.specification.generation.import_dat_schema",
        "--schema-file",
        str(snapshot / "schema.json"),
        "--output",
        str(generated),
        "--adapt-version",
        "poe2" if game == "poe2" else "stable",
    ]
    if game == "poe2":
        command.append("--poe2")
    subprocess.run(command, check=True)
    spec_module = importlib.util.spec_from_file_location("snapshot_schema", generated)
    schema = importlib.util.module_from_spec(spec_module)
    spec_module.loader.exec_module(schema)

    filesystem = create_file_system(game, source, snapshot / "raw")
    reader = RelationalReader(
        path_or_file_system=filesystem,
        specification=schema.specification,
        read_options={"use_dat_value": False, "auto_build_index": True, "x64": True},
        language="English",
        raise_error_on_missing_relation=True,
    )
    prefix = "RePoE.parser.poe2" if game == "poe2" else "RePoE.parser.modules"
    normalized = snapshot / "normalized"
    normalized.mkdir()
    caches = {}
    for name in MODULES:
        print(f"[{game}] Exporting {name}", flush=True)
        module = importlib.import_module(
            f"{'RePoE.parser.modules' if name == 'stats' else prefix}.{name}"
        )
        getattr(module, name)(
            file_system=filesystem,
            data_path=str(normalized) + os.sep,
            relational_reader=reader,
            language="English",
            caches=caches,
            sequel=2 if game == "poe2" else 1,
            fail_fast=True,
        ).write()

    mods = read_json(normalized / "mods.json")
    for row in reader["Mods.dat64"]:
        key = row["Id"]
        if key in mods:
            mods[key]["maximum_level"] = row["MaxLevel"]
        weight_tags = row["SpawnWeight_Tags" if game == "poe2" else "SpawnWeight_TagsKeys"]
        if len(weight_tags) != len(row["SpawnWeight_Values"]):
            raise ValueError(f"{key}: spawn tags and weight values have different lengths")
        if len(
            row["GenerationWeight_Tags" if game == "poe2" else "GenerationWeight_TagsKeys"]
        ) != len(row["GenerationWeight_Values"]):
            raise ValueError(f"{key}: generation tags and weight values have different lengths")
    for name, table in reader.files.items():
        if table.reader.table_rows and table.reader.cast_size != table.reader.table_record_length:
            raise ValueError(f"{name}: schema row size differs from the client table")
    write_json(normalized / "mods.json", mods)
    # Keep the compact export consistent with the enriched canonical file.
    (normalized / "mods.min.json").write_text(
        json.dumps(mods, separators=(",", ":")), encoding="utf-8"
    )
    write_json(snapshot / "inputs.json", filesystem.inputs)
    write_json(snapshot / "transport.json", filesystem.transports)
    counts = validate_dataset(normalized)
    missing_images = []
    for key, base in read_json(normalized / "base_items.json").items():
        asset = base["visual_identity"]["dds_file"]
        if asset and not safe_asset_path(normalized, str(Path(asset).with_suffix(".png"))).exists():
            missing_images.append(key)
    counts["missing_images"] = missing_images
    write_json(snapshot / "validation.json", counts)


def publish(output, game, snapshot, manifest):
    write_json(snapshot / "manifest.json", manifest)
    final = snapshot.with_name(snapshot.name.removeprefix(".incomplete-"))
    snapshot.rename(final)
    pointer = output / game / "latest.json"
    temporary = pointer.with_name(f".latest-{uuid4().hex}.json")
    write_json(temporary, {"snapshot": final.relative_to(output / game).as_posix()})
    temporary.replace(pointer)
    return final


def verify(snapshot):
    manifest = read_json(snapshot / "manifest.json")
    if not manifest.get("files"):
        raise ValueError("Snapshot manifest has no file hashes")
    for name, expected in manifest["files"].items():
        if digest(safe_asset_path(snapshot, name).read_bytes()) != expected:
            raise ValueError(f"Snapshot hash mismatch: {name}")
    return validate_dataset(snapshot / "normalized")


def run(config, output, selected, schema_path):
    schema_bytes = (
        schema_path.read_bytes() if schema_path else urlopen(SCHEMA_URL, timeout=60).read()
    )
    schema_json = json.loads(schema_bytes)
    if not isinstance(schema_json.get("tables"), list):
        raise ValueError("Schema must contain a tables array")
    lock_bytes = (PACKAGE / "uv.lock").read_bytes()
    dependencies = tomllib.loads(lock_bytes.decode())["package"]
    for game in selected:
        source = config[game]
        runs = output / game / "snapshots"
        runs.mkdir(parents=True, exist_ok=True)
        snapshot = Path(tempfile.mkdtemp(prefix=f".incomplete-{source['patch']}-", dir=runs))
        (snapshot / "schema.json").write_bytes(schema_bytes)
        write_json(snapshot / "source.json", source)
        (snapshot / "uv.lock").write_bytes(lock_bytes)
        (snapshot / "pipeline.py").write_bytes(Path(__file__).read_bytes())
        print(f"[{game}] Extracting into {snapshot}", flush=True)
        with (snapshot / "extract.log").open("w", encoding="utf-8") as log:
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).resolve()),
                    "_extract",
                    "--game",
                    game,
                    "--snapshot",
                    str(snapshot),
                ],
                stdout=log,
                stderr=subprocess.STDOUT,
                env={**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"},
            )
        if result.returncode:
            raise RuntimeError(
                f"{game} extraction failed; previous snapshot is unchanged. See {snapshot / 'extract.log'}"
            )
        manifest = {
            "format_version": 1,
            "game": game,
            "patch": source["patch"],
            "source": {
                "kind": "local" if "directory" in source else "cdn",
                "location": source_location(game, source),
            },
            "schema_sha256": digest(schema_bytes),
            "dependency_lock_sha256": digest(lock_bytes),
            "extractors": [p for p in dependencies if p["name"] in ("repoe", "pypoe")],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "weight_provenance": "client-extracted; server accuracy unverified; PoE 2 values may be eligibility flags rather than relative weights",
            "validation": read_json(snapshot / "validation.json"),
        }
        manifest["files"] = {
            p.relative_to(snapshot).as_posix(): digest(p.read_bytes())
            for p in sorted(snapshot.rglob("*"))
            if p.is_file() and p.name != "extract.log"
        }
        final = publish(output, game, snapshot, manifest)
        print(f"[{game}] Published {final}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("run", help="Extract, validate and publish local snapshots")
    command.add_argument("--config", type=Path, required=True)
    command.add_argument("--output", type=Path, default=Path("data"))
    command.add_argument("--game", choices=["poe1", "poe2", "both"], default="both")
    command.add_argument(
        "--schema", type=Path, help="Reuse a saved schema.json instead of downloading"
    )
    command = commands.add_parser(
        "versions", help="Discover current CDN versions directly from GGG"
    )
    command.add_argument("--game", choices=["poe1", "poe2", "both"], default="both")
    command = commands.add_parser("verify", help="Check a snapshot's hashes and relationships")
    command.add_argument("--snapshot", type=Path, required=True)
    command = commands.add_parser(
        "replay", help="Re-extract saved raw files with the saved schema, without network access"
    )
    command.add_argument("--snapshot", type=Path, required=True)
    command.add_argument("--output", type=Path, default=Path("data"))
    command = commands.add_parser(
        "inspect", help="Show a base and candidate explicit modifier weights"
    )
    command.add_argument("--snapshot", type=Path, required=True)
    command.add_argument("--base", required=True, help="Base metadata path, not display name")
    command.add_argument("--item-level", type=int, required=True)
    command.add_argument("--existing", action="append", default=[])
    command = commands.add_parser("_extract", help=argparse.SUPPRESS)
    command.add_argument("--game", choices=HOSTS, required=True)
    command.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "run":
        config = load_config(args.config.resolve())
        selected = list(config) if args.game == "both" else [args.game]
        if any(game not in config for game in selected):
            parser.error("Selected game is absent from the configuration")
        run(config, args.output.resolve(), selected, args.schema)
    elif args.command == "_extract":
        extract(args.game, read_json(args.snapshot / "source.json"), args.snapshot)
    elif args.command == "versions":
        games = HOSTS if args.game == "both" else [args.game]
        print(json.dumps({game: {"patch": discover_version(game)} for game in games}, indent=2))
    elif args.command == "verify":
        print(json.dumps(verify(args.snapshot), indent=2))
    elif args.command == "replay":
        snapshot = args.snapshot.resolve()
        verify(snapshot)
        if (snapshot / "uv.lock").read_bytes() != (PACKAGE / "uv.lock").read_bytes():
            raise ValueError(
                "Replay requires the snapshot's dependency lock; restore that revision first"
            )
        manifest = read_json(snapshot / "manifest.json")
        game = manifest["game"]
        run(
            {game: {"patch": manifest["patch"], "directory": str(snapshot / "raw")}},
            args.output.resolve(),
            [game],
            snapshot / "schema.json",
        )
    else:
        if not 1 <= args.item_level <= 100:
            parser.error("Item level must be between 1 and 100")
        base = read_json(args.snapshot / "normalized/base_items.json")[args.base]
        mods = read_json(args.snapshot / "normalized/mods.json")
        print(
            json.dumps(
                {
                    "base": base,
                    "candidates": mod_pool(base, mods, args.item_level, args.existing),
                    "weight_provenance": read_json(args.snapshot / "manifest.json")[
                        "weight_provenance"
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, RuntimeError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
