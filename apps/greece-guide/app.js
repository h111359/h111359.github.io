/**
 * app.js: Progressive catalogue, accessible tabs, route actions, filters, and galleries for the Nikiti guide.
 * Provides data-driven rendering while preserving source-visible route and catalogue fallbacks.
 */

(function enhanceNikitiCatalogue() {
    "use strict";

    // Revision query bypasses older cache-first workers that predate villa-based routes and expanded dishes.
    const DATA_URL = "./catalog-data.json?v=6";
    const ALL_VALUE = "all";
    const DEFAULT_TAB = "food";
    const INITIAL_HASH_ALIGNMENT_DELAY_MS = 100;
    const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
    const MINIMUM_RATING_REVIEWS = 50;
    const ROUTE_ORIGIN = {
        latitude: 40.207465355104475,
        longitude: 23.676892454034267
    };
    const TAB_IDS = ["food", "restaurants", "fish", "sights", "beaches"];
    const IMAGE_DIMENSIONS = {
        "images/moussaka.jpg": [960, 657],
        "images/tsipoura.jpg": [960, 720],
        "images/old-nikiti.jpg": [1280, 960],
        "images/spathies.jpg": [640, 480],
        "images/agios-ioannis.jpg": [800, 600],
        "images/nikiti-kastri.jpg": [1920, 1440]
    };
    const TAB_CONFIG = {
        food: {
            dataKey: "foods",
            filterALabel: "Категория",
            filterBLabel: "Потвърждение",
            sortOptions: [["name", "Име"], ["price", "Цена"]]
        },
        restaurants: {
            dataKey: "restaurants",
            filterALabel: "Вид заведение",
            filterBLabel: "Кухня",
            sortOptions: [["distance", "Пешеходна близост"], ["name", "Име"], ["rating", "Google рейтинг"], ["popularity", "Популярност"], ["price", "Ценова категория"]]
        },
        fish: {
            dataKey: "fish",
            filterALabel: "Приготвяне",
            filterBLabel: "Вкус / текстура",
            sortOptions: [["name", "Име на български"], ["greek", "Име на гръцки"]]
        },
        sights: {
            dataKey: "sights",
            filterALabel: "Тип",
            filterBLabel: "Време с автомобил",
            sortOptions: [["distance", "Автомобилна близост"], ["name", "Име"], ["drive", "Време с автомобил"]]
        },
        beaches: {
            dataKey: "beaches",
            filterALabel: "Тип бряг",
            filterBLabel: "Удобство",
            sortOptions: [["proximity", "Група и близост"], ["name", "Име"], ["drive", "Време"], ["family", "За семейства"]]
        }
    };
    const SELECTORS = {
        tabs: "[role='tab']",
        panels: "[role='tabpanel']",
        list: "[data-catalog-list]",
        filters: "[data-catalog-filters]",
        query: "[data-filter-query]",
        filterA: "[data-filter-a]",
        filterB: "[data-filter-b]",
        sort: "[data-sort]",
        status: "[data-result-status]"
    };
    let catalogue = null;
    let activeTabId = DEFAULT_TAB;

    /**
     * Creates a DOM element with optional class and text without parsing HTML strings.
     *
     * @param {string} tagName - HTML tag name to create.
     * @param {string} [className] - Optional class list for the new element.
     * @param {string} [textValue] - Optional text content for the new element.
     * @returns {HTMLElement} The configured element.
     */
    function createElement(tagName, className, textValue) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        if (textValue !== undefined) {
            element.textContent = textValue;
        }
        return element;
    }

    /**
     * Normalizes human-readable copy for case- and accent-insensitive filtering.
     *
     * @param {string} value - Text to normalize.
     * @returns {string} Lowercase text with combining marks removed.
     */
    function normalizeText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("bg");
    }

    /**
     * Formats a numeric euro price for Bulgarian readers.
     *
     * @param {number} value - Price value in euros.
     * @returns {string} Localized price with the euro symbol.
     */
    function formatEuro(value) {
        return new Intl.NumberFormat("bg-BG", {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: Number.isInteger(value) ? 0 : 2
        }).format(value);
    }

    /**
     * Builds an external link with the security relationship required for a new tab.
     *
     * @param {string} label - Visible link label.
     * @param {string} url - Destination URL.
     * @returns {HTMLAnchorElement} Configured external anchor.
     */
    function createExternalLink(label, url) {
        const link = createElement("a", "record-link", label);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return link;
    }

    /**
     * Creates a labelled definition-list row.
     *
     * @param {HTMLDListElement} list - Definition list receiving the row.
     * @param {string} term - Field label.
     * @param {string} description - Field value.
     * @returns {void}
     */
    function appendDefinition(list, term, description) {
        list.append(createElement("dt", "record-detail__term", term));
        list.append(createElement("dd", "record-detail__value", description || "Няма достатъчно данни"));
    }

    /**
     * Adds a keyboard-scrollable gallery of factual local images or an honest shortage notice.
     *
     * @param {HTMLElement} card - Record card receiving the media block.
     * @param {Object|Object[]|null|undefined} imageData - One image or an array of image metadata.
     * @param {string} [shortageNote] - Evidence note when fewer than three object-specific images exist.
     * @returns {void}
     */
    function appendRecordMedia(card, imageData, shortageNote) {
        const images = Array.isArray(imageData) ? imageData : imageData ? [imageData] : [];
        const media = createElement("section", "record-media-group");
        media.setAttribute("aria-label", "Снимки на записа");

        if (!images.length) {
            const placeholder = createElement("div", "record-media__placeholder");
            placeholder.setAttribute("role", "img");
            placeholder.setAttribute("aria-label", "Няма намерена лицензирана снимка на конкретния обект");
            placeholder.append(createElement("span", "record-media__symbol", "◌"));
            placeholder.append(createElement("span", "record-media__missing", "Няма намерена лицензирана снимка на конкретния обект"));
            media.append(placeholder);
        } else {
            const gallery = createElement("div", "record-gallery");
            // The focusable native scroller supports Arrow keys without custom carousel controls.
            gallery.tabIndex = 0;
            gallery.setAttribute("aria-label", `Галерия с ${images.length} снимки; използвайте стрелките за хоризонтално превъртане`);
            images.forEach(function appendImage(imageDataItem) {
                const figure = createElement("figure", "record-media");
                const image = document.createElement("img");
                const storedDimensions = Number.isFinite(imageDataItem.width) && Number.isFinite(imageDataItem.height)
                    ? [imageDataItem.width, imageDataItem.height]
                    : null;
                const dimensions = storedDimensions || IMAGE_DIMENSIONS[imageDataItem.src] || [960, 720];
                image.src = imageDataItem.src;
                image.alt = imageDataItem.alt;
                image.width = dimensions[0];
                image.height = dimensions[1];
                image.loading = "lazy";
                image.decoding = "async";
                const caption = createElement("figcaption", "record-media__credit");
                if (imageDataItem.context) {
                    caption.append(createElement("span", "record-media__context", imageDataItem.context));
                }
                caption.append(createExternalLink(`${imageDataItem.credit} · ${imageDataItem.license}`, imageDataItem.source));
                figure.append(image, caption);
                gallery.append(figure);
            });
            media.append(gallery);
        }

        if (shortageNote) {
            media.append(createElement("p", "record-media__shortage", shortageNote));
        }
        card.prepend(media);
    }

    /**
     * Adds a linked list of provenance sources to a record card.
     *
     * @param {HTMLElement} container - Element receiving the source links.
     * @param {string[]} urls - Unique source URLs.
     * @returns {void}
     */
    function appendSources(container, urls) {
        const sourceUrls = Array.from(new Set(urls.filter(Boolean)));
        const sourceList = createElement("div", "record-sources");
        sourceList.append(createElement("strong", "record-sources__label", "Източници: "));
        sourceUrls.forEach(function appendSource(url, index) {
            sourceList.append(createExternalLink(`Източник ${index + 1}`, url));
        });
        container.append(sourceList);
    }

    /**
     * Creates the shared shell and metadata used by all catalogue record types.
     *
     * @param {string} tabId - Owning catalogue tab identifier.
     * @param {string} recordId - Stable record identifier.
     * @param {string} badge - Short category label.
     * @param {string} title - Primary record title.
     * @returns {{card: HTMLElement, body: HTMLElement, header: HTMLElement, details: HTMLDetailsElement, detailList: HTMLDListElement}} Record elements.
     */
    function createRecordShell(tabId, recordId, badge, title) {
        const card = createElement("article", "record-card");
        card.id = `record-${tabId}-${recordId}`;
        const body = createElement("div", "record-card__body");
        const header = createElement("header", "record-card__header");
        header.append(createElement("span", "record-card__badge", badge));
        header.append(createElement("h3", "record-card__title", title));
        const details = createElement("details", "record-details");
        details.append(createElement("summary", "record-details__summary", "Подробности и източници"));
        const detailList = createElement("dl", "record-detail");
        details.append(detailList);
        body.append(header);
        card.append(body);
        return {card, body, header, details, detailList};
    }

    /**
     * Returns the lowest published price for a dish.
     *
     * @param {Object} food - Food catalogue record.
     * @returns {number} Lowest verified numeric offer or positive infinity.
     */
    function getFoodPrice(food) {
        const prices = food.offers.map(function getOfferPrice(offer) {
            return Number(offer.price);
        }).filter(Number.isFinite);
        return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
    }

    /**
     * Renders one food record with explicit local-confirmation and price status.
     *
     * @param {Object} food - Food catalogue record.
     * @returns {HTMLElement} Rendered food card.
     */
    function renderFood(food) {
        const shell = createRecordShell("food", food.id, food.category, food.bulgarian);
        shell.card.dataset.filterA = food.category;
        shell.card.dataset.filterB = food.statusLabel;
        shell.card.dataset.sortName = food.bulgarian;
        shell.card.dataset.sortPrice = String(getFoodPrice(food));
        appendRecordMedia(shell.card, food.image);
        const statusClass = food.localStatus === "confirmed" ? "record-status--confirmed" : "record-status--unconfirmed";
        shell.header.append(createElement("span", `record-status ${statusClass}`, food.statusLabel));
        shell.body.append(createElement("p", "record-card__greek", food.greek));
        shell.body.append(createElement("p", "record-card__description", food.description));
        if (food.offers.length) {
            const prices = createElement("ul", "offer-list");
            food.offers.forEach(function appendOffer(offer) {
                const note = offer.priceNote ? ` (${offer.priceNote})` : "";
                prices.append(createElement("li", "offer-list__item", `${offer.restaurant}: ${formatEuro(offer.price)}${note} · проверено ${offer.verified}`));
            });
            shell.body.append(prices);
        } else {
            shell.body.append(createElement("p", "price-missing", food.priceStatus));
        }
        appendDefinition(shell.detailList, "Нормализирано основно име", food.normalizedName);
        appendDefinition(shell.detailList, "Приготвяне", food.preparation);
        appendDefinition(shell.detailList, "Основни съставки", food.ingredients.join(", "));
        appendDefinition(shell.detailList, "Вкус и текстура", food.taste);
        appendDefinition(shell.detailList, "Проверено", food.verified);
        appendSources(shell.details, food.sources || food.offers.map(function getSource(offer) {
            return offer.source;
        }));
        shell.body.append(shell.details);
        return shell.card;
    }

    /**
     * Checks whether a platform snapshot meets the public display contract.
     *
     * @param {Object|null} ratingData - Platform rating snapshot.
     * @returns {boolean} Whether the snapshot has provenance and at least 50 reviews.
     */
    function hasDisplayableRating(ratingData) {
        return Boolean(
            ratingData
            && Number.isFinite(ratingData.rating)
            && Number.isFinite(ratingData.reviews)
            && ratingData.reviews >= MINIMUM_RATING_REVIEWS
            && ratingData.url
            && ratingData.verified
        );
    }

    /**
     * Calculates the documented popularity score from a qualifying Google snapshot.
     *
     * @param {Object|null} googleData - Google rating snapshot.
     * @returns {number|null} Popularity score or null when the snapshot is incomplete.
     */
    function calculatePopularity(googleData) {
        if (!hasDisplayableRating(googleData)) {
            return null;
        }
        return googleData.rating * Math.log1p(googleData.reviews);
    }

    /**
     * Converts a numeric popularity score to a consistent qualitative label.
     *
     * @param {number|null} score - Calculated popularity score.
     * @returns {string} Bulgarian popularity label with score where available.
     */
    function formatPopularity(score) {
        if (score === null) {
            return "Няма достатъчно данни";
        }
        const label = score >= 35 ? "много висока" : score >= 25 ? "висока" : score >= 15 ? "средна" : "ограничена";
        return `${label} (${score.toFixed(1)})`;
    }

    /**
     * Renders a platform rating while preserving missing-profile semantics.
     *
     * @param {string} platform - Platform display name.
     * @param {Object|null} ratingData - Rating snapshot or manual verification record.
     * @returns {HTMLElement} Rating paragraph with optional link.
     */
    function renderRating(platform, ratingData) {
        const row = createElement("p", "rating-row");
        row.append(createElement("strong", "rating-row__label", `${platform}: `));
        if (hasDisplayableRating(ratingData)) {
            row.append(document.createTextNode(`${ratingData.rating.toFixed(1)} / 5 · ${ratingData.reviews.toLocaleString("bg-BG")} отзива · проверено ${ratingData.verified} · `));
            row.append(createExternalLink("Профил", ratingData.url));
        } else {
            row.append(document.createTextNode("Няма достатъчно данни за моментна оценка"));
            if (ratingData && ratingData.verified) {
                row.append(document.createTextNode(` · проверено ${ratingData.verified}`));
            }
            if (ratingData && ratingData.url) {
                row.append(document.createTextNode(" · "));
                row.append(createExternalLink("Провери профила", ratingData.url));
            }
        }
        return row;
    }

    /**
     * Creates a Google Maps location link from verified coordinates.
     *
     * @param {number} latitude - Latitude in decimal degrees.
     * @param {number} longitude - Longitude in decimal degrees.
     * @returns {string} Google Maps query URL.
     */
    function getGoogleMapsUrl(latitude, longitude) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
    }

    /**
     * Creates a Google Maps Directions link with the villa and destination coordinates embedded.
     *
     * @param {number} latitude - Destination latitude in decimal degrees.
     * @param {number} longitude - Destination longitude in decimal degrees.
     * @param {string} mode - Google Maps travel mode: walking or driving.
     * @returns {string} Google Maps Directions URL.
     */
    function getGoogleMapsDirectionsUrl(latitude, longitude, mode) {
        const origin = `${ROUTE_ORIGIN.latitude},${ROUTE_ORIGIN.longitude}`;
        const destination = `${latitude},${longitude}`;
        return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
    }

    /**
     * Formats one dated static route snapshot for Bulgarian readers.
     *
     * @param {Object} route - Route snapshot with mode, distance, duration, and verification date.
     * @returns {string} Compact route summary.
     */
    function formatRoute(route) {
        const modeLabel = route.mode === "walking" ? "пеша" : "с автомобил";
        const distance = new Intl.NumberFormat("bg-BG", {maximumFractionDigits: 1}).format(route.distanceKm);
        return `${modeLabel} · ≈ ${distance} км · ≈ ${route.durationMinutes} мин · проверено ${route.verified}`;
    }

    /**
     * Adds the two required Google Maps actions for a geographic record.
     *
     * @param {HTMLElement} container - Action container receiving the links.
     * @param {Object} record - Geographic record with coordinates and a route snapshot.
     * @returns {void}
     */
    function appendMapActions(container, record) {
        container.append(createExternalLink("Място в Google Maps", getGoogleMapsUrl(record.latitude, record.longitude)));
        container.append(createExternalLink(
            "Маршрут от вилата",
            getGoogleMapsDirectionsUrl(record.latitude, record.longitude, record.route.mode)
        ));
    }

    /**
     * Maps a symbolic price category to a sortable numeric value.
     *
     * @param {string} priceLevel - Published or estimated symbolic price label.
     * @returns {number} Count of euro symbols or a high missing-data value.
     */
    function getPriceLevelValue(priceLevel) {
        const matches = String(priceLevel || "").match(/€/g);
        return matches ? matches.length : 99;
    }

    /**
     * Renders one restaurant record with coordinates, ratings, popularity, and source links.
     *
     * @param {Object} restaurant - Restaurant catalogue record.
     * @returns {HTMLElement} Rendered restaurant card.
     */
    function renderRestaurant(restaurant) {
        const shell = createRecordShell("restaurants", restaurant.id, restaurant.type, restaurant.name);
        const popularity = calculatePopularity(restaurant.google);
        shell.card.dataset.filterA = restaurant.type;
        shell.card.dataset.filterB = restaurant.cuisines.join("|");
        shell.card.dataset.sortName = restaurant.name;
        shell.card.dataset.sortRating = String(hasDisplayableRating(restaurant.google) ? restaurant.google.rating : -1);
        shell.card.dataset.sortPopularity = String(popularity === null ? -1 : popularity);
        shell.card.dataset.sortPrice = String(getPriceLevelValue(restaurant.priceLevel));
        shell.card.dataset.sortDistance = String(restaurant.route.distanceKm);
        appendRecordMedia(shell.card, restaurant.images, restaurant.imageShortage);
        shell.body.append(createElement("p", "record-card__description", restaurant.description));
        shell.body.append(createElement("p", "record-card__route", formatRoute(restaurant.route)));
        shell.body.append(createElement("p", "record-card__meta", `Кухня: ${restaurant.cuisines.join(", ")} · ${restaurant.priceLevel}`));
        shell.body.append(renderRating("Google", restaurant.google));
        shell.body.append(renderRating("Tripadvisor", restaurant.tripadvisor));
        appendDefinition(shell.detailList, "Адрес", restaurant.address);
        appendDefinition(shell.detailList, "Координати", `${restaurant.latitude.toFixed(6)}, ${restaurant.longitude.toFixed(6)}`);
        appendDefinition(shell.detailList, "Маршрут от The Seaside Villas", formatRoute(restaurant.route));
        appendDefinition(shell.detailList, "Телефон", restaurant.phone || "Няма достатъчно данни");
        appendDefinition(shell.detailList, "Популярност", formatPopularity(popularity));
        appendDefinition(shell.detailList, "Вероятно натоварване", restaurant.busy);
        const dishNames = restaurant.dishes.map(function resolveDish(dishId) {
            const match = catalogue.foods.find(function findDish(food) {
                return food.id === dishId;
            });
            return match ? match.bulgarian : dishId;
        });
        appendDefinition(shell.detailList, "Проверени ястия", dishNames.length ? dishNames.join(", ") : "Няма достъпно актуално меню, каталогизирано в тази моментна снимка");
        const links = createElement("div", "record-actions");
        appendMapActions(links, restaurant);
        if (restaurant.official) {
            links.append(createExternalLink("Официален сайт", restaurant.official));
        }
        shell.details.append(links);
        const menu = createElement("p", "record-menu");
        menu.append(createElement("strong", "record-menu__label", "Меню: "));
        if (restaurant.menu.url) {
            menu.append(createExternalLink(restaurant.menu.label, restaurant.menu.url));
        } else {
            menu.append(document.createTextNode(restaurant.menu.label));
        }
        menu.append(document.createTextNode(` · проверено ${restaurant.menu.verified}`));
        shell.details.append(menu);
        appendSources(shell.details, [...restaurant.sources, restaurant.route.source]);
        shell.body.append(shell.details);
        return shell.card;
    }

    /**
     * Reduces free-form fish preparation text to stable filter categories.
     *
     * @param {string} preparation - Preparation description.
     * @returns {string[]} Matching preparation filters.
     */
    function classifyPreparation(preparation) {
        const normalized = normalizeText(preparation);
        const categories = [];
        if (normalized.includes("скара")) {
            categories.push("На скара");
        }
        if (normalized.includes("пържен")) {
            categories.push("Пържено");
        }
        if (normalized.includes("печен") || normalized.includes("фурна")) {
            categories.push("Печено");
        }
        if (normalized.includes("супа") || normalized.includes("варен")) {
            categories.push("Супа / варено");
        }
        if (normalized.includes("маринован") || normalized.includes("тартар")) {
            categories.push("Сурово / мариновано");
        }
        return categories.length ? categories : ["Друг начин"];
    }

    /**
     * Reduces fish taste descriptions to stable filter categories.
     *
     * @param {string} taste - Taste and texture description.
     * @returns {string[]} Matching taste filters.
     */
    function classifyTaste(taste) {
        const normalized = normalizeText(taste);
        const categories = [];
        if (normalized.includes("мазн")) {
            categories.push("Мазно");
        }
        if (normalized.includes("нежн") || normalized.includes("деликат")) {
            categories.push("Нежно");
        }
        if (normalized.includes("плътн") || normalized.includes("стегнат")) {
            categories.push("Плътно");
        }
        if (normalized.includes("постн")) {
            categories.push("Постно");
        }
        return categories.length ? categories : ["Балансирано"];
    }

    /**
     * Renders one true-fish record with eating, deboning, pairing, and safety guidance.
     *
     * @param {Object} fish - Fish catalogue record.
     * @returns {HTMLElement} Rendered fish card.
     */
    function renderFish(fish) {
        const shell = createRecordShell("fish", fish.id, fish.scientific, fish.bulgarian);
        shell.card.dataset.filterA = classifyPreparation(fish.preparation).join("|");
        shell.card.dataset.filterB = classifyTaste(fish.taste).join("|");
        shell.card.dataset.sortName = fish.bulgarian;
        shell.card.dataset.sortGreek = fish.greek;
        appendRecordMedia(shell.card, fish.image);
        shell.body.append(createElement("p", "record-card__greek", `${fish.greek} · ${fish.pronunciation}`));
        shell.body.append(createElement("p", "record-card__description", fish.description));
        shell.body.append(createElement("p", "record-card__meta", `Обичайно приготвяне: ${fish.preparation}`));
        appendDefinition(shell.detailList, "Типичен размер", fish.size);
        appendDefinition(shell.detailList, "Вкус и текстура", fish.taste);
        appendDefinition(shell.detailList, "Обезкостяване", fish.bones);
        appendDefinition(shell.detailList, "Как се яде", fish.eating);
        appendDefinition(shell.detailList, "Съчетание", fish.pairing);
        if (fish.id === "drakaina" || fish.id === "skorpina") {
            shell.details.append(createElement("p", "specific-warning", fish.description));
        }
        appendSources(shell.details, [
            `https://fishbase.se/summary/${encodeURIComponent(fish.scientific.replace(" ", "-"))}.html`,
            "https://www.fao.org/4/i1276b/i1276b00.htm",
            "https://www.greece-is.com/greek-fish-translated-guide-greeces-seafood/"
        ]);
        shell.body.append(shell.details);
        return shell.card;
    }

    /**
     * Classifies a drive time into a compact filter band.
     *
     * @param {number} minutes - Approximate drive time.
     * @returns {string} Human-readable drive-time band.
     */
    function classifyDrive(minutes) {
        if (minutes <= 10) {
            return "До 10 мин";
        }
        if (minutes <= 20) {
            return "11–20 мин";
        }
        return "21–30 мин";
    }

    /**
     * Renders one sight record with historical, access, and mutable visitor details.
     *
     * @param {Object} sight - Sight catalogue record.
     * @returns {HTMLElement} Rendered sight card.
     */
    function renderSight(sight) {
        const shell = createRecordShell("sights", sight.id, sight.type, sight.name);
        shell.card.dataset.filterA = sight.type;
        shell.card.dataset.filterB = classifyDrive(sight.route.durationMinutes);
        shell.card.dataset.sortName = sight.name;
        shell.card.dataset.sortDrive = String(sight.route.durationMinutes);
        shell.card.dataset.sortDistance = String(sight.route.distanceKm);
        appendRecordMedia(shell.card, sight.image);
        shell.body.append(createElement("p", "record-card__description", sight.description));
        shell.body.append(createElement("p", "record-card__route", formatRoute(sight.route)));
        shell.body.append(createElement("p", "record-card__meta", sight.location));
        appendDefinition(shell.detailList, "История", sight.history);
        appendDefinition(shell.detailList, "Координати", `${sight.latitude.toFixed(6)}, ${sight.longitude.toFixed(6)}`);
        appendDefinition(shell.detailList, "Маршрут от The Seaside Villas", formatRoute(sight.route));
        appendDefinition(shell.detailList, "Достъп", sight.access);
        appendDefinition(shell.detailList, "Работно време", sight.hours);
        appendDefinition(shell.detailList, "Вход", sight.fee);
        appendDefinition(shell.detailList, "Проверено", sight.verified);
        const links = createElement("div", "record-actions");
        appendMapActions(links, sight);
        shell.details.append(links);
        appendSources(shell.details, [...sight.sources, sight.route.source]);
        shell.body.append(shell.details);
        return shell.card;
    }

    /**
     * Returns compact feature filters for a beach record.
     *
     * @param {Object} beach - Beach catalogue record.
     * @returns {string[]} Matching beach convenience categories.
     */
    function classifyBeachFeatures(beach) {
        const features = [];
        if (normalizeText(beach.freeZone).startsWith("да")) {
            features.push("Свободна зона");
        }
        if (normalizeText(beach.organized).startsWith("да")) {
            features.push("Организирана зона");
        }
        if (beach.family) {
            features.push("За семейства");
        }
        if (!normalizeText(beach.services).includes("недостатъчно") && !normalizeText(beach.services).includes("липсващи")) {
            features.push("Услуги наблизо");
        }
        return features.length ? features : ["Без потвърдени удобства"];
    }

    /**
     * Renders one beach record with dated environmental and practical attributes.
     *
     * @param {Object} beach - Beach catalogue record.
     * @returns {HTMLElement} Rendered beach card.
     */
    function renderBeach(beach) {
        const shell = createRecordShell("beaches", beach.id, beach.proximityLabel, beach.name);
        shell.card.dataset.filterA = beach.shore;
        shell.card.dataset.filterB = classifyBeachFeatures(beach).join("|");
        shell.card.dataset.sortName = beach.name;
        shell.card.dataset.sortDrive = String(beach.route.durationMinutes);
        shell.card.dataset.sortProximity = String((beach.proximityGroup * 1000) + beach.route.distanceKm);
        shell.card.dataset.sortFamily = beach.family ? "1" : "0";
        appendRecordMedia(shell.card, beach.images, beach.imageShortage);
        shell.body.append(createElement("p", "record-card__description", beach.location));
        shell.body.append(createElement("p", "record-card__route", formatRoute(beach.route)));
        shell.body.append(createElement("p", "record-card__meta", `${beach.shore} · ${beach.family ? "подходящост за семейства: да, с обичайния родителски надзор" : "подходящост за семейства: преценете на място"}`));
        appendDefinition(shell.detailList, "Координати", `${beach.latitude.toFixed(6)}, ${beach.longitude.toFixed(6)}`);
        appendDefinition(shell.detailList, "Маршрут от The Seaside Villas", formatRoute(beach.route));
        appendDefinition(shell.detailList, "Размери", `${beach.length}; ширина: ${beach.width}`);
        appendDefinition(shell.detailList, "Чистота", beach.cleanliness);
        appendDefinition(shell.detailList, "Свободна зона", beach.freeZone);
        appendDefinition(shell.detailList, "Организирана зона", beach.organized);
        appendDefinition(shell.detailList, "Дъно и дълбочина", `${beach.seabed}; ${beach.depth}`);
        appendDefinition(shell.detailList, "Камъни и скали", beach.rocks);
        appendDefinition(shell.detailList, "Опасности", beach.hazards);
        appendDefinition(shell.detailList, "Тоалетни", beach.toilets);
        appendDefinition(shell.detailList, "Услуги", beach.services);
        appendDefinition(shell.detailList, "Шум", beach.noise);
        appendDefinition(shell.detailList, "Достъп и паркиране", beach.access);
        appendDefinition(shell.detailList, "Последна проверка", beach.verified);
        const links = createElement("div", "record-actions");
        appendMapActions(links, beach);
        shell.details.append(links);
        appendSources(shell.details, [beach.cleanlinessSource, ...beach.sources, beach.route.source]);
        shell.body.append(shell.details);
        return shell.card;
    }

    /**
     * Selects the record renderer for a catalogue tab.
     *
     * @param {string} tabId - Active tab identifier.
     * @returns {Function} Renderer for records in that tab.
     */
    function getRenderer(tabId) {
        return {
            food: renderFood,
            restaurants: renderRestaurant,
            fish: renderFish,
            sights: renderSight,
            beaches: renderBeach
        }[tabId];
    }

    /**
     * Replaces source-visible fallback lists with the structured catalogue records.
     *
     * @returns {void}
     */
    function renderCatalogue() {
        TAB_IDS.forEach(function renderTabRecords(tabId) {
            const panel = document.getElementById(tabId);
            const list = panel && panel.querySelector(SELECTORS.list);
            if (!list) {
                return;
            }
            const config = TAB_CONFIG[tabId];
            const renderer = getRenderer(tabId);
            const records = catalogue[config.dataKey];
            const fragment = document.createDocumentFragment();
            records.forEach(function appendRecord(record) {
                fragment.append(renderer(record));
            });
            list.replaceChildren(fragment);
        });
    }

    /**
     * Collects unique pipe-separated card metadata for a filter select.
     *
     * @param {HTMLElement[]} cards - Cards to inspect.
     * @param {string} dataKey - Dataset property name.
     * @returns {string[]} Sorted unique options.
     */
    function collectFilterOptions(cards, dataKey) {
        const options = new Set();
        cards.forEach(function inspectCard(card) {
            String(card.dataset[dataKey] || "").split("|").filter(Boolean).forEach(function addOption(value) {
                options.add(value);
            });
        });
        return Array.from(options).sort(function compareOptions(first, second) {
            return first.localeCompare(second, "bg");
        });
    }

    /**
     * Populates a filter select with an unrestricted option and current record values.
     *
     * @param {HTMLSelectElement} select - Select element to update.
     * @param {string[]} options - Filter options to append.
     * @returns {void}
     */
    function populateSelect(select, options) {
        const unrestricted = createElement("option", "", "Всички");
        unrestricted.value = ALL_VALUE;
        const fragment = document.createDocumentFragment();
        fragment.append(unrestricted);
        options.forEach(function appendOption(optionValue) {
            const option = createElement("option", "", optionValue);
            option.value = optionValue;
            fragment.append(option);
        });
        select.replaceChildren(fragment);
    }

    /**
     * Updates filter labels and options for the active catalogue type.
     *
     * @returns {void}
     */
    function configureFilters() {
        const form = document.querySelector(SELECTORS.filters);
        const panel = document.getElementById(activeTabId);
        if (!form || !panel) {
            return;
        }
        const cards = Array.from(panel.querySelectorAll(".record-card"));
        const config = TAB_CONFIG[activeTabId];
        const filterA = form.querySelector(SELECTORS.filterA);
        const filterB = form.querySelector(SELECTORS.filterB);
        const sort = form.querySelector(SELECTORS.sort);
        form.querySelector("[data-filter-a-label]").textContent = config.filterALabel;
        form.querySelector("[data-filter-b-label]").textContent = config.filterBLabel;
        populateSelect(filterA, collectFilterOptions(cards, "filterA"));
        populateSelect(filterB, collectFilterOptions(cards, "filterB"));
        const sortFragment = document.createDocumentFragment();
        config.sortOptions.forEach(function appendSortOption(sortOption) {
            const option = createElement("option", "", sortOption[1]);
            option.value = sortOption[0];
            sortFragment.append(option);
        });
        sort.replaceChildren(sortFragment);
        form.reset();
        applyFilters();
    }

    /**
     * Checks whether a selected exact filter is present in pipe-separated card metadata.
     *
     * @param {string} selected - Active select value.
     * @param {string} cardValue - Pipe-separated card metadata.
     * @returns {boolean} True when unrestricted or exactly matched.
     */
    function matchesFilter(selected, cardValue) {
        return selected === ALL_VALUE || String(cardValue || "").split("|").includes(selected);
    }

    /**
     * Returns the sortable card value for the selected mode.
     *
     * @param {HTMLElement} card - Card to inspect.
     * @param {string} sortMode - Active sorting mode.
     * @returns {string|number} Comparable sort value.
     */
    function getSortValue(card, sortMode) {
        const dataKey = `sort${sortMode.charAt(0).toUpperCase()}${sortMode.slice(1)}`;
        const rawValue = card.dataset[dataKey] || "";
        return ["price", "rating", "popularity", "drive", "distance", "proximity", "family"].includes(sortMode)
            ? Number(rawValue)
            : normalizeText(rawValue);
    }

    /**
     * Sorts visible and hidden cards consistently without discarding the current records.
     *
     * @param {HTMLElement} list - Catalogue list containing cards.
     * @param {HTMLElement[]} cards - Cards to sort.
     * @param {string} sortMode - Active sorting mode.
     * @returns {void}
     */
    function sortCards(list, cards, sortMode) {
        const descending = ["rating", "popularity", "family"].includes(sortMode);
        cards.sort(function compareCards(first, second) {
            const firstValue = getSortValue(first, sortMode);
            const secondValue = getSortValue(second, sortMode);
            if (typeof firstValue === "number" && typeof secondValue === "number") {
                return descending ? secondValue - firstValue : firstValue - secondValue;
            }
            return String(firstValue).localeCompare(String(secondValue), "bg");
        });
        cards.forEach(function appendSortedCard(card) {
            list.append(card);
        });
    }

    /**
     * Applies search, two exact filters, and sorting to the active catalogue tab.
     *
     * @returns {void}
     */
    function applyFilters() {
        const form = document.querySelector(SELECTORS.filters);
        const panel = document.getElementById(activeTabId);
        const status = document.querySelector(SELECTORS.status);
        if (!form || !panel || !status) {
            return;
        }
        const list = panel.querySelector(SELECTORS.list);
        const cards = Array.from(list.querySelectorAll(".record-card"));
        const query = normalizeText(form.querySelector(SELECTORS.query).value.trim());
        const filterA = form.querySelector(SELECTORS.filterA).value;
        const filterB = form.querySelector(SELECTORS.filterB).value;
        const sortMode = form.querySelector(SELECTORS.sort).value;
        let visibleCount = 0;
        cards.forEach(function updateCard(card) {
            const isVisible = (!query || normalizeText(card.textContent).includes(query))
                && matchesFilter(filterA, card.dataset.filterA)
                && matchesFilter(filterB, card.dataset.filterB);
            card.hidden = !isVisible;
            visibleCount += isVisible ? 1 : 0;
        });
        sortCards(list, cards, sortMode);
        status.textContent = `Показани ${visibleCount} от ${cards.length} записа.`;
    }

    /**
     * Updates accessible tab state and optionally writes a browser-history hash entry.
     *
     * @param {string} requestedTabId - Tab identifier to activate.
     * @param {boolean} updateHistory - Whether to push the tab hash into history.
     * @returns {void}
     */
    function activateTab(requestedTabId, updateHistory) {
        const tabId = TAB_IDS.includes(requestedTabId) ? requestedTabId : DEFAULT_TAB;
        activeTabId = tabId;
        document.querySelectorAll(SELECTORS.tabs).forEach(function updateTab(tab) {
            const isActive = tab.getAttribute("aria-controls") === tabId;
            tab.setAttribute("aria-selected", String(isActive));
            tab.tabIndex = isActive ? 0 : -1;
            tab.classList.toggle("is-active", isActive);
        });
        document.querySelectorAll(SELECTORS.panels).forEach(function updatePanel(panel) {
            panel.hidden = panel.id !== tabId;
        });
        if (updateHistory && window.location.hash !== `#${tabId}`) {
            window.history.pushState({tabId}, "", `#${tabId}`);
        }
        if (catalogue) {
            configureFilters();
        }
    }

    /**
     * Realigns a direct tab hash after asynchronous rendering changes panel heights.
     *
     * @returns {void}
     */
    function alignInitialHashTarget() {
        const requestedTabId = window.location.hash.slice(1);
        if (!TAB_IDS.includes(requestedTabId)) {
            return;
        }
        const scheduleAlignment = function scheduleAlignment() {
            // The short post-load delay runs after the browser's native initial-anchor scroll.
            window.setTimeout(function waitForAnchorScroll() {
                window.requestAnimationFrame(function scrollToRenderedPanel() {
                    const panel = document.getElementById(requestedTabId);
                    if (panel) {
                        panel.scrollIntoView({behavior: "auto", block: "start"});
                    }
                });
            }, INITIAL_HASH_ALIGNMENT_DELAY_MS);
        };
        if (document.readyState === "complete") {
            scheduleAlignment();
        } else {
            window.addEventListener("load", scheduleAlignment, {once: true});
        }
    }

    /**
     * Initializes click and WAI-ARIA keyboard behavior for the five catalogue tabs.
     *
     * @returns {void}
     */
    function initializeTabs() {
        const tabs = Array.from(document.querySelectorAll(SELECTORS.tabs));
        tabs.forEach(function connectTab(tab, tabIndex) {
            tab.addEventListener("click", function activateClickedTab(event) {
                event.preventDefault();
                activateTab(tab.getAttribute("aria-controls"), true);
            });
            tab.addEventListener("keydown", function navigateTabs(event) {
                const keyTargets = {
                    ArrowRight: (tabIndex + 1) % tabs.length,
                    ArrowLeft: (tabIndex - 1 + tabs.length) % tabs.length,
                    Home: 0,
                    End: tabs.length - 1
                };
                if (!(event.key in keyTargets)) {
                    return;
                }
                event.preventDefault();
                const target = tabs[keyTargets[event.key]];
                target.focus();
                activateTab(target.getAttribute("aria-controls"), true);
            });
        });
        window.addEventListener("popstate", function restoreHistoryTab() {
            activateTab(window.location.hash.slice(1), false);
        });
        window.addEventListener("hashchange", function restoreHashTab() {
            activateTab(window.location.hash.slice(1), false);
        });
        activateTab(window.location.hash.slice(1), false);
    }

    /**
     * Initializes the catalogue search controls after structured records are ready.
     *
     * @returns {void}
     */
    function initializeFilters() {
        const form = document.querySelector(SELECTORS.filters);
        if (!form) {
            return;
        }
        form.hidden = false;
        form.addEventListener("input", applyFilters);
        form.addEventListener("change", applyFilters);
        form.addEventListener("reset", function applyAfterNativeReset() {
            window.requestAnimationFrame(applyFilters);
        });
        configureFilters();
    }

    /**
     * Registers the folder-scoped service worker on secure or local test origins.
     *
     * @returns {void}
     */
    function registerOfflineSupport() {
        const secureOrigin = window.location.protocol === "https:" || LOCAL_HOSTNAMES.has(window.location.hostname);
        if (!("serviceWorker" in navigator) || !secureOrigin) {
            return;
        }
        navigator.serviceWorker.register("./sw.js").catch(function reportWorkerFailure(error) {
            // The complete source-visible fallback remains usable even when offline setup fails.
            console.warn("Offline support could not be enabled.", error);
        });
    }

    /**
     * Loads the local structured snapshot and enables the enhanced catalogue interface.
     *
     * @returns {Promise<void>} Promise resolved after rendering or fallback reporting.
     */
    async function loadCatalogue() {
        try {
            const response = await fetch(DATA_URL);
            if (!response.ok) {
                throw new Error(`Catalogue request failed with HTTP ${response.status}.`);
            }
            catalogue = await response.json();
            renderCatalogue();
            initializeFilters();
            alignInitialHashTarget();
        } catch (error) {
            console.warn("The structured Nikiti catalogue could not be loaded.", error);
        }
    }

    document.documentElement.classList.add("is-enhanced");
    initializeTabs();
    registerOfflineSupport();
    loadCatalogue();
}());
