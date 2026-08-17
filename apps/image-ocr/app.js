/**
 * app.js: Runs browser-local multilingual OCR and manages image input, preview, editing, and export.
 * Provides guarded Tesseract.js loading, browser-native image decoding, recoverable errors, and UTF-8 output.
 */

(function initializeImageOcrApplication() {
    "use strict";

    // Pinned runtime and worker distribution for repeatable browser behavior.
    const TESSERACT_RUNTIME_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
    const TESSERACT_WORKER_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js";
    // Tesseract.js 6.0.1 uses the matching v6 core asset family.
    const TESSERACT_CORE_URL = "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0";
    // Versioned fast LSTM data keeps first-run downloads practical for the eng, bul, and ell models.
    const TESSERACT_LANGUAGE_URL = "https://tessdata.projectnaptha.com/4.0.0_fast";
    const ROTATION_STEP_DEGREES = 90;
    const FULL_ROTATION_DEGREES = 360;
    const HALF_ROTATION_DEGREES = 180;
    const QUARTER_TURN_RADIANS = Math.PI / 2;
    const OBJECT_URL_RELEASE_DELAY_MS = 0;
    const DEFAULT_SOURCE_NAME = "clipboard-image";
    const DEFAULT_DOWNLOAD_NAME = "recognized-text.txt";
    const MEMORY_ERROR_PATTERN = /memory|alloc|out of bounds|array buffer|canvas/i;
    const FILE_EXTENSION_PATTERN = /\.[^./\\]+$/;
    // These characters are invalid or unsafe in common desktop download filenames.
    const UNSAFE_FILENAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;
    const TEXT_EDITING_SELECTOR = "textarea, input[type='text'], input[type='search'], [contenteditable='true']";
    const LANGUAGE_NAMES = {
        eng: "English",
        bul: "Bulgarian",
        ell: "Greek"
    };
    const STATUS_LABELS = {
        "loading tesseract core": "Loading OCR engine…",
        "initializing tesseract": "Starting OCR engine…",
        "loading language traineddata": "Loading selected language data…",
        "initializing api": "Preparing selected languages…",
        "recognizing text": "Recognizing text…"
    };

    const elements = {
        imageInput: document.getElementById("image-input"),
        pasteButton: document.getElementById("paste-button"),
        dropzone: document.getElementById("dropzone"),
        fileSummary: document.getElementById("file-summary"),
        fileName: document.getElementById("file-name"),
        fileDetail: document.getElementById("file-detail"),
        previewFrame: document.getElementById("preview-frame"),
        previewPlaceholder: document.getElementById("preview-placeholder"),
        rotateLeft: document.getElementById("rotate-left"),
        rotateRight: document.getElementById("rotate-right"),
        resetRotation: document.getElementById("reset-rotation"),
        rotationLabel: document.getElementById("rotation-label"),
        languageInputs: Array.from(document.querySelectorAll("input[name='ocr-language']")),
        selectAllLanguages: document.getElementById("select-all-languages"),
        recognizeButton: document.getElementById("recognize-button"),
        statusText: document.getElementById("status-text"),
        progress: document.getElementById("progress"),
        errorMessage: document.getElementById("error-message"),
        feedbackMessage: document.getElementById("feedback-message"),
        resultText: document.getElementById("result-text"),
        copyButton: document.getElementById("copy-button"),
        downloadButton: document.getElementById("download-button"),
        startOverButton: document.getElementById("start-over-button")
    };

    let previewCanvas = document.getElementById("preview-canvas");
    let runtimePromise = null;
    const state = {
        sourceFile: null,
        sourceImage: null,
        sourceObjectUrl: "",
        rotation: 0,
        worker: null,
        workerLanguageKey: "",
        processing: false,
        resultAvailable: false
    };

    /**
     * Returns the currently selected Tesseract language identifiers in interface order.
     *
     * @returns {string[]} Selected identifiers drawn from eng, bul, and ell.
     */
    function getSelectedLanguages() {
        return elements.languageInputs
            .filter(function findCheckedLanguage(input) {
                return input.checked;
            })
            .map(function readLanguageValue(input) {
                return input.value;
            });
    }

    /**
     * Enables and disables controls from the current application state.
     *
     * @returns {void}
     */
    function refreshControls() {
        const hasImage = Boolean(state.sourceImage);
        const hasLanguages = getSelectedLanguages().length > 0;
        const imageControlsDisabled = state.processing || !hasImage;

        elements.imageInput.disabled = state.processing;
        elements.pasteButton.disabled = state.processing;
        elements.dropzone.classList.toggle("is-disabled", state.processing);
        elements.dropzone.setAttribute("aria-disabled", String(state.processing));
        elements.rotateLeft.disabled = imageControlsDisabled;
        elements.rotateRight.disabled = imageControlsDisabled;
        elements.resetRotation.disabled = imageControlsDisabled || state.rotation === 0;
        elements.languageInputs.forEach(function setLanguageDisabled(input) {
            input.disabled = state.processing;
        });
        elements.selectAllLanguages.disabled = state.processing;
        elements.recognizeButton.disabled = state.processing || !hasImage || !hasLanguages;
        elements.copyButton.disabled = state.processing || !state.resultAvailable;
        elements.downloadButton.disabled = state.processing || !state.resultAvailable;
        elements.startOverButton.disabled = state.processing || (!hasImage && !state.resultAvailable);
        elements.recognizeButton.textContent = state.processing ? "Recognizing…" : "Recognize text";
    }

    /**
     * Updates the polite status region and optional progress indicator.
     *
     * @param {string} message - Plain-language operation state for the user.
     * @param {number|null} progressPercent - A percentage from 0 to 100, or null for indeterminate progress.
     * @param {boolean} showProgress - Whether the progress element should be visible.
     * @returns {void}
     */
    function setStatus(message, progressPercent = null, showProgress = false) {
        elements.statusText.textContent = message;
        elements.progress.hidden = !showProgress;

        if (!showProgress) {
            elements.progress.removeAttribute("value");
            elements.progress.textContent = "";
            return;
        }

        if (Number.isFinite(progressPercent)) {
            const boundedProgress = Math.min(100, Math.max(0, Math.round(progressPercent)));
            elements.progress.value = boundedProgress;
            elements.progress.textContent = `${boundedProgress}%`;
        } else {
            elements.progress.removeAttribute("value");
            elements.progress.textContent = "Working…";
        }
    }

    /**
     * Shows a recoverable error in the assertive alert region.
     *
     * @param {string} message - Plain-language failure and recovery guidance.
     * @returns {void}
     */
    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.hidden = false;
    }

    /**
     * Clears the visible error without changing image or result state.
     *
     * @returns {void}
     */
    function clearError() {
        elements.errorMessage.textContent = "";
        elements.errorMessage.hidden = true;
    }

    /**
     * Updates polite feedback for non-processing actions such as copy or selection.
     *
     * @param {string} message - Feedback that should not interrupt assistive technology users.
     * @returns {void}
     */
    function setFeedback(message) {
        elements.feedbackMessage.textContent = message;
    }

    /**
     * Clears OCR output when its source pixels are replaced or rotated.
     *
     * @returns {void}
     */
    function clearObsoleteResult() {
        elements.resultText.value = "";
        state.resultAvailable = false;
        refreshControls();
    }

    /**
     * Loads the pinned Tesseract.js browser API and permits a later retry after network failure.
     *
     * @returns {Promise<object>} A promise resolving to the global Tesseract API.
     * @throws {Error} If the CDN runtime script cannot be loaded.
     */
    function loadTesseractRuntime() {
        if (window.Tesseract) {
            return Promise.resolve(window.Tesseract);
        }

        if (runtimePromise) {
            return runtimePromise;
        }

        runtimePromise = new Promise(function appendRuntimeScript(resolve, reject) {
            const script = document.createElement("script");
            script.src = TESSERACT_RUNTIME_URL;
            script.crossOrigin = "anonymous";
            script.dataset.ocrRuntime = "true";

            script.addEventListener("load", function resolveRuntimeLoad() {
                if (window.Tesseract) {
                    resolve(window.Tesseract);
                    return;
                }

                runtimePromise = null;
                script.remove();
                reject(new Error("The OCR runtime loaded without exposing its browser API."));
            }, { once: true });

            script.addEventListener("error", function rejectRuntimeLoad() {
                runtimePromise = null;
                script.remove();
                reject(new Error("The OCR runtime could not be downloaded."));
            }, { once: true });

            document.head.append(script);
        });

        return runtimePromise;
    }

    /**
     * Converts a Tesseract progress event into an accessible status update.
     *
     * @param {{status?: string, progress?: number}} update - Worker status and fractional progress.
     * @returns {void}
     */
    function reportWorkerProgress(update) {
        const message = STATUS_LABELS[update.status] || "Processing image…";
        const progressPercent = Number.isFinite(update.progress) ? update.progress * 100 : null;
        setStatus(message, progressPercent, true);
    }

    /**
     * Records worker-side errors for diagnosis while the awaited operation handles user recovery.
     *
     * @param {unknown} error - Error reported by the Tesseract worker.
     * @returns {void}
     */
    function reportWorkerError(error) {
        console.error("Tesseract worker error:", error);
    }

    /**
     * Terminates the active OCR worker so stale language data and broken worker state are released.
     *
     * @returns {Promise<void>} Resolves after worker cleanup has been attempted.
     */
    async function terminateWorker() {
        if (!state.worker) {
            state.workerLanguageKey = "";
            return;
        }

        const workerToTerminate = state.worker;
        state.worker = null;
        state.workerLanguageKey = "";

        try {
            await workerToTerminate.terminate();
        } catch (error) {
            // Cleanup failure should not block a fresh worker on the next recognition attempt.
            console.warn("Unable to terminate the previous OCR worker cleanly:", error);
        }
    }

    /**
     * Returns an OCR worker initialized with exactly the currently selected language data.
     *
     * @param {string[]} languages - Tesseract identifiers to load for the next OCR job.
     * @returns {Promise<object>} A ready Tesseract.js worker.
     * @throws {Error} If runtime, core, worker, or language assets cannot load.
     */
    async function getWorkerForLanguages(languages) {
        const languageKey = languages.join("+");
        if (state.worker && state.workerLanguageKey === languageKey) {
            return state.worker;
        }

        await terminateWorker();
        const tesseract = await loadTesseractRuntime();
        state.worker = await tesseract.createWorker(languages, tesseract.OEM.LSTM_ONLY, {
            workerPath: TESSERACT_WORKER_URL,
            corePath: TESSERACT_CORE_URL,
            langPath: TESSERACT_LANGUAGE_URL,
            logger: reportWorkerProgress,
            errorHandler: reportWorkerError
        });
        state.workerLanguageKey = languageKey;
        return state.worker;
    }

    /**
     * Decodes a file through the browser's native image pipeline without a format or size allowlist.
     *
     * @param {Blob} file - File or clipboard blob to decode.
     * @returns {Promise<{image: HTMLImageElement, objectUrl: string}>} Decoded image and its managed object URL.
     * @throws {Error} If the browser cannot decode the supplied content as an image.
     */
    function decodeImage(file) {
        return new Promise(function decodeObjectUrl(resolve, reject) {
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();

            image.addEventListener("load", function resolveImageLoad() {
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    resolve({ image: image, objectUrl: objectUrl });
                    return;
                }

                URL.revokeObjectURL(objectUrl);
                reject(new Error("The decoded image has no usable dimensions."));
            }, { once: true });

            image.addEventListener("error", function rejectImageLoad() {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("The browser could not decode this file as an image."));
            }, { once: true });

            image.src = objectUrl;
        });
    }

    /**
     * Draws a decoded image at the requested orientation on a replacement canvas.
     *
     * @param {HTMLImageElement} image - Browser-decoded source image.
     * @param {number} rotation - Clockwise rotation in 90-degree increments.
     * @returns {HTMLCanvasElement} Canvas containing the pixels that OCR will receive.
     * @throws {Error} If canvas allocation or drawing fails, commonly from device memory limits.
     */
    function createOrientedCanvas(image, rotation) {
        const swapsDimensions = rotation === ROTATION_STEP_DEGREES || rotation === FULL_ROTATION_DEGREES - ROTATION_STEP_DEGREES;
        const targetWidth = swapsDimensions ? image.naturalHeight : image.naturalWidth;
        const targetHeight = swapsDimensions ? image.naturalWidth : image.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.className = "preview-canvas";
        canvas.setAttribute("role", "img");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            throw new Error("The browser could not allocate a canvas for this image.");
        }

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("The browser could not create an image drawing context.");
        }

        context.save();
        if (rotation === ROTATION_STEP_DEGREES) {
            context.translate(targetWidth, 0);
            context.rotate(QUARTER_TURN_RADIANS);
        } else if (rotation === HALF_ROTATION_DEGREES) {
            context.translate(targetWidth, targetHeight);
            context.rotate(2 * QUARTER_TURN_RADIANS);
        } else if (rotation === FULL_ROTATION_DEGREES - ROTATION_STEP_DEGREES) {
            context.translate(0, targetHeight);
            context.rotate(3 * QUARTER_TURN_RADIANS);
        }

        context.drawImage(image, 0, 0);
        context.restore();
        canvas.textContent = "Your selected image preview.";
        return canvas;
    }

    /**
     * Replaces the visible canvas only after new pixels have rendered successfully.
     *
     * @param {HTMLCanvasElement} nextCanvas - Fully rendered preview and OCR source.
     * @param {string} sourceName - Display name used in the accessible canvas description.
     * @param {number} rotation - Current clockwise rotation in degrees.
     * @returns {void}
     */
    function replacePreviewCanvas(nextCanvas, sourceName, rotation) {
        const orientationText = rotation === 0 ? "original orientation" : `${rotation} degrees clockwise`;
        nextCanvas.id = "preview-canvas";
        nextCanvas.hidden = false;
        nextCanvas.setAttribute("aria-label", `Preview of ${sourceName}, ${orientationText}`);
        previewCanvas.replaceWith(nextCanvas);
        previewCanvas = nextCanvas;
        elements.previewPlaceholder.hidden = true;
    }

    /**
     * Formats a byte count as compact file metadata without using it as a validation limit.
     *
     * @param {number} bytes - Source byte length.
     * @returns {string} Human-readable byte count.
     */
    function formatBytes(bytes) {
        const BYTES_PER_KIBIBYTE = 1024;
        const BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;

        if (bytes >= BYTES_PER_MEBIBYTE) {
            return `${(bytes / BYTES_PER_MEBIBYTE).toFixed(1)} MB`;
        }

        if (bytes >= BYTES_PER_KIBIBYTE) {
            return `${(bytes / BYTES_PER_KIBIBYTE).toFixed(1)} KB`;
        }

        return `${bytes} bytes`;
    }

    /**
     * Commits a successfully decoded image and resets output made obsolete by the new source.
     *
     * @param {Blob & {name?: string}} file - Selected source file or clipboard blob.
     * @param {HTMLImageElement} image - Successfully decoded browser image.
     * @param {string} objectUrl - Object URL owned by the new image state.
     * @param {HTMLCanvasElement} canvas - Successfully rendered original-orientation preview.
     * @returns {void}
     */
    function commitImage(file, image, objectUrl, canvas) {
        if (state.sourceObjectUrl) {
            URL.revokeObjectURL(state.sourceObjectUrl);
        }

        const sourceName = file.name || DEFAULT_SOURCE_NAME;
        state.sourceFile = file;
        state.sourceImage = image;
        state.sourceObjectUrl = objectUrl;
        state.rotation = 0;
        replacePreviewCanvas(canvas, sourceName, state.rotation);
        clearObsoleteResult();
        clearError();
        setFeedback("");
        elements.fileName.textContent = sourceName;
        elements.fileDetail.textContent = `${image.naturalWidth} × ${image.naturalHeight} pixels · ${formatBytes(file.size)}`;
        elements.fileSummary.hidden = false;
        elements.rotationLabel.textContent = "Original orientation";
        setStatus("Image ready. Choose languages, then start recognition.");
        refreshControls();
    }

    /**
     * Attempts to decode and select a candidate image while preserving current state on failure.
     *
     * @param {Blob & {name?: string}} file - Candidate file or clipboard image blob.
     * @returns {Promise<void>} Resolves after selection or recoverable error feedback.
     */
    async function selectImage(file) {
        if (!file || state.processing) {
            return;
        }

        clearError();
        setFeedback("");
        setStatus("Decoding image…", null, true);

        try {
            const decoded = await decodeImage(file);
            let canvas;

            try {
                canvas = createOrientedCanvas(decoded.image, 0);
            } catch (error) {
                URL.revokeObjectURL(decoded.objectUrl);
                throw error;
            }

            commitImage(file, decoded.image, decoded.objectUrl, canvas);
        } catch (error) {
            console.error("Image selection failed:", error);
            setStatus(state.sourceImage ? "Current image retained." : "Choose an image to begin.");
            showError("This content could not be decoded as an image, or the browser did not have enough memory. Choose another image and try again.");
            refreshControls();
        }
    }

    /**
     * Rotates the preview and invalidates OCR output only after rendering succeeds.
     *
     * @param {number} delta - Positive or negative 90-degree rotation change.
     * @returns {void}
     */
    function rotatePreview(delta) {
        if (!state.sourceImage || state.processing) {
            return;
        }

        const nextRotation = (state.rotation + delta + FULL_ROTATION_DEGREES) % FULL_ROTATION_DEGREES;

        try {
            const nextCanvas = createOrientedCanvas(state.sourceImage, nextRotation);
            const sourceName = state.sourceFile.name || DEFAULT_SOURCE_NAME;
            replacePreviewCanvas(nextCanvas, sourceName, nextRotation);
            state.rotation = nextRotation;
            elements.rotationLabel.textContent = nextRotation === 0 ? "Original orientation" : `${nextRotation}° clockwise`;
            clearObsoleteResult();
            clearError();
            setFeedback("Previous OCR text was cleared because the preview orientation changed.");
            setStatus("Orientation updated. Ready to recognize.");
            refreshControls();
        } catch (error) {
            console.error("Preview rotation failed:", error);
            showError("The image could not be rotated with the available browser memory. Its previous orientation is still ready to use.");
            setStatus("Previous orientation retained.");
            refreshControls();
        }
    }

    /**
     * Maps a failed recognition stage to plain-language retry guidance.
     *
     * @param {unknown} error - Runtime, language, memory, or OCR failure.
     * @param {string} stage - The stage active when the failure occurred.
     * @returns {string} Recoverable error text.
     */
    function describeRecognitionError(error, stage) {
        const errorText = error instanceof Error ? error.message : String(error);

        if (MEMORY_ERROR_PATTERN.test(errorText)) {
            return "This image could not be processed with the available browser memory. Your image is still selected; try a smaller image or close other browser tabs, then retry.";
        }

        if (stage === "runtime") {
            return "The OCR runtime could not load from the CDN. Check your internet connection or content-blocking settings, then try again.";
        }

        if (stage === "language") {
            return "The selected language data could not load from the CDN. Check your connection, keep or change the language selection, then try again.";
        }

        return "Recognition failed before text could be produced. Your image and language choices are still available; try again.";
    }

    /**
     * Runs one OCR operation against the currently displayed canvas and selected languages.
     *
     * @returns {Promise<void>} Resolves after text output or recoverable failure handling.
     */
    async function recognizeCurrentImage() {
        const languages = getSelectedLanguages();
        if (state.processing) {
            return;
        }

        if (!state.sourceImage) {
            showError("Choose an image before starting recognition.");
            return;
        }

        if (languages.length === 0) {
            showError("Select at least one language before starting recognition.");
            return;
        }

        let stage = "runtime";
        state.processing = true;
        clearError();
        setFeedback("");
        clearObsoleteResult();
        setStatus("Loading OCR runtime…", null, true);
        refreshControls();

        try {
            await loadTesseractRuntime();
            stage = "language";
            const worker = await getWorkerForLanguages(languages);
            stage = "recognition";
            setStatus("Recognizing text…", 0, true);
            const result = await worker.recognize(previewCanvas);
            elements.resultText.value = result.data.text || "";
            state.resultAvailable = true;
            setStatus("Recognition complete.", 100, true);
            setFeedback(elements.resultText.value.trim() ? "Text is ready to review, edit, copy, or download." : "Recognition completed, but no text was found. You can edit the result or try another language or image.");
        } catch (error) {
            console.error("OCR operation failed:", error);
            await terminateWorker();
            showError(describeRecognitionError(error, stage));
            setStatus("Recognition stopped. Ready to retry.");
        } finally {
            state.processing = false;
            refreshControls();
        }
    }

    /**
     * Finds the first image blob exposed by a browser clipboard read.
     *
     * @param {ClipboardItems} clipboardItems - Clipboard items returned by the permissions API.
     * @returns {Promise<Blob|null>} First image blob, or null when no image exists.
     */
    async function getImageFromClipboardItems(clipboardItems) {
        for (const item of clipboardItems) {
            const imageType = item.types.find(function findImageMimeType(type) {
                return type.startsWith("image/");
            });

            if (imageType) {
                return item.getType(imageType);
            }
        }

        return null;
    }

    /**
     * Reads an image through the asynchronous Clipboard API after explicit user activation.
     *
     * @returns {Promise<void>} Resolves after image selection or visible clipboard feedback.
     */
    async function pasteImageFromButton() {
        clearError();
        setFeedback("");

        if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
            showError("This browser cannot read images with the Paste image button. Use Ctrl+V or Command+V outside a text field, drag and drop, or choose a file instead.");
            return;
        }

        try {
            const clipboardItems = await navigator.clipboard.read();
            const blob = await getImageFromClipboardItems(clipboardItems);
            if (!blob) {
                showError("The clipboard does not contain an image. Your current image and text have not changed.");
                return;
            }

            await selectImage(blob);
        } catch (error) {
            console.error("Clipboard image read failed:", error);
            showError("The browser could not read an image from the clipboard. Allow clipboard access, or use drag and drop or the file picker.");
        }
    }

    /**
     * Handles a standard paste event without intercepting normal text editing.
     *
     * @param {ClipboardEvent} event - Document paste event.
     * @returns {void}
     */
    function handleDocumentPaste(event) {
        if (event.target instanceof Element && event.target.closest(TEXT_EDITING_SELECTOR)) {
            return;
        }

        const clipboardItems = Array.from(event.clipboardData ? event.clipboardData.items : []);
        const imageItem = clipboardItems.find(function findClipboardImage(item) {
            return item.kind === "file" && item.type.startsWith("image/");
        });

        if (!imageItem) {
            showError("The clipboard does not contain an image. Your current image and text have not changed.");
            return;
        }

        const imageFile = imageItem.getAsFile();
        if (!imageFile) {
            showError("The pasted image could not be read. Your current image and text have not changed.");
            return;
        }

        event.preventDefault();
        void selectImage(imageFile);
    }

    /**
     * Creates a safe text filename from the selected source filename.
     *
     * @returns {string} Filename ending in .txt.
     */
    function createDownloadFilename() {
        if (!state.sourceFile || !state.sourceFile.name) {
            return DEFAULT_DOWNLOAD_NAME;
        }

        const withoutExtension = state.sourceFile.name.replace(FILE_EXTENSION_PATTERN, "");
        const safeBase = withoutExtension.replace(UNSAFE_FILENAME_PATTERN, "-").trim();
        return `${safeBase || "recognized-text"}.txt`;
    }

    /**
     * Attempts selection-based copying when the asynchronous Clipboard API is unavailable or denied.
     *
     * @returns {boolean} True when the browser reports that it copied the edited result.
     */
    function copyEditedTextWithSelection() {
        const previousActiveElement = document.activeElement;
        const selectionStart = elements.resultText.selectionStart;
        const selectionEnd = elements.resultText.selectionEnd;

        elements.resultText.focus({ preventScroll: true });
        elements.resultText.select();

        let copied = false;
        try {
            copied = document.execCommand("copy");
        } catch (error) {
            console.warn("Selection-based text copy failed:", error);
        }

        elements.resultText.setSelectionRange(selectionStart, selectionEnd);
        if (previousActiveElement instanceof HTMLElement) {
            previousActiveElement.focus({ preventScroll: true });
        }
        return copied;
    }

    /**
     * Copies the current edited result through the secure Clipboard API.
     *
     * @returns {Promise<void>} Resolves after visible success or failure feedback.
     */
    async function copyEditedText() {
        clearError();
        setFeedback("");

        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            try {
                await navigator.clipboard.writeText(elements.resultText.value);
                setFeedback("The current edited text was copied to the clipboard.");
                return;
            } catch (error) {
                // A selection-based retry supports browsers that expose but deny the asynchronous API.
                console.warn("Clipboard API text write failed; trying selection-based copy:", error);
            }
        }

        if (copyEditedTextWithSelection()) {
            setFeedback("The current edited text was copied to the clipboard.");
        } else {
            showError("The text could not be copied. Allow clipboard access, or select the text field and copy it manually.");
        }
    }

    /**
     * Downloads the current edited result as UTF-8 plain text.
     *
     * @returns {void}
     */
    function downloadEditedText() {
        clearError();
        const textBlob = new Blob([elements.resultText.value], { type: "text/plain;charset=utf-8" });
        const objectUrl = URL.createObjectURL(textBlob);
        const downloadLink = document.createElement("a");
        downloadLink.href = objectUrl;
        downloadLink.download = createDownloadFilename();
        downloadLink.click();
        window.setTimeout(function releaseDownloadObjectUrl() {
            URL.revokeObjectURL(objectUrl);
        }, OBJECT_URL_RELEASE_DELAY_MS);
        setFeedback(`Downloaded ${downloadLink.download} as UTF-8 plain text.`);
    }

    /**
     * Restores the application's initial image, language, result, message, and worker state.
     *
     * @returns {Promise<void>} Resolves after OCR worker cleanup.
     */
    async function startOver() {
        await terminateWorker();
        if (state.sourceObjectUrl) {
            URL.revokeObjectURL(state.sourceObjectUrl);
        }

        state.sourceFile = null;
        state.sourceImage = null;
        state.sourceObjectUrl = "";
        state.rotation = 0;
        state.resultAvailable = false;
        elements.imageInput.value = "";
        elements.fileSummary.hidden = true;
        elements.fileName.textContent = "";
        elements.fileDetail.textContent = "";
        elements.resultText.value = "";
        elements.rotationLabel.textContent = "Original orientation";
        elements.languageInputs.forEach(function resetLanguage(input) {
            input.checked = input.value === "eng";
        });

        const emptyCanvas = document.createElement("canvas");
        emptyCanvas.id = "preview-canvas";
        emptyCanvas.className = "preview-canvas";
        emptyCanvas.hidden = true;
        emptyCanvas.setAttribute("role", "img");
        emptyCanvas.setAttribute("aria-label", "No image selected");
        emptyCanvas.textContent = "Your selected image preview.";
        previewCanvas.replaceWith(emptyCanvas);
        previewCanvas = emptyCanvas;
        elements.previewPlaceholder.hidden = false;
        clearError();
        setFeedback("");
        setStatus("Choose an image to begin.");
        refreshControls();
    }

    /**
     * Selects all supported recognition languages without starting OCR.
     *
     * @returns {void}
     */
    function selectAllLanguages() {
        elements.languageInputs.forEach(function checkLanguage(input) {
            input.checked = true;
        });
        clearError();
        setFeedback("English, Bulgarian, and Greek are selected.");
        refreshControls();
    }

    /**
     * Removes drag styling when the pointer leaves the actual drop target.
     *
     * @param {DragEvent} event - Drag-leave event from the drop zone.
     * @returns {void}
     */
    function handleDragLeave(event) {
        if (!elements.dropzone.contains(event.relatedTarget)) {
            elements.dropzone.classList.remove("is-dragging");
        }
    }

    /**
     * Accepts the first dropped file and lets native decoding decide whether it is an image.
     *
     * @param {DragEvent} event - Drop event containing browser file data.
     * @returns {void}
     */
    function handleDrop(event) {
        event.preventDefault();
        elements.dropzone.classList.remove("is-dragging");

        if (state.processing) {
            setFeedback("Wait for the current recognition to finish before replacing the image.");
            return;
        }

        const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;

        if (!file) {
            showError("No file was found in that drop. Your current image and text have not changed.");
            return;
        }

        void selectImage(file);
    }

    elements.imageInput.addEventListener("change", function handleFileSelection(event) {
        const file = event.target.files ? event.target.files[0] : null;
        void selectImage(file);
        // Clearing the control lets a user intentionally choose the same file again.
        event.target.value = "";
    });

    elements.pasteButton.addEventListener("click", function handlePasteButtonClick() {
        void pasteImageFromButton();
    });

    elements.dropzone.addEventListener("dragenter", function handleDragEnter(event) {
        event.preventDefault();
        if (!state.processing) {
            elements.dropzone.classList.add("is-dragging");
        }
    });

    elements.dropzone.addEventListener("dragover", function handleDragOver(event) {
        event.preventDefault();
        if (!state.processing) {
            elements.dropzone.classList.add("is-dragging");
        }
    });

    elements.dropzone.addEventListener("dragleave", handleDragLeave);
    elements.dropzone.addEventListener("drop", handleDrop);
    document.addEventListener("paste", handleDocumentPaste);
    elements.rotateLeft.addEventListener("click", function handleRotateLeft() {
        rotatePreview(-ROTATION_STEP_DEGREES);
    });
    elements.rotateRight.addEventListener("click", function handleRotateRight() {
        rotatePreview(ROTATION_STEP_DEGREES);
    });
    elements.resetRotation.addEventListener("click", function handleRotationReset() {
        rotatePreview(-state.rotation);
    });
    elements.languageInputs.forEach(function attachLanguageChange(input) {
        input.addEventListener("change", function handleLanguageChange() {
            clearError();
            refreshControls();
        });
    });
    elements.selectAllLanguages.addEventListener("click", selectAllLanguages);
    elements.recognizeButton.addEventListener("click", function handleRecognitionClick() {
        void recognizeCurrentImage();
    });
    elements.copyButton.addEventListener("click", function handleCopyClick() {
        void copyEditedText();
    });
    elements.downloadButton.addEventListener("click", downloadEditedText);
    elements.startOverButton.addEventListener("click", function handleStartOverClick() {
        void startOver();
    });

    window.addEventListener("beforeunload", function releaseApplicationResources() {
        if (state.sourceObjectUrl) {
            URL.revokeObjectURL(state.sourceObjectUrl);
        }
        if (state.worker) {
            // Page teardown cannot await worker termination, but requesting it releases resources where supported.
            void state.worker.terminate();
        }
    });

    refreshControls();
}());
