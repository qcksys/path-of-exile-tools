import copy
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import pipeline


def modifier(**overrides):
    return {
        "adds_tags": [],
        "domain": "item",
        "generation_type": "prefix",
        "generation_weights": [],
        "grants_effects": [],
        "groups": ["IncreasedLife"],
        "implicit_tags": ["life"],
        "is_essence_only": False,
        "name": "Healthy",
        "required_level": 5,
        "maximum_level": 0,
        "spawn_weights": [
            {"tag": "fishing_rod", "weight": 0},
            {"tag": "weapon", "weight": 0},
            {"tag": "default", "weight": 1000},
        ],
        "stats": [{"id": "base_maximum_life", "min": 10, "max": 24}],
        "text": "+(10-24) to maximum Life",
        "type": "Life",
        **overrides,
    }


BASE = {
    "domain": "item",
    "drop_level": 10,
    "implicits": ["IncreasedLifeImplicitBelt1"],
    "inventory_height": 1,
    "inventory_width": 2,
    "item_class": "Belt",
    "name": "Leather Belt",
    "properties": {},
    "release_state": "released",
    "tags": ["belt", "default"],
    "visual_identity": {"id": "Belt3", "dds_file": "Art/2DItems/Belts/Belt3.dds"},
}


def dataset(directory):
    values = {
        "base_items": {"Metadata/Items/Belts/Belt3": BASE},
        "mods": {
            "IncreasedLife1": modifier(),
            "IncreasedLifeImplicitBelt1": modifier(
                generation_type="corrupted",
                spawn_weights=[],
                stats=[{"id": "base_maximum_life", "min": 25, "max": 40}],
            ),
        },
        "stats": {"base_maximum_life": {"alias": {}, "is_aliased": False, "is_local": False}},
        "tags": ["default", "weapon", "fishing_rod", "belt", "life"],
        "item_classes": {"Belt": {"name": "Belt"}},
    }
    for name, value in values.items():
        pipeline.write_json(directory / f"{name}.json", value)
    return copy.deepcopy(values)


