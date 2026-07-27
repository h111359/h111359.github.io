/**
 * app.js: Accessible controller for the public China travel journal.
 * Provides registry normalization, date-grouped navigation, event loading, editorial rendering, and modal focus handling.
 */

(function () {
  "use strict";

  /* ============================================================
     Configuration and State
     ============================================================ */

  const HASH_EVENT_KEY = "event";
  const EVENT_DATA_SCRIPT_ID = "eventDataScript";
  const THUMBNAIL_WIDTH = 1600;
  const ICON_VIEW_BOX = "0 0 24 24";
  const DRAWER_MEDIA_QUERY = window.matchMedia("(max-width: 53.75rem)");
  const GALLERY_VARIANTS = [
    "media-card--wide",
    "media-card--portrait",
    "",
    "",
    "media-card--portrait",
    "media-card--wide",
    "media-card--panorama"
  ];
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

  const DATE_GROUP_FORMATTER = new Intl.DateTimeFormat("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  });
  const DATE_HEADING_FORMATTER = new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
  const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("bg-BG", {
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
    drawerOpen: false
  };

  const DOM = {
    siteHeader: null,
    tripFacts: null,
    openNavigator: null,
    closeNavigator: null,
    drawerScrim: null,
    navigator: null,
    eventSearchForm: null,
    eventSearch: null,
    navSummary: null,
    eventGroups: null,
    main: null,
    eventDate: null,
    eventTitle: null,
    eventStatus: null,
    gallery: null,
    lightbox: null,
    closeLightbox: null,
    lightboxBody: null
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
   * Resolves and validates all source-level interface elements.
   *
   * @returns {boolean} True when every required element exists and initialization can continue.
   */
  function cacheDomReferences() {
    const idBindings = {
      siteHeader: "siteHeader",
      tripFacts: "tripFacts",
      openNavigator: "openNavigator",
      closeNavigator: "closeNavigator",
      drawerScrim: "drawerScrim",
      navigator: "eventNavigator",
      eventSearch: "eventSearch",
      navSummary: "navSummary",
      eventGroups: "eventGroups",
      main: "main-content",
      eventDate: "eventDate",
      eventTitle: "eventTitle",
      eventStatus: "eventStatus",
      gallery: "gallery",
      lightbox: "lightbox",
      closeLightbox: "closeLightbox",
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
      console.error("Липсват задължителни елементи на галерията:", missingReferences.join(", "));
      return false;
    }
    return true;
  }

  /**
   * Uppercases only the first visible character of a generated Bulgarian label.
   *
   * @param {string} value - Text that may begin with a lowercase character.
   * @returns {string} Text with a locale-aware uppercase first character.
   */
  function capitalizeFirst(value) {
    if (!value) {
      return "";
    }
    return value.charAt(0).toLocaleUpperCase("bg-BG") + value.slice(1);
  }

  /**
   * Returns a Bulgarian event-count phrase.
   *
   * @param {number} count - Deduplicated number of registry events.
   * @returns {string} A visitor-facing singular or plural count.
   */
  function formatEventCount(count) {
    return count === 1 ? "1 събитие" : `${count} събития`;
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
      ? `Събитие: ${capitalizeFirst(fallbackPhrase)}`
      : "Събитие без заглавие";
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
        : "Без посочена дата";

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
      closeDrawer({ restoreFocus: true });
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
    const normalizedTerm = APP_STATE.searchTerm.toLocaleLowerCase("bg-BG");
    const visibleEvents = normalizedTerm
      ? APP_STATE.events.filter((eventEntry) => (
        eventEntry.label.toLocaleLowerCase("bg-BG").includes(normalizedTerm)
      ))
      : APP_STATE.events;

    DOM.eventGroups.replaceChildren();

    if (visibleEvents.length === 0) {
      const emptyMessage = createElement("p", "event-groups__empty");
      emptyMessage.textContent = "Няма събития, които отговарят на търсенето.";
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
      ? `Показани ${visibleEvents.length} от ${formatEventCount(APP_STATE.events.length)}`
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
    DOM.siteHeader.inert = isInert;
    DOM.main.inert = isInert;
  }

  /**
   * Opens the compact event drawer and transfers focus to its close control.
   *
   * @returns {void}
   */
  function openDrawer() {
    if (!DRAWER_MEDIA_QUERY.matches || APP_STATE.drawerOpen) {
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
    DOM.closeNavigator.focus();
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

    if (DRAWER_MEDIA_QUERY.matches) {
      DOM.navigator.setAttribute("aria-hidden", "true");
    }
    DOM.navigator.removeAttribute("role");
    DOM.navigator.removeAttribute("aria-modal");

    if (restoreFocus) {
      DOM.openNavigator.focus();
    }
  }

  /**
   * Synchronizes navigator semantics when the responsive breakpoint changes.
   *
   * @returns {void}
   */
  function synchronizeDrawerMode() {
    if (DRAWER_MEDIA_QUERY.matches) {
      DOM.navigator.setAttribute("aria-hidden", APP_STATE.drawerOpen ? "false" : "true");
      return;
    }

    if (APP_STATE.drawerOpen) {
      closeDrawer({ restoreFocus: false });
    }
    DOM.navigator.removeAttribute("aria-hidden");
    DOM.navigator.removeAttribute("role");
    DOM.navigator.removeAttribute("aria-modal");
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
   * Builds a lazy gallery thumbnail URL from an existing Drive identifier.
   *
   * @param {string} driveId - File identifier extracted from the stored preview URL.
   * @returns {string} Google Drive thumbnail address.
   */
  function buildThumbnailUrl(driveId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w${THUMBNAIL_WIDTH}`;
  }

  /**
   * Builds a direct-view fallback URL from an existing Drive identifier.
   *
   * @param {string} driveId - File identifier extracted from the stored preview URL.
   * @returns {string} Google Drive view address used only after thumbnail failure.
   */
  function buildViewUrl(driveId) {
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveId)}`;
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
      const rawType = String(item.type || "").toLocaleLowerCase("bg-BG");

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
        desc: String(item.desc || ""),
        driveId
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
          reject(new Error("Остаряло зареждане на събитие."));
          return;
        }

        const rawItems = window.GALLERY_ITEMS;
        delete window.GALLERY_ITEMS;
        script.remove();
        APP_STATE.activeDataScript = null;

        if (!Array.isArray(rawItems)) {
          reject(new Error(`Липсват данни за събитието ${eventEntry.slug}.`));
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
        reject(new Error(`Неуспешно зареждане на ${eventEntry.data}.`));
      });

      document.head.appendChild(script);
    });
  }

  /* ============================================================
     Editorial Gallery Rendering
     ============================================================ */

  /**
   * Returns the varied media-card class assigned by source media position.
   *
   * @param {number} mediaIndex - Zero-based media position excluding story blocks.
   * @returns {string} Editorial layout variant that never changes DOM order.
   */
  function getGalleryVariant(mediaIndex) {
    return GALLERY_VARIANTS[mediaIndex % GALLERY_VARIANTS.length];
  }

  /**
   * Replaces a failed thumbnail with its direct-view fallback and then a Bulgarian placeholder.
   *
   * @param {HTMLImageElement} image - Thumbnail that emitted the error.
   * @param {HTMLButtonElement} mediaButton - Parent action receiving the final error state.
   * @param {string} driveId - Existing Google Drive file identifier.
   * @returns {void}
   */
  function handleThumbnailError(image, mediaButton, driveId) {
    if (!image.dataset.fallbackAttempted) {
      image.dataset.fallbackAttempted = "true";
      image.src = buildViewUrl(driveId);
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
    const hasDescription = item.desc.trim().length > 0;
    const variant = hasDescription ? "media-card--story" : getGalleryVariant(mediaIndex);
    const cardClasses = ["media-card", variant].filter(Boolean).join(" ");
    const card = createElement("article", cardClasses);
    const button = createElement("button", "media-button");
    const image = createElement("img");
    const placeholder = createElement("span", "media-placeholder");
    const mediaNumber = mediaIndex + 1;
    const mediaNoun = item.kind === "video" ? "видео" : "снимка";
    const eventLabel = APP_STATE.activeEvent ? APP_STATE.activeEvent.label : "събитието";

    button.type = "button";
    button.setAttribute("aria-label", `Отвори ${mediaNoun} ${mediaNumber}: ${eventLabel}`);
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.alt = item.kind === "video"
      ? `Кадър от видео ${mediaNumber} — ${eventLabel}`
      : `Снимка ${mediaNumber} — ${eventLabel}`;
    image.src = buildThumbnailUrl(item.driveId);
    image.addEventListener("error", () => {
      handleThumbnailError(image, button, item.driveId);
    });
    placeholder.textContent = item.kind === "video"
      ? "Кадърът не може да се зареди. Видеото може да се отвори."
      : "Снимката не може да се зареди. Опитайте да я отворите.";

    button.append(image, placeholder);

    if (item.kind === "video") {
      const playMark = createElement("span", "play-mark");
      playMark.appendChild(createIcon("M9 7l8 5-8 5z"));
      button.appendChild(playMark);
    }

    button.addEventListener("click", () => {
      openLightbox(item, button);
    });
    card.appendChild(button);

    if (hasDescription) {
      const caption = createElement("div", "media-caption");
      // Rich text is trusted local content authored through data_editor.html and must retain formatting.
      caption.innerHTML = item.desc;
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
   * @param {string} message - Bulgarian explanation shown to visitors.
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
      retryButton.textContent = "Опитайте отново";
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
    DOM.gallery.replaceChildren();
    DOM.gallery.setAttribute("aria-busy", "false");

    if (items.length === 0) {
      DOM.eventStatus.textContent = "За това събитие няма съдържание за показване.";
      DOM.gallery.appendChild(
        createStateCard("За това събитие няма съдържание за показване.", "empty")
      );
      return;
    }

    let mediaIndex = 0;
    items.forEach((item) => {
      if (item.kind === "text") {
        DOM.gallery.appendChild(createStoryCard(item));
        return;
      }

      DOM.gallery.appendChild(createMediaCard(item, mediaIndex));
      mediaIndex += 1;
    });
  }

  /**
   * Displays a loading surface without inserting technical data paths into visitor copy.
   *
   * @returns {void}
   */
  function renderLoadingState() {
    DOM.gallery.setAttribute("aria-busy", "true");
    DOM.gallery.replaceChildren(
      createStateCard("Зареждане на снимките и разказите…", "loading")
    );
    DOM.eventStatus.textContent = "Съдържанието се зарежда.";
  }

  /**
   * Displays a recoverable Bulgarian failure state for the selected event.
   *
   * @returns {void}
   */
  function renderEventFailure() {
    DOM.gallery.setAttribute("aria-busy", "false");
    DOM.eventStatus.textContent = "Съдържанието не можа да се зареди.";
    DOM.gallery.replaceChildren(
      createStateCard(
        "Възникна проблем при зареждането на това събитие. Проверете връзката и опитайте отново.",
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
    DOM.siteHeader.inert = isInert;
    DOM.navigator.inert = isInert;
    DOM.main.inert = isInert;
  }

  /**
   * Builds a Drive preview URL, adding autoplay only for video records.
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
      previewUrl.searchParams.set("autoplay", "1");
      return previewUrl.toString();
    } catch (error) {
      console.error("Адресът за видеото не може да бъде обработен:", error);
      return item.preview;
    }
  }

  /**
   * Opens the selected Drive media in the basic modal and transfers focus to Close.
   *
   * @param {Object} item - Normalized image or video item selected by the visitor.
   * @param {HTMLButtonElement} trigger - Gallery control that must regain focus after dismissal.
   * @returns {void}
   */
  function openLightbox(item, trigger) {
    const frame = createElement("iframe", "lightbox__frame");
    const mediaNoun = item.kind === "video" ? "видео" : "снимка";
    const eventLabel = APP_STATE.activeEvent ? APP_STATE.activeEvent.label : "събитието";
    frame.title = `Преглед на ${mediaNoun}: ${eventLabel}`;
    frame.referrerPolicy = "no-referrer";
    frame.allow = item.kind === "video"
      ? "autoplay; fullscreen; picture-in-picture"
      : "fullscreen; picture-in-picture";
    frame.src = buildLightboxUrl(item);

    APP_STATE.lightboxTrigger = trigger;
    DOM.lightboxBody.replaceChildren(frame);
    DOM.lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    setLightboxBackgroundInert(true);
    DOM.closeLightbox.focus();
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
    DOM.lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    setLightboxBackgroundInert(false);

    if (APP_STATE.lightboxTrigger && APP_STATE.lightboxTrigger.isConnected) {
      APP_STATE.lightboxTrigger.focus();
    }
    APP_STATE.lightboxTrigger = null;
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

    if (APP_STATE.activeSlug === slug && !forceReload) {
      updateNavigatorSelection(slug);
      return;
    }

    APP_STATE.activeSlug = slug;
    APP_STATE.activeEvent = eventEntry;
    APP_STATE.loadSequence += 1;
    const currentLoadSequence = APP_STATE.loadSequence;
    updateNavigatorSelection(slug);
    renderEventHeading(eventEntry);
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
      console.error("Събитието не можа да се зареди:", error);
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
   * Handles global Escape and Tab patterns for the active modal surface.
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
    }
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
    DRAWER_MEDIA_QUERY.addEventListener("change", synchronizeDrawerMode);
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

    APP_STATE.events = normalizeEventRegistry(window.GALLERY_EVENT_INDEX);
    APP_STATE.eventBySlug = new Map(
      APP_STATE.events.map((eventEntry) => [eventEntry.slug, eventEntry])
    );
    bindInterfaceEvents();
    synchronizeDrawerMode();

    if (APP_STATE.events.length === 0) {
      DOM.eventTitle.textContent = "Пътуването не може да бъде заредено";
      DOM.eventStatus.textContent = "Липсва списък със събития.";
      DOM.gallery.setAttribute("aria-busy", "false");
      DOM.gallery.replaceChildren(
        createStateCard(
          "В момента няма достъпни събития от пътуването.",
          "error"
        )
      );
      DOM.navSummary.textContent = "Няма събития";
      return;
    }

    renderTripFacts();
    renderEventNavigator();
    navigateFromHash("replace");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}());
