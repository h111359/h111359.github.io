"""
test_greece_guide.py: Regression tests for the villa-based Nikiti static guide.
Part of AIB request R-20260821-1337 and its offline catalogue contract.
"""

from __future__ import annotations

from datetime import date
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest
from urllib.parse import parse_qs, urlparse


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
GUIDE_ROOT = REPOSITORY_ROOT / "apps" / "greece-guide"
CATALOGUE = json.loads((GUIDE_ROOT / "catalog-data.json").read_text(encoding="utf-8"))
HTML_SOURCE = (GUIDE_ROOT / "index.html").read_text(encoding="utf-8")
JAVASCRIPT_SOURCE = (GUIDE_ROOT / "app.js").read_text(encoding="utf-8")
CSS_SOURCE = (GUIDE_ROOT / "styles.css").read_text(encoding="utf-8")
SERVICE_WORKER_SOURCE = (GUIDE_ROOT / "sw.js").read_text(encoding="utf-8")
LICENSES = json.loads((GUIDE_ROOT / "images" / "image-licenses.json").read_text(encoding="utf-8"))
ORIGIN = "40.207465355104475,23.676892454034267"


class LinkCollector(HTMLParser):
    """Collect source-visible anchors without owning external resources."""

    def __init__(self) -> None:
        """Initialize an empty anchor collection."""
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._active_href = ""
        self._active_text: list[str] = []

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        """Start collecting text when an anchor opens."""
        if tag == "a":
            self._active_href = dict(attributes).get("href") or ""
            self._active_text = []

    def handle_data(self, data: str) -> None:
        """Collect readable text nested inside the active anchor."""
        if self._active_href:
            self._active_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        """Store the completed anchor when its closing tag is reached."""
        if tag == "a" and self._active_href:
            self.links.append(("".join(self._active_text).strip(), self._active_href))
            self._active_href = ""
            self._active_text = []


