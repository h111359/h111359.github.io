# hmhristov.com

This repository is the source for Hristo M. Hristov's static personal website. It is published through GitHub Pages with no application server, build system, or package manager.

## Main site

The primary career presentation remains a four-page static site:

- `index.html` — Home
- `cv.html` — Professional
- `apps.html` — Projects
- `art_drawing.html` — Creative

Trip journals and utilities are auxiliary pages reached through their own URLs; they do not add items to the primary navigation.

## Reusable trip journals

Family trip stories use a shared static gallery system:

- `trips/shared/` contains the reusable gallery controller and stylesheet.
- `trips/template/` is the copy-ready starting point for a new trip.
- `trips/data_editor.html` is the canonical local editor for every trip's `data/` directory.
- `scripts/generate_trip_event.py` creates one event data file from a public Google Drive folder without credentials.
- Root-level peer folders such as `china/` publish real trips at stable URLs.

The existing China journal remains available under `china/`. Its event hashes, registry, and authored `china/data/*.js` stories retain their existing schema and URLs while its application code and styling come from `trips/shared/`.

See [trips/README.md](trips/README.md) for configuration, event generation, editing, validation, and publication instructions.

## Local preview

Because event files are loaded dynamically, preview the repository through an HTTP server rather than opening trip HTML directly as a `file:` URL:

```sh
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/china/` or `http://127.0.0.1:8765/trips/template/`.

## Generator tests

The generator uses only the Python 3.10+ standard library. Run its synthetic, network-free tests with:

```sh
python -m unittest tests/test_generate_trip_event.py -v
```

The fixtures contain no family media identifiers, credentials, tokens, or real Drive folder configuration.
