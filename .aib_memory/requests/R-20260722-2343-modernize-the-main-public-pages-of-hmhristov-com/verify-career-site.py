"""
verify-career-site.py: Static acceptance checks for the four-page career presentation.
Part of AIB request R-20260722-2343 and intended to run without third-party packages.
"""

from __future__ import annotations

import re
import unittest
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


PAGE_NAVIGATION = {
    "index.html": "Home",
    "cv.html": "Professional",
    "apps.html": "Projects",
    "art_drawing.html": "Creative",
}
NAVIGATION_LABELS = ["Home", "Professional", "Projects", "Creative"]
NAVIGATION_HREFS = list(PAGE_NAVIGATION)
SOCIAL_IMAGES = {
    "index.html": "images/social/home-preview.jpg",
    "cv.html": "images/social/professional-preview.jpg",
    "apps.html": "images/social/projects-preview.jpg",
    "art_drawing.html": "images/social/creative-preview.jpg",
}
ARTWORK_PATHS = {
    "art/201501_IMG_6502_23.JPG",
    "art/201503_IMG_6503_23.JPG",
    "art/201505_DSC06570_23.JPG",
    "art/201506_IMG_7038_23.JPG",
    "art/201506_IMG_7088_23.JPG",
    "art/201506_IMG_7093_23.JPG",
    "art/201507_IMG_7084_23.JPG",
    "art/201507_IMG_7101_23.JPG",
    "art/201507_IMG_7149_23.JPG",
    "art/201508_IMG_7202_23.JPG",
    "art/201508_IMG_7480_23.JPG",
    "art/201602_IMG_9755_23.JPG",
    "art/201604_DSC01268_23.JPG",
}
JPEG_START_OF_FRAME_MARKERS = {
    0xC0,
    0xC1,
    0xC2,
    0xC3,
    0xC5,
    0xC6,
    0xC7,
    0xC9,
    0xCA,
    0xCB,
    0xCD,
    0xCE,
    0xCF,
}


class CareerPageParser(HTMLParser):
    """Collects source-level page structure without altering or rendering the document."""

    def __init__(self) -> None:
        """Initialize counters and element collections used by the acceptance tests."""
        super().__init__(convert_charrefs=True)
        self.anchors: list[dict[str, str]] = []
        self.body_classes: set[str] = set()
        self.canonical_urls: list[str] = []
        self.class_counts: Counter[str] = Counter()
        self.figure_sections: Counter[str] = Counter()
        self.images: list[dict[str, str]] = []
        self.inline_handlers: list[str] = []
        self.inline_style_count = 0
        self.landmarks: Counter[str] = Counter()
        self.links: list[dict[str, str]] = []
        self.metas: list[dict[str, str]] = []
        self.navigation_anchors: list[dict[str, str]] = []
        self.scripts: list[dict[str, str]] = []
        self.section_stack: list[str] = []
        self.title = ""
        self._active_anchor: dict[str, str] | None = None
        self._inside_navigation = False
        self._inside_title = False

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        """Collect relevant attributes and structural counts for an opening tag."""
        attributes = {name: value or "" for name, value in attrs}
        classes = set(attributes.get("class", "").split())
        self.class_counts.update(classes)

        for name in attributes:
            if name.lower().startswith("on"):
                self.inline_handlers.append(name)
        if "style" in attributes:
            self.inline_style_count += 1

        if tag in {"header", "nav", "main", "footer"}:
            self.landmarks[tag] += 1
        if tag == "html":
            self.landmarks["lang=en"] += attributes.get("lang") == "en"
        if tag == "body":
            self.body_classes = classes
        if tag == "title":
            self._inside_title = True
        if tag == "meta":
            self.metas.append(attributes)
        if tag == "link":
            self.links.append(attributes)
            if "canonical" in attributes.get("rel", "").split():
                self.canonical_urls.append(attributes.get("href", ""))
        if tag == "script":
            self.scripts.append(attributes)
        if tag == "img":
            self.images.append(attributes)
        if tag == "section":
            section_name = attributes.get("aria-labelledby", attributes.get("id", ""))
            self.section_stack.append(section_name)
        if tag == "figure":
            self.figure_sections[self.section_stack[-1] if self.section_stack else ""] += 1
        if tag == "nav":
            self._inside_navigation = True
        if tag == "a":
            self._active_anchor = dict(attributes)
            self._active_anchor["text"] = ""

    def handle_endtag(self, tag: str) -> None:
        """Finalize collected text and section state for a closing tag."""
        if tag == "title":
            self._inside_title = False
        if tag == "a" and self._active_anchor is not None:
            self._active_anchor["text"] = self._active_anchor["text"].strip()
            self.anchors.append(self._active_anchor)
            if self._inside_navigation:
                self.navigation_anchors.append(self._active_anchor)
            self._active_anchor = None
        if tag == "nav":
            self._inside_navigation = False
        if tag == "section" and self.section_stack:
            self.section_stack.pop()

    def handle_data(self, data: str) -> None:
        """Append text content for title and active anchor collection."""
        if self._inside_title:
            self.title += data
        if self._active_anchor is not None:
            self._active_anchor["text"] += data


