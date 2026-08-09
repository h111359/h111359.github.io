# Shared trip journal workflow

The trip system publishes independent static journals while keeping the gallery application, editor, and data-generation workflow reusable. It needs only GitHub Pages and a modern browser; there is no server-side component or JavaScript build step.

## Architecture

Real trips are root-level peer folders:

```text
china/
  index.html
  trip-config.js
  data/
    events.js
    event-*.js
<trip-slug>/
  index.html
  trip-config.js
  data/
trips/
  shared/
    gallery.css
    gallery.js
  template/
  data_editor.html
scripts/
  generate_trip_event.py
```

Each trip owns only its page shell, identity/configuration, event registry, and story data. `trips/shared/gallery.js` reads `window.GALLERY_TRIP_CONFIG`, `window.GALLERY_EVENT_INDEX`, and the selected event's `window.GALLERY_ITEMS`. `trips/shared/gallery.css` supplies the common responsive presentation.

The template is not another real trip. Its empty registry deliberately displays the configured no-events state until the copied folder receives event data.

## Create a trip

1. Copy `trips/template/` to a new root-level folder whose name is the public trip slug, for example `family-weekend/`.
2. Edit only the copied `trip-config.js` to establish the trip identity and optional theme overrides.
3. Generate or manually create one or more `data/event-*.js` files.
4. Open `trips/data_editor.html` in Chrome or Edge and select the copied trip's `data/` folder.
5. Add each event to `events.js` through the editor, check its title and data path, and save.
6. Preview the new root-level URL through a local HTTP server, then publish the files through GitHub Pages.

The template uses root-relative `/trips/shared/` asset references. This works at the custom-domain site root both before and after the folder is copied. A deployment hosted below a URL prefix must adjust those two shared asset paths.

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

The shared controller provides complete English label defaults. The China configuration supplies Bulgarian labels and the existing warm lacquer-and-jade theme.

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
  { name: "photo.jpg", preview: "https://drive.google.com/file/d/FILE_ID/preview?authuser=0", desc: "", visible: true },
  { type: "text", title: "Story heading", body: "<p>Trusted authored HTML.</p>", desc: "" }
];
```

Media can be images or videos. Only `visible: false` hides a media record, so legacy items without the field remain visible. Text blocks are unaffected by media visibility. The shared application intentionally renders locally authored `body` and `desc` HTML as rich text.

## Generate an event from Google Drive

The Python 3.10+ generator accepts a public folder URL or ID and creates exactly one event file:

```sh
python scripts/generate_trip_event.py "https://drive.google.com/drive/folders/FOLDER_ID" --output family-weekend/data/event-day-1.js
```

Use `--overwrite` only when intentionally replacing an existing event:

```sh
python scripts/generate_trip_event.py FOLDER_ID \
  --output family-weekend/data/event-day-1.js \
  --overwrite
```

Without `--overwrite`, an existing file is replaced only after an explicit interactive confirmation. Regeneration replaces the entire file; it does not preserve descriptions, text blocks, visibility settings, or custom ordering. Declining replacement leaves the original bytes unchanged.

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

## Edit data locally

Open `trips/data_editor.html` directly in Chrome 86+ or Edge 86+. The File System Access API requires a Chromium-based browser and a user-selected directory.

1. Choose **Open a trip data/ folder** and select the `data/` directory inside any trip.
2. Select an event from the loaded `events.js` registry.
3. Add, remove, reorder, or edit media and text blocks; update descriptions, rich text, and visibility as needed.
4. Use **Refresh** to compare the selected file with disk or rely on the five-second foreground poll.
5. Save the current event in place. Dirty-state protection defers external changes and warns before local edits are discarded.
6. Expand **events.js registry** to add, remove, reorder, or update event registrations, then save the registry separately.

The editor persists a user-authorized directory handle and last selection when the browser permits it. Revoked permissions, another browser origin, or cleared browser storage require selecting the folder again. The editor does not contact Google Drive and does not generate files from folders.

## Preview and publish

Serve the repository root locally so dynamic event scripts and root-relative shared assets use the same paths as GitHub Pages:

```sh
python -m http.server 8765
```

Check both the trip root and at least one bookmarkable event hash. Confirm navigation, search, images, video previews, text blocks, descriptions, visibility, and lightbox behavior before committing. Publishing is the normal GitHub Pages workflow; no compilation step is required.

## Automated verification

The generator test suite covers folder reference parsing, natural sorting, media filtering and skip reporting, JavaScript escaping, schema serialization, resource keys, guarded overwrite behavior, and representative embedded-folder response parsing:

```sh
python -m unittest tests/test_generate_trip_event.py -v
```

Tests are network-free and use only synthetic identifiers. A live public folder remains an integration check because the Drive page is undocumented and can change independently of this repository.
