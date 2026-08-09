# China family trip journal

This folder publishes the existing China journal at the stable `/china/` URL. Its event registry, event slugs, bookmark hashes, and authored `data/*.js` files retain the established static schema.

## Shared application

China now loads:

- trip identity, Bulgarian interface copy, locale, metadata, and theme from `trip-config.js`;
- the event registry from `data/events.js`;
- reusable application behavior from `../trips/shared/gallery.js`;
- reusable presentation from `../trips/shared/gallery.css`.

Do not copy the shared controller or stylesheet back into this folder. Trip-specific changes belong in `trip-config.js` or the trip's own `data/` files.

## Add or update an event

1. Make the source Google Drive folder and every intended child media file publicly viewable. The repository tools never alter permissions.
2. Generate one local event file from the public folder:

   ```sh
   python scripts/generate_trip_event.py FOLDER_ID \
     --output china/data/event-YYYYMMDD-place.js
   ```

3. Open `trips/data_editor.html` in Chrome or Edge, select `china/data/`, and register the new file in `events.js`.
4. Use the same editor to add descriptions or text blocks, change visibility, reorder records, validate content, and save in place.
5. Preview `/china/` through a local HTTP server and verify the new `#event=<slug>` hash before publishing.

Regeneration replaces a whole event file. When an output already exists, the generator warns that descriptions, text blocks, visibility choices, and custom ordering will be lost; it requires explicit confirmation or `--overwrite`. It never changes `events.js`.

The obsolete Google Apps Script workflow has been removed. It changed Drive permissions, paginated manually, and embedded trip-specific folder references. Use the shared credential-free Python generator and canonical data editor instead.

See [`trips/README.md`](../trips/README.md) for full architecture, configuration, generator limitations, editor behavior, testing, and publication instructions.