class GreeceGuideDataTests(unittest.TestCase):
    """Verify catalogue uniqueness, routes, evidence states, and local assets."""

    def test_food_catalogue_has_fifty_unique_normalized_records(self) -> None:
        """Keep 25 confirmed and 25 sourced unconfirmed dishes without duplicate identifiers."""
        foods = CATALOGUE["foods"]
        self.assertEqual(len(foods), 50)
        self.assertEqual(len({food["id"] for food in foods}), 50)
        self.assertEqual(len({food["normalizedName"].casefold() for food in foods}), 50)
        confirmed = [food for food in foods if food["localStatus"] == "confirmed"]
        unconfirmed = [food for food in foods if food["localStatus"] == "unconfirmed"]
        self.assertEqual((len(confirmed), len(unconfirmed)), (25, 25))
        for food in unconfirmed:
            self.assertEqual(food["statusLabel"], "Не е потвърдено в Никити")
            self.assertEqual(food["priceStatus"], "Няма потвърдена местна цена")
            self.assertEqual(food["offers"], [])
            self.assertGreaterEqual(len(food["sources"]), 2)

    def test_every_local_image_exists_and_is_registered(self) -> None:
        """Require a local file and license record for every structured catalogue image."""
        registered = {image["file"] for image in LICENSES["images"]}
        for collection_name in ["foods", "restaurants", "fish", "sights", "beaches"]:
            for record in CATALOGUE[collection_name]:
                images = record.get("images", [record["image"]] if record.get("image") else [])
                for image in images:
                    image_path = image["src"].removeprefix("images/")
                    self.assertTrue((GUIDE_ROOT / image["src"]).is_file(), image["src"])
                    self.assertIn(image_path, registered)
        for collection_name in ["restaurants", "beaches"]:
            for record in CATALOGUE[collection_name]:
                self.assertTrue(record["imageShortage"] or len(record["images"]) >= 3)

    def test_geographic_records_follow_origin_mode_range_and_order(self) -> None:
        """Enforce walking restaurants, grouped beaches, and driving sights from the villa."""
        origin = CATALOGUE["meta"]["origin"]
        self.assertEqual(f"{origin['latitude']},{origin['longitude']}", ORIGIN)
        restaurants = CATALOGUE["restaurants"]
        self.assertTrue(all(record["route"]["mode"] == "walking" for record in restaurants))
        self.assertEqual(
            [record["route"]["distanceKm"] for record in restaurants],
            sorted(record["route"]["distanceKm"] for record in restaurants),
        )
        sights = CATALOGUE["sights"]
        self.assertTrue(all(record["route"]["mode"] == "driving" for record in sights))
        self.assertTrue(all(record["route"]["durationMinutes"] <= 30 for record in sights))
        self.assertEqual(
            [record["route"]["distanceKm"] for record in sights],
            sorted(record["route"]["distanceKm"] for record in sights),
        )
        beaches = CATALOGUE["beaches"]
        beach_order = [(record["proximityGroup"], record["route"]["distanceKm"]) for record in beaches]
        self.assertEqual(beach_order, sorted(beach_order))
        self.assertTrue(all(record["route"]["mode"] == "walking" for record in beaches if record["proximityGroup"] < 3))
        self.assertTrue(all(record["route"]["mode"] == "driving" for record in beaches if record["proximityGroup"] == 3))
        self.assertTrue(all(record["route"]["durationMinutes"] <= 30 for record in beaches if record["proximityGroup"] == 3))

    def test_restaurants_have_menu_state_and_nonmisleading_gallery_state(self) -> None:
        """Require explicit menu outcomes and object-specific gallery evidence for every restaurant."""
        for restaurant in CATALOGUE["restaurants"]:
            self.assertIn(restaurant["menu"]["status"], {"external", "not-found"})
            if restaurant["menu"]["status"] == "not-found":
                self.assertEqual(restaurant["menu"]["label"], "Не е намерено публично меню")
            for image in restaurant["images"]:
                self.assertNotIn("context", image)

    def test_all_restaurants_have_independent_platform_snapshots(self) -> None:
        """Require dated profile links and suppress numeric ratings below 50 reviews."""
        restaurants = CATALOGUE["restaurants"]
        self.assertEqual(len(restaurants), 21)
        self.assertEqual(len({restaurant["id"] for restaurant in restaurants}), 21)

        qualifying_counts = {"google": 0, "tripadvisor": 0}
        for restaurant in restaurants:
            for platform, hostname in [
                ("google", "google.com"),
                ("tripadvisor", "tripadvisor.com"),
            ]:
                snapshot = restaurant[platform]
                self.assertIsInstance(snapshot, dict, f"{restaurant['id']} {platform}")
                self.assertEqual(set(snapshot), {"rating", "reviews", "url", "verified"})
                self.assertIn(hostname, urlparse(snapshot["url"]).hostname or "")
                date.fromisoformat(snapshot["verified"])
                self.assertEqual(snapshot["rating"] is None, snapshot["reviews"] is None)
                if snapshot["rating"] is not None:
                    self.assertGreaterEqual(snapshot["reviews"], 50)
                    self.assertGreaterEqual(snapshot["rating"], 0)
                    self.assertLessEqual(snapshot["rating"], 5)
                    qualifying_counts[platform] += 1

        self.assertEqual(qualifying_counts, {"google": 17, "tripadvisor": 12})
        avra = next(restaurant for restaurant in restaurants if restaurant["id"] == "avra")
        self.assertGreaterEqual(avra["google"]["reviews"], 50)


