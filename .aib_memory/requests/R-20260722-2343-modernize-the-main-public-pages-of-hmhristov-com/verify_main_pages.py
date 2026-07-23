"""
verify_main_pages.py: Source-level acceptance checks for the four-page career site.
Part of AIB request R-20260722-2343 verification evidence.
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import struct


WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
PAGE_FILES = ("index.html", "cv.html", "apps.html", "art_drawing.html")
NAVIGATION = (
    ("index.html", "Home"),
    ("cv.html", "Professional"),
    ("apps.html", "Projects"),
    ("art_drawing.html", "Creative"),
)
SOCIAL_IMAGES = {
    "index.html": "images/social/home-preview.jpg",
    "cv.html": "images/social/professional-preview.jpg",
    "apps.html": "images/social/projects-preview.jpg",
    "art_drawing.html": "images/social/creative-preview.jpg",
}
ART_IMAGES = {
    "art/201501_IMG_6502_23.JPG": (250, 339),
    "art/201503_IMG_6503_23.JPG": (276, 279),
    "art/201505_DSC06570_23.JPG": (545, 412),
    "art/201506_IMG_7038_23.JPG": (401, 325),
    "art/201506_IMG_7088_23.JPG": (270, 381),
    "art/201506_IMG_7093_23.JPG": (347, 462),
    "art/201507_IMG_7084_23.JPG": (292, 391),
    "art/201507_IMG_7101_23.JPG": (289, 362),
    "art/201508_IMG_7202_23.JPG": (435, 320),
    "art/201602_IMG_9755_23.JPG": (357, 445),
    "art/201507_IMG_7149_23.JPG": (437, 307),
    "art/201508_IMG_7480_23.JPG": (355, 495),
    "art/201604_DSC01268_23.JPG": (507, 410),
}
FORBIDDEN_SOURCE_PATTERN = re.compile(
    r"202507_china|fonts\.(?:googleapis|gstatic)|"
    r"<script[^>]+src=[\"']https?://|\son[a-z]+\s*=",
    re.IGNORECASE,
)


class PageParser(HTMLParser):
    """Collect the source attributes and link text needed by acceptance checks."""

    def __init__(self) -> None:
        """Initialize empty tag, link, and title collections."""
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict[str, str]]] = []
        self.links: list[tuple[dict[str, str], str]] = []
        self.title = ""
        self._active_link: dict[str, str] | None = None
        self._active_link_text: list[str] = []
        self._inside_title = False

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        """Store normalized start-tag attributes and begin link/title capture."""
        normalized_attrs = {name: value or "" for name, value in attrs}
        self.tags.append((tag, normalized_attrs))
        if tag == "a":
            self._active_link = normalized_attrs
            self._active_link_text = []
        elif tag == "title":
            self._inside_title = True

    def handle_data(self, data: str) -> None:
        """Collect human-readable anchor and document-title text."""
        if self._active_link is not None:
            self._active_link_text.append(data)
        if self._inside_title:
            self.title += data

    def handle_endtag(self, tag: str) -> None:
        """Finish active anchor or document-title capture."""
        if tag == "a" and self._active_link is not None:
            link_text = " ".join("".join(self._active_link_text).split())
            self.links.append((self._active_link, link_text))
            self._active_link = None
            self._active_link_text = []
        elif tag == "title":
            self._inside_title = False


def _require(condition: bool, message: str) -> None:
    """Raise a readable verification failure when a condition is false."""
    if not condition:
        raise AssertionError(message)


def _class_tokens(attrs: dict[str, str]) -> set[str]:
    """Return the whitespace-separated class tokens for one element."""
    return set(attrs.get("class", "").split())


def _parse_page(page_path: Path) -> tuple[str, PageParser]:
    """Read and parse one UTF-8 source page."""
    source = page_path.read_text(encoding="utf-8")
    parser = PageParser()
    parser.feed(source)
    return source, parser


def _tags(
    parser: PageParser,
    tag_name: str,
) -> list[dict[str, str]]:
    """Return normalized attributes for all matching start tags."""
    return [attrs for tag, attrs in parser.tags if tag == tag_name]


def _meta_content(
    parser: PageParser,
    attribute_name: str,
    attribute_value: str,
) -> list[str]:
    """Return content values for matching metadata declarations."""
    return [
        attrs.get("content", "")
        for attrs in _tags(parser, "meta")
        if attrs.get(attribute_name) == attribute_value
    ]


def _verify_common_page(page_name: str) -> None:
    """Verify navigation, metadata, resilience, and external-link safety."""
    source, parser = _parse_page(WORKSPACE_ROOT / page_name)
    _require(not FORBIDDEN_SOURCE_PATTERN.search(source), f"{page_name}: forbidden source")
    _require(parser.title.strip(), f"{page_name}: missing title")

    body_tags = _tags(parser, "body")
    _require(len(body_tags) == 1, f"{page_name}: expected one body")
    _require("site-page" in _class_tokens(body_tags[0]), f"{page_name}: missing site-page")

    navigation_links = [
        (attrs.get("href", ""), text)
        for attrs, text in parser.links
        if "site-nav__link" in _class_tokens(attrs)
    ]
    _require(tuple(navigation_links) == NAVIGATION, f"{page_name}: navigation mismatch")
    current_links = [
        attrs for attrs, _ in parser.links if attrs.get("aria-current") == "page"
    ]
    _require(len(current_links) == 1, f"{page_name}: expected one current page")

    canonical_links = [
        attrs.get("href", "")
        for attrs in _tags(parser, "link")
        if attrs.get("rel") == "canonical"
    ]
    _require(len(canonical_links) == 1, f"{page_name}: canonical mismatch")
    _require(len(_meta_content(parser, "name", "description")) == 1, f"{page_name}: description")
    for property_name in (
        "og:title",
        "og:description",
        "og:url",
        "og:type",
        "og:image",
        "og:image:alt",
    ):
        values = _meta_content(parser, "property", property_name)
        _require(len(values) == 1 and values[0], f"{page_name}: missing {property_name}")

    expected_social_url = f"https://hmhristov.com/{SOCIAL_IMAGES[page_name]}"
    social_values = _meta_content(parser, "property", "og:image")
    _require(social_values == [expected_social_url], f"{page_name}: social image mismatch")

    external_links = [
        attrs for attrs, _ in parser.links if attrs.get("target") == "_blank"
    ]
    for attrs in external_links:
        relationship_tokens = set(attrs.get("rel", "").split())
        _require(
            {"noopener", "noreferrer"} <= relationship_tokens,
            f"{page_name}: unsafe external link {attrs.get('href', '')}",
        )


def _verify_project_page() -> None:
    """Verify exactly two project cards and their direct destinations."""
    _, parser = _parse_page(WORKSPACE_ROOT / "apps.html")
    project_cards = [
        attrs
        for attrs in _tags(parser, "article")
        if "project-card" in _class_tokens(attrs)
    ]
    _require(len(project_cards) == 2, "apps.html: expected exactly two project cards")
    destinations = {
        attrs.get("href", "")
        for attrs, _ in parser.links
        if attrs.get("href", "").startswith("apps/")
    }
    _require(
        destinations
        == {"apps/PUK_English_Words.html", "apps/hhwords/index.html"},
        "apps.html: project destinations mismatch",
    )


def _verify_art_page() -> None:
    """Verify all thirteen natural-ratio, lazy-loaded artwork references."""
    _, parser = _parse_page(WORKSPACE_ROOT / "art_drawing.html")
    art_images = {
        attrs.get("src", ""): attrs
        for attrs in _tags(parser, "img")
        if "art-card__image" in _class_tokens(attrs)
    }
    _require(set(art_images) == set(ART_IMAGES), "art_drawing.html: artwork mismatch")
    for image_source, (expected_width, expected_height) in ART_IMAGES.items():
        attrs = art_images[image_source]
        _require(attrs.get("loading") == "lazy", f"{image_source}: not lazy")
        _require(attrs.get("width") == str(expected_width), f"{image_source}: width")
        _require(attrs.get("height") == str(expected_height), f"{image_source}: height")
        _require(bool(attrs.get("alt", "").strip()), f"{image_source}: missing alt")


def _read_jpeg_dimensions(image_path: Path) -> tuple[int, int]:
    """Read JPEG dimensions from a start-of-frame marker without third-party code."""
    with image_path.open("rb") as image_file:
        _require(image_file.read(2) == b"\xff\xd8", f"{image_path}: invalid JPEG")
        while True:
            marker_prefix = image_file.read(1)
            _require(marker_prefix, f"{image_path}: missing JPEG size marker")
            if marker_prefix != b"\xff":
                continue
            marker = image_file.read(1)
            while marker == b"\xff":
                marker = image_file.read(1)
            segment_length = struct.unpack(">H", image_file.read(2))[0]
            if marker in {b"\xc0", b"\xc1", b"\xc2", b"\xc3"}:
                image_file.read(1)
                height, width = struct.unpack(">HH", image_file.read(4))
                return width, height
            image_file.seek(segment_length - 2, 1)


def _verify_social_images() -> None:
    """Verify that every page-specific social JPEG is exactly 1200 by 630."""
    for relative_path in SOCIAL_IMAGES.values():
        image_path = WORKSPACE_ROOT / relative_path
        _require(image_path.is_file(), f"{relative_path}: missing")
        _require(
            _read_jpeg_dimensions(image_path) == (1200, 630),
            f"{relative_path}: dimensions mismatch",
        )


def main() -> None:
    """Run all source acceptance checks and print a compact success summary."""
    for page_name in PAGE_FILES:
        _verify_common_page(page_name)
    _verify_project_page()
    _verify_art_page()
    _verify_social_images()
    print("PASS: 4 pages, 4 navigation states, 2 projects, 13 artworks, 4 social images")


if __name__ == "__main__":
    main()