def parse_page(path: Path) -> CareerPageParser:
    """
    Parse one HTML source file into the acceptance-test collector.

    Args:
        path: HTML file to inspect.

    Returns:
        A populated CareerPageParser.
    """
    parser = CareerPageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def meta_content(parser: CareerPageParser, key: str, value: str) -> list[str]:
    """
    Return metadata content values matching one attribute pair.

    Args:
        parser: Parsed page collector.
        key: Metadata attribute name, such as name or property.
        value: Required metadata attribute value.

    Returns:
        All matching content values in source order.
    """
    return [meta.get("content", "") for meta in parser.metas if meta.get(key) == value]


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    """
    Read JPEG width and height directly from a start-of-frame segment.

    Args:
        path: JPEG file to inspect.

    Returns:
        Width and height in pixels.

    Raises:
        ValueError: If the file lacks a recognized JPEG dimension segment.
    """
    data = path.read_bytes()
    offset = 2
    while offset + 8 < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in {0xD8, 0xD9}:
            continue
        segment_length = int.from_bytes(data[offset:offset + 2], "big")
        offset += 2
        if marker in JPEG_START_OF_FRAME_MARKERS:
            height = int.from_bytes(data[offset + 1:offset + 3], "big")
            width = int.from_bytes(data[offset + 3:offset + 5], "big")
            return width, height
        offset += segment_length - 2
    raise ValueError(f"No JPEG dimensions found in {path}")


