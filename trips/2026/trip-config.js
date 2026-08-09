/**
 * trip-config.js: Copy-ready identity, interface copy, and theme settings for a new trip.
 * Defines window.GALLERY_TRIP_CONFIG for the reusable static trip gallery.
 */

window.GALLERY_TRIP_CONFIG = {
  // Use a BCP 47 language tag for the document and a supported Intl locale for date formatting.
  language: "en",
  locale: "en-US",
  pageTitle: "Събития през 202608",
  heroEyebrow: "2026 година",
  heading: "Пътувания и събития на семейството през 2026 година",
  subtitle: "Какво ни се случи през 2026 година",
  // Leave empty to derive a date range and event count from the event registry.
  tripFacts: "",
  pageDescription: "A family trip journal with photos, videos, and stories.",
  // Remove unchanged theme values; the shared stylesheet supplies complete defaults.
  theme: {
    accent: "#9f2f2a",
    accentStrong: "#74201e",
    accentSoft: "#f2dfd8",
    secondary: "#315e54",
    secondarySoft: "#dce7df"
  },
  // Override any shared English label here when publishing in another language.
  labels: {}
};
