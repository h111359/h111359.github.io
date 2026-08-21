/**
 * site.js: Progressive enhancement for the bilingual four-page career presentation.
 * Provides language preference, in-place route-state confirmation, and one-time reveals.
 */

(function enhanceCareerSite() {
    "use strict";

    const ROOT_PATH = "/";
    const ENGLISH_HOME_PATH = "/index.html";
    const BULGARIAN_HOME_PATH = "/index-bg.html";
    const HOME_PATHS = new Set([ROOT_PATH, ENGLISH_HOME_PATH]);
    const LANGUAGE_STORAGE_KEY = "portfolio-language";
    const SUPPORTED_LANGUAGES = new Set(["bg", "en"]);
    const CURRENT_CLASS = "is-current";
    const REVEAL_READY_CLASS = "reveal-ready";
    const REVEAL_VISIBLE_CLASS = "reveal-visible";
    const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
    const REVEAL_OPTIONS = {
        root: null,
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.08
    };

    /**
     * Normalizes a pathname so the domain root and index document share Home state.
     *
     * @param {string} pathname - Browser or link pathname to normalize.
     * @returns {string} A normalized pathname beginning with a slash.
     */
    function normalizePath(pathname) {
        const normalizedPath = pathname.replace(/\/+/g, "/");
        return HOME_PATHS.has(normalizedPath) ? ENGLISH_HOME_PATH : normalizedPath;
    }

    /**
     * Reads a valid language preference when browser storage is available.
     *
     * @returns {string|null} The saved language code, or null when unavailable or invalid.
     */
    function readLanguagePreference() {
        try {
            const language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
            return SUPPORTED_LANGUAGES.has(language) ? language : null;
        } catch (storageError) {
            // Privacy settings may block storage; static language links remain fully functional.
            return null;
        }
    }

    /**
     * Saves a supported language preference when browser storage is available.
     *
     * @param {string} language - The language code selected by the visitor.
     * @returns {void}
     */
    function writeLanguagePreference(language) {
        if (!SUPPORTED_LANGUAGES.has(language)) {
            return;
        }

        try {
            window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        } catch (storageError) {
            // A failed preference write never blocks navigation through ordinary links.
        }
    }

    /**
     * Applies root-only preference routing and records explicit language choices.
     *
     * @returns {boolean} True when navigation to the Bulgarian Home page has started.
     */
    function enhanceLanguagePreference() {
        const currentPath = window.location.pathname.replace(/\/+/g, "/");

        // Only the bare domain root may follow a saved preference; named URLs stay authoritative.
        if (currentPath === ROOT_PATH && readLanguagePreference() === "bg") {
            const destination = `${BULGARIAN_HOME_PATH}${window.location.search}${window.location.hash}`;
            window.location.replace(destination);
            return true;
        }

        writeLanguagePreference(document.documentElement.lang);
        const languageLinks = document.querySelectorAll("[data-language-option]");
        languageLinks.forEach(function rememberSelectedLanguage(link) {
            link.addEventListener("click", function saveLanguageBeforeNavigation() {
                writeLanguagePreference(link.dataset.languageOption);
            });
        });
        return false;
    }

    /**
     * Confirms the current route on hard-coded navigation without removing source state.
     *
     * @returns {void}
     */
    function enhanceNavigation() {
        const currentPath = normalizePath(window.location.pathname);
        const navigationLinks = document.querySelectorAll("[data-site-nav] a[href]");

        navigationLinks.forEach(function markMatchingNavigationLink(link) {
            const linkPath = normalizePath(new URL(link.href, window.location.href).pathname);
            if (linkPath === currentPath) {
                link.classList.add(CURRENT_CLASS);
                link.dataset.locationCurrent = "true";
            }
        });
    }

    /**
     * Reveals an observed element once and releases it from further observation.
     *
     * @param {IntersectionObserverEntry[]} entries - Current visibility changes.
     * @param {IntersectionObserver} observer - Observer managing reveal targets.
     * @returns {void}
     */
    function revealVisibleElements(entries, observer) {
        entries.forEach(function revealVisibleElement(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add(REVEAL_VISIBLE_CLASS);
                observer.unobserve(entry.target);
            }
        });
    }

    /**
     * Checks whether a reveal target is already inside the initial viewport.
     *
     * @param {Element} target - Element considered for immediate visibility.
     * @returns {boolean} True when any part of the target intersects the viewport.
     */
    function isInInitialViewport(target) {
        const bounds = target.getBoundingClientRect();
        return bounds.bottom >= 0 && bounds.top <= window.innerHeight;
    }

    /**
     * Enables reveal classes only when motion is welcome and observer support exists.
     *
     * @returns {void}
     */
    function enhanceReveals() {
        const revealTargets = document.querySelectorAll("[data-reveal]");
        const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;

        if (reducedMotion || !("IntersectionObserver" in window) || revealTargets.length === 0) {
            return;
        }

        document.body.classList.add(REVEAL_READY_CLASS);
        const observer = new IntersectionObserver(revealVisibleElements, REVEAL_OPTIONS);
        revealTargets.forEach(function prepareRevealTarget(target) {
            if (isInInitialViewport(target)) {
                target.classList.add(REVEAL_VISIBLE_CLASS);
            } else {
                observer.observe(target);
            }
        });
    }

    if (!enhanceLanguagePreference()) {
        enhanceNavigation();
        enhanceReveals();
    }
}());
