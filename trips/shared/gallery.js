/**
 * gallery.js: Reusable accessible controller for static trip journals.
 * Provides trip configuration, event loading, corrected-media rendering, navigation, and modal focus handling.
 */

(function () {
  "use strict";

  /* ============================================================
     Configuration and State
     ============================================================ */

  const HASH_EVENT_KEY = "event";
  const EVENT_DATA_SCRIPT_ID = "eventDataScript";
  const THUMBNAIL_WIDTH = 1600;
  const IMAGE_ZOOM_MIN = 1;
  const IMAGE_ZOOM_MAX = 4;
  const IMAGE_ZOOM_STEP = 0.25;
  const ICON_VIEW_BOX = "0 0 24 24";
  const QUARTER_TURN_DEGREES = 90;
  const HALF_ROTATION_DEGREES = 180;
  const FULL_ROTATION_DEGREES = 360;
  const MEDIA_ORIENTATION_CLASSES = Object.freeze([
    "media-card--portrait",
    "media-card--square",
    "media-card--landscape"
  ]);
  const LIGHTBOX_ORIENTATION_CLASSES = Object.freeze([
    "lightbox__body--portrait",
    "lightbox__body--square",
    "lightbox__body--landscape"
  ]);
  // Shared defaults localize new controls without overwriting authored trip labels.
  const BOOK_LABELS = Object.freeze({
    en: { previousEvent: "Previous event", nextEvent: "Next event", eventNavigation: "Browse events",
      previousItem: "Previous item", nextItem: "Next item", itemNavigation: "Browse items",
      itemDestination: "Item {number}: {title}", itemPosition: "{number} / {total}",
      firstItem: "First page", lastItem: "Last page", pageNumber: "Page number", textNoun: "Text",
      zoomIn: "Zoom in", zoomOut: "Zoom out" },
    bg: { previousEvent: "Предишно събитие", nextEvent: "Следващо събитие", eventNavigation: "Преглед на събития",
      previousItem: "Предишен елемент", nextItem: "Следващ елемент", itemNavigation: "Преглед на елементи",
      itemDestination: "Елемент {number}: {title}", itemPosition: "{number} / {total}",
      firstItem: "Първа страница", lastItem: "Последна страница", pageNumber: "Номер на страница", textNoun: "Текст",
      zoomIn: "Увеличи", zoomOut: "Намали" }
  });

  const DEFAULT_LABELS = Object.freeze({
    skipLink: "Skip to content",
    openNavigator: "Open event navigator",
    events: "Events",
    navigatorAria: "Trip events",
    routeKicker: "Каталог",
    journalHeading: "Журал на събитията",
    closeNavigator: "Close event navigator",
    searchLabel: "Търси събития",
    untitledEvent: "Untitled event",
    unknownDate: "Дата не е известна",
    noSearchResults: "No events match the search.",
    filteredSummary: "Showing {visible} of {total}",
    staleLoad: "The event load is no longer current.",
    missingEventData: "No data was defined for event {event}.",
    eventLoadFailed: "Failed to load {path}.",
    imageNoun: "image",
    videoNoun: "video",
    currentEventFallback: "the event",
    openMedia: "Open {media} {number}: {event}",
    imageAlt: "Image {number} — {event}",
    videoAlt: "Video frame {number} — {event}",
    imageUnavailable: "The image could not be loaded. Try opening it.",
    videoUnavailable: "The frame could not be loaded. The video can still be opened.",
    retry: "Try again",
    emptyEvent: "This event has no content to display.",
    loadingContent: "Loading photos and stories…",
    contentLoading: "Content is loading.",
    contentLoadFailed: "The content could not be loaded.",
    eventFailure: "There was a problem loading this event. Check the connection and try again.",
    videoUrlErrorLog: "The video URL could not be processed:",
    mediaPreview: "Preview of {media}: {event}",
    eventErrorLog: "The event could not be loaded:",
    tripUnavailable: "The trip could not be loaded",
    registryMissing: "The event registry is empty.",
    noTripEvents: "No trip events are currently available.",
    noEvents: "No events"
  });
  const DEFAULT_TRIP_CONFIG = Object.freeze({
    language: "en",
    locale: "en-US",
    pageTitle: "Trip journal",
    heroEyebrow: "Travel journal",
    heading: "Trip journal",
    subtitle: "Photos, videos, and stories",
    tripFacts: "",
    pageDescription: "A static family trip journal with photos, videos, and stories.",
    theme: Object.freeze({}),
    labels: DEFAULT_LABELS
  });
  const THEME_PROPERTY_MAP = Object.freeze({
    canvas: "--color-canvas",
    surface: "--color-surface",
    surfaceRaised: "--color-surface-raised",
    ink: "--color-ink",
    inkSoft: "--color-ink-soft",
    inkMuted: "--color-ink-muted",
    accent: "--color-lacquer",
    accentStrong: "--color-lacquer-deep",
    accentSoft: "--color-lacquer-pale",
    secondary: "--color-jade",
    secondarySoft: "--color-jade-pale",
    focus: "--color-focus",
    heroWash: "--color-hero-wash"
  });
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "iframe",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  // Matches the first YYYYMMDD sequence in a registry slug or title.
  const EVENT_DATE_PATTERN = /(\d{4})(\d{2})(\d{2})/;
  // Removes a technical YYYYMMDD and optional sequence prefix from a registry title.
  const EVENT_TITLE_PREFIX_PATTERN = /^\d{8}(?:[_\s-]+\d{2})?[_\s-]*/;
  // Removes the technical event/date/sequence prefix before converting a slug into a fallback label.
  const EVENT_SLUG_PREFIX_PATTERN = /^event-\d{8}(?:[_-]\d{2})?[-_]?/i;
  // Identifies common video extensions used by the existing static event records.
  const VIDEO_NAME_PATTERN = /\.(?:mp4|m4v|mov|webm)$/i;
  // Splits a digit followed by a Latin letter so compact slugs such as "3gorges" remain readable.
  const DIGIT_LETTER_PATTERN = /(\d)([a-z])/gi;
  // Splits a Latin letter followed by a digit when a compact fallback slug uses both character groups.
  const LETTER_DIGIT_PATTERN = /([a-z])(\d)/gi;

  /**
   * Normalizes the optional trip-level global into safe reusable application settings.
   *
   * @param {unknown} candidate - Value supplied as window.GALLERY_TRIP_CONFIG by a trip folder.
   * @returns {Object} Complete configuration merged with the shared English defaults.
   */
  function normalizeTripConfig(candidate) {
    const source = candidate && typeof candidate === "object" ? candidate : {};
    const labels = source.labels && typeof source.labels === "object" ? source.labels : {};
    const theme = source.theme && typeof source.theme === "object" ? source.theme : {};
    const stringValue = (key) => (
      typeof source[key] === "string" && source[key].trim()
        ? source[key].trim()
        : DEFAULT_TRIP_CONFIG[key]
    );

    return {
      language: stringValue("language"),
      locale: stringValue("locale"),
      pageTitle: stringValue("pageTitle"),
      heroEyebrow: stringValue("heroEyebrow"),
      heading: stringValue("heading"),
      subtitle: stringValue("subtitle"),
      tripFacts: typeof source.tripFacts === "string" ? source.tripFacts.trim() : "",
      pageDescription: stringValue("pageDescription"),
      theme,
      labels: { ...DEFAULT_LABELS, ...(BOOK_LABELS[stringValue("language").split("-")[0]] || BOOK_LABELS.en), ...labels }
    };
  }

  const TRIP_CONFIG = normalizeTripConfig(window.GALLERY_TRIP_CONFIG);

  const DATE_GROUP_FORMATTER = new Intl.DateTimeFormat(TRIP_CONFIG.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  });
  const DATE_HEADING_FORMATTER = new Intl.DateTimeFormat(TRIP_CONFIG.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
  const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat(TRIP_CONFIG.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });

  const APP_STATE = {
    events: [],
    eventBySlug: new Map(),
    activeSlug: "",
    activeEvent: null,
    media: [],
    searchTerm: "",
    loadSequence: 0,
    activeDataScript: null,
    lightboxTrigger: null,
    lightboxItem: null,
    imageZoom: IMAGE_ZOOM_MIN,
    drawerOpen: false,
    currentItem: 0
  };

  const DOM = {
    pageDescription: null,
    themeColor: null,
    skipLink: null,
    siteHeader: null,
    heroEyebrow: null,
    heroHeading: null,
    heroSubtitle: null,
    tripFacts: null,
    openNavigator: null,
    closeNavigator: null,
    drawerScrim: null,
    navigator: null,
    routeKicker: null,
    journalHeading: null,
    eventSearchForm: null,
    eventSearchLabel: null,
    eventSearch: null,
    navSummary: null,
    eventGroups: null,
    main: null,
    eventDate: null,
    eventTitle: null,
    eventStatus: null,
    gallery: null,
    lightbox: null,
    lightboxTitle: null,
    closeLightbox: null,
    lightboxCloseLabel: null,
    lightboxBody: null,
    navigatorTriggerLabel: null
  };

  /* ============================================================
     DOM and Formatting Helpers
     ============================================================ */

  /**
   * Creates an element with an optional class name.
   *
   * @param {string} tagName - HTML element name to create.
   * @param {string} [className] - Space-separated CSS classes applied to the element.
   * @returns {HTMLElement} The newly created element.
   */
  function createElement(tagName, className) {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    return node;
  }

  /**
   * Creates a decorative SVG icon from one path.
   *
   * @param {string} pathData - SVG path data defining the icon.
   * @param {string} [className] - Optional CSS class for the SVG.
   * @returns {SVGSVGElement} An aria-hidden SVG suitable for a labelled control.
   */
  function createIcon(pathData, className) {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    const path = document.createElementNS(namespace, "path");
    icon.setAttribute("viewBox", ICON_VIEW_BOX);
    icon.setAttribute("aria-hidden", "true");
    if (className) {
      icon.setAttribute("class", className);
    }
    path.setAttribute("d", pathData);
    icon.appendChild(path);
    return icon;
  }

  /**
   * Formats a configured interface label by replacing named brace tokens.
   *
   * @param {string} key - Label key from the normalized trip configuration.
   * @param {Object} [values] - Token names and values inserted into the configured template.
   * @returns {string} Localized interface copy ready for display.
   */
  function formatLabel(key, values) {
    const template = String(TRIP_CONFIG.labels[key] || DEFAULT_LABELS[key] || "");
    return Object.entries(values || {}).reduce(
      (result, [token, value]) => result.replaceAll(`{${token}}`, String(value)),
      template
    );
  }

  /**
   * Resolves and validates all source-level interface elements.
   *
   * @returns {boolean} True when every required element exists and initialization can continue.
   */
  function cacheDomReferences() {
    const idBindings = {
      pageDescription: "pageDescription",
      themeColor: "themeColor",
      skipLink: "skipLink",
      siteHeader: "siteHeader",
      heroEyebrow: "heroEyebrow",
      heroHeading: "heroHeading",
      heroSubtitle: "heroSubtitle",
      tripFacts: "tripFacts",
      openNavigator: "openNavigator",
      navigatorTriggerLabel: "navigatorTriggerLabel",
      closeNavigator: "closeNavigator",
      drawerScrim: "drawerScrim",
      navigator: "eventNavigator",
      routeKicker: "routeKicker",
      journalHeading: "journalHeading",
      eventSearchLabel: "eventSearchLabel",
      eventSearch: "eventSearch",
      navSummary: "navSummary",
      eventGroups: "eventGroups",
      main: "main-content",
      eventDate: "eventDate",
      eventTitle: "eventTitle",
      eventStatus: "eventStatus",
      gallery: "gallery",
      lightbox: "lightbox",
      lightboxTitle: "lightboxTitle",
      closeLightbox: "closeLightbox",
      lightboxCloseLabel: "lightboxCloseLabel",
      lightboxBody: "lightboxBody"
    };

    Object.entries(idBindings).forEach(([referenceName, elementId]) => {
      DOM[referenceName] = document.getElementById(elementId);
    });
    DOM.eventSearchForm = DOM.eventSearch ? DOM.eventSearch.closest("form") : null;

    const missingReferences = Object.entries(DOM)
      .filter(([, element]) => !element)
      .map(([referenceName]) => referenceName);

    if (missingReferences.length > 0) {
      console.error(formatLabel("missingElementsLog"), missingReferences.join(", "));
      return false;
    }
    return true;
  }

  /**
   * Applies document identity, visitor copy, accessibility labels, and whitelisted theme values.
   *
   * @returns {void}
   */
  function applyTripConfig() {
    document.documentElement.lang = TRIP_CONFIG.language;
    document.title = TRIP_CONFIG.pageTitle;
    DOM.pageDescription.setAttribute("content", TRIP_CONFIG.pageDescription);
    DOM.skipLink.textContent = formatLabel("skipLink");
    DOM.heroEyebrow.textContent = TRIP_CONFIG.heroEyebrow;
    DOM.heroHeading.textContent = TRIP_CONFIG.heading;
    DOM.heroSubtitle.textContent = TRIP_CONFIG.subtitle;
    DOM.openNavigator.setAttribute("aria-label", formatLabel("openNavigator"));
    DOM.navigatorTriggerLabel.textContent = formatLabel("events");
    DOM.navigator.setAttribute("aria-label", formatLabel("navigatorAria"));
    DOM.routeKicker.textContent = formatLabel("routeKicker");
    DOM.journalHeading.textContent = formatLabel("journalHeading");
    DOM.closeNavigator.setAttribute("aria-label", formatLabel("closeNavigator"));
    DOM.eventSearchLabel.textContent = formatLabel("searchLabel");
    DOM.eventSearch.setAttribute("placeholder", formatLabel("searchPlaceholder"));
    DOM.eventGroups.setAttribute("aria-label", formatLabel("eventsByDate"));
    DOM.eventTitle.textContent = formatLabel("loadingTrip");
    DOM.lightboxTitle.textContent = formatLabel("lightboxTitle");
    DOM.lightboxCloseLabel.textContent = formatLabel("close");

    Object.entries(THEME_PROPERTY_MAP).forEach(([configKey, cssProperty]) => {
      const value = TRIP_CONFIG.theme[configKey];
      if (typeof value === "string" && value.trim()) {
        document.documentElement.style.setProperty(cssProperty, value.trim());
      }
    });
    if (typeof TRIP_CONFIG.theme.canvas === "string" && TRIP_CONFIG.theme.canvas.trim()) {
      DOM.themeColor.setAttribute("content", TRIP_CONFIG.theme.canvas.trim());
    }
  }

  /**
   * Uppercases only the first visible character of a generated localized label.
   *
   * @param {string} value - Text that may begin with a lowercase character.
   * @returns {string} Text with a locale-aware uppercase first character.
   */
  function capitalizeFirst(value) {
    if (!value) {
      return "";
    }
    return value.charAt(0).toLocaleUpperCase(TRIP_CONFIG.locale) + value.slice(1);
  }

  /**
   * Returns a localized event-count phrase.
   *
   * @param {number} count - Deduplicated number of registry events.
   * @returns {string} A visitor-facing singular or plural count.
   */
  function formatEventCount(count) {
    return formatLabel(count === 1 ? "eventCountSingular" : "eventCountPlural", { count });
  }

  /**
   * Produces a visitor-facing label from a registry title or its slug fallback.
   *
   * @param {Object} eventEntry - Registry entry containing slug and optional title.
   * @returns {string} Clean label without technical date, sequence, or filename syntax.
   */
  function deriveEventLabel(eventEntry) {
    const registryTitle = String(eventEntry.title || "").trim();
    if (registryTitle) {
      const cleanTitle = registryTitle
        .replace(EVENT_TITLE_PREFIX_PATTERN, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleanTitle) {
        return cleanTitle;
      }
    }

    const fallbackPhrase = String(eventEntry.slug || "")
      .replace(EVENT_SLUG_PREFIX_PATTERN, "")
      .replace(DIGIT_LETTER_PATTERN, "$1 $2")
      .replace(LETTER_DIGIT_PATTERN, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return fallbackPhrase
      ? `${formatLabel("eventFallbackPrefix")}: ${capitalizeFirst(fallbackPhrase)}`
      : formatLabel("untitledEvent");
  }

  /**
   * Extracts a validated UTC calendar date from an event slug or title.
   *
   * @param {Object} eventEntry - Registry entry whose date is encoded in existing source text.
   * @returns {{key: string, value: Date}|null} Stable grouping key and date, or null when absent.
   */
  function deriveEventDate(eventEntry) {
    const source = `${eventEntry.slug || ""} ${eventEntry.title || ""}`;
    const match = source.match(EVENT_DATE_PATTERN);
    if (!match) {
      return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const value = new Date(Date.UTC(year, month - 1, day));

    // Date.UTC rolls invalid dates forward, so compare each component before presenting it as fact.
    const isValid = value.getUTCFullYear() === year
      && value.getUTCMonth() === month - 1
      && value.getUTCDate() === day;
    if (!isValid) {
      return null;
    }

    return {
      key: `${match[1]}-${match[2]}-${match[3]}`,
      value
    };
  }

  /**
   * Deduplicates registry entries by slug and enriches them with derived display metadata.
   *
   * @param {unknown} registry - Value exposed by the protected events.js file.
   * @returns {Object[]} Valid first occurrences in their original registry order.
   */
  function normalizeEventRegistry(registry) {
    if (!Array.isArray(registry)) {
      return [];
    }

    const uniqueEvents = new Map();
    registry.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }

      const slug = String(entry.slug || "").trim();
      const data = String(entry.data || "").trim();
      if (!slug || !data || uniqueEvents.has(slug)) {
        return;
      }

      const normalizedEntry = {
        slug,
        data,
        title: String(entry.title || ""),
        label: deriveEventLabel(entry),
        date: deriveEventDate(entry)
      };
      uniqueEvents.set(slug, normalizedEntry);
    });

    return Array.from(uniqueEvents.values());
  }

  /**
   * Builds the trip date range and event count only from normalized registry facts.
   *
   * @returns {void}
   */
  function renderTripFacts() {
    if (TRIP_CONFIG.tripFacts) {
      DOM.tripFacts.textContent = TRIP_CONFIG.tripFacts;
      DOM.tripFacts.hidden = false;
      return;
    }

    const datedEvents = APP_STATE.events
      .filter((eventEntry) => eventEntry.date)
      .map((eventEntry) => eventEntry.date.value)
      .sort((firstDate, secondDate) => firstDate.getTime() - secondDate.getTime());

    const factParts = [];
    if (datedEvents.length > 0) {
      const firstDate = datedEvents[0];
      const lastDate = datedEvents[datedEvents.length - 1];
      const sameMonth = firstDate.getUTCMonth() === lastDate.getUTCMonth();
      const sameYear = firstDate.getUTCFullYear() === lastDate.getUTCFullYear();

      if (firstDate.getTime() === lastDate.getTime()) {
        factParts.push(DATE_HEADING_FORMATTER.format(firstDate));
      } else if (sameMonth && sameYear) {
        factParts.push(
          `${firstDate.getUTCDate()}–${lastDate.getUTCDate()} ${MONTH_YEAR_FORMATTER.format(firstDate)}`
        );
      } else {
        factParts.push(
          `${DATE_HEADING_FORMATTER.format(firstDate)} – ${DATE_HEADING_FORMATTER.format(lastDate)}`
        );
      }
    }

    factParts.push(formatEventCount(APP_STATE.events.length));
    DOM.tripFacts.textContent = factParts.join(" · ");
    DOM.tripFacts.hidden = false;
  }

  /* ============================================================
     Event Navigator
     ============================================================ */

  /**
   * Groups filtered events by their derived registry dates without changing their order.
   *
   * @param {Object[]} eventEntries - Normalized events visible for the active search.
   * @returns {Map<string, {label: string, events: Object[]}>} Ordered date groups for navigation.
   */
  function groupEventsByDate(eventEntries) {
    const groups = new Map();
    eventEntries.forEach((eventEntry) => {
      const groupKey = eventEntry.date ? eventEntry.date.key : "unknown";
      const groupLabel = eventEntry.date
        ? capitalizeFirst(DATE_GROUP_FORMATTER.format(eventEntry.date.value))
        : formatLabel("unknownDate");

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          label: groupLabel,
          events: []
        });
      }
      groups.get(groupKey).events.push(eventEntry);
    });
    return groups;
  }

  /**
   * Creates one accessible event button inside a date group.
   *
   * @param {Object} eventEntry - Normalized registry event represented by the button.
   * @returns {HTMLLIElement} List item containing the event navigation control.
   */
  function createEventNavigationItem(eventEntry) {
    const item = createElement("li");
    const button = createElement("button", "event-button");
    button.type = "button";
    button.dataset.eventSlug = eventEntry.slug;
    button.textContent = eventEntry.label;
    if (eventEntry.slug === APP_STATE.activeSlug) {
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => {
      navigateToEvent(eventEntry.slug, { historyMode: "push" });
    });
    item.appendChild(button);
    return item;
  }

  /**
   * Renders date-grouped event choices filtered by the current search term.
   *
   * @returns {void}
   */
  function renderEventNavigator() {
    const normalizedTerm = APP_STATE.searchTerm.toLocaleLowerCase(TRIP_CONFIG.locale);
    const visibleEvents = normalizedTerm
      ? APP_STATE.events.filter((eventEntry) => (
        eventEntry.label.toLocaleLowerCase(TRIP_CONFIG.locale).includes(normalizedTerm)
      ))
      : APP_STATE.events;

    DOM.eventGroups.replaceChildren();

    if (visibleEvents.length === 0) {
      const emptyMessage = createElement("p", "event-groups__empty");
      emptyMessage.textContent = formatLabel(APP_STATE.events.length ? "noSearchResults" : "noEvents");
      DOM.eventGroups.appendChild(emptyMessage);
    } else {
      const groupedEvents = groupEventsByDate(visibleEvents);
      groupedEvents.forEach((group) => {
        const section = createElement("section", "event-group");
        const heading = createElement("h3");
        const list = createElement("ul", "event-group__list");
        heading.textContent = group.label;
        group.events.forEach((eventEntry) => {
          list.appendChild(createEventNavigationItem(eventEntry));
        });
        section.append(heading, list);
        DOM.eventGroups.appendChild(section);
      });
    }

    DOM.navSummary.textContent = normalizedTerm
      ? formatLabel("filteredSummary", {
        visible: visibleEvents.length,
        total: formatEventCount(APP_STATE.events.length)
      })
      : formatEventCount(APP_STATE.events.length);
  }

  /**
   * Updates aria-current without rebuilding the focused itinerary control.
   *
   * @param {string} activeSlug - Slug displayed in the gallery.
   * @returns {void}
   */
  function updateNavigatorSelection(activeSlug) {
    DOM.eventGroups.querySelectorAll("[data-event-slug]").forEach((button) => {
      if (button.dataset.eventSlug === activeSlug) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  /* ============================================================
     Drawer Interaction
     ============================================================ */

  /**
   * Marks the header and journal inert while the modal mobile drawer owns interaction.
   *
   * @param {boolean} isInert - Whether background content must be excluded from focus and interaction.
   * @returns {void}
   */
  function setDrawerBackgroundInert(isInert) {
    DOM.skipLink.inert = isInert;
    DOM.siteHeader.inert = isInert;
    DOM.main.inert = isInert;
  }

  /**
   * Opens the compact event drawer and transfers focus to its close control.
   *
   * @returns {void}
   */
  function openDrawer() {
    if (APP_STATE.drawerOpen) {
      return;
    }

    APP_STATE.drawerOpen = true;
    DOM.navigator.classList.add("is-open");
    DOM.drawerScrim.classList.add("is-open");
    DOM.drawerScrim.setAttribute("aria-hidden", "false");
    DOM.navigator.setAttribute("role", "dialog");
    DOM.navigator.setAttribute("aria-modal", "true");
    DOM.navigator.setAttribute("aria-hidden", "false");
    DOM.openNavigator.setAttribute("aria-expanded", "true");
    document.body.classList.add("drawer-open");
    setDrawerBackgroundInert(true);
    DOM.navigator.inert = false;
    DOM.closeNavigator.focus({ preventScroll: true });
    DOM.eventGroups.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }

  /**
   * Closes the compact event drawer and optionally returns focus to its trigger.
   *
   * @param {{restoreFocus?: boolean}} [options] - Focus behavior after dismissal.
   * @returns {void}
   */
  function closeDrawer(options) {
    const restoreFocus = Boolean(options && options.restoreFocus);
    if (!APP_STATE.drawerOpen) {
      return;
    }

    APP_STATE.drawerOpen = false;
    DOM.navigator.classList.remove("is-open");
    DOM.drawerScrim.classList.remove("is-open");
    DOM.drawerScrim.setAttribute("aria-hidden", "true");
    DOM.openNavigator.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
    setDrawerBackgroundInert(false);

    DOM.navigator.setAttribute("aria-hidden", "true");
    DOM.navigator.inert = true;
    APP_STATE.searchTerm = "";
    DOM.eventSearch.value = "";
    renderEventNavigator();
    DOM.navigator.removeAttribute("role");
    DOM.navigator.removeAttribute("aria-modal");

    if (restoreFocus) {
      DOM.openNavigator.focus({ preventScroll: true });
    }
  }

  /**
   * Synchronizes navigator semantics when the responsive breakpoint changes.
   *
   * @returns {void}
   */
  function synchronizeDrawerMode() {
    DOM.navigator.setAttribute("aria-hidden", APP_STATE.drawerOpen ? "false" : "true");
    DOM.navigator.inert = !APP_STATE.drawerOpen;
  }

  /* ============================================================
     Event Data Loading and Normalization
     ============================================================ */

  /**
   * Extracts a Google Drive file identifier from an existing preview URL.
   *
   * @param {string} previewUrl - Stored Drive preview address from an event data file.
   * @returns {string|null} Drive file identifier, or null when the reference is malformed.
   */
  function extractDriveId(previewUrl) {
    // Captures the path segment between "/d/" and "/preview" in the existing Drive URL shape.
    const match = String(previewUrl).match(/\/d\/([^/]+)\/preview/);
    return match ? match[1] : null;
  }

  /**
   * Extracts an optional Google Drive resource key from a stored preview URL.
   *
   * @param {string} previewUrl - Stored Drive preview address from an event data file.
   * @returns {string} Resource key required for some link-shared files, or an empty string.
   */
  function extractDriveResourceKey(previewUrl) {
    try {
      return new URL(previewUrl).searchParams.get("resourcekey") || "";
    } catch (error) {
      console.debug("Ignoring an invalid optional Drive resource key URL.", error);
      return "";
    }
  }

  /**
   * Builds a lazy gallery thumbnail URL from an existing Drive identifier.
   *
   * @param {string} driveId - File identifier extracted from the stored preview URL.
   * @param {string} [resourceKey] - Optional link-sharing resource key retained from the preview URL.
   * @returns {string} Google Drive thumbnail address.
   */
  function buildThumbnailUrl(driveId, resourceKey) {
    const parameters = new URLSearchParams({
      id: driveId,
      sz: `w${THUMBNAIL_WIDTH}`
    });
    if (resourceKey) {
      parameters.set("resourcekey", resourceKey);
    }
    return `https://drive.google.com/thumbnail?${parameters.toString()}`;
  }

  /**
   * Builds a direct-view fallback URL from an existing Drive identifier.
   *
   * @param {string} driveId - File identifier extracted from the stored preview URL.
   * @param {string} [resourceKey] - Optional link-sharing resource key retained from the preview URL.
   * @returns {string} Google Drive view address used only after thumbnail failure.
   */
  function buildViewUrl(driveId, resourceKey) {
    const parameters = new URLSearchParams({ export: "view", id: driveId });
    if (resourceKey) {
      parameters.set("resourcekey", resourceKey);
    }
    return `https://drive.google.com/uc?${parameters.toString()}`;
  }

  /**
   * Normalizes an optional stored media rotation to a clockwise quarter turn.
   *
   * @param {unknown} value - Rotation value supplied by an event data record.
   * @returns {number} One of 0, 90, 180, or 270 degrees.
   */
  function normalizeMediaRotation(value) {
    const rotation = Number(value);
    if (!Number.isFinite(rotation) || rotation % QUARTER_TURN_DEGREES !== 0) {
      return 0;
    }
    return ((rotation % FULL_ROTATION_DEGREES) + FULL_ROTATION_DEGREES) % FULL_ROTATION_DEGREES;
  }

  /**
   * Applies normalized correction properties to one displayed media element.
   *
   * @param {HTMLElement} element - Thumbnail, full image, or preview frame to correct.
   * @param {Object} item - Normalized media record containing correction state.
   * @returns {void}
   */
  function applyMediaTransform(element, item) {
    element.style.setProperty("--media-flip-x", item.flipHorizontal ? "-1" : "1");
    element.style.setProperty("--media-flip-y", item.flipVertical ? "-1" : "1");
    element.style.setProperty("--media-rotation", `${item.rotation}deg`);
    element.classList.toggle(
      "media-transform--quarter-turn",
      item.rotation % HALF_ROTATION_DEGREES !== 0
    );
  }

  /**
   * Normalizes protected event records while preserving their source order and trusted rich text.
   *
   * @param {unknown} rawItems - GALLERY_ITEMS value loaded from an event data script.
   * @returns {Object[]} Displayable text, image, and video records in original order.
   */
  function normalizeGalleryItems(rawItems) {
    if (!Array.isArray(rawItems)) {
      return [];
    }

    return rawItems.map((rawItem) => {
      const item = rawItem && typeof rawItem === "object" ? rawItem : {};
      const rawType = String(item.type || "").toLocaleLowerCase(TRIP_CONFIG.locale);

      // Text blocks remain visible regardless of the media-only optional visibility field.
      if (rawType === "text") {
        return {
          kind: "text",
          title: String(item.title || item.name || ""),
          body: String(item.body || ""),
          desc: String(item.desc || "")
        };
      }

      // Only the exact boolean false hides media so all legacy records remain visible.
      if (item.visible === false) {
        return null;
      }

      const preview = String(item.preview || "");
      const driveId = extractDriveId(preview);
      if (!driveId) {
        return null;
      }

      const name = String(item.name || "");
      return {
        kind: VIDEO_NAME_PATTERN.test(name) ? "video" : "image",
        preview,
        title: String(item.title || ""),
        desc: String(item.desc || ""),
        driveId,
        resourceKey: extractDriveResourceKey(preview),
        flipHorizontal: item.flipHorizontal === true,
        flipVertical: item.flipVertical === true,
        rotation: normalizeMediaRotation(item.rotation),
        orientation: null
      };
    }).filter(Boolean);
  }

  /**
   * Loads one protected event data file through the existing static script-registry pattern.
   *
   * @param {Object} eventEntry - Normalized registry event containing its existing data path.
   * @returns {Promise<Object[]>} Promise resolving to normalized gallery items.
   */
  function loadEventData(eventEntry) {
    return new Promise((resolve, reject) => {
      if (APP_STATE.activeDataScript) {
        APP_STATE.activeDataScript.remove();
      }
      delete window.GALLERY_ITEMS;

      const script = document.createElement("script");
      script.id = EVENT_DATA_SCRIPT_ID;
      script.src = eventEntry.data;
      script.async = true;
      APP_STATE.activeDataScript = script;

      script.addEventListener("load", () => {
        if (APP_STATE.activeDataScript !== script) {
          reject(new Error(formatLabel("staleLoad")));
          return;
        }

        const rawItems = window.GALLERY_ITEMS;
        delete window.GALLERY_ITEMS;
        script.remove();
        APP_STATE.activeDataScript = null;

        if (!Array.isArray(rawItems)) {
          reject(new Error(formatLabel("missingEventData", { event: eventEntry.slug })));
          return;
        }

        // A JSON clone detaches the gallery from the shared global before the next script load.
        const clonedItems = JSON.parse(JSON.stringify(rawItems));
        resolve(normalizeGalleryItems(clonedItems));
      });

      script.addEventListener("error", () => {
        if (APP_STATE.activeDataScript === script) {
          APP_STATE.activeDataScript = null;
        }
        script.remove();
        reject(new Error(formatLabel("eventLoadFailed", { path: eventEntry.data })));
      });

      document.head.appendChild(script);
    });
  }

  /* ============================================================
     Editorial Gallery Rendering
     ============================================================ */

  /**
   * Classifies a loaded thumbnail from its intrinsic dimensions.
   *
   * @param {number} width - Intrinsic thumbnail width in pixels.
   * @param {number} height - Intrinsic thumbnail height in pixels.
   * @param {number} rotation - Normalized clockwise rotation applied to the source.
   * @returns {"portrait"|"square"|"landscape"|null} Corrected orientation category, or null for invalid dimensions.
   */
  function classifyMediaOrientation(width, height, rotation) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    const isQuarterTurn = normalizeMediaRotation(rotation) % HALF_ROTATION_DEGREES !== 0;
    const correctedWidth = isQuarterTurn ? height : width;
    const correctedHeight = isQuarterTurn ? width : height;
    const aspectRatio = correctedWidth / correctedHeight;
    if (aspectRatio < 1) {
      return "portrait";
    }
    if (aspectRatio === 1) {
      return "square";
    }
    return "landscape";
  }

  /**
   * Applies the loaded thumbnail orientation without changing the media's source position.
   *
   * @param {HTMLElement} card - Media card whose layout follows the thumbnail orientation.
   * @param {HTMLImageElement} image - Loaded thumbnail exposing intrinsic dimensions.
   * @param {Object} item - Normalized media record whose rotation affects orientation.
   * @returns {void}
   */
  function applyMediaOrientation(card, image, item) {
    const orientation = classifyMediaOrientation(image.naturalWidth, image.naturalHeight, item.rotation);
    if (!orientation) {
      return;
    }

    item.orientation = orientation;
    card.classList.remove("media-card--orientation-pending", ...MEDIA_ORIENTATION_CLASSES);
    card.classList.add(`media-card--${orientation}`);
    if (APP_STATE.lightboxItem === item && !DOM.lightbox.hidden) {
      applyLightboxOrientation(item);
    }
  }

  /**
   * Creates the persistent visual action cue for an image or video thumbnail.
   *
   * @param {"image"|"video"} mediaKind - Normalized media category controlling icon shape and color.
   * @returns {HTMLSpanElement} Decorative icon mark represented accessibly by the parent button label.
   */
  function createMediaActionMark(mediaKind) {
    const isVideo = mediaKind === "video";
    const modifier = isVideo ? "media-action-mark--video" : "media-action-mark--image";
    const pathData = isVideo
      ? "M9 7l8 5-8 5z"
      : "M11 4a7 7 0 1 0 4.9 12L21 21M11 8v6M8 11h6";
    const mark = createElement("span", `media-action-mark ${modifier}`);
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(createIcon(pathData));
    return mark;
  }

  /**
   * Replaces a failed thumbnail with its direct-view fallback and then a localized placeholder.
   *
   * @param {HTMLImageElement} image - Thumbnail that emitted the error.
   * @param {HTMLButtonElement} mediaButton - Parent action receiving the final error state.
   * @param {string} driveId - Existing Google Drive file identifier.
   * @param {string} resourceKey - Optional Drive key needed by link-shared media.
   * @returns {void}
   */
  function handleThumbnailError(image, mediaButton, driveId, resourceKey) {
    if (!image.dataset.fallbackAttempted) {
      image.dataset.fallbackAttempted = "true";
      image.src = buildViewUrl(driveId, resourceKey);
      return;
    }
    mediaButton.classList.add("has-image-error");
  }

  /**
   * Creates one media card without exposing its technical filename.
   *
   * @param {Object} item - Normalized image or video record.
   * @param {number} mediaIndex - Zero-based position among event media.
   * @returns {HTMLElement} Article containing a lazy thumbnail, optional story, and lightbox action.
   */
  function createMediaCard(item, mediaIndex) {
    const hasDescription = item.desc.trim().length > 0 || item.title.trim().length > 0;
    const cardClasses = [
      "media-card",
      "media-card--orientation-pending",
      hasDescription ? "media-card--story" : ""
    ].filter(Boolean).join(" ");
    const card = createElement("article", cardClasses);
    const button = createElement("button", `media-button media-button--${item.kind}`);
    const image = createElement("img");
    const placeholder = createElement("span", "media-placeholder");
    const mediaNumber = mediaIndex + 1;
    const mediaNoun = formatLabel(item.kind === "video" ? "videoNoun" : "imageNoun");
    const eventLabel = APP_STATE.activeEvent
      ? APP_STATE.activeEvent.label
      : formatLabel("currentEventFallback");

    button.type = "button";
    button.setAttribute("aria-label", formatLabel("openMedia", {
      media: mediaNoun,
      number: mediaNumber,
      event: eventLabel
    }));
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.alt = formatLabel(item.kind === "video" ? "videoAlt" : "imageAlt", {
      number: mediaNumber,
      event: eventLabel
    });
    image.addEventListener("load", () => {
      applyMediaOrientation(card, image, item);
      fitVisibleMedia();
    });
    image.addEventListener("error", () => {
      handleThumbnailError(image, button, item.driveId, item.resourceKey);
    });
    applyMediaTransform(image, item);
    image.src = buildThumbnailUrl(item.driveId, item.resourceKey);
    placeholder.textContent = item.kind === "video"
      ? formatLabel("videoUnavailable")
      : formatLabel("imageUnavailable");

    button.append(image, placeholder, createMediaActionMark(item.kind));

    button.addEventListener("click", () => {
      openLightbox(item, button);
    });
    card.appendChild(button);

    if (hasDescription) {
      const caption = createElement("div", "media-caption");
      // Rich text is trusted local content authored through data_editor.html and must retain formatting.
      caption.innerHTML = item.desc;
      if (item.title.trim()) {
        const title = createElement("h3");
        title.textContent = item.title;
        caption.prepend(title);
      }
      // Native focusable scroll region supports arrows/PageDown without trapping Tab.
      caption.tabIndex = 0;
      caption.setAttribute("role", "region");
      caption.setAttribute("aria-label", item.title || image.alt);
      card.appendChild(caption);
    }

    return card;
  }

  /**
   * Creates a full-width authored story card.
   *
   * @param {Object} item - Normalized text item with trusted title, description, and body fields.
   * @returns {HTMLElement} Full-width article preserving the authored rich-text fields.
   */
  function createStoryCard(item) {
    const card = createElement("article", "story-card");
    const inner = createElement("div", "story-card__inner");
    inner.tabIndex = 0;
    inner.setAttribute("role", "region");
    inner.setAttribute("aria-label", item.title || formatLabel("textNoun"));

    if (item.title.trim()) {
      const title = createElement("h3");
      title.textContent = item.title;
      inner.appendChild(title);
    }

    if (item.desc.trim()) {
      const note = createElement("div", "story-card__note");
      // Rich text is trusted local content authored through data_editor.html and must retain formatting.
      note.innerHTML = item.desc;
      inner.appendChild(note);
    }

    const body = createElement("div", "story-body");
    // Rich text is trusted local content authored through data_editor.html and must retain formatting.
    body.innerHTML = item.body;
    inner.appendChild(body);
    card.appendChild(inner);
    return card;
  }

  /**
   * Creates a full-width loading, empty, or error state.
   *
   * @param {string} message - Localized explanation shown to visitors.
   * @param {"loading"|"empty"|"error"} stateType - Visual state category.
   * @param {Function|null} [retryAction] - Optional retry callback for recoverable failures.
   * @returns {HTMLElement} Status article ready for the gallery.
   */
  function createStateCard(message, stateType, retryAction) {
    const stateClass = stateType === "error" ? "state-card state-card--error" : "state-card";
    const card = createElement("div", stateClass);
    const text = createElement("p");
    text.textContent = message;
    card.appendChild(text);

    if (typeof retryAction === "function") {
      const retryButton = createElement("button", "state-card__action");
      retryButton.type = "button";
      retryButton.textContent = formatLabel("retry");
      retryButton.addEventListener("click", retryAction);
      card.appendChild(retryButton);
    }
    return card;
  }

  /**
   * Renders normalized event content in exact source order.
   *
   * @param {Object[]} items - Normalized gallery items from the selected event.
   * @returns {void}
   */
  function renderGallery(items) {
    APP_STATE.media = items;
    APP_STATE.currentItem = 0;
    DOM.gallery.setAttribute("aria-busy", "false");
    showItem(0, false);
  }

  // Native buttons support Enter/Space; every generated control has a visible or accessible label.
  function bookButton(labelKey, action, className = "book-button") {
    const button = createElement("button", className);
    button.type = "button";
    button.textContent = formatLabel(labelKey);
    button.addEventListener("click", action);
    return button;
  }

  // Links retain bookmarkable destinations and native modifier-click behavior.
  function createEventControls() {
    const nav = createElement("nav", "event-navigation");
    nav.setAttribute("aria-label", formatLabel("eventNavigation"));
    const index = APP_STATE.events.indexOf(APP_STATE.activeEvent);
    if (APP_STATE.events.length < 2 || index < 0) return nav;
    [-1, 1].forEach((direction) => {
      const entry = APP_STATE.events[index + direction];
      if (!entry) return;
      const link = createElement("a", "book-button");
      link.href = `#${new URLSearchParams({ event: entry.slug })}`;
      link.textContent = formatLabel(direction < 0 ? "previousEvent" : "nextEvent");
      link.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateToEvent(entry.slug);
      });
      nav.appendChild(link);
    });
    return nav;
  }

  // Only the active page exists in the DOM, excluding hidden media from playback and the focus order.
  function showItem(index, focus = true) {
    closeLightbox();
    APP_STATE.currentItem = index;
    const item = APP_STATE.media[index];
    const card = !item ? createStateCard(formatLabel("emptyEvent"), "empty")
      : item.kind === "text" ? createStoryCard(item) : createMediaCard(item, index);
    card.tabIndex = -1;
    card.setAttribute("aria-label", formatLabel("itemDestination", {
      number: index + 1, title: item?.title || formatLabel(item?.kind === "text" ? "textNoun" : item?.kind === "video" ? "videoNoun" : "imageNoun")
    }));
    DOM.gallery.replaceChildren(card);
    renderBookNavigation();
    card.querySelectorAll("h3").forEach((heading) => { heading.tabIndex = -1; });
    if (focus) (card.querySelector("h3") || card).focus({ preventScroll: true });
  }

  // Compact native buttons retain localized names and Enter/Space activation.
  function itemButton(labelKey, symbol, index) {
    const button = bookButton(labelKey, () => showItem(index));
    button.setAttribute("aria-label", button.textContent);
    button.title = button.textContent;
    button.textContent = symbol;
    return button;
  }

  // The labeled text field supports numeric keyboards, Enter, and commit-on-blur.
  function createPageInput() {
    const position = createElement("label", "item-position");
    const label = createElement("span", "visually-hidden");
    label.textContent = formatLabel("pageNumber");
    const input = createElement("input", "page-number");
    input.type = "text";
    input.inputMode = "numeric";
    input.value = String(APP_STATE.currentItem + 1);
    input.autocomplete = "off";
    const total = createElement("span");
    total.textContent = ` / ${APP_STATE.media.length}`;
    const commit = () => {
      const value = input.value.trim();
      const page = Number(value);
      // Accept only whole decimal page numbers in this event; restore invalid edits.
      if (/^[0-9]+$/.test(value) && Number.isSafeInteger(page) && page >= 1 && page <= APP_STATE.media.length) {
        if (page !== APP_STATE.currentItem + 1) showItem(page - 1);
      }
      input.value = String(APP_STATE.currentItem + 1);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); commit(); }
    });
    position.append(label, input, total);
    return position;
  }

  function renderBookNavigation() {
    const navigation = DOM.siteHeader.querySelector(".book-navigation");
    navigation.replaceChildren();
    if (APP_STATE.media.length > 1) {
      const items = createElement("nav", "item-navigation");
      items.setAttribute("aria-label", formatLabel("itemNavigation"));
      if (APP_STATE.currentItem > 0) {
        items.append(itemButton("firstItem", "«", 0), itemButton("previousItem", "‹", APP_STATE.currentItem - 1));
      }
      items.appendChild(createPageInput());
      if (APP_STATE.currentItem < APP_STATE.media.length - 1) {
        items.append(itemButton("nextItem", "›", APP_STATE.currentItem + 1), itemButton("lastItem", "»", APP_STATE.media.length - 1));
      }
      navigation.appendChild(items);
    }
    navigation.appendChild(createEventControls());
  }

  // Grid tracks measure real wrapped headings and controls, leaving precisely the remaining viewport to content.
  function initializeBookLayout() {
    document.body.classList.add("book-gallery");
    DOM.eventTitle.tabIndex = -1;
    const context = createElement("div", "trip-context");
    context.append(DOM.heroSubtitle, DOM.tripFacts);
    DOM.navigator.querySelector(".navigator__header").after(context);
    DOM.eventSearchForm.hidden = APP_STATE.events.length < 2;
    DOM.siteHeader.querySelector(".hero__inner").appendChild(createElement("div", "book-navigation"));
    const toolbar = createElement("div", "lightbox-toolbar");
    toolbar.appendChild(DOM.closeLightbox);
    DOM.lightbox.prepend(toolbar);
    const resizeObserver = new ResizeObserver(fitVisibleMedia);
    resizeObserver.observe(DOM.gallery);
    resizeObserver.observe(DOM.lightboxBody);
  }

  // Full-width text has a fixed wrapping measure; reserve its natural height up to half the page.
  function fitStackedCaption(card, caption) {
    const availableHeight = card.clientHeight;
    const scrollTop = caption.scrollTop;
    caption.style.height = "0px";
    const captionHeight = Math.min(caption.scrollHeight, availableHeight / 2);
    card.style.gridTemplateRows = `${availableHeight - captionHeight}px minmax(0, 1fr)`;
    caption.style.height = "";
    caption.scrollTop = scrollTop;
  }

  // Rotation swaps the source box before containment so quarter-turned images lose no source pixels.
  function fitVisibleMedia() {
    document.querySelectorAll(".media-button img, .lightbox__image, .lightbox__frame").forEach((image) => {
      const frame = image.parentElement;
      const quarterTurn = image.classList.contains("media-transform--quarter-turn");
      const card = frame.closest(".media-card");
      const caption = card?.querySelector(".media-caption");
      if (caption && image.naturalWidth && image.naturalHeight) {
        if (card.classList.contains("media-card--portrait")) card.style.gridTemplateRows = "";
        else fitStackedCaption(card, caption);
      }
      const bounds = frame.getBoundingClientRect();
      image.style.width = `${quarterTurn ? bounds.height : bounds.width}px`;
      image.style.height = `${quarterTurn ? bounds.width : bounds.height}px`;
    });
  }

  /**
   * Displays a loading surface without inserting technical data paths into visitor copy.
   *
   * @returns {void}
   */
  function renderLoadingState() {
    APP_STATE.media = [];
    renderBookNavigation();
    DOM.gallery.setAttribute("aria-busy", "true");
    DOM.gallery.replaceChildren(
      createStateCard(formatLabel("loadingContent"), "loading")
    );
    DOM.eventStatus.textContent = formatLabel("contentLoading");
  }

  /**
   * Displays a recoverable localized failure state for the selected event.
   *
   * @returns {void}
   */
  function renderEventFailure() {
    DOM.gallery.setAttribute("aria-busy", "false");
    DOM.eventStatus.textContent = formatLabel("contentLoadFailed");
    DOM.gallery.replaceChildren(
      createStateCard(
        formatLabel("eventFailure"),
        "error",
        () => {
          navigateToEvent(APP_STATE.activeSlug, {
            historyMode: "none",
            forceReload: true
          });
        }
      )
    );
  }

  /* ============================================================
     Basic Lightbox and Focus Management
     ============================================================ */

  /**
   * Returns visible focusable descendants for a dialog or drawer focus loop.
   *
   * @param {HTMLElement} container - Modal interface containing keyboard controls.
   * @returns {HTMLElement[]} Visible focus targets in DOM order.
   */
  function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((element) => element.getClientRects().length > 0);
  }

  /**
   * Contains Tab and Shift+Tab focus within the active modal interface.
   *
   * @param {KeyboardEvent} event - Keyboard event raised by the page.
   * @param {HTMLElement} container - Open lightbox or drawer that owns focus.
   * @returns {void}
   */
  function trapFocus(event, container) {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  /**
   * Makes the complete journal inert while the media dialog is open.
   *
   * @param {boolean} isInert - Whether page content must be removed from interaction.
   * @returns {void}
   */
  function setLightboxBackgroundInert(isInert) {
    DOM.skipLink.inert = isInert;
    DOM.siteHeader.inert = isInert;
    DOM.navigator.inert = isInert || !APP_STATE.drawerOpen;
    DOM.main.inert = isInert;
  }

  /**
   * Builds a Drive preview URL with automatic video playback disabled.
   *
   * @param {Object} item - Normalized media item holding the protected preview reference.
   * @returns {string} Existing Drive preview URL with optional video autoplay preference.
   */
  function buildLightboxUrl(item) {
    if (item.kind !== "video") {
      return item.preview;
    }

    try {
      const previewUrl = new URL(item.preview);
      previewUrl.searchParams.set("autoplay", "0");
      return previewUrl.toString();
    } catch (error) {
      console.error(formatLabel("videoUrlErrorLog"), error);
      return item.preview;
    }
  }

  /**
   * Matches the lightbox viewport to the corrected media orientation.
   *
   * @param {Object} item - Normalized media record with a detected orientation.
   * @returns {void}
   */
  function applyLightboxOrientation(item) {
    DOM.lightboxBody.classList.remove(...LIGHTBOX_ORIENTATION_CLASSES);
    if (item.orientation) {
      DOM.lightboxBody.classList.add(`lightbox__body--${item.orientation}`);
    }
  }

  /**
   * Replaces a failed full-size thumbnail with a direct Drive response, then a local message.
   *
   * @param {HTMLImageElement} image - Full-size lightbox image that emitted an error.
   * @param {Object} item - Normalized image record holding the Drive identifiers.
   * @returns {void}
   */
  function handleLightboxImageError(image, item) {
    if (!image.dataset.fallbackAttempted) {
      image.dataset.fallbackAttempted = "true";
      image.src = buildViewUrl(item.driveId, item.resourceKey);
      return;
    }

    const message = createElement("p", "lightbox__message");
    message.textContent = formatLabel("imageUnavailable");
    image.replaceWith(message);
  }

  /**
   * Creates corrected image or video content for the lightbox.
   *
   * @param {Object} item - Normalized media record selected by the visitor.
   * @param {string} accessibleTitle - Localized description for the enlarged media.
   * @returns {HTMLElement} Corrected image element or Drive video frame.
   */
  function createLightboxMedia(item, accessibleTitle) {
    if (item.kind === "image") {
      const image = createElement("img", "lightbox__image");
      image.alt = accessibleTitle;
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("load", () => {
        item.orientation = classifyMediaOrientation(
          image.naturalWidth,
          image.naturalHeight,
          item.rotation
        );
        applyLightboxOrientation(item);
        fitVisibleMedia();
      });
      image.addEventListener("error", () => {
        handleLightboxImageError(image, item);
      });
      applyMediaTransform(image, item);
      image.src = buildThumbnailUrl(item.driveId, item.resourceKey);
      const stage = createElement("div", "image-stage");
      stage.appendChild(image);
      return stage;
    }

    const frame = createElement("iframe", "lightbox__frame");
    frame.title = accessibleTitle;
    frame.referrerPolicy = "no-referrer";
    frame.allow = "autoplay; fullscreen; picture-in-picture";
    frame.src = buildLightboxUrl(item);
    applyMediaTransform(frame, item);
    return frame;
  }

  /**
   * Opens the selected Drive media in the basic modal and transfers focus to Close.
   *
   * @param {Object} item - Normalized image or video item selected by the visitor.
   * @param {HTMLButtonElement} trigger - Gallery control that must regain focus after dismissal.
   * @returns {void}
   */
  function openLightbox(item, trigger) {
    const mediaNoun = formatLabel(item.kind === "video" ? "videoNoun" : "imageNoun");
    const eventLabel = APP_STATE.activeEvent
      ? APP_STATE.activeEvent.label
      : formatLabel("currentEventFallback");
    const accessibleTitle = formatLabel("mediaPreview", { media: mediaNoun, event: eventLabel });
    const media = createLightboxMedia(item, accessibleTitle);

    APP_STATE.lightboxTrigger = trigger;
    APP_STATE.lightboxItem = item;
    applyLightboxOrientation(item);
    DOM.lightboxBody.replaceChildren(media);
    DOM.lightbox.hidden = false;
    APP_STATE.imageZoom = IMAGE_ZOOM_MIN;
    DOM.lightboxBody.style.setProperty("--image-zoom", IMAGE_ZOOM_MIN);
    DOM.lightboxBody.classList.remove("is-zoomed");
    DOM.lightboxBody.scrollTo(0, 0);
    DOM.lightbox.querySelector(".zoom-controls")?.remove();
    if (item.kind === "image") {
      const controls = createElement("div", "zoom-controls");
      // Native +/− buttons retain focus for repeated Enter/Space activation; labels name the action.
      for (const [label, symbol, step] of [["zoomOut", "−", -IMAGE_ZOOM_STEP], ["zoomIn", "+", IMAGE_ZOOM_STEP]]) {
        const button = bookButton(label, () => setImageZoom(APP_STATE.imageZoom + step));
        button.textContent = symbol;
        button.setAttribute("aria-label", formatLabel(label));
        button.title = formatLabel(label);
        button.dataset.zoomDirection = step > 0 ? "in" : "out";
        controls.appendChild(button);
      }
      const level = createElement("output", "zoom-level");
      level.setAttribute("aria-live", "polite");
      controls.appendChild(level);
      DOM.lightbox.querySelector(".lightbox-toolbar").prepend(controls);
      setImageZoom(IMAGE_ZOOM_MIN);
    }
    requestAnimationFrame(fitVisibleMedia);
    document.body.classList.add("lightbox-open");
    setLightboxBackgroundInert(true);
    DOM.closeLightbox.focus();
  }

  // Scale the scrollable stage, preserving the viewed center while keeping toolbar focus stable.
  function setImageZoom(level) {
    const body = DOM.lightboxBody;
    if (!body.querySelector("img")) return;
    const previous = APP_STATE.imageZoom;
    const zoom = Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, level));
    const centerX = (body.scrollLeft + body.clientWidth / 2) / previous;
    const centerY = (body.scrollTop + body.clientHeight / 2) / previous;
    APP_STATE.imageZoom = zoom;
    body.style.setProperty("--image-zoom", zoom);
    body.classList.toggle("is-zoomed", zoom > IMAGE_ZOOM_MIN);
    fitVisibleMedia();
    body.scrollTo(centerX * zoom - body.clientWidth / 2, centerY * zoom - body.clientHeight / 2);
    body.tabIndex = 0;
    body.setAttribute("role", "region");
    body.setAttribute("aria-labelledby", "lightboxTitle");
    const controls = DOM.lightbox.querySelector(".zoom-controls");
    controls.querySelector(".zoom-level").textContent = `${Math.round(zoom * 100)}%`;
    // aria-disabled keeps the focused control reachable at a limit; clamping prevents extra changes.
    controls.querySelector('[data-zoom-direction="in"]').setAttribute("aria-disabled", String(zoom === IMAGE_ZOOM_MAX));
    controls.querySelector('[data-zoom-direction="out"]').setAttribute("aria-disabled", String(zoom === IMAGE_ZOOM_MIN));
  }

  /**
   * Closes the media dialog, stops embedded playback, and restores initiating focus.
   *
   * @returns {void}
   */
  function closeLightbox() {
    if (DOM.lightbox.hidden) {
      return;
    }

    const frame = DOM.lightboxBody.querySelector("iframe");
    if (frame) {
      frame.src = "about:blank";
    }
    DOM.lightboxBody.replaceChildren();
    DOM.lightbox.querySelector(".zoom-controls")?.remove();
    DOM.lightboxBody.classList.remove(...LIGHTBOX_ORIENTATION_CLASSES);
    DOM.lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    setLightboxBackgroundInert(false);

    if (APP_STATE.lightboxTrigger && APP_STATE.lightboxTrigger.isConnected) {
      APP_STATE.lightboxTrigger.focus();
    }
    APP_STATE.lightboxTrigger = null;
    APP_STATE.lightboxItem = null;
  }

  /* ============================================================
     Hash Routing and Event Selection
     ============================================================ */

  /**
   * Reads the selected event from the existing hash-query URL format.
   *
   * @returns {string} Registry slug encoded in the event hash parameter, or an empty string.
   */
  function readEventSlugFromHash() {
    const rawHash = window.location.hash.replace(/^#\??/, "");
    return new URLSearchParams(rawHash).get(HASH_EVENT_KEY) || "";
  }

  /**
   * Checks whether the current hash explicitly represents gallery routing rather than a page anchor.
   *
   * @returns {boolean} True when an event parameter is present, even if its value is invalid.
   */
  function hashContainsEventParameter() {
    const rawHash = window.location.hash.replace(/^#\??/, "");
    return new URLSearchParams(rawHash).has(HASH_EVENT_KEY);
  }

  /**
   * Writes a bookmarkable hash while retaining any other hash-query parameters.
   *
   * @param {string} slug - Valid normalized event slug.
   * @param {"push"|"replace"} historyMode - Whether selection creates or replaces a history entry.
   * @returns {void}
   */
  function writeEventHash(slug, historyMode) {
    const rawHash = window.location.hash.replace(/^#\??/, "");
    const parameters = new URLSearchParams(rawHash);
    parameters.set(HASH_EVENT_KEY, slug);
    const nextUrl = `${window.location.pathname}${window.location.search}#${parameters.toString()}`;

    if (historyMode === "replace") {
      window.history.replaceState(null, "", nextUrl);
    } else {
      window.history.pushState(null, "", nextUrl);
    }
  }

  /**
   * Updates the chapter heading from normalized registry facts.
   *
   * @param {Object} eventEntry - Selected event with label and optional derived date.
   * @returns {void}
   */
  function renderEventHeading(eventEntry) {
    DOM.eventTitle.textContent = eventEntry.label;
    DOM.eventDate.textContent = eventEntry.date
      ? capitalizeFirst(DATE_HEADING_FORMATTER.format(eventEntry.date.value))
      : "";
  }

  /**
   * Selects, loads, and renders one event while preserving hash history behavior.
   *
   * @param {string} slug - Normalized registry slug requested by navigation or browser history.
   * @param {{historyMode?: "push"|"replace"|"none", forceReload?: boolean}} [options] - URL and reload behavior.
   * @returns {Promise<void>} Promise settled after the current event load attempt.
   */
  async function navigateToEvent(slug, options) {
    const historyMode = options && options.historyMode ? options.historyMode : "push";
    const forceReload = Boolean(options && options.forceReload);
    const eventEntry = APP_STATE.eventBySlug.get(slug);
    if (!eventEntry) {
      return;
    }

    if (historyMode !== "none" && readEventSlugFromHash() !== slug) {
      writeEventHash(slug, historyMode);
    }

    closeDrawer({ restoreFocus: false });
    closeLightbox();
    if (APP_STATE.activeSlug === slug && !forceReload) {
      updateNavigatorSelection(slug);
      if (DOM.gallery.getAttribute("aria-busy") !== "true") showItem(0, false);
      DOM.eventTitle.focus({ preventScroll: true });
      return;
    }

    APP_STATE.activeSlug = slug;
    APP_STATE.activeEvent = eventEntry;
    APP_STATE.loadSequence += 1;
    const currentLoadSequence = APP_STATE.loadSequence;
    updateNavigatorSelection(slug);
    renderEventHeading(eventEntry);
    DOM.main.querySelector(".event-heading .event-navigation")?.remove();
    DOM.eventTitle.closest(".event-heading").appendChild(createEventControls());
    DOM.eventTitle.focus({ preventScroll: true });
    renderLoadingState();

    try {
      const items = await loadEventData(eventEntry);
      // A later selection owns the shared gallery even if this script happened to finish afterward.
      if (currentLoadSequence !== APP_STATE.loadSequence) {
        return;
      }
      APP_STATE.media = items;
      DOM.eventStatus.textContent = "";
      renderGallery(items);
    } catch (error) {
      if (currentLoadSequence !== APP_STATE.loadSequence) {
        return;
      }
      console.error(formatLabel("eventErrorLog"), error);
      APP_STATE.media = [];
      renderEventFailure();
    }
  }

  /**
   * Resolves a bookmarked hash or replaces an invalid value with the first registry event.
   *
   * @param {"replace"|"none"} fallbackHistoryMode - URL behavior when no valid hash event exists.
   * @returns {void}
   */
  function navigateFromHash(fallbackHistoryMode) {
    if (!APP_STATE.events.length) return;
    const requestedSlug = readEventSlugFromHash();

    // Source-level anchors such as #main-content must remain available to keyboard and no-script users.
    if (window.location.hash && !hashContainsEventParameter()) {
      if (!APP_STATE.activeSlug) {
        navigateToEvent(APP_STATE.events[0].slug, { historyMode: "none" });
      }
      return;
    }

    const validSlug = APP_STATE.eventBySlug.has(requestedSlug)
      ? requestedSlug
      : APP_STATE.events[0].slug;
    const historyMode = requestedSlug === validSlug ? "none" : fallbackHistoryMode;
    navigateToEvent(validSlug, { historyMode });
  }

  /* ============================================================
     Event Binding and Initialization
     ============================================================ */

  /**
   * Handles modal Escape/Tab patterns and Left/Right navigation between book items.
   *
   * @param {KeyboardEvent} event - Page-level keydown event.
   * @returns {void}
   */
  function handleGlobalKeydown(event) {
    if (!DOM.lightbox.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }
      trapFocus(event, DOM.lightbox);
      return;
    }

    if (APP_STATE.drawerOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer({ restoreFocus: true });
        return;
      }
      trapFocus(event, DOM.navigator);
      return;
    }

    // Preserve text editing, native control keys, and modified browser shortcuts.
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && (event.target.isContentEditable || event.target.closest("input, textarea, select, video, audio, [role='slider'], [role='spinbutton']"))) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (DOM.gallery.getAttribute("aria-busy") === "true") return;
    const index = APP_STATE.currentItem + (event.key === "ArrowLeft" ? -1 : 1);
    if (index < 0 || index >= APP_STATE.media.length) return;
    event.preventDefault();
    showItem(index);
  }

  /**
   * Connects source-level controls to search, drawer, lightbox, and history behavior.
   *
   * @returns {void}
   */
  function bindInterfaceEvents() {
    DOM.eventSearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    DOM.eventSearch.addEventListener("input", () => {
      APP_STATE.searchTerm = DOM.eventSearch.value.trim();
      renderEventNavigator();
    });
    DOM.openNavigator.addEventListener("click", openDrawer);
    DOM.closeNavigator.addEventListener("click", () => {
      closeDrawer({ restoreFocus: true });
    });
    DOM.drawerScrim.addEventListener("click", () => {
      closeDrawer({ restoreFocus: true });
    });
    // Mouse dragging supplements native touch and keyboard scrolling in the zoomed image region.
    let panStart = null;
    DOM.lightboxBody.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !DOM.lightboxBody.classList.contains("is-zoomed")) return;
      event.preventDefault();
      panStart = { x: event.clientX, y: event.clientY, left: DOM.lightboxBody.scrollLeft, top: DOM.lightboxBody.scrollTop };
      DOM.lightboxBody.setPointerCapture(event.pointerId);
    });
    DOM.lightboxBody.addEventListener("pointermove", (event) => {
      if (!panStart) return;
      DOM.lightboxBody.scrollLeft = panStart.left + panStart.x - event.clientX;
      DOM.lightboxBody.scrollTop = panStart.top + panStart.y - event.clientY;
    });
    DOM.lightboxBody.addEventListener("lostpointercapture", () => { panStart = null; });
    DOM.closeLightbox.addEventListener("click", closeLightbox);
    DOM.lightbox.addEventListener("click", (event) => {
      if (event.target === DOM.lightbox) {
        closeLightbox();
      }
    });
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("popstate", () => {
      navigateFromHash("replace");
    });
    window.addEventListener("hashchange", () => {
      navigateFromHash("replace");
    });

  }

  /**
   * Starts the enhanced gallery from the protected event registry.
   *
   * @returns {void}
   */
  function initialize() {
    if (!cacheDomReferences()) {
      return;
    }

    applyTripConfig();
    APP_STATE.events = normalizeEventRegistry(window.GALLERY_EVENT_INDEX);
    APP_STATE.eventBySlug = new Map(
      APP_STATE.events.map((eventEntry) => [eventEntry.slug, eventEntry])
    );
    initializeBookLayout();
    renderTripFacts();
    renderEventNavigator();
    bindInterfaceEvents();
    synchronizeDrawerMode();

    if (APP_STATE.events.length === 0) {
      DOM.eventTitle.textContent = formatLabel("tripUnavailable");
      DOM.eventStatus.textContent = formatLabel("registryMissing");
      DOM.gallery.setAttribute("aria-busy", "false");
      DOM.gallery.replaceChildren(
        createStateCard(
          formatLabel("noTripEvents"),
          "error"
        )
      );
      DOM.navSummary.textContent = formatLabel("noEvents");
      return;
    }

    navigateFromHash("replace");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}());
