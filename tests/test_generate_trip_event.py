"""
test_generate_trip_event.py: Unit tests for credential-free trip event generation.
Part of the shared multi-trip publishing workflow; all Drive response data is synthetic.
"""

from __future__ import annotations

from contextlib import redirect_stderr
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "generate_trip_event.py"
FIXTURE_PATH = REPOSITORY_ROOT / "tests" / "fixtures" / "embedded_folder_view.html"
MODULE_SPEC = importlib.util.spec_from_file_location("generate_trip_event", MODULE_PATH)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError(f"Could not load generator module from {MODULE_PATH}")
GENERATOR = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = GENERATOR
MODULE_SPEC.loader.exec_module(GENERATOR)


class FolderReferenceTests(unittest.TestCase):
    """Verify strict folder reference and resource-key extraction."""

    def test_extract_folder_id_from_id_and_supported_urls(self) -> None:
        """Accept raw IDs, folder paths, and embedded-view query parameters."""
        folder_id = "SYNTHETIC_FOLDER_ID_12345"
        references = (
            folder_id,
            f"https://drive.google.com/drive/folders/{folder_id}?usp=sharing",
            f"https://drive.google.com/embeddedfolderview?id={folder_id}",
        )
        self.assertEqual([GENERATOR.extract_folder_id(value) for value in references], [folder_id] * 3)

    def test_extract_folder_id_rejects_non_folder_url(self) -> None:
        """Reject URLs whose host or identifier shape cannot represent a Drive folder."""
        with self.assertRaises(GENERATOR.GeneratorError):
            GENERATOR.extract_folder_id("https://example.test/drive/folders/not-drive")

    def test_extract_resource_key_when_present(self) -> None:
        """Retain the optional link-sharing resource key without inventing one."""
        folder_id = "SYNTHETIC_FOLDER_ID_12345"
        url = f"https://drive.google.com/drive/folders/{folder_id}?resourcekey=SYNTHETIC_KEY"
        self.assertEqual(GENERATOR.extract_resource_key(url), "SYNTHETIC_KEY")
        self.assertEqual(GENERATOR.extract_resource_key(folder_id), "")


class FolderParserTests(unittest.TestCase):
    """Verify representative embedded-folder parsing and defensive failure behavior."""

    def test_parse_representative_embedded_folder_fixture(self) -> None:
        """Classify files, folders, shortcuts, native documents, and resource keys."""
        items = GENERATOR.parse_embedded_folder_view(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(len(items), 7)
        self.assertEqual(
            [item.kind for item in items],
            ["file", "file", "file", "file", "folder", "shortcut", "google-native"],
        )
        self.assertEqual(items[1].resource_key, "SYNTHETIC_KEY")

    def test_parse_rejects_unexpected_response(self) -> None:
        """Fail actionably instead of treating an incomplete response as an empty folder."""
        with self.assertRaises(GENERATOR.FolderParseError):
            GENERATOR.parse_embedded_folder_view("<html><body>missing title</body></html>")


class MediaSelectionTests(unittest.TestCase):
    """Verify supported media filtering, skip reporting, and natural order."""

    def test_natural_sorting(self) -> None:
        """Sort digit runs numerically while retaining case-insensitive filename order."""
        names = ["photo10.jpg", "Photo2.jpg", "photo1.jpg", "photo02.jpg"]
        self.assertEqual(
            sorted(names, key=GENERATOR.natural_sort_key),
            ["photo1.jpg", "Photo2.jpg", "photo02.jpg", "photo10.jpg"],
        )

    def test_media_filtering_reports_every_skipped_kind(self) -> None:
        """Include images and videos while reporting unsupported direct children."""
        parsed = GENERATOR.parse_embedded_folder_view(FIXTURE_PATH.read_text(encoding="utf-8"))
        report = io.StringIO()
        selected = GENERATOR.select_media_items(parsed, report)
        self.assertEqual([item.name for item in selected], ["clip1.mp4", "photo2.jpg", "photo10.jpg"])
        diagnostics = report.getvalue()
        self.assertIn("Skipped unsupported file: notes.pdf", diagnostics)
        self.assertIn("Skipped nested folder: nested-album", diagnostics)
        self.assertIn("Skipped shortcut: linked-photo.jpg", diagnostics)
        self.assertIn("Skipped Google-native document: itinerary", diagnostics)


class SerializationTests(unittest.TestCase):
    """Verify JavaScript-safe schema serialization and Drive resource-key preservation."""

    def test_js_string_literal_escapes_special_characters(self) -> None:
        """Escape quotes, slashes, control characters, and JavaScript line separators."""
        literal = GENERATOR.js_string_literal('a"b\\c\n\u2028.jpg')
        self.assertEqual(literal, '"a\\"b\\\\c\\n\\u2028.jpg"')

    def test_serialize_event_uses_existing_schema(self) -> None:
        """Emit one complete event with empty descriptions and visible media defaults."""
        item = GENERATOR.DriveItem(
            "BBBBBBBBBBBBBBBBBBBBBBBBB",
            "photo2.jpg",
            "file",
            "SYNTHETIC_KEY",
        )
        source = GENERATOR.serialize_event([item])
        self.assertTrue(source.startswith("window.GALLERY_ITEMS = [\n"))
        self.assertIn('name: "photo2.jpg"', source)
        self.assertIn("resourcekey=SYNTHETIC_KEY", source)
        self.assertIn('desc: "", visible: true', source)
        self.assertTrue(source.endswith("];\n"))


class OutputSafetyTests(unittest.TestCase):
    """Verify replacement consent and atomic destination safeguards."""

    def test_existing_output_refusal_preserves_bytes(self) -> None:
        """Leave an existing file byte-for-byte unchanged after a declined replacement."""
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "event.js"
            original = b"existing\x00content"
            output_path.write_bytes(original)
            report = io.StringIO()
            with mock.patch.object(GENERATOR.sys.stdin, "isatty", return_value=True):
                allowed = GENERATOR.should_replace_output(
                    output_path,
                    overwrite=False,
                    confirm=lambda _prompt: "no",
                    report_stream=report,
                )
            self.assertFalse(allowed)
            self.assertEqual(output_path.read_bytes(), original)
            self.assertIn("removes descriptions", report.getvalue())

    def test_existing_output_acceptance_requires_explicit_yes(self) -> None:
        """Allow interactive replacement only after an affirmative answer."""
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "event.js"
            output_path.write_text("existing", encoding="utf-8")
            with mock.patch.object(GENERATOR.sys.stdin, "isatty", return_value=True):
                allowed = GENERATOR.should_replace_output(
                    output_path,
                    overwrite=False,
                    confirm=lambda _prompt: "yes",
                    report_stream=io.StringIO(),
                )
            self.assertTrue(allowed)

    def test_atomic_write_rejects_event_registry(self) -> None:
        """Prevent the generator from ever replacing a trip's events.js registry."""
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(GENERATOR.GeneratorError):
                GENERATOR.write_event_atomically(Path(directory) / "events.js", "content")


if __name__ == "__main__":
    with redirect_stderr(sys.stderr):
        unittest.main()
