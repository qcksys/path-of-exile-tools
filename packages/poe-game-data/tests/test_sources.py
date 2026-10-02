import hashlib
from pathlib import Path
import struct
import tempfile
import unittest

import pipeline


def ggpk_fixture(version, name, data):
    encoding = "utf-32-le" if version == 4 else "utf-16-le"
    terminator = "\0".encode(encoding)

    def record(tag, body):
        return struct.pack("<I4s", len(body) + 8, tag) + body

    file_record = record(
        b"FILE",
        struct.pack("<I", len(name) + 1)
        + hashlib.sha256(data).digest()
        + (name + "\0").encode(encoding)
        + data,
    )
    directory_size = 48 + len(terminator) + 12
    root = record(
        b"PDIR",
        struct.pack("<II", 1, 1)
        + bytes(32)
        + terminator
        + struct.pack("<Iq", 0, 28 + directory_size),
    )
    free_offset = 28 + len(root) + len(file_record)
    header = record(b"GGPK", struct.pack("<Iqq", version, 28, free_offset))
    return header + root + file_record + record(b"FREE", struct.pack("<q", 0))


class SourceTests(unittest.TestCase):
    def test_ggpk_utf16_and_utf32_sources_are_read_without_modification(self):
        for version in (2, 4):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as directory:
                archive = Path(directory) / "Content.ggpk"
                content = ggpk_fixture(version, "fixture.bin", b"raw client bytes")
                archive.write_bytes(content)
                raw = Path(directory) / "recorded"
                filesystem = pipeline.create_file_system("poe1", {"directory": directory}, raw)
                self.assertEqual(filesystem.get_file("fixture.bin"), b"raw client bytes")
                self.assertEqual((raw / "fixture.bin").read_bytes(), b"raw client bytes")
                self.assertEqual(
                    filesystem.inputs["fixture.bin"]["sha256"], pipeline.digest(b"raw client bytes")
                )
                self.assertEqual(archive.read_bytes(), content)

    def test_unpacked_files_preserve_logical_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Data/Balance/fixture.datc64"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"table bytes")
            filesystem = pipeline.create_file_system(
                "poe2", {"directory": directory}, Path(directory) / "recorded"
            )
            self.assertEqual(filesystem.get_file("Data/Balance/fixture.datc64"), b"table bytes")


if __name__ == "__main__":
    unittest.main()