class GreeceGuideSourceTests(unittest.TestCase):
    """Verify no-script routes, removed warnings/map code, and offline cache revision."""

    def test_source_visible_google_routes_embed_exact_coordinates_and_modes(self) -> None:
        """Expose two native Google Maps actions per geographic record with exact endpoints."""
        collector = LinkCollector()
        collector.feed(HTML_SOURCE)
        place_links = [href for label, href in collector.links if label == "Място в Google Maps"]
        route_links = [href for label, href in collector.links if label == "Маршрут от вилата"]
        geographic_count = sum(len(CATALOGUE[key]) for key in ["restaurants", "sights", "beaches"])
        self.assertEqual((len(place_links), len(route_links)), (geographic_count, geographic_count))
        for route_url in route_links:
            query = parse_qs(urlparse(route_url).query)
            self.assertEqual(query["origin"], [ORIGIN])
            self.assertIn(query["travelmode"][0], {"walking", "driving"})
            latitude, longitude = query["destination"][0].split(",")
            self.assertTrue(latitude and longitude)

    def test_obsolete_map_and_repeated_warnings_are_removed(self) -> None:
        """Keep the schematic map and generic repeated caveats out of all interface sources."""
        combined_source = "\n".join([HTML_SOURCE, JAVASCRIPT_SOURCE, CSS_SOURCE])
        forbidden_phrases = [
            "Обща интерактивна карта",
            "coordinate-map",
            "map-marker",
            "Рецептата, съставките, наличността и цената могат да се променят",
            "всяка риба може да съдържа кости",
            "Информацията не заменя указанията на ресторанта",
        ]
        for phrase in forbidden_phrases:
            self.assertNotIn(phrase, combined_source)

    def test_source_visible_restaurant_ratings_match_the_display_contract(self) -> None:
        """Keep both platform states visible when scripts fail and enforce the threshold in JavaScript."""
        restaurant_count = len(CATALOGUE["restaurants"])
        fallback_count = sum(
            snapshot["rating"] is None
            for restaurant in CATALOGUE["restaurants"]
            for snapshot in [restaurant["google"], restaurant["tripadvisor"]]
        )
        self.assertEqual(HTML_SOURCE.count("<strong>Google:</strong>"), restaurant_count)
        self.assertEqual(HTML_SOURCE.count("<strong>Tripadvisor:</strong>"), restaurant_count)
        self.assertEqual(HTML_SOURCE.count("Няма достатъчно данни за моментна оценка"), fallback_count)

        for restaurant in CATALOGUE["restaurants"]:
            card_start = HTML_SOURCE.index(f"<h3>{restaurant['name']}</h3>")
            card_end = HTML_SOURCE.index("</article>", card_start)
            card_source = unescape(HTML_SOURCE[card_start:card_end])
            for platform, label in [("google", "Google"), ("tripadvisor", "Tripadvisor")]:
                row_start = card_source.index(f"<strong>{label}:</strong>")
                row_end = card_source.index("</p>", row_start)
                row_source = card_source[row_start:row_end]
                snapshot = restaurant[platform]
                self.assertIn(snapshot["url"], row_source)
                if snapshot["rating"] is None:
                    self.assertIn("Няма достатъчно данни за моментна оценка", row_source)
                else:
                    review_count = f"{snapshot['reviews']:,}".replace(",", " ")
                    self.assertIn(f"{snapshot['rating']:.1f} / 5 · {review_count} отзива", row_source)

        self.assertIn("const MINIMUM_RATING_REVIEWS = 50", JAVASCRIPT_SOURCE)
        self.assertIn("ratingData.reviews >= MINIMUM_RATING_REVIEWS", JAVASCRIPT_SOURCE)
        self.assertIn("hasDisplayableRating(restaurant.google) ? restaurant.google.rating : -1", JAVASCRIPT_SOURCE)

    def test_source_fallback_and_service_worker_share_revision_six(self) -> None:
        """Keep source records complete and pre-cache all structured image collections."""
        self.assertEqual(HTML_SOURCE.count("<article>"), 119)
        self.assertIn("styles.css?v=6", HTML_SOURCE)
        self.assertIn("app.js?v=6", HTML_SOURCE)
        self.assertIn('const CACHE_NAME = "greece-guide-v6"', SERVICE_WORKER_SOURCE)
        self.assertIn('"./catalog-data.json?v=6"', SERVICE_WORKER_SOURCE)
        self.assertIn("Array.isArray(record.images)", SERVICE_WORKER_SOURCE)


if __name__ == "__main__":
    unittest.main()
