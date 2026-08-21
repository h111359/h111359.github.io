"""
test_bilingual_portfolio.py: Regression tests for the paired English and Bulgarian portfolio pages.
Part of AIB request R-20260821-2053 and its static bilingual navigation contract.
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SITE_SCRIPT = (REPOSITORY_ROOT / "js" / "site.js").read_text(encoding="utf-8")
PAGE_PAIRS = {
    "index.html": "index-bg.html",
    "cv.html": "cv-bg.html",
    "apps.html": "apps-bg.html",
    "art_drawing.html": "art_drawing-bg.html",
}
REQUIRED_OPEN_GRAPH_FIELDS = {"og:title", "og:description", "og:url", "og:image", "og:image:alt"}


class PortfolioDocumentParser(HTMLParser):
    """Collect metadata and navigation from one portfolio document without owning resources."""

    def __init__(self) -> None:
        """Initialize empty metadata, link, and navigation collections."""
        super().__init__()
        self.document_language = ""
        self.title = ""
        self.meta: dict[str, str] = {}
        self.links: list[dict[str, str]] = []
        self.anchors: list[dict[str, object]] = []
        self.resources: list[str] = []
        self.language_text: list[str] = []
        self._in_title = False
        self._navigation_context = ""
        self._active_anchor: dict[str, object] | None = None

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        """Collect relevant attributes and enter title, navigation, or anchor state."""
        attrs = {name: value or "" for name, value in attributes}
        if tag == "html":
            self.document_language = attrs.get("lang", "")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = attrs.get("name") or attrs.get("property")
            if key:
                self.meta[key] = attrs.get("content", "")
        elif tag == "link":
            self.links.append(attrs)
            if attrs.get("rel") == "stylesheet":
                self.resources.append(attrs.get("href", ""))
        elif tag in {"img", "script"} and attrs.get("src"):
            self.resources.append(attrs["src"])
        elif tag == "nav":
            if "data-site-nav" in attrs:
                self._navigation_context = "primary"
            elif "site-language" in attrs.get("class", "").split():
                self._navigation_context = "language"
        elif tag == "a":
            self._active_anchor = {"attrs": attrs, "context": self._navigation_context, "text": []}

    def handle_data(self, data: str) -> None:
        """Collect title, language-switcher, and active-anchor text."""
        if self._in_title:
            self.title += data
        if self._navigation_context == "language":
            self.language_text.append(data)
        if self._active_anchor is not None:
            anchor_text = self._active_anchor["text"]
            if isinstance(anchor_text, list):
                anchor_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        """Finish title, anchor, and navigation records at their closing tags."""
        if tag == "title":
            self._in_title = False
        elif tag == "a" and self._active_anchor is not None:
            self.anchors.append(self._active_anchor)
            self._active_anchor = None
        elif tag == "nav":
            self._navigation_context = ""


def parse_page(filename: str) -> PortfolioDocumentParser:
    """Parse one repository-root HTML page and return its collected document contract."""
    parser = PortfolioDocumentParser()
    parser.feed((REPOSITORY_ROOT / filename).read_text(encoding="utf-8"))
    return parser


class BilingualPortfolioTests(unittest.TestCase):
    """Verify language pairing, static navigation, metadata, and preference enhancement."""

    def test_every_page_has_localized_metadata_and_language_pair(self) -> None:
        """Require self canonicals, complete alternates, and localized social metadata."""
        for english_filename, bulgarian_filename in PAGE_PAIRS.items():
            expected_alternates = {
                "en": f"https://hmhristov.com/{english_filename}",
                "bg": f"https://hmhristov.com/{bulgarian_filename}",
                "x-default": f"https://hmhristov.com/{english_filename}",
            }
            for filename, language in [(english_filename, "en"), (bulgarian_filename, "bg")]:
                with self.subTest(filename=filename):
                    document = parse_page(filename)
                    canonical = next(link["href"] for link in document.links if link.get("rel") == "canonical")
                    alternates = {
                        link["hreflang"]: link["href"]
                        for link in document.links
                        if link.get("rel") == "alternate"
                    }
                    self.assertEqual(document.document_language, language)
                    self.assertTrue(document.title.strip())
                    self.assertTrue(document.meta["description"])
                    self.assertTrue(REQUIRED_OPEN_GRAPH_FIELDS.issubset(document.meta))
                    self.assertEqual(document.meta["og:url"], canonical)
                    self.assertEqual(canonical, f"https://hmhristov.com/{filename}")
                    self.assertEqual(alternates, expected_alternates)

    def test_primary_and_language_navigation_work_without_javascript(self) -> None:
        """Keep all routes source-visible, language-contained, and current-page aware."""
        for english_filename, bulgarian_filename in PAGE_PAIRS.items():
            for filename, language, counterpart in [
                (english_filename, "en", bulgarian_filename),
                (bulgarian_filename, "bg", english_filename),
            ]:
                with self.subTest(filename=filename):
                    document = parse_page(filename)
                    primary_links = [anchor for anchor in document.anchors if anchor["context"] == "primary"]
                    language_links = [anchor for anchor in document.anchors if anchor["context"] == "language"]
                    current_links = [
                        anchor for anchor in primary_links if anchor["attrs"].get("aria-current") == "page"
                    ]
                    primary_hrefs = [anchor["attrs"]["href"] for anchor in primary_links]
                    language_hrefs = [anchor["attrs"]["href"] for anchor in language_links]
                    self.assertEqual(len(primary_links), 4)
                    self.assertEqual(len(current_links), 1)
                    self.assertEqual(current_links[0]["attrs"]["href"], filename)
                    self.assertEqual(" ".join("".join(document.language_text).split()), "BG | EN")
                    self.assertEqual(set(language_hrefs), {filename, counterpart})
                    if language == "bg":
                        self.assertTrue(all(href.endswith("-bg.html") for href in primary_hrefs))
                    else:
                        self.assertTrue(all(not href.endswith("-bg.html") for href in primary_hrefs))

    def test_bulgarian_projects_keep_the_same_application_urls(self) -> None:
        """Localize only the Projects presentation while preserving application destinations."""
        english_links = [
            anchor["attrs"]["href"]
            for anchor in parse_page("apps.html").anchors
            if anchor["attrs"].get("href", "").startswith("apps/")
        ]
        bulgarian_links = [
            anchor["attrs"]["href"]
            for anchor in parse_page("apps-bg.html").anchors
            if anchor["attrs"].get("href", "").startswith("apps/")
        ]
        self.assertEqual(len(english_links), 6)
        self.assertEqual(bulgarian_links, english_links)

    def test_all_local_page_targets_exist(self) -> None:
        """Prevent broken static links, scripts, stylesheets, and image references."""
        for filename in [*PAGE_PAIRS, *PAGE_PAIRS.values()]:
            document = parse_page(filename)
            references = [anchor["attrs"].get("href", "") for anchor in document.anchors]
            references.extend(document.resources)
            for reference in references:
                if not reference or reference.startswith(("#", "http://", "https://", "mailto:")):
                    continue
                local_path = reference.split("#", 1)[0].split("?", 1)[0]
                with self.subTest(filename=filename, reference=reference):
                    self.assertTrue((REPOSITORY_ROOT / local_path).exists())

    def test_language_preference_redirect_is_limited_to_the_domain_root(self) -> None:
        """Remember either language while redirecting only an exact bare-root visit."""
        self.assertIn('const LANGUAGE_STORAGE_KEY = "portfolio-language"', SITE_SCRIPT)
        self.assertIn("window.localStorage.getItem(LANGUAGE_STORAGE_KEY)", SITE_SCRIPT)
        self.assertIn("window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)", SITE_SCRIPT)
        self.assertIn('currentPath === ROOT_PATH && readLanguagePreference() === "bg"', SITE_SCRIPT)
        self.assertIn("window.location.replace(destination)", SITE_SCRIPT)


if __name__ == "__main__":
    unittest.main()
