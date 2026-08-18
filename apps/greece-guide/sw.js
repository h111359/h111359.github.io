/**
 * sw.js: Folder-scoped offline cache for the Nikiti and Sithonia guide.
 * Pre-caches the complete local app shell and refreshes same-origin resources when online.
 */

const CACHE_NAME = "greece-guide-v1";
const CORE_ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./sw.js"];
const GET_METHOD = "GET";
const NAVIGATION_MODE = "navigate";

/**
 * Fetches a request and stores a successful same-origin response for later offline use.
 *
 * @param {Request} request - Same-origin request to retrieve and cache.
 * @returns {Promise<Response>} Network response for the current request.
 * @throws {TypeError} When the network request cannot be completed.
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
 * Resolves a navigation request online first and falls back to the cached guide document.
 *
 * @param {Request} request - Browser navigation request within the guide scope.
 * @returns {Promise<Response>} Live page or cached guide document when offline.
 */
async function handleNavigation(request) {
    try {
        return await fetchAndCache(request);
    } catch (error) {
        // Navigation remains useful offline by returning the complete source-visible guide.
        const cachedDocument = await caches.match("./index.html");
        if (cachedDocument) {
            return cachedDocument;
        }
        throw error;
    }
}

/**
 * Resolves a local asset from cache first and refreshes missing assets from the network.
 *
 * @param {Request} request - Same-origin asset request within the guide scope.
 * @returns {Promise<Response>} Cached or live response for the requested asset.
 */
async function handleAsset(request) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || fetchAndCache(request);
}

self.addEventListener("install", function cacheGuideShell(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function addCoreAssets(cache) {
                return cache.addAll(CORE_ASSETS);
            })
            .then(function activateCurrentWorker() {
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", function removeOldGuideCaches(event) {
    event.waitUntil(
        caches.keys()
            .then(function deleteUnusedCaches(cacheNames) {
                return Promise.all(cacheNames
                    .filter(function isOldGuideCache(cacheName) {
                        return cacheName.startsWith("greece-guide-") && cacheName !== CACHE_NAME;
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
