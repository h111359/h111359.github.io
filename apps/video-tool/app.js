/**
 * app.js: Browser-local MP4 validation, conversion, compression, trimming, and download control.
 * Provides the complete interactive surface for the Video & Audio Converter application.
 */

(function initializeVideoTool() {
    "use strict";

    const SOURCE_DIRECTORY = "/source";
    const SOURCE_FILE_PATH = `${SOURCE_DIRECTORY}/input.mp4`;
    const FRAME_PROBE_OUTPUT = "-";
    const RANGE_STEP_SECONDS = 0.05;
    const MAX_PROGRESS_PERCENT = 100;
    const BYTES_PER_MEGABYTE = 1024 * 1024;
    const DESKTOP_WARNING_BYTES = 500 * BYTES_PER_MEGABYTE;
    const DESKTOP_WARNING_SECONDS = 30 * 60;
    const MOBILE_WARNING_BYTES = 150 * BYTES_PER_MEGABYTE;
    const MOBILE_WARNING_SECONDS = 10 * 60;
    const MOBILE_DEVICE_QUERY = "(max-width: 50rem), (pointer: coarse)";
    const CORE_SCRIPT_URL = new URL("vendor/ffmpeg/ffmpeg-core.js", window.location.href).href;
    const CORE_WASM_URL = new URL("vendor/ffmpeg/ffmpeg-core.wasm", window.location.href).href;
    const CORE_WASM_PAYLOAD_URL = new URL("vendor/ffmpeg/ffmpeg-core.wasm.js", window.location.href).href;
    const QUEUE_STATE_LABELS = {
        queued: "Queued",
        running: "Running",
        complete: "Complete",
        failed: "Failed",
        cancelled: "Cancelled"
    };
    const COMPRESSION_PRESETS = {
        small: { label: "Small", maxHeight: 480, crf: 32, fpsCap: 30, audioBitrate: 96 },
        balanced: { label: "Balanced", maxHeight: 720, crf: 28, fpsCap: 30, audioBitrate: 128 },
        high: { label: "High Quality", maxHeight: 1080, crf: 23, fpsCap: 60, audioBitrate: 192 }
    };
    const CHANNEL_LAYOUT_COUNTS = {
        mono: 1,
        stereo: 2,
        "2.1": 3,
        "3.0": 3,
        quad: 4,
        "4.0": 4,
        "5.0": 5,
        "5.1": 6,
        "6.1": 7,
        "7.1": 8,
        octagonal: 8
    };

    // FFmpeg progress logs expose timestamps as HH:MM:SS.xx after the literal time= marker.
    const FFMPEG_TIME_PATTERN = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;
    // Download filenames exclude control characters and platform-reserved filename punctuation.
    const UNSAFE_FILENAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;

    const elements = {
        fileInput: document.querySelector("#source-file"),
        dropZone: document.querySelector("#drop-zone"),
        compatibilityError: document.querySelector("#compatibility-error"),
        sourceSummary: document.querySelector("#source-summary"),
        sourceName: document.querySelector("#source-name"),
        sourceSize: document.querySelector("#source-size"),
        sourceDuration: document.querySelector("#source-duration"),
        sourceDimensions: document.querySelector("#source-dimensions"),
        sourceAudio: document.querySelector("#source-audio"),
        sourceWarning: document.querySelector("#source-warning"),
        preview: document.querySelector("#source-preview"),
        outputOptions: document.querySelector("#output-options"),
        mp3Checkbox: document.querySelector("#output-mp3"),
        mp3Bitrate: document.querySelector("#mp3-bitrate"),
        m4aCheckbox: document.querySelector("#output-m4a"),
        m4aBitrate: document.querySelector("#m4a-bitrate"),
        compressedCheckbox: document.querySelector("#output-compressed"),
        compressionPreset: document.querySelector("#compression-preset"),
        audioUnavailable: document.querySelector("#audio-unavailable"),
        trimOptions: document.querySelector("#trim-options"),
        trimmedCheckbox: document.querySelector("#output-trimmed"),
        timeline: document.querySelector("#timeline"),
        trimStart: document.querySelector("#trim-start"),
        trimEnd: document.querySelector("#trim-end"),
        trimStartOutput: document.querySelector("#trim-start-output"),
        trimEndOutput: document.querySelector("#trim-end-output"),
        previewRange: document.querySelector("#preview-range"),
        startButton: document.querySelector("#start-button"),
        cancelButton: document.querySelector("#cancel-button"),
        resetButton: document.querySelector("#reset-button"),
        statusMessage: document.querySelector("#status-message"),
        errorMessage: document.querySelector("#error-message"),
        progressBlock: document.querySelector("#progress-block"),
        currentJob: document.querySelector("#current-job"),
        progressValue: document.querySelector("#progress-value"),
        jobProgress: document.querySelector("#job-progress"),
        queueList: document.querySelector("#queue-list"),
        resultsEmpty: document.querySelector("#results-empty"),
        resultsList: document.querySelector("#results-list")
    };

    const state = {
        file: null,
        sourceUrl: null,
        sourceInfo: null,
        sourcePath: null,
        sourceReady: false,
        engine: null,
        processing: false,
        cancelRequested: false,
        validationVersion: 0,
        currentJob: null,
        currentExpectedDuration: 0,
        currentLogProgress: 0,
        engineLogs: [],
        queue: [],
        outputs: new Map(),
        previewingRange: false
    };

    let compressedWasmPayloadPromise = null;

    /**
     * Runs inside the file-mode Blob worker. Keeping it self-contained lets its source be
     * serialized without requesting a separate worker file from the opaque file origin.
     *
     * @returns {void}
     */
    function fileProtocolWorkerRuntime() {
        "use strict";

        let ffmpeg = null;

        function send(type, data, id, transfer) {
            self.postMessage({ id, type, data }, transfer || []);
        }

        self.onmessage = async function handleMessage(event) {
            const { id, type, data } = event.data;
            let result;
            let transfer = [];

            try {
                if (type !== "LOAD" && !ffmpeg) {
                    throw new Error("FFmpeg is not loaded. Call load() first.");
                }

                switch (type) {
                case "LOAD": {
                    importScripts(data.coreURL);
                    if (typeof self.createFFmpegCore !== "function") {
                        throw new Error("The local FFmpeg core script could not be loaded.");
                    }
                    const runtimeLocations = btoa(JSON.stringify({
                        wasmURL: data.wasmURL,
                        workerURL: data.coreURL.replace(/\.js$/i, ".worker.js")
                    }));
                    ffmpeg = await self.createFFmpegCore({
                        mainScriptUrlOrBlob: `${data.coreURL}#${runtimeLocations}`,
                        wasmBinary: data.wasmBinary
                    });
                    ffmpeg.setLogger(function forwardLog(log) {
                        send("LOG", log);
                    });
                    ffmpeg.setProgress(function forwardProgress(progress) {
                        send("PROGRESS", progress);
                    });
                    result = true;
                    break;
                }
                case "EXEC":
                    ffmpeg.setTimeout(data.timeout);
                    ffmpeg.exec(...data.args);
                    result = ffmpeg.ret;
                    ffmpeg.reset();
                    break;
                case "WRITE_FILE":
                    ffmpeg.FS.writeFile(data.path, data.bytes);
                    result = true;
                    break;
                case "READ_FILE":
                    result = ffmpeg.FS.readFile(data.path);
                    transfer = [result.buffer];
                    break;
                case "DELETE_FILE":
                    ffmpeg.FS.unlink(data.path);
                    result = true;
                    break;
                case "CREATE_DIR":
                    ffmpeg.FS.mkdir(data.path);
                    result = true;
                    break;
                default:
                    throw new Error(`Unknown FFmpeg worker message: ${type}`);
                }

                send(type, result, id, transfer);
            } catch (error) {
                send("ERROR", error instanceof Error ? error.message : String(error), id);
            }
        };
    }

    /**
     * Minimal controller matching the subset of @ffmpeg/ffmpeg used by this application.
     * It is selected only for file URLs, where browsers reject the package's external worker.
     */
    class FileProtocolFFmpeg {
        constructor() {
            this.loaded = false;
            this.worker = null;
            this.workerUrl = null;
            this.nextMessageId = 0;
            this.pending = new Map();
            this.listeners = { log: [], progress: [] };
            this.terminated = false;
        }

        on(type, listener) {
            if (this.listeners[type]) this.listeners[type].push(listener);
        }

        off(type, listener) {
            if (!this.listeners[type]) return;
            this.listeners[type] = this.listeners[type].filter(function retainOther(candidate) {
                return candidate !== listener;
            });
        }

        createWorker() {
            if (this.worker) return;
            const source = `(${fileProtocolWorkerRuntime.toString()}());`;
            this.workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            this.worker = new Worker(this.workerUrl);
            this.worker.addEventListener("message", (event) => {
                const { id, type, data } = event.data;
                if (type === "LOG" || type === "PROGRESS") {
                    this.listeners[type.toLowerCase()].forEach(function notify(listener) {
                        listener(data);
                    });
                    return;
                }

                const request = this.pending.get(id);
                if (!request) return;
                this.pending.delete(id);
                if (type === "ERROR") {
                    request.reject(new Error(data));
                } else {
                    request.resolve(data);
                }
            });
            this.worker.addEventListener("error", (event) => {
                const message = event.message || "The local FFmpeg worker stopped unexpectedly.";
                this.rejectPending(new Error(message));
            });
        }

        rejectPending(error) {
            this.pending.forEach(function rejectRequest(request) {
                request.reject(error);
            });
            this.pending.clear();
        }

        send(type, data, transfer) {
            if (this.terminated) return Promise.reject(new Error("The FFmpeg worker was terminated."));
            this.createWorker();
            return new Promise((resolve, reject) => {
                const id = this.nextMessageId;
                this.nextMessageId += 1;
                this.pending.set(id, { resolve, reject });
                this.worker.postMessage({ id, type, data }, transfer || []);
            });
        }

        async load(configuration) {
            const wasmBinary = configuration.wasmBinary;
            const loaded = await this.send("LOAD", configuration, [wasmBinary.buffer]);
            this.loaded = Boolean(loaded);
            return loaded;
        }

        exec(args, timeout = -1) {
            return this.send("EXEC", { args, timeout });
        }

        writeFile(path, bytes) {
            return this.send("WRITE_FILE", { path, bytes }, [bytes.buffer]);
        }

        readFile(path) {
            return this.send("READ_FILE", { path });
        }

        deleteFile(path) {
            return this.send("DELETE_FILE", { path });
        }

        createDir(path) {
            return this.send("CREATE_DIR", { path });
        }

        terminate() {
            this.terminated = true;
            this.loaded = false;
            this.rejectPending(new Error("The FFmpeg worker was terminated."));
            if (this.worker) this.worker.terminate();
            if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
            this.worker = null;
            this.workerUrl = null;
        }
    }

    /**
     * Loads and decodes the JavaScript-safe compressed WASM payload used only by file URLs.
     *
     * @returns {Promise<{bytes: Uint8Array, uncompressedBytes: number}>} Cached gzip bytes and expected output size.
     */
    function loadCompressedWasmPayload() {
        if (compressedWasmPayloadPromise) return compressedWasmPayloadPromise;

        compressedWasmPayloadPromise = new Promise(function loadPayload(resolve, reject) {
            const script = document.createElement("script");
            script.src = CORE_WASM_PAYLOAD_URL;
            script.onload = function decodePayload() {
                script.remove();
                const payload = window.VideoToolFFmpegWasmPayload;
                if (!payload || payload.encoding !== "gzip+base64" || typeof payload.data !== "string") {
                    reject(new Error("The direct-file FFmpeg payload is invalid or incomplete."));
                    return;
                }

                try {
                    let encodedBytes = atob(payload.data);
                    const compressedBytes = new Uint8Array(encodedBytes.length);
                    for (let index = 0; index < encodedBytes.length; index += 1) {
                        compressedBytes[index] = encodedBytes.charCodeAt(index);
                    }
                    encodedBytes = "";
                    window.VideoToolFFmpegWasmPayload = null;
                    resolve({ bytes: compressedBytes, uncompressedBytes: payload.uncompressedBytes });
                } catch (error) {
                    reject(new Error(`The direct-file FFmpeg payload could not be decoded: ${error.message || error}`));
                }
            };
            script.onerror = function rejectPayloadLoad() {
                script.remove();
                reject(new Error("The direct-file FFmpeg payload could not be loaded. Keep the vendor folder beside index.html."));
            };
            document.head.append(script);
        }).catch(function allowPayloadRetry(error) {
            compressedWasmPayloadPromise = null;
            throw error;
        });

        return compressedWasmPayloadPromise;
    }

    /**
     * Inflates a fresh transferable FFmpeg WASM binary for a file-mode worker.
     *
     * @returns {Promise<Uint8Array>} Uncompressed FFmpeg core bytes.
     */
    async function createFileProtocolWasmBinary() {
        const payload = await loadCompressedWasmPayload();
        const gzipStream = new Blob([payload.bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        const wasmBuffer = await new Response(gzipStream).arrayBuffer();
        if (wasmBuffer.byteLength !== payload.uncompressedBytes) {
            throw new Error("The direct-file FFmpeg payload did not decompress to the expected size.");
        }
        return new Uint8Array(wasmBuffer);
    }

    /**
     * Returns missing browser facilities required for local conversion.
     *
     * @returns {string[]} Human-readable names of unavailable capabilities.
     */
    function findMissingCapabilities() {
        const missing = [];
        const testAnchor = document.createElement("a");

        if (!("WebAssembly" in window)) missing.push("WebAssembly");
        if (!("Worker" in window)) missing.push("Web Workers");
        if (!("Blob" in window) || !("File" in window)) missing.push("local file access");
        if (!("URL" in window) || typeof URL.createObjectURL !== "function") missing.push("browser object URLs");
        if (!("HTMLMediaElement" in window)) missing.push("media preview");
        if (!("download" in testAnchor)) missing.push("file downloads");
        if (window.location.protocol === "file:") {
            if (!("DecompressionStream" in window) || !("Response" in window) || typeof Blob.prototype.stream !== "function") {
                missing.push("direct-file WebAssembly decompression");
            }
        } else if (!window.FFmpegWASM || typeof window.FFmpegWASM.FFmpeg !== "function") {
            missing.push("the local FFmpeg loader");
        }

        return missing;
    }

    /**
     * Applies the initial and post-reset runtime gate to both picker and drop interactions.
     *
     * @returns {boolean} True when this page can start local conversion.
     */
    function applyCompatibilityGate() {
        const missingCapabilities = findMissingCapabilities();
        const blocked = missingCapabilities.length > 0;

        elements.fileInput.disabled = blocked;
        elements.dropZone.classList.toggle("is-disabled", blocked);
        if (blocked) {
            elements.dropZone.setAttribute("aria-disabled", "true");
        } else {
            elements.dropZone.removeAttribute("aria-disabled");
            elements.compatibilityError.hidden = true;
            elements.compatibilityError.replaceChildren();
        }

        if (missingCapabilities.length > 0) {
            elements.compatibilityError.textContent = `This browser cannot run local conversion because it lacks: ${missingCapabilities.join(", ")}. Try a current Chrome, Edge, Firefox, or Safari release.`;
            elements.compatibilityError.hidden = false;
            announceStatus("Browser compatibility check failed.", false);
        }

        return !blocked;
    }

    /**
     * Formats a byte count using a compact binary unit.
     *
     * @param {number} bytes - Non-negative byte count to display.
     * @returns {string} A localized size with an appropriate unit.
     */
    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

        const units = ["B", "KB", "MB", "GB"];
        const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / (1024 ** unitIndex);
        const digits = unitIndex === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
        return `${value.toFixed(digits)} ${units[unitIndex]}`;
    }

    /**
     * Formats seconds as an exact clock value suitable for duration and trim labels.
     *
     * @param {number} totalSeconds - Time in seconds to display.
     * @param {boolean} [showHundredths=false] - Whether to include two fractional digits.
     * @returns {string} A HH:MM:SS or MM:SS clock string.
     */
    function formatTime(totalSeconds, showHundredths = false) {
        const safeSeconds = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const seconds = safeSeconds % 60;
        const secondsText = showHundredths
            ? seconds.toFixed(2).padStart(5, "0")
            : Math.floor(seconds).toString().padStart(2, "0");

        if (hours > 0) {
            return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secondsText}`;
        }
        return `${minutes.toString().padStart(2, "0")}:${secondsText}`;
    }

    /**
     * Shows a polite status update and optionally clears the active alert.
     *
     * @param {string} message - Current workflow state to announce.
     * @param {boolean} [clearError=true] - Whether an earlier error should be dismissed.
     * @returns {void}
     */
    function announceStatus(message, clearError = true) {
        elements.statusMessage.textContent = message;
        if (clearError) {
            elements.errorMessage.hidden = true;
            elements.errorMessage.textContent = "";
        }
    }

    /**
     * Displays an assertive, visible validation or processing error.
     *
     * @param {string} message - Recoverable error and suggested next action.
     * @returns {void}
     */
    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.hidden = false;
    }

    /**
     * Updates the visible progress value for the current sequential job.
     *
     * @param {number} ratio - Job completion ratio between zero and one.
     * @returns {void}
     */
    function setProgress(ratio) {
        const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
        const percent = Math.round(safeRatio * MAX_PROGRESS_PERCENT);
        elements.jobProgress.value = percent;
        elements.jobProgress.textContent = `${percent}%`;
        elements.progressValue.textContent = `${percent}%`;
    }

    /**
     * Uses FFmpeg's experimental progress event when it advances the active job.
     *
     * @param {{progress: number}} event - FFmpeg progress payload.
     * @returns {void}
     */
    function handleEngineProgress(event) {
        if (!state.currentJob || !Number.isFinite(event.progress)) return;
        setProgress(Math.max(event.progress, state.currentLogProgress));
    }

    /**
     * Derives fallback progress from FFmpeg timestamps for commands where ratio events stall.
     *
     * @param {{message: string}} event - FFmpeg log payload.
     * @returns {void}
     */
    function handleEngineLog(event) {
        if (typeof event.message !== "string") return;
        state.engineLogs.push(event.message);
        if (state.engineLogs.length > 40) state.engineLogs.shift();
        if (!state.currentJob || !state.currentExpectedDuration) return;
        const match = event.message.match(FFMPEG_TIME_PATTERN);
        if (!match) return;

        const elapsedSeconds = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
        state.currentLogProgress = Math.min(1, elapsedSeconds / state.currentExpectedDuration);
        setProgress(state.currentLogProgress);
    }

    /**
     * Creates and loads the single-thread FFmpeg engine for HTTP or direct-file mode on demand.
     *
     * @returns {Promise<object>} Loaded FFmpeg controller instance.
     * @throws {Error} When local runtime assets cannot be loaded or initialized.
     */
    async function ensureEngine() {
        if (state.engine && state.engine.loaded) return state.engine;
        const directFileMode = window.location.protocol === "file:";
        if (!directFileMode && (!window.FFmpegWASM || typeof window.FFmpegWASM.FFmpeg !== "function")) {
            throw new Error("The repository-hosted FFmpeg loader is unavailable. Reload the page and try again.");
        }

        announceStatus("Loading the local FFmpeg engine (about 31 MB)…");
        const engine = directFileMode ? new FileProtocolFFmpeg() : new window.FFmpegWASM.FFmpeg();
        engine.on("progress", handleEngineProgress);
        engine.on("log", handleEngineLog);
        state.engine = engine;
        try {
            const loadConfiguration = { coreURL: CORE_SCRIPT_URL, wasmURL: CORE_WASM_URL };
            if (directFileMode) loadConfiguration.wasmBinary = await createFileProtocolWasmBinary();
            await engine.load(loadConfiguration);
        } catch (error) {
            if (state.engine === engine) state.engine = null;
            engine.terminate();
            throw error;
        }
        state.sourceReady = false;
        return engine;
    }

    /**
     * Transfers the selected File into FFmpeg's in-memory filesystem for probing and sequential jobs.
     *
     * @returns {Promise<string>} FFmpeg virtual path to the selected source.
     * @throws {Error} When no source is selected or the browser-to-worker transfer fails.
     */
    async function ensureSourceReady() {
        if (!state.file) throw new Error("Choose an MP4 before starting conversion.");
        if (state.sourceReady && state.sourcePath) return state.sourcePath;

        const engine = await ensureEngine();
        try {
            await engine.createDir(SOURCE_DIRECTORY);
        } catch (error) {
            // A retained engine may already own the input directory after an earlier successful validation.
            if (!String(error).includes("File exists")) throw error;
        }
        const sourceBytes = new Uint8Array(await state.file.arrayBuffer());
        await engine.writeFile(SOURCE_FILE_PATH, sourceBytes);
        state.sourcePath = SOURCE_FILE_PATH;
        state.sourceReady = true;
        return state.sourcePath;
    }

    /**
     * Terminates the worker and releases its WASM filesystem and active command.
     *
     * @returns {void}
     */
    function disposeEngine() {
        if (state.engine) {
            state.engine.terminate();
        }
        state.engine = null;
        state.sourceReady = false;
        state.sourcePath = null;
        state.currentJob = null;
    }

    /**
     * Reads ISO Base Media File Format brands from the leading ftyp box.
     *
     * @param {File} file - Candidate local MP4.
     * @returns {Promise<string[]>} Major and compatible four-character brands, or an empty array.
     */
    async function readContainerBrands(file) {
        const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
        const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
        let offset = 0;

        while (offset + 8 <= header.length) {
            const size = view.getUint32(offset);
            const type = String.fromCharCode(...header.slice(offset + 4, offset + 8));
            if (type === "ftyp" && size >= 16 && offset + size <= header.length) {
                const brands = [String.fromCharCode(...header.slice(offset + 8, offset + 12))];
                for (let brandOffset = offset + 16; brandOffset + 4 <= offset + size; brandOffset += 4) {
                    brands.push(String.fromCharCode(...header.slice(brandOffset, brandOffset + 4)));
                }
                return brands;
            }
            if (size < 8 || offset + size > header.length) break;
            offset += size;
        }
        return [];
    }

    /**
     * Determines whether parsed ftyp brands identify an MP4-family container rather than QuickTime or 3GP.
     *
     * @param {string[]} brands - Major and compatible ISO media brands.
     * @returns {boolean} True when at least one recognized MP4 brand is present.
     */
    function hasMp4Brand(brands) {
        return brands.some(function isMp4Brand(brand) {
            const normalized = brand.trim();
            return /^iso[2-9m]$/i.test(normalized)
                || /^mp4[12]$/i.test(normalized)
                || /^(avc1|dash|M4V|M4VH|M4VP|MSNV)$/i.test(normalized);
        });
    }

    /**
     * Waits for the browser preview to recognize source metadata.
     *
     * @param {string} objectUrl - Local object URL assigned to the video element.
     * @returns {Promise<{duration: number, width: number, height: number}>} Browser media metadata.
     * @throws {Error} When the browser cannot parse the selected media for preview.
     */
    function loadPreviewMetadata(objectUrl) {
        return new Promise(function resolvePreviewMetadata(resolve, reject) {
            const handleLoaded = function handleLoadedMetadata() {
                cleanup();
                if (!Number.isFinite(elements.preview.duration) || elements.preview.duration <= 0 || !elements.preview.videoWidth) {
                    reject(new Error("The selected file has no readable video duration or dimensions."));
                    return;
                }
                resolve({
                    duration: elements.preview.duration,
                    width: elements.preview.videoWidth,
                    height: elements.preview.videoHeight
                });
            };
            const handleError = function handlePreviewError() {
                cleanup();
                reject(new Error("This browser cannot decode the selected MP4 for preview."));
            };
            const cleanup = function removePreviewListeners() {
                elements.preview.removeEventListener("loadedmetadata", handleLoaded);
                elements.preview.removeEventListener("error", handleError);
            };

            elements.preview.addEventListener("loadedmetadata", handleLoaded, { once: true });
            elements.preview.addEventListener("error", handleError, { once: true });
            elements.preview.src = objectUrl;
            elements.preview.load();
        });
    }

    /**
     * Reads a frame rate from FFmpeg's input video-stream description.
     *
     * @param {string} videoLogLine - FFmpeg log line describing the source video stream.
     * @returns {number} Detected frames per second, or zero when the log omits it.
     */
    function parseFrameRateFromLog(videoLogLine) {
        const match = videoLogLine.match(/(?:,|\s)(\d+(?:\.\d+)?) fps(?:,|\s)/i);
        return match ? Number(match[1]) : 0;
    }

    /**
     * Reads mono, stereo, surround-layout, or explicit channel count from an FFmpeg audio-stream line.
     *
     * @param {string} audioLogLine - FFmpeg log line describing the source audio stream.
     * @returns {number} Detected channel count, or zero when the layout is unknown.
     */
    function parseAudioChannelsFromLog(audioLogLine) {
        const normalized = audioLogLine.toLowerCase();
        const explicitChannels = normalized.match(/,\s*(\d+) channels?(?:,|\s)/);
        if (explicitChannels) return Number(explicitChannels[1]);

        const layouts = Object.keys(CHANNEL_LAYOUT_COUNTS).sort(function longestFirst(first, second) {
            return second.length - first.length;
        });
        const layout = layouts.find(function findLayout(name) {
            return normalized.includes(`, ${name},`)
                || normalized.includes(`, ${name} (`)
                || normalized.includes(`, ${name}(`);
        });
        return layout ? CHANNEL_LAYOUT_COUNTS[layout] : 0;
    }

    /**
     * Decodes a real frame and extracts source stream facts from FFmpeg's own input map.
     *
     * @param {string} sourcePath - FFmpeg path to the selected file.
     * @param {{duration: number, width: number, height: number}} browserMetadata - Preview facts to normalize.
     * @returns {Promise<object>} Normalized duration, dimensions, audio, channels, and frame rate.
     * @throws {Error} When FFmpeg cannot parse and decode the video stream.
     */
    async function inspectAndDecodeSource(sourcePath, browserMetadata) {
        const engine = await ensureEngine();
        state.engineLogs = [];
        const exitCode = await engine.exec([
            "-hide_banner",
            "-i", sourcePath,
            "-map", "0:v:0",
            "-frames:v", "1",
            "-an",
            "-f", "null",
            FRAME_PROBE_OUTPUT
        ]);
        const videoLine = state.engineLogs.find(function findInputVideo(line) {
            return line.includes("Stream #0:") && line.includes("Video:");
        });
        const audioLine = state.engineLogs.find(function findInputAudio(line) {
            return line.includes("Stream #0:") && line.includes("Audio:");
        });

        if (exitCode !== 0 || !videoLine) {
            const diagnostic = state.engineLogs.filter(Boolean).slice(-4).join(" ");
            throw new Error(`FFmpeg could not decode a valid video stream.${diagnostic ? ` ${diagnostic}` : ""}`);
        }
        if (!Number.isFinite(browserMetadata.duration) || browserMetadata.duration <= RANGE_STEP_SECONDS) {
            throw new Error("The MP4 duration is missing or too short to process.");
        }

        return {
            duration: browserMetadata.duration,
            width: browserMetadata.width,
            height: browserMetadata.height,
            hasAudio: Boolean(audioLine),
            audioChannels: audioLine ? parseAudioChannelsFromLog(audioLine) : 0,
            frameRate: parseFrameRateFromLog(videoLine)
        };
    }

    /**
     * Releases every generated output URL and removes its download card.
     *
     * @returns {void}
     */
    function clearOutputs() {
        state.outputs.forEach(function revokeOutput(output) {
            URL.revokeObjectURL(output.url);
        });
        state.outputs.clear();
        elements.resultsList.replaceChildren();
        elements.resultsEmpty.hidden = false;
    }

    /**
     * Releases the current source preview URL and resets its media element.
     *
     * @returns {void}
     */
    function clearSourcePreview() {
        state.previewingRange = false;
        elements.preview.pause();
        elements.preview.removeAttribute("src");
        elements.preview.load();
        if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
        state.sourceUrl = null;
    }

    /**
     * Returns all output checkboxes to an unselected state.
     *
     * @returns {void}
     */
    function clearOutputSelections() {
        elements.mp3Checkbox.checked = false;
        elements.m4aCheckbox.checked = false;
        elements.compressedCheckbox.checked = false;
        elements.trimmedCheckbox.checked = false;
    }

    /**
     * Clears source-dependent controls while preserving the native file input value when requested.
     *
     * @param {boolean} clearFileInput - Whether to empty the picker selection.
     * @returns {void}
     */
    function clearSourceState(clearFileInput) {
        clearSourcePreview();
        clearOutputs();
        clearOutputSelections();
        state.file = null;
        state.sourceInfo = null;
        elements.sourceSummary.hidden = true;
        elements.sourceWarning.hidden = true;
        elements.outputOptions.disabled = true;
        elements.trimOptions.disabled = true;
        elements.previewRange.disabled = true;
        elements.audioUnavailable.hidden = true;
        if (clearFileInput) elements.fileInput.value = "";
        updateActionAvailability();
    }

    /**
     * Configures audio controls based on the detected stream layout.
     *
     * @param {boolean} hasAudio - Whether the source contains an audio stream.
     * @returns {void}
     */
    function configureAudioControls(hasAudio) {
        elements.mp3Checkbox.disabled = !hasAudio;
        elements.mp3Bitrate.disabled = !hasAudio;
        elements.m4aCheckbox.disabled = !hasAudio;
        elements.m4aBitrate.disabled = !hasAudio;
        elements.audioUnavailable.hidden = hasAudio;
        if (!hasAudio) {
            elements.mp3Checkbox.checked = false;
            elements.m4aCheckbox.checked = false;
        }
    }

    /**
     * Updates the dual-range visual fill, exact values, and accessible value text.
     *
     * @returns {void}
     */
    function updateTimeline() {
        const maximum = Number(elements.trimEnd.max) || 1;
        const start = Number(elements.trimStart.value);
        const end = Number(elements.trimEnd.value);
        const startPercent = (start / maximum) * 100;
        const endPercent = (end / maximum) * 100;

        elements.timeline.style.setProperty("--range-start", `${startPercent}%`);
        elements.timeline.style.setProperty("--range-end", `${endPercent}%`);
        elements.trimStartOutput.value = formatTime(start, true);
        elements.trimEndOutput.value = formatTime(end, true);
        elements.trimStart.setAttribute("aria-valuetext", formatTime(start, true));
        elements.trimEnd.setAttribute("aria-valuetext", formatTime(end, true));
    }

    /**
     * Initializes trim bounds from a validated source duration.
     *
     * @param {number} duration - Complete source duration in seconds.
     * @returns {void}
     */
    function configureTimeline(duration) {
        const maximum = Math.max(RANGE_STEP_SECONDS, duration);
        elements.trimStart.max = String(maximum);
        elements.trimEnd.max = String(maximum);
        elements.trimStart.value = "0";
        elements.trimEnd.value = String(maximum);
        elements.previewRange.disabled = false;
        updateTimeline();
    }

    /**
     * Shows a device-specific soft warning for large or long media.
     *
     * @param {File} file - Selected source file.
     * @param {number} duration - Detected source duration in seconds.
     * @returns {void}
     */
    function updateMemoryWarning(file, duration) {
        const isMobile = window.matchMedia(MOBILE_DEVICE_QUERY).matches;
        const byteLimit = isMobile ? MOBILE_WARNING_BYTES : DESKTOP_WARNING_BYTES;
        const durationLimit = isMobile ? MOBILE_WARNING_SECONDS : DESKTOP_WARNING_SECONDS;
        const exceedsLimit = file.size > byteLimit || duration > durationLimit;

        elements.sourceWarning.hidden = !exceedsLimit;
        if (exceedsLimit) {
            const deviceLabel = isMobile ? "mobile" : "desktop";
            elements.sourceWarning.textContent = `Large ${deviceLabel} job: this file exceeds ${formatBytes(byteLimit)} or ${Math.round(durationLimit / 60)} minutes. Browser memory may run out, but you can continue.`;
        }
    }

    /**
     * Renders validated source metadata and enables compatible options.
     *
     * @param {File} file - Validated source file.
     * @param {object} info - Normalized media facts.
     * @returns {void}
     */
    function showValidatedSource(file, info) {
        elements.sourceName.textContent = file.name;
        elements.sourceSize.textContent = formatBytes(file.size);
        elements.sourceDuration.textContent = formatTime(info.duration, true);
        elements.sourceDimensions.textContent = `${info.width} × ${info.height}`;
        elements.sourceAudio.textContent = info.hasAudio
            ? `Yes · ${info.audioChannels > 2 ? `${info.audioChannels} channels (outputs use stereo)` : `${info.audioChannels || "unknown"} channel${info.audioChannels === 1 ? "" : "s"}`}`
            : "No · silent video";
        elements.sourceSummary.hidden = false;
        elements.outputOptions.disabled = false;
        elements.trimOptions.disabled = false;
        configureAudioControls(info.hasAudio);
        configureTimeline(info.duration);
        updateMemoryWarning(file, info.duration);
        updateActionAvailability();
    }

    /**
     * Validates a replacement file through extension, MP4 signature, preview, FFprobe, and frame decoding.
     *
     * @param {File} file - Local file selected or dropped by the visitor.
     * @returns {Promise<void>}
     */
    async function validateSource(file) {
        const validationVersion = state.validationVersion + 1;
        state.validationVersion = validationVersion;
        state.cancelRequested = true;
        disposeEngine();
        clearSourceState(false);
        clearQueue();
        state.file = file;
        state.cancelRequested = false;
        announceStatus(`Checking ${file.name}…`);

        try {
            if (!file.name.toLowerCase().endsWith(".mp4")) {
                throw new Error("Choose a file whose name ends in .mp4. Other input formats are not supported.");
            }
            const brands = await readContainerBrands(file);
            if (!hasMp4Brand(brands)) {
                throw new Error("The file does not contain a recognized MP4 ftyp signature. Renaming another format to .mp4 is not sufficient.");
            }

            state.sourceUrl = URL.createObjectURL(file);
            const browserMetadata = await loadPreviewMetadata(state.sourceUrl);
            if (validationVersion !== state.validationVersion) return;

            await ensureEngine();
            if (validationVersion !== state.validationVersion) return;
            const sourcePath = await ensureSourceReady();
            const info = await inspectAndDecodeSource(sourcePath, browserMetadata);
            if (validationVersion !== state.validationVersion) return;

            state.sourceInfo = info;
            showValidatedSource(file, info);
            announceStatus("MP4 validated. Choose one or more outputs, then start conversion.");
        } catch (error) {
            if (validationVersion !== state.validationVersion) return;
            disposeEngine();
            clearSourceState(false);
            elements.fileInput.value = "";
            announceStatus("The selected file could not be used.", false);
            showError(`${error.message || error} Choose a different MP4 and try again.`);
        }
    }

    /**
     * Sets the start button from source validity, current work, and selected transformations.
     *
     * @returns {void}
     */
    function updateActionAvailability() {
        const hasSelection = elements.mp3Checkbox.checked
            || elements.m4aCheckbox.checked
            || elements.compressedCheckbox.checked
            || elements.trimmedCheckbox.checked;
        elements.startButton.disabled = !state.sourceInfo || !hasSelection || state.processing;
        elements.cancelButton.disabled = !state.processing;
    }

    /**
     * Returns stereo downmix arguments only when a source has more than two channels.
     *
     * @returns {string[]} FFmpeg channel-layout arguments.
     */
    function audioChannelArguments() {
        return state.sourceInfo.audioChannels > 2 ? ["-ac", "2"] : [];
    }

    /**
     * Produces a safe, non-empty basename for all generated downloads.
     *
     * @param {string} filename - Original local filename.
     * @returns {string} Sanitized filename without the final extension.
     */
    function safeBasename(filename) {
        const withoutExtension = filename.replace(/\.mp4$/i, "");
        const sanitized = withoutExtension.replace(UNSAFE_FILENAME_PATTERN, "_").replace(/[. ]+$/g, "").trim();
        return sanitized || "video";
    }

    /**
     * Builds a complete-source MP3 extraction job.
     *
     * @param {string} sourcePath - FFmpeg source path.
     * @param {string} basename - Safe output basename.
     * @returns {object} Queue job and FFmpeg command definition.
     */
    function buildMp3Job(sourcePath, basename) {
        const outputPath = "/output-audio.mp3";
        return {
            id: "mp3",
            label: `MP3 audio · ${elements.mp3Bitrate.value} kbps`,
            outputPath,
            filename: `${basename}_audio.mp3`,
            mimeType: "audio/mpeg",
            expectedDuration: state.sourceInfo.duration,
            args: [
                "-i", sourcePath, "-map", "0:a:0", "-vn",
                "-c:a", "libmp3lame", "-b:a", `${elements.mp3Bitrate.value}k`,
                ...audioChannelArguments(), "-map_metadata", "-1", "-y", outputPath
            ]
        };
    }

    /**
     * Builds a complete-source AAC-in-M4A extraction job.
     *
     * @param {string} sourcePath - FFmpeg source path.
     * @param {string} basename - Safe output basename.
     * @returns {object} Queue job and FFmpeg command definition.
     */
    function buildM4aJob(sourcePath, basename) {
        const outputPath = "/output-audio.m4a";
        return {
            id: "m4a",
            label: `M4A audio · ${elements.m4aBitrate.value} kbps`,
            outputPath,
            filename: `${basename}_audio.m4a`,
            mimeType: "audio/mp4",
            expectedDuration: state.sourceInfo.duration,
            args: [
                "-i", sourcePath, "-map", "0:a:0", "-vn",
                "-c:a", "aac", "-b:a", `${elements.m4aBitrate.value}k`,
                ...audioChannelArguments(), "-movflags", "+faststart",
                "-map_metadata", "-1", "-y", outputPath
            ]
        };
    }

    /**
     * Creates a no-upscale filter that preserves aspect ratio and caps frame rate to the chosen preset.
     *
     * @param {object} preset - Compression preset limits.
     * @returns {string} FFmpeg video-filter chain.
     */
    function buildCompressionFilter(preset) {
        const sourceRate = state.sourceInfo.frameRate > 0 ? state.sourceInfo.frameRate : preset.fpsCap;
        const targetRate = Math.min(sourceRate, preset.fpsCap).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
        return `scale=-2:'trunc(min(${preset.maxHeight},ih)/2)*2':flags=lanczos,fps=${targetRate}`;
    }

    /**
     * Builds an H.264/AAC compression job using the selected documented preset.
     *
     * @param {string} sourcePath - FFmpeg source path.
     * @param {string} basename - Safe output basename.
     * @returns {object} Queue job and FFmpeg command definition.
     */
    function buildCompressionJob(sourcePath, basename) {
        const outputPath = "/output-compressed.mp4";
        const preset = COMPRESSION_PRESETS[elements.compressionPreset.value];
        const audioArguments = state.sourceInfo.hasAudio
            ? ["-c:a", "aac", "-b:a", `${preset.audioBitrate}k`, ...audioChannelArguments()]
            : [];
        return {
            id: "compressed",
            label: `Compressed MP4 · ${preset.label}`,
            outputPath,
            filename: `${basename}_compressed.mp4`,
            mimeType: "video/mp4",
            expectedDuration: state.sourceInfo.duration,
            args: [
                "-i", sourcePath, "-map", "0:v:0", "-map", "0:a:0?",
                "-vf", buildCompressionFilter(preset),
                "-c:v", "libx264", "-preset", "medium", "-crf", String(preset.crf),
                "-pix_fmt", "yuv420p", ...audioArguments,
                "-movflags", "+faststart", "-map_metadata", "-1", "-map_chapters", "-1",
                "-metadata:s:v", "rotate=0", "-y", outputPath
            ]
        };
    }

    /**
     * Builds an accurately seeking, high-quality re-encoded trim job.
     *
     * @param {string} sourcePath - FFmpeg source path.
     * @param {string} basename - Safe output basename.
     * @returns {object} Queue job and FFmpeg command definition.
     */
    function buildTrimJob(sourcePath, basename) {
        const outputPath = "/output-trimmed.mp4";
        const start = Number(elements.trimStart.value);
        const end = Number(elements.trimEnd.value);
        const selectedDuration = end - start;
        const audioArguments = state.sourceInfo.hasAudio
            ? ["-c:a", "aac", "-b:a", "192k", ...audioChannelArguments()]
            : [];
        return {
            id: "trimmed",
            label: `Trimmed MP4 · ${formatTime(start, true)}–${formatTime(end, true)}`,
            outputPath,
            filename: `${basename}_trimmed.mp4`,
            mimeType: "video/mp4",
            expectedDuration: selectedDuration,
            args: [
                "-i", sourcePath, "-ss", start.toFixed(3), "-t", selectedDuration.toFixed(3),
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                ...audioArguments, "-movflags", "+faststart", "-avoid_negative_ts", "make_zero",
                "-map_metadata", "-1", "-map_chapters", "-1", "-metadata:s:v", "rotate=0",
                "-y", outputPath
            ]
        };
    }

    /**
     * Captures selected settings as an ordered, sequential transformation queue.
     *
     * @param {string} sourcePath - FFmpeg source path.
     * @returns {object[]} Queue jobs in audio, compression, then trim order.
     */
    function collectJobs(sourcePath) {
        const basename = safeBasename(state.file.name);
        const jobs = [];
        if (elements.mp3Checkbox.checked) jobs.push(buildMp3Job(sourcePath, basename));
        if (elements.m4aCheckbox.checked) jobs.push(buildM4aJob(sourcePath, basename));
        if (elements.compressedCheckbox.checked) jobs.push(buildCompressionJob(sourcePath, basename));
        if (elements.trimmedCheckbox.checked) jobs.push(buildTrimJob(sourcePath, basename));
        return jobs;
    }

    /**
     * Replaces the queue list with selected jobs and their explicit states.
     *
     * @param {object[]} jobs - Ordered jobs to display.
     * @returns {void}
     */
    function renderQueue(jobs) {
        elements.queueList.replaceChildren();
        jobs.forEach(function renderQueueJob(job) {
            const item = document.createElement("li");
            const label = document.createElement("span");
            const status = document.createElement("span");
            item.className = "queue-item";
            item.dataset.state = "queued";
            label.textContent = job.label;
            status.className = "queue-item__state";
            status.textContent = QUEUE_STATE_LABELS.queued;
            item.append(label, status);
            elements.queueList.append(item);
            job.queueElement = item;
            job.queueStatusElement = status;
            job.state = "queued";
        });
    }

    /**
     * Updates one queue row with both textual and visual state.
     *
     * @param {object} job - Queue job to update.
     * @param {string} nextState - One of the defined queue state names.
     * @param {string} [detail=""] - Optional state detail such as an error summary.
     * @returns {void}
     */
    function setJobState(job, nextState, detail = "") {
        job.state = nextState;
        job.queueElement.dataset.state = nextState;
        job.queueStatusElement.textContent = detail
            ? `${QUEUE_STATE_LABELS[nextState]} · ${detail}`
            : QUEUE_STATE_LABELS[nextState];
    }

    /**
     * Restores the empty queue placeholder after source replacement or reset.
     *
     * @returns {void}
     */
    function clearQueue() {
        state.queue = [];
        elements.queueList.replaceChildren();
        const emptyItem = document.createElement("li");
        emptyItem.className = "queue-list__empty";
        emptyItem.textContent = "Selected jobs will appear here.";
        elements.queueList.append(emptyItem);
        elements.progressBlock.hidden = true;
        setProgress(0);
    }

    /**
     * Creates or replaces one retained download card without triggering a download.
     *
     * @param {object} job - Completed job metadata.
     * @param {Blob} blob - Generated local media bytes.
     * @returns {void}
     */
    function addResult(job, blob) {
        const existing = state.outputs.get(job.id);
        if (existing) {
            URL.revokeObjectURL(existing.url);
            existing.card.remove();
        }

        const url = URL.createObjectURL(blob);
        const card = document.createElement("article");
        const title = document.createElement("h3");
        const detail = document.createElement("p");
        const download = document.createElement("a");
        card.className = "result-card";
        title.textContent = job.label;
        detail.textContent = `Result size: ${formatBytes(blob.size)}`;

        if (job.id === "compressed") {
            const difference = state.file.size - blob.size;
            const percent = Math.abs((difference / state.file.size) * 100);
            detail.textContent = `Source ${formatBytes(state.file.size)} · Result ${formatBytes(blob.size)} · ${formatBytes(Math.abs(difference))} ${difference >= 0 ? "smaller" : "larger"} (${percent.toFixed(1)}%)`;
            if (difference <= 0) {
                const warning = document.createElement("p");
                warning.className = "result-card__warning";
                warning.textContent = "This compressed result is not smaller than the source, but it remains available to download.";
                card.append(title, detail, warning);
            } else {
                card.append(title, detail);
            }
        } else {
            card.append(title, detail);
        }

        // Generated link: explicit filename and download attribute ensure only user activation saves the file.
        download.className = "download-link";
        download.href = url;
        download.download = job.filename;
        download.textContent = `Download ${job.filename}`;
        card.append(download);
        elements.resultsList.append(card);
        elements.resultsEmpty.hidden = true;
        state.outputs.set(job.id, { url, card, blob });
    }

    /**
     * Runs one FFmpeg command, reads its output, and removes the temporary virtual file.
     *
     * @param {object} job - Current queue job.
     * @returns {Promise<Blob>} Generated media blob.
     * @throws {Error} When FFmpeg exits unsuccessfully or creates an empty output.
     */
    async function executeJob(job) {
        const engine = await ensureEngine();
        try {
            await engine.deleteFile(job.outputPath);
        } catch {
            // Best-effort cleanup: the command's -y flag safely replaces a stale file, while first runs have none.
        }

        const exitCode = await engine.exec(job.args);
        if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}.`);
        const bytes = await engine.readFile(job.outputPath);
        await engine.deleteFile(job.outputPath);
        if (!bytes.length) throw new Error("FFmpeg produced an empty file.");
        return new Blob([bytes], { type: job.mimeType });
    }

    /**
     * Marks active and waiting jobs cancelled while leaving completed results intact.
     *
     * @returns {void}
     */
    function markRemainingJobsCancelled() {
        state.queue.forEach(function cancelPendingJob(job) {
            if (job.state === "queued" || job.state === "running") setJobState(job, "cancelled");
        });
    }

    /**
     * Processes selected transformations one at a time to limit peak browser memory.
     *
     * @returns {Promise<void>}
     */
    async function runQueue() {
        if (!state.sourceInfo || state.processing) return;
        const start = Number(elements.trimStart.value);
        const end = Number(elements.trimEnd.value);
        if (elements.trimmedCheckbox.checked && end - start < RANGE_STEP_SECONDS) {
            showError("Trim end must be greater than trim start by at least 0.05 seconds.");
            return;
        }

        state.processing = true;
        state.cancelRequested = false;
        updateProcessingControls();
        announceStatus("Preparing the local conversion queue…");

        let completedCount = 0;
        let failedCount = 0;
        try {
            const sourcePath = await ensureSourceReady();
            state.queue = collectJobs(sourcePath);
            renderQueue(state.queue);
            elements.progressBlock.hidden = false;

            for (const job of state.queue) {
                if (state.cancelRequested) break;
                state.currentJob = job;
                state.currentExpectedDuration = job.expectedDuration;
                state.currentLogProgress = 0;
                setJobState(job, "running");
                elements.currentJob.textContent = job.label;
                setProgress(0);
                announceStatus(`Running ${job.label}. Remaining jobs will wait.`);

                try {
                    const blob = await executeJob(job);
                    if (state.cancelRequested) {
                        setJobState(job, "cancelled");
                        break;
                    }
                    addResult(job, blob);
                    setProgress(1);
                    setJobState(job, "complete", formatBytes(blob.size));
                    completedCount += 1;
                } catch (error) {
                    if (state.cancelRequested) {
                        setJobState(job, "cancelled");
                        break;
                    }
                    failedCount += 1;
                    setJobState(job, "failed", error.message || String(error));
                    showError(`${job.label} failed: ${error.message || error} The next queued job will still run.`);
                }
            }
        } catch (error) {
            if (!state.cancelRequested) {
                failedCount += 1;
                showError(`The conversion engine could not start: ${error.message || error}`);
            }
        } finally {
            if (state.cancelRequested) markRemainingJobsCancelled();
            state.processing = false;
            state.currentJob = null;
            state.currentExpectedDuration = 0;
            updateProcessingControls();
            if (state.cancelRequested) {
                announceStatus(`Conversion cancelled. ${completedCount} completed result${completedCount === 1 ? " was" : "s were"} preserved.`, false);
            } else {
                announceStatus(`Queue finished: ${completedCount} complete, ${failedCount} failed.`, failedCount === 0);
            }
        }
    }

    /**
     * Disables mutable settings during processing and restores valid per-source states afterwards.
     *
     * @returns {void}
     */
    function updateProcessingControls() {
        const controlsDisabled = state.processing || !state.sourceInfo;
        elements.outputOptions.disabled = controlsDisabled;
        elements.trimOptions.disabled = controlsDisabled;
        if (!controlsDisabled) configureAudioControls(state.sourceInfo.hasAudio);
        elements.previewRange.disabled = controlsDisabled;
        updateActionAvailability();
    }

    /**
     * Stops the active worker and clears queued work while retaining completed download URLs.
     *
     * @returns {void}
     */
    function cancelQueue() {
        if (!state.processing) return;
        state.cancelRequested = true;
        markRemainingJobsCancelled();
        disposeEngine();
        announceStatus("Cancelling the active job and clearing queued work…", false);
    }

    /**
     * Resets source, output URLs, messages, engine memory, and all processing state.
     *
     * @returns {void}
     */
    function resetApplication() {
        state.validationVersion += 1;
        state.cancelRequested = true;
        state.processing = false;
        disposeEngine();
        clearSourceState(true);
        clearQueue();
        if (applyCompatibilityGate()) {
            announceStatus("Reset complete. Choose an MP4 to begin.");
        }
    }

    /**
     * Clamps the start handle below the end handle and seeks preview to the selected start.
     *
     * @returns {void}
     */
    function handleTrimStartInput() {
        const maximumStart = Math.max(0, Number(elements.trimEnd.value) - RANGE_STEP_SECONDS);
        if (Number(elements.trimStart.value) > maximumStart) elements.trimStart.value = String(maximumStart);
        elements.preview.pause();
        elements.preview.currentTime = Number(elements.trimStart.value);
        state.previewingRange = false;
        updateTimeline();
    }

    /**
     * Clamps the end handle above the start handle and seeks preview to the selected end.
     *
     * @returns {void}
     */
    function handleTrimEndInput() {
        const minimumEnd = Math.min(Number(elements.trimEnd.max), Number(elements.trimStart.value) + RANGE_STEP_SECONDS);
        if (Number(elements.trimEnd.value) < minimumEnd) elements.trimEnd.value = String(minimumEnd);
        elements.preview.pause();
        elements.preview.currentTime = Number(elements.trimEnd.value);
        state.previewingRange = false;
        updateTimeline();
    }

    /**
     * Plays only the selected trim range in the existing source preview.
     *
     * @returns {Promise<void>}
     */
    async function previewSelectedRange() {
        if (!state.sourceInfo) return;
        elements.preview.currentTime = Number(elements.trimStart.value);
        state.previewingRange = true;
        try {
            await elements.preview.play();
        } catch (error) {
            state.previewingRange = false;
            showError(`The browser could not start the range preview: ${error.message || error}`);
        }
    }

    /**
     * Stops explicit range preview at the selected end boundary.
     *
     * @returns {void}
     */
    function enforcePreviewEnd() {
        if (!state.previewingRange) return;
        const selectedEnd = Number(elements.trimEnd.value);
        if (elements.preview.currentTime >= selectedEnd) {
            elements.preview.pause();
            elements.preview.currentTime = selectedEnd;
            state.previewingRange = false;
            announceStatus("Selected trim range preview finished.");
        }
    }

    /**
     * Handles one file from a picker or drop interaction and rejects multi-file drops.
     *
     * @param {FileList|File[]} files - Candidate local files.
     * @returns {void}
     */
    function acceptFiles(files) {
        if (elements.fileInput.disabled) {
            showError("This browser is missing a required local-conversion capability. Use a current supported browser.");
            return;
        }
        if (!files || files.length !== 1) {
            showError("Choose exactly one MP4 file. Batch processing is not supported.");
            return;
        }
        void validateSource(files[0]);
    }

    /**
     * Prevents browser file navigation and displays drop-target feedback.
     *
     * @param {DragEvent} event - Current drag event.
     * @returns {void}
     */
    function handleDragOver(event) {
        event.preventDefault();
        if (elements.fileInput.disabled) {
            if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
            return;
        }
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        elements.dropZone.classList.add("is-dragging");
    }

    /**
     * Accepts a single dropped file without assigning it to the protected native input value.
     *
     * @param {DragEvent} event - File drop event.
     * @returns {void}
     */
    function handleDrop(event) {
        event.preventDefault();
        elements.dropZone.classList.remove("is-dragging");
        acceptFiles(event.dataTransfer?.files || []);
    }

    /**
     * Releases local URLs and worker resources when the document is discarded.
     *
     * @returns {void}
     */
    function releaseSessionResources() {
        if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
        state.outputs.forEach(function revokeSessionOutput(output) {
            URL.revokeObjectURL(output.url);
        });
        disposeEngine();
    }

    /**
     * Binds native controls to application behavior and applies the initial capability gate.
     *
     * @returns {void}
     */
    function bindInterface() {
        applyCompatibilityGate();

        elements.fileInput.addEventListener("change", function handleFileSelection() {
            acceptFiles(elements.fileInput.files);
        });
        elements.dropZone.addEventListener("dragenter", handleDragOver);
        elements.dropZone.addEventListener("dragover", handleDragOver);
        elements.dropZone.addEventListener("dragleave", function clearDragState() {
            elements.dropZone.classList.remove("is-dragging");
        });
        elements.dropZone.addEventListener("drop", handleDrop);

        [elements.mp3Checkbox, elements.m4aCheckbox, elements.compressedCheckbox, elements.trimmedCheckbox]
            .forEach(function bindSelectionChange(control) {
                control.addEventListener("change", updateActionAvailability);
            });
        elements.trimStart.addEventListener("input", handleTrimStartInput);
        elements.trimEnd.addEventListener("input", handleTrimEndInput);
        elements.previewRange.addEventListener("click", function startRangePreview() {
            void previewSelectedRange();
        });
        elements.preview.addEventListener("timeupdate", enforcePreviewEnd);
        elements.startButton.addEventListener("click", function startQueue() {
            void runQueue();
        });
        elements.cancelButton.addEventListener("click", cancelQueue);
        elements.resetButton.addEventListener("click", resetApplication);
        window.addEventListener("beforeunload", releaseSessionResources);
    }

    clearQueue();
    updateTimeline();
    bindInterface();
}());
