# Shared trip journal workflow

Trip journals publish as ordinary static HTML, CSS and JavaScript on GitHub Pages. The browser editor adds a local Python authoring service; no server or build step is needed for published pages.

## Start the editor

Install Python 3.10 or newer. The helper uses only its standard library; no packages or virtual environment are required.

- **Linux (Ubuntu):** Right-click `trips/start-editor.sh` in Files and choose **Run as a Program**. The script is executable and opens a terminal for the helper. If a download stripped its executable permission, enable **Properties → Permissions → Allow executing file as program** first. Double-clicking shell scripts in modern Ubuntu Files opens them as text; use the explicit Run action. The script resolves its own location, so moving the repository or launching from another folder is supported. No desktop shortcut or installation is required.
- **Windows:** Double-click `trips/start-editor.bat`. It tries the Python launcher (`py -3`) and then `python` on PATH. Missing/old Python produces an installation message.

The launcher opens `http://127.0.0.1:8765/trips/data_editor.html` in the default browser and keeps a terminal open. **Ctrl+C** stops the helper; pending request workers finish first. Linux terminal hangup and supported termination signals also request shutdown. An occupied port causes an error rather than connecting to another service. Close the old helper and retry. If the browser does not open, the terminal prints its URL.

From a terminal at the repository root, run `./trips/start-editor.sh`. On Windows use `py -3 trips/scripts/trip_editor_server.py`. Closing a Windows console can forcibly terminate Python before pending writes finish; use Ctrl+C and wait for exit before closing the window.

Helper mode works in modern Chrome, Firefox and Edge. **Open a trip data/ folder** retains the Chromium File System Access fallback, including in-place event and registry editing. A data-folder handle does not authorize parent config access: trip creation, settings, Drive generation and automatic preview require helper mode. Offline manual editing still works; Drive discovery and existing AI actions require network access.

## Architecture

Real trips are peers below `trips/`:

```text
trips/
  china/                  existing trip, unchanged by the authoring upgrade
  2026/                   existing trip, unchanged by the authoring upgrade
  <trip-slug>/
    index.html
    trip-config.js
    data/
      events.js
      event-*.js
  shared/
    gallery.css
    gallery.js
  template/               reusable shell/config and empty event registry
  data_editor.html
  start-editor.sh
  start-editor.bat
  scripts/
    trip_editor_server.py loopback endpoints and static preview
    trip_storage.py       literal parsing, portable paths and coordinated writes
    drive_generation.py   reviewed reuse of the existing CLI generator
scripts/
  generate_trip_event.py  existing standalone generator
```

A **trip** owns its page shell, configuration and data directory. A **part** owns one event data file and one `events.js` registration. Empty, exactly-one-part and multiple-part trips are supported. Template, shared and scripts directories are excluded from discovery. The template uses `../shared/gallery.css` and `../shared/gallery.js`, matching its new location under `trips/<slug>/`.

## Create and configure a trip

1. Open **Create new trip**, enter a name and review the suggested URL slug. Bulgarian and `bg-BG` are defaults; English is available.
2. Choose **Create new trip**. The editor copies the template exclusively into `trips/<slug>/` and selects the new empty trip. Existing destinations are left untouched; select the existing trip from the dropdown instead.
3. Open **Trip settings** to edit identity and basic language settings. **Advanced settings** contains theme values, trip facts, description and localized labels. Choose **Save settings**.
4. Optionally enter a public Drive folder during creation. The empty trip is created first, then the ordinary reviewed part-generation form is offered. A failed Drive operation does not remove that trip.

Generated slugs use lowercase ASCII and Bulgarian transliteration: ж→zh, й→y, х→h, ц→ts, ч→ch, ш→sh, щ→sht, ъ→a, ь→y, ю→yu, я→ya; other Bulgarian letters use their straightforward Latin equivalents. Non-alphanumeric separators become hyphens. For example, `Пътуване до София` becomes `patuvane-do-sofiya`. Edited slugs permit lowercase letters/digits separated by hyphens or underscores; reserved Windows names, case collisions, traversal and symlinks are rejected.

## Trip configuration


Every `trip-config.js` defines `window.GALLERY_TRIP_CONFIG` before the registry and shared controller load. The supported trip-level values are:

| Property | Purpose |
| --- | --- |
| `language` | BCP 47 document language applied to `<html lang>`. |
| `locale` | Locale used by `Intl.DateTimeFormat`, case-aware search, and generated date labels. |
| `pageTitle` | Browser title. |
| `heroEyebrow` | Short line above the main heading. |
| `heading` | Main trip heading. |
| `subtitle` | Trip introduction below the heading. |
| `tripFacts` | Explicit trip facts/date summary; leave empty to derive a registry date range and event count. |
| `pageDescription` | Page description metadata. |
| `theme` | Optional semantic color overrides such as `accent`, `secondary`, `canvas`, and `focus`. |
| `labels` | Optional localized overrides for shared interface and state messages. |