class CareerSiteAcceptanceTests(unittest.TestCase):
    """Verifies the static career-site contract and owns no shared external resources."""

    @classmethod
    def setUpClass(cls) -> None:
        """Load the four source pages once for all static assertions."""
        cls.workspace = Path(__file__).resolve().parents[3]
        cls.sources = {
            name: (cls.workspace / name).read_text(encoding="utf-8")
            for name in PAGE_NAVIGATION
        }
        cls.pages = {
            name: parse_page(cls.workspace / name)
            for name in PAGE_NAVIGATION
        }

    def test_semantic_navigation_and_current_page(self) -> None:
        """Every page exposes identical source navigation and one correct current marker."""
        for name, current_label in PAGE_NAVIGATION.items():
            with self.subTest(page=name):
                page = self.pages[name]
                self.assertEqual(page.landmarks["lang=en"], 1)
                self.assertEqual(
                    [page.landmarks[item] for item in ("header", "nav", "main", "footer")],
                    [1, 1, 1, 1],
                )
                self.assertIn("site-page", page.body_classes)
                self.assertEqual(
                    [anchor["text"] for anchor in page.navigation_anchors],
                    NAVIGATION_LABELS,
                )
                self.assertEqual(
                    [anchor["href"] for anchor in page.navigation_anchors],
                    NAVIGATION_HREFS,
                )
                current = [
                    anchor
                    for anchor in page.navigation_anchors
                    if anchor.get("aria-current") == "page"
                ]
                self.assertEqual(len(current), 1)
                self.assertEqual(current[0]["text"], current_label)

    def test_unique_complete_social_metadata(self) -> None:
        """Titles, descriptions, canonicals, and Open Graph fields are complete and unique."""
        titles: set[str] = set()
        descriptions: set[str] = set()
        canonicals: set[str] = set()
        for name, expected_image in SOCIAL_IMAGES.items():
            with self.subTest(page=name):
                page = self.pages[name]
                description = meta_content(page, "name", "description")
                self.assertEqual(len(description), 1)
                self.assertEqual(len(page.canonical_urls), 1)
                titles.add(page.title.strip())
                descriptions.add(description[0])
                canonicals.add(page.canonical_urls[0])
                for property_name in (
                    "og:title",
                    "og:description",
                    "og:url",
                    "og:type",
                    "og:image",
                    "og:image:alt",
                ):
                    self.assertEqual(len(meta_content(page, "property", property_name)), 1)
                self.assertEqual(
                    meta_content(page, "property", "og:image"),
                    [f"https://hmhristov.com/{expected_image}"],
                )
        self.assertEqual(len(titles), 4)
        self.assertEqual(len(descriptions), 4)
        self.assertEqual(len(canonicals), 4)

    def test_social_preview_files(self) -> None:
        """All referenced social cards exist as optimized 1200 by 630 JPEG files."""
        for relative_path in SOCIAL_IMAGES.values():
            with self.subTest(image=relative_path):
                image_path = self.workspace / relative_path
                self.assertTrue(image_path.is_file())
                self.assertEqual(jpeg_dimensions(image_path), (1200, 630))
                self.assertLess(image_path.stat().st_size, 500_000)

    def test_projects_contract(self) -> None:
        """Projects contains exactly two cards and exactly the two supported launch routes."""
        page = self.pages["apps.html"]
        self.assertEqual(page.class_counts["project-card"], 2)
        href_counts = Counter(anchor.get("href", "") for anchor in page.anchors)
        self.assertEqual(href_counts["apps/PUK_English_Words.html"], 1)
        self.assertEqual(href_counts["apps/hhwords/index.html"], 1)

    def test_artwork_contract(self) -> None:
        """Creative contains all thirteen intrinsic, lazy-loaded works in the 10/3 grouping."""
        page = self.pages["art_drawing.html"]
        artwork_images = [image for image in page.images if image.get("src", "").startswith("art/")]
        self.assertEqual(page.class_counts["art-card"], 13)
        self.assertEqual(page.figure_sections["oils-title"], 10)
        self.assertEqual(page.figure_sections["watercolors-title"], 3)
        self.assertEqual({image["src"] for image in artwork_images}, ARTWORK_PATHS)
        self.assertTrue(all(image.get("width") and image.get("height") for image in artwork_images))
        self.assertTrue(all(image.get("loading") == "lazy" for image in artwork_images))
        self.assertTrue(all(image.get("alt", "").strip() for image in artwork_images))

    def test_portrait_loading_contract(self) -> None:
        """Home loads the principal portrait eagerly with its known intrinsic dimensions."""
        portraits = [
            image
            for image in self.pages["index.html"].images
            if image.get("src") == "images/HHristov_20240407_110742.jpg"
        ]
        self.assertEqual(len(portraits), 1)
        self.assertEqual(portraits[0].get("width"), "600")
        self.assertEqual(portraits[0].get("height"), "800")
        self.assertEqual(portraits[0].get("loading"), "eager")

    def test_source_safety_and_scope(self) -> None:
        """Pages avoid inline handlers, unsafe links, third-party scripts, and China promotion."""
        unsafe_protocol = re.compile(r"^(?:javascript|data):", re.IGNORECASE)
        for name, page in self.pages.items():
            with self.subTest(page=name):
                self.assertEqual(page.inline_handlers, [])
                self.assertEqual(page.inline_style_count, 0)
                self.assertNotIn("202507_china", self.sources[name])
                self.assertEqual(
                    [script.get("src") for script in page.scripts],
                    ["js/site.js"],
                )
                self.assertEqual(
                    [link.get("href") for link in page.links if "stylesheet" in link.get("rel", "")],
                    ["css/main.css"],
                )
                for anchor in page.anchors:
                    href = anchor.get("href", "")
                    self.assertIsNone(unsafe_protocol.match(href))
                    if anchor.get("target") == "_blank":
                        relationships = set(anchor.get("rel", "").split())
                        self.assertTrue({"noopener", "noreferrer"}.issubset(relationships))


if __name__ == "__main__":
    unittest.main(verbosity=2)
