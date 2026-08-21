/**
 * sw.js: Folder-scoped offline cache for the Nikiti catalogue.
 * Pre-caches the structured snapshot, interface, and every locally licensed image.
 */

const CACHE_NAME = "greece-guide-v6";
const GUIDE_CACHE_PREFIX = "greece-guide-";
const GET_METHOD = "GET";
const NAVIGATION_MODE = "navigate";
const RECORD_COLLECTION_KEYS = ["foods", "restaurants", "fish", "sights", "beaches"];
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./styles.css?v=6",
    "./app.js?v=6",
    "./sw.js",
    "./catalog-data.json?v=6",
    "./images/image-licenses.json"
];

/**
 * Collects every unique local record image declared by the structured catalogue.
 *
 * @param {Object} catalogue - Parsed catalogue snapshot with the five record collections.
 * @returns {string[]} Folder-relative image paths ready for Cache.addAll().
 */
function collectCatalogueImageAssets(catalogue) {
    const imagePaths = RECORD_COLLECTION_KEYS.flatMap(function collectCollectionImages(collectionKey) {
        return catalogue[collectionKey].flatMap(function getRecordImages(record) {
            const images = Array.isArray(record.images) ? record.images : record.image ? [record.image] : [];
            return images.map(function getImagePath(image) {
                return `./${image.src}`;
            });
        });
    });
    return Array.from(new Set(imagePaths));
}

/**
 * Pre-caches the interface, structured snapshot, attribution registry, and all record images.
 *
 * @returns {Promise<void>} Promise resolved when the complete local catalogue is cached.
 */
async function cacheCompleteLocalSnapshot() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    const catalogueResponse = await cache.match("./catalog-data.json?v=6");
    if (!catalogueResponse) {
        throw new Error("The cached catalogue snapshot is unavailable.");
    }
    const catalogue = await catalogueResponse.json();
    await cache.addAll(collectCatalogueImageAssets(catalogue));
}

/**
 * Fetches a same-origin request and refreshes its successful cached response.
 *
 * @param {Request} request - Local request to retrieve and cache.
 * @returns {Promise<Response>} Network response for the current request.
 */
async function fetchAndCache(request) {
    const response = await fetch(request);

    if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }

    return response;
}

/**
 * Uses the network for navigation so a returning visitor receives current static files.
 *
 * @param {Request} request - Navigation request within the guide scope.
 * @returns {Promise<Response>} Live page or cached source-visible document.
 */
async function handleNavigation(request) {
    try {
        return await fetchAndCache(request);
    } catch (error) {
        const requestedDocument = await caches.match(request);
        const fallbackDocument = await caches.match("./index.html");

        if (requestedDocument || fallbackDocument) {
            return requestedDocument || fallbackDocument;
        }

        throw error;
    }
}

/**
 * Serves static local assets immediately and fills cache gaps from the network.
 *
 * @param {Request} request - Same-origin asset request within the guide scope.
 * @returns {Promise<Response>} Cached or live response for the requested asset.
 */
async function handleAsset(request) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || fetchAndCache(request);
}

self.addEventListener("install", function cacheCompleteGuide(event) {
    event.waitUntil(
        cacheCompleteLocalSnapshot()
            .then(function activateCurrentWorker() {
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", function removeSupersededGuideCaches(event) {
    event.waitUntil(
        caches.keys()
            .then(function deleteUnusedCaches(cacheNames) {
                return Promise.all(cacheNames
                    .filter(function isOldGuideCache(cacheName) {
                        return cacheName.startsWith(GUIDE_CACHE_PREFIX) && cacheName !== CACHE_NAME;
                    })
                    .map(function deleteOldGuideCache(cacheName) {
                        return caches.delete(cacheName);
                    }));
            })
            .then(function controlOpenGuidePages() {
                return self.clients.claim();
            })
    );
});

self.addEventListener("fetch", function serveGuideRequest(event) {
    const request = event.request;
    const requestUrl = new URL(request.url);

    if (request.method !== GET_METHOD || requestUrl.origin !== self.location.origin) {
        return;
    }

    if (request.mode === NAVIGATION_MODE) {
        event.respondWith(handleNavigation(request));
        return;
    }

    event.respondWith(handleAsset(request));
});