New trips receive complete Bulgarian or English presets, including empty-trip copy. The China configuration remains unchanged. The settings editor preserves custom labels and theme overrides when switching language, and retains unknown JSON-compatible config fields. Advanced settings include every supported theme value, including heroWash, and a labeled JSON editor for localized messages. Executable JavaScript expressions in configuration are rejected without overwriting the file; repair them manually to use settings editing. Saving preserves literal values, not original comments or formatting.

## Event registry and event data

Each trip's `data/events.js` defines:

```js
window.GALLERY_EVENT_INDEX = [
  { slug: "event-20260808-example", title: "Example · 8 August 2026", data: "data/event-20260808-example.js" }
];
```

Keep slugs stable after publication because the gallery uses `#event=<slug>` hashes as bookmarks. The `data` path is relative to the trip's `index.html`.

Each event data file defines:

```js
window.GALLERY_ITEMS = [
  { name: "photo.jpg", preview: "https://drive.google.com/file/d/FILE_ID/preview?authuser=0", desc: "", visible: true, flipHorizontal: true, rotation: 90 },
  { type: "text", title: "Story heading", body: "<p>Trusted authored HTML.</p>", desc: "" }
];
```

Media can be images or videos. Only `visible: false` hides a media record, so legacy items without the field remain visible. Text blocks are unaffected by media visibility. The shared application intentionally renders locally authored `body` and `desc` HTML as rich text.

Media records may also include `flipHorizontal: true`, `flipVertical: true`, and `rotation: 90`, `180`, or `270`. These correction fields are optional: omitted flips default to `false`, and an omitted rotation defaults to `0`, so existing event records render unchanged. The data editor writes only active corrections and previews them before save.

## Add, edit or delete parts

Use the existing **events.js registry** panel to add blank parts, change titles, reorder entries or remove parts. New identities are editable before their first save; saved slugs and filenames are locked to preserve bookmarks. A newly registered missing event file is created as an empty part together with its registry entry.

Removing a saved part queues deletion of **both** its registry entry and event file after confirmation. **Save registry** applies the coordinated operation. An event file still referenced by another row cannot be deleted. Existing malformed or duplicate registry records remain readable and existing event files remain editable, but every registry-changing operation requires the full registry to be valid. Correct editable titles in the panel; if a repair needs a saved slug or filename change, repair the source manually, then choose **Reload trip / repair feedback**. The editor does not silently rename saved identities.

Event editing retains rich text, text blocks, media visibility, flips, quarter-turn rotation, ordering and AI description controls. Helper mode remembers the last trip and event; manual mode remembers a user-authorized folder and event when browser permissions/storage allow it. Revoked access or cleared storage requires reopening the folder. API keys remain in tab memory.

Settings, registry and event drafts are tracked separately. Switching trips asks before discarding any of them. The selected event refreshes manually or every five seconds while visible; external changes are deferred while dirty, stale writes are rejected, and failed parsing retains the last valid state. Late loads and AI results cannot replace a newly selected trip/event.

## Generate a part from a public Drive folder

1. Save any outstanding drafts. Open **Add or regenerate a part from Google Drive**.
2. Enter the date, title and public Drive folder URL. Use **Suggest slug and filename** or edit the new identity. For replacement, choose **Regenerate selected part** to retain its saved identity; **New part identity** returns to creation mode.
3. Choose **Discover media**. Review the included filenames, valid count and skip report. Large folders can take several minutes because each selected child is validated.
4. Choose **Confirm and save reviewed part**. The helper rechecks file versions and writes the event plus registry together. A review expires after ten minutes and can be committed only once.

Replacement requires explicit confirmation that descriptions, text blocks, visibility, corrections and custom ordering will be lost. Failed discovery, zero supported media, denied replacement, stale versions or failed registry writes leave the original files intact under the runtime recovery policy below. Folder URLs are not stored in the public event registry or configuration; enter the URL again for regeneration.

The helper imports the existing CLI generator's discovery, filtering, public validation and serialization functions. It uses no credentials, visits only direct folder children, and never changes permissions. Its parser relies on public Drive HTML, so live behavior can change independently of this repository.

### Standalone CLI

The Python 3.10+ generator accepts a public folder URL or ID and creates exactly one event file:

```sh
python scripts/generate_trip_event.py "https://drive.google.com/drive/folders/FOLDER_ID" --output trips/family-weekend/data/event-day-1.js
```

