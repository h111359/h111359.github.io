/**
 * app.js: Progressive filtering and offline-state enhancement for the Greece guide.
 * Provides searchable cards, live result feedback, connectivity messaging, and service-worker setup.
 */

(function enhanceGreeceGuide() {
    "use strict";

    const ALL_VALUE = "all";
    const FILTERED_CLASS = "is-filtered-out";
    const OFFLINE_CLASS = "is-offline";
    const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
    const SELECTORS = {
        filterForm: "[data-filter-form]",
        searchItem: "[data-search-item]",
        searchPanel: "[data-search-panel]",
        resultStatus: "[data-result-status]",
        connectionStatus: "[data-connection-status]",
        phraseGroupTitle: ".phrase-group-title"
    };
    const CONNECTION_COPY = {
        online: "Онлайн: картите и източниците могат да се отворят.",
        offline: "Офлайн: справочникът е наличен; външните връзки изискват интернет."
    };

    /**
     * Normalizes searchable copy for case-insensitive matching in Bulgarian and Greek.
     *
     * @param {string} value - Text to prepare for comparison.
     * @returns {string} Lowercase text without combining accent marks.
     */
    function normalizeText(value) {
        return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    }

    /**
     * Splits a space-separated data attribute into searchable tokens.
     *
     * @param {string | undefined} value - Data attribute value to split.
     * @returns {string[]} Individual non-empty tokens.
     */
    function getTokens(value) {
        return (value || "").split(/\s+/).filter(Boolean);
    }

    /**
     * Checks whether a selected filter is present in an item's token list.
     *
     * @param {string} selection - Current filter selection.
     * @param {string | undefined} itemValue - Item data attribute to inspect.
     * @returns {boolean} True when the selection is unrestricted or matched.
     */
    function matchesSelection(selection, itemValue) {
        return selection === ALL_VALUE || getTokens(itemValue).includes(selection);
    }

    /**
     * Reports the number of visible indexed records through the polite live region.
     *
     * @param {HTMLElement} statusElement - Live region receiving the summary.
     * @param {number} visibleCount - Number of records passing all filters.
     * @param {number} totalCount - Total number of indexed records.
     * @returns {void}
     */
    function reportVisibleCount(statusElement, visibleCount, totalCount) {
        statusElement.textContent = `Показани ${visibleCount} от ${totalCount} записа.`;
    }

    /**
     * Hides phrase group headings that have no visible phrase rows beneath them.
     *
     * @returns {void}
     */
    function updatePhraseGroupHeadings() {
        document.querySelectorAll(SELECTORS.phraseGroupTitle).forEach(function updateHeading(heading) {
            let sibling = heading.nextElementSibling;
            let hasVisiblePhrase = false;

            while (sibling && !sibling.matches(SELECTORS.phraseGroupTitle)) {
                if (sibling.matches(SELECTORS.searchItem) && !sibling.classList.contains(FILTERED_CLASS)) {
                    hasVisiblePhrase = true;
                    break;
                }
                sibling = sibling.nextElementSibling;
            }

            heading.classList.toggle(FILTERED_CLASS, !hasVisiblePhrase);
        });
    }

    /**
     * Applies text and metadata filters to every indexed card or phrase.
     *
     * @param {HTMLFormElement} form - Filter form containing the current choices.
     * @param {HTMLElement[]} items - Indexed guide records to update.
     * @param {HTMLElement} statusElement - Live region for the visible result count.
     * @returns {void}
     */
    function applyFilters(form, items, statusElement) {
        const formData = new FormData(form);
        const query = normalizeText(String(formData.get("query") || "").trim());
        const kind = String(formData.get("kind") || ALL_VALUE);
        const category = String(formData.get("category") || ALL_VALUE);
        const area = String(formData.get("area") || ALL_VALUE);
        const feature = String(formData.get("feature") || ALL_VALUE);
        let visibleCount = 0;

        items.forEach(function updateItemVisibility(item) {
            const matchesQuery = !query || normalizeText(item.textContent || "").includes(query);
            const isVisible = matchesQuery
                && matchesSelection(kind, item.dataset.kind)
                && matchesSelection(category, item.dataset.category)
                && matchesSelection(area, item.dataset.area)
                && matchesSelection(feature, item.dataset.feature);

            item.classList.toggle(FILTERED_CLASS, !isVisible);
            visibleCount += isVisible ? 1 : 0;
        });

        updatePhraseGroupHeadings();
        reportVisibleCount(statusElement, visibleCount, items.length);
    }

    /**
     * Enables search controls only after their interaction code is ready.
     *
     * @returns {void}
     */
    function initializeSearch() {
        const panel = document.querySelector(SELECTORS.searchPanel);
        const form = document.querySelector(SELECTORS.filterForm);
        const statusElement = document.querySelector(SELECTORS.resultStatus);
        const items = Array.from(document.querySelectorAll(SELECTORS.searchItem));

        if (!panel || !form || !statusElement || items.length === 0) {
            return;
        }

        panel.hidden = false;
        const refreshResults = function refreshResults() {
            applyFilters(form, items, statusElement);
        };

        form.addEventListener("input", refreshResults);
        form.addEventListener("change", refreshResults);
        form.addEventListener("reset", function refreshAfterNativeReset() {
            window.requestAnimationFrame(refreshResults);
        });
        refreshResults();
    }

    /**
     * Updates the persistent note so external-link limitations are explicit offline.
     *
     * @returns {void}
     */
    function updateConnectionStatus() {
        const statusElement = document.querySelector(SELECTORS.connectionStatus);
        if (!statusElement) {
            return;
        }

        const isOffline = !navigator.onLine;
        statusElement.textContent = isOffline ? CONNECTION_COPY.offline : CONNECTION_COPY.online;
        statusElement.classList.toggle(OFFLINE_CLASS, isOffline);
    }

    /**
     * Registers the folder-scoped service worker on secure or local test origins.
     *
     * @returns {void}
     */
    function registerOfflineSupport() {
        const isSecureOrigin = window.location.protocol === "https:"
            || LOCAL_HOSTNAMES.has(window.location.hostname);

        if (!("serviceWorker" in navigator) || !isSecureOrigin) {
            return;
        }

        navigator.serviceWorker.register("./sw.js").catch(function reportRegistrationFailure(error) {
            // The guide remains complete online; log the cache failure for diagnostics.
            console.warn("Offline support could not be enabled.", error);
        });
    }

    initializeSearch();
    updateConnectionStatus();
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);
    registerOfflineSupport();
}());