class WeightTests(unittest.TestCase):
    def test_leather_belt_and_weapon_follow_first_matching_rule(self):
        mods = {"IncreasedLife1": modifier()}
        self.assertEqual(pipeline.mod_pool(BASE, mods, 5)[0]["effective_weight"], 1000)
        self.assertEqual(pipeline.mod_pool({**BASE, "tags": ["weapon", "default"]}, mods, 5), [])
        self.assertEqual(pipeline.mod_pool({**BASE, "tags": ["belt"]}, mods, 5), [])

    def test_generation_weights_are_ordered_percentages(self):
        mod = modifier(
            generation_weights=[{"tag": "belt", "weight": 25}, {"tag": "default", "weight": 200}]
        )
        self.assertEqual(pipeline.mod_pool(BASE, {"mod": mod}, 5)[0]["effective_weight"], 250)
        mod["generation_weights"][0]["weight"] = 0
        self.assertEqual(pipeline.mod_pool(BASE, {"mod": mod}, 5), [])

    def test_level_domain_essence_and_non_affix_filters(self):
        for changes in (
            {"required_level": 6},
            {"maximum_level": 4},
            {"domain": "monster"},
            {"is_essence_only": True},
            {"generation_type": "corrupted"},
        ):
            with self.subTest(changes=changes):
                self.assertEqual(pipeline.mod_pool(BASE, {"mod": modifier(**changes)}, 5), [])
        self.assertEqual(len(pipeline.mod_pool(BASE, {"mod": modifier(maximum_level=5)}, 5)), 1)

    def test_existing_mods_add_tags_and_exclude_groups(self):
        mods = {
            "existing": modifier(adds_tags=["special"], groups=["taken"]),
            "blocked": modifier(groups=["taken"]),
            "enabled": modifier(groups=["free"], spawn_weights=[{"tag": "special", "weight": 20}]),
        }
        self.assertEqual(
            [m["id"] for m in pipeline.mod_pool(BASE, mods, 5, ["existing"])], ["enabled"]
        )
        with self.assertRaisesRegex(ValueError, "unique"):
            pipeline.mod_pool(BASE, mods, 5, ["existing", "existing"])

    def test_absent_poe2_weights_are_not_invented(self):
        self.assertEqual(pipeline.mod_pool(BASE, {"mod": modifier(spawn_weights=[])}, 100), [])


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_config_pins_both_games_and_resolves_local_directory(self):
        path = self.root / "config.json"
        pipeline.write_json(
            path, {"poe1": {"patch": "3.29.3.3"}, "poe2": {"patch": "4.5.5.2", "directory": "."}}
        )
        config = pipeline.load_config(path)
        self.assertEqual(
            pipeline.source_location("poe1", config["poe1"]), "https://patch.poecdn.com/3.29.3.3/"
        )
        self.assertEqual(pipeline.source_location("poe2", config["poe2"]), str(self.root.resolve()))
        for bad in (
            {},
            {"poe3": {}},
            {"poe1": {"patch": "latest"}},
            {"poe2": {"patch": "3.29.3.3"}},
            {"poe1": {"patch": "3.29.3.3", "directory": "missing"}},
        ):
            pipeline.write_json(path, bad)
            with self.subTest(config=bad), self.assertRaises(ValueError):
                pipeline.load_config(path)

    def test_asset_paths_cannot_escape_snapshot(self):
        self.assertEqual(
            pipeline.safe_asset_path(self.root, "Data\\Mods.datc64"), self.root / "Data/Mods.datc64"
        )
        for name in ("../escape", "Data/../../escape", str(self.root.parent / "escape")):
            with self.subTest(path=name), self.assertRaises(ValueError):
                pipeline.safe_asset_path(self.root, name)

    def test_validation_catches_dangling_references_and_bad_ranges(self):
        values = dataset(self.root)
        self.assertEqual(pipeline.validate_dataset(self.root)["mods"], 2)
        mutations = [
            ("base_items", lambda v: v["Metadata/Items/Belts/Belt3"].update(implicits=["missing"])),
            ("base_items", lambda v: v["Metadata/Items/Belts/Belt3"].update(item_class="missing")),
            ("mods", lambda v: v["IncreasedLife1"]["stats"][0].update(id="missing")),
            ("mods", lambda v: v["IncreasedLife1"]["stats"][0].update(min=30)),
            ("mods", lambda v: v["IncreasedLife1"]["spawn_weights"][0].update(tag="missing")),
            ("mods", lambda v: v["IncreasedLife1"]["spawn_weights"][0].update(weight=-1)),
        ]
        for name, mutate in mutations:
            value = copy.deepcopy(values[name])
            mutate(value)
            pipeline.write_json(self.root / f"{name}.json", value)
            with self.subTest(dataset=name), self.assertRaises(ValueError):
                pipeline.validate_dataset(self.root)
            pipeline.write_json(self.root / f"{name}.json", values[name])

    def test_failed_extraction_preserves_previous_pointer_and_log(self):
        pointer = self.root / "output/poe1/latest.json"
        pipeline.write_json(pointer, {"snapshot": "snapshots/previous"})
        schema = self.root / "schema.json"
        pipeline.write_json(schema, {"tables": []})
        with patch.object(
            pipeline.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)
        ):
            with self.assertRaisesRegex(RuntimeError, "previous snapshot is unchanged"):
                pipeline.run(
                    {"poe1": {"patch": "3.29.3.3"}}, self.root / "output", ["poe1"], schema
                )
        self.assertEqual(pipeline.read_json(pointer), {"snapshot": "snapshots/previous"})
        self.assertEqual(
            len(list((pointer.parent / "snapshots").glob(".incomplete-*/extract.log"))), 1
        )

    def test_successful_run_keeps_separate_game_manifests_and_hashes(self):
        schema = self.root / "schema.json"
        pipeline.write_json(schema, {"tables": []})

        def export(command, **kwargs):
            snapshot = Path(command[command.index("--snapshot") + 1])
            dataset(snapshot / "normalized")
            pipeline.write_json(
                snapshot / "validation.json", pipeline.validate_dataset(snapshot / "normalized")
            )
            return subprocess.CompletedProcess(command, 0)

        config = {"poe1": {"patch": "3.29.3.3"}, "poe2": {"patch": "4.5.5.2"}}
        with patch.object(pipeline.subprocess, "run", side_effect=export):
            pipeline.run(config, self.root, list(config), schema)
        for game, source in config.items():
            snapshot = (
                self.root / game / pipeline.read_json(self.root / game / "latest.json")["snapshot"]
            )
            manifest = pipeline.read_json(snapshot / "manifest.json")
            self.assertEqual((manifest["game"], manifest["patch"]), (game, source["patch"]))
            self.assertEqual(manifest["schema_sha256"], pipeline.digest(schema.read_bytes()))
            for name, expected in manifest["files"].items():
                self.assertEqual(pipeline.digest((snapshot / name).read_bytes()), expected)
            self.assertFalse(snapshot.name.startswith(".incomplete-"))
            self.assertEqual(pipeline.verify(snapshot)["bases"], 1)
            (snapshot / "schema.json").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                pipeline.verify(snapshot)

    def test_patch_handshake_handles_fragmented_responses(self):
        url = "https://patch-poe2.poecdn.com/4.5.5.4/"
        response = bytearray(
            bytes([2]) + bytes(32) + len(url).to_bytes(2, "big") + url.encode("utf-16-le")
        )

        def receive(size):
            part = bytes(response[: min(size, 3)])
            del response[: len(part)]
            return part

        with patch.object(pipeline.socket, "create_connection") as connection:
            connection.return_value.__enter__.return_value.recv.side_effect = receive
            self.assertEqual(pipeline.discover_version("poe2"), "4.5.5.4")
            with self.assertRaisesRegex(ValueError, "Truncated"):
                pipeline.discover_version("poe2")


if __name__ == "__main__":
    unittest.main()