Use `--overwrite` only when intentionally replacing an existing event:

```sh
python scripts/generate_trip_event.py FOLDER_ID \
  --output trips/family-weekend/data/event-day-1.js \
  --overwrite
```

Without `--overwrite`, an existing file is replaced only after an explicit interactive confirmation. Regeneration replaces the entire file; it does not preserve descriptions, text blocks, visibility settings, image correction settings, or custom ordering. Declining replacement leaves the original bytes unchanged.

The generator:

- makes unauthenticated requests and never changes Drive permissions;
- inspects direct children only and never enters nested folders;
- uses the public embedded folder view so it has no arbitrary 50-item or single-page limit;
- includes common image and video extensions and naturally sorts filenames;
- skips and reports nested folders, detected shortcuts, Google-native documents, and unsupported files;
- preserves a `resourcekey` in generated preview URLs when the public listing exposes one;
- validates every selected media item with a small unauthenticated Drive probe;
- refuses to write when discovery is ambiguous, no supported media exists, or any selected item cannot be verified;
- prepares the complete content before an atomic filesystem replacement, preventing partial output;
- refuses any output path named `events.js`.

Run `python scripts/generate_trip_event.py --help` for the complete option and limitation summary.

### Credential-free limitation

Google does not publish a supported unauthenticated equivalent of the Drive API's `files.list`. The generator therefore isolates parsing of the undocumented public `embeddedfolderview` HTML in `parse_embedded_folder_view()`. If Google changes or removes that response, the script exits non-zero with an actionable parsing error instead of silently producing an incomplete gallery. Update that isolated parser and its synthetic fixture before retrying.

Public folder access is not treated as proof that every selected child is reachable. The generator validates files individually without cookies, tokens, API keys, OAuth, or credential files. This is the strongest check available within the credential-free workflow, but Google remains the authority for the final viewer response.

## Preview and recovery

**Preview trip** opens the helper URL in a new tab, including `#event=<slug>` for the selected part. With unsaved changes it offers to save all affected valid drafts together; declining, validation failure or any failed save cancels preview. Allow the new tab if the browser blocks it. Publishing remains a separate manual Git/GitHub Pages workflow.

Coordinated writes keep originals while the helper runs. A caught failure restores replaced/deleted originals and removes new partial output. If restoring a file also fails, the helper blocks further writes and reports a hidden `.trip-editor-recovery-*` directory containing numbered `*.original` files. Stop editing, recover those originals and repair the underlying disk/permission problem before restarting; keep recovery directories out of published content. Manual folder mode offers a downloadable original-source recovery file if rollback fails.

This is **runtime rollback**, not a durable transaction journal. Power loss, forced process termination or forcibly closing a Windows console can interrupt it; there is no automatic restart recovery. Review both the event and registry against retained originals after an abrupt termination. File versions detect conflicting edits, but arbitrary simultaneous changes by an external editor during filesystem replacement are not a supported transaction participant.

## Verification

Run from the repository root:

```sh
python -B -m unittest discover -s tests -p 'test_generate_trip_event.py' -v
python -B -m unittest discover -s tests -p 'test_trip_editor.py' -v
```

The suites use temporary repositories and synthetic Drive responses, without external requests. HTTP tests require permission to bind loopback sockets. Open `http://127.0.0.1:8765/tests/trip_editor_browser.html` while the helper runs, then choose **Run tests in memory**. The harness executes the actual editor/gallery logic with mocked storage and text-only gallery fixtures; it never changes repository files or contacts Drive/OpenAI.

The implementation was checked with 12 existing generator tests, 25 helper tests, and 14 browser assertions in both headless Chrome and Firefox. A separate disposable browser-to-helper run covered creation, synthetic Drive review, coordinated generation, settings saving and selected-part preview. Desktop and mobile screenshots were inspected. After replacing the Linux desktop entry with an executable shell script, all 28 helper/launcher tests passed. Launcher checks cover relocation, literal arguments, missing Python and simulated terminal startup; a real loopback check served the editor and stopped cleanly with SIGINT. Interactive Files startup remains a manual check.

The remaining interactive acceptance checks are:

- Linux Files **Run as a Program** startup, plus terminal shutdown on the owner's desktop.
- Windows double-click startup/shutdown, missing Python and occupied-port behavior.
- Edge and actual Chromium File System Access permission/restoration dialogs; the automated fallback test uses a mock directory handle.
- One owner-supplied public Drive folder through discovery, generation and preview; live Drive and live AI service calls were not tested.

Record the platform/browser and outcome when performing these checks. Automated results do not establish interactive file-manager behavior, Windows console behavior or current Drive availability.
