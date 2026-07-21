# Product Context

## Product

- Personal public website for Hristo M. Hristov, data and analytics professional.
- Hosted as a GitHub Pages site with custom domain hmhristov.com (CNAME record).
- Primary audience is the owner and public visitors.
- Site sections: personal homepage, CV, mini web apps, art gallery, China travel photo gallery, checklist page, GitHub markdown reader.
- No commercial scope; purely personal/portfolio use.

## Concepts

- GitHub Pages static hosting with custom domain configured via CNAME file.
- Multi-event photo/video gallery backed by Google Drive media; each event is a JS data file defining GALLERY_ITEMS.
- Event registry pattern: events.js defines GALLERY_EVENT_INDEX array; app.js dynamically loads per-event data files via script injection.
- Hash-based routing in gallery app using URLSearchParams on location.hash for bookmarkable event navigation.
- Gallery media items referenced by Google Drive file preview URLs; thumbnails and view URLs derived from extracted file IDs.
- English/Bulgarian word learning game mechanic: displays a word, user selects correct translation from multiple options.
- Markdown reader app fetches raw files from configured GitHub repos and renders them in-browser.
- Site-wide shared stylesheet at css/main.css used by all root-level pages.
- No build toolchain, transpiler, or package manager; pure static HTML, CSS, and vanilla JavaScript.
- HTML markup stored directly in body and desc string fields of gallery event data files; rendered via innerHTML in app.js gallery viewer; authored only through the trusted local data_editor.html editor.

## Requirements

- MUST: All pages and features must operate as static files with no server-side code.
- MUST: events.js must define window.GALLERY_EVENT_INDEX array with entries containing slug, title, and data fields.
- MUST NOT: No server-side dependencies or build tools may be introduced.
- OPTIONAL: Gallery events may include text block items (type: text) with title and body fields in addition to image and video items.
- OPTIONAL: Comments utility app may be used to upload, preview, and download event data JS files.
- MUST: app.js MUST render body and desc fields of gallery items via innerHTML to support stored HTML rich text formatting.
- MUST: Each gallery event data file must define window.GALLERY_ITEMS array with media items containing name, preview, and desc fields; media may additionally contain an optional boolean visible field, and only visible: false hides media so legacy records remain visible.

## Solution

- Static site architecture: all pages are plain HTML files linked from root; no framework or router.
- China trip gallery (202507_china/) uses IIFE-scoped app.js that reads window.GALLERY_EVENT_INDEX and loads per-event window.GALLERY_ITEMS via dynamic script injection.
- app.js builds a dropdown nav (select element) populated from event registry and updates selection via hash routing on navigation.
- Gallery lightbox renders images using Google Drive thumbnail URLs and videos using Drive preview embed URLs.
- comments_app.js provides upload/parse/preview utility for event JS files; supports file upload, text edit, and download in-browser without a server.
- reporead/main.js fetches raw markdown files from GitHub repos listed in setup.js, builds a sidebar file tree, and renders markdown content in the main panel.
- apps/hhwords/index.html is a flashcard-style word learning app backed by a large words.json dataset.
- apps/PUK_English_Words.html is a simpler word quiz with an inline English/Bulgarian word list.
- cl.html renders markdown via the external marked.js library loaded from CDN.
- sidebar-toggle.js handles mobile responsive sidebar toggle for the gallery page.
- art/ directory holds static JPG art/drawing images displayed via art_drawing.html.
- data_editor.html is a standalone full-featured local editor for 202507_china/data/ event JS files; uses File System Access API for in-place read/write of event JS files and events.js; supports HTML rich text in desc/body fields via contentEditable toolbar, full item CRUD, move-up/down reorder, and events.js registry editing; runs fully offline in Chromium-based browsers.
- The public China gallery filters image and video records whose optional visible field is exactly false, leaves text blocks unaffected, and displays No items when successful filtering produces no displayable entries.
- data_editor.html retains item deletion and adds media visibility editing; it persists a user-authorized directory handle and last event for startup restoration, and refreshes only the selected event manually or every five seconds while visible with full-text comparison, dirty-state deferral, and last-valid-state error recovery.

## Issues
- events.js contains a duplicate entry for event-20250724-tudja; the gallery dropdown shows this event twice.
- events.js event-20250726_08-3gorges has an empty title field; the gallery dropdown shows a blank label for this event.
- comments_app.js tryParseItems(): broad regex for property-name quoting may misparse indented continuation lines in unusual JS formatting.
- comments_app.js tryParseItems(): _checked flag mapping index may misalign if jsonLines entries are filtered during parsing.
- comments_app.js jsStringEscape(): does not handle Unicode surrogate pairs, null bytes, or non-breaking spaces that may appear in text copied from external sources.
- app.js makeImageCard(): onerror fallback silently swallows the error when extractId() returns null for an already-invalid preview URL.
- comments_app.js render(): direct textarea edits may trigger autoLoadItems() on intermediate invalid parse states, clearing the rendered grid unexpectedly.
- Editor session restoration remains origin- and browser-permission-dependent; revoked or unavailable directory access requires the user to reopen the data folder.
- Selected-file polling correctness depends on retaining the non-overlapping read guard around manual, interval, and visibility-resume refreshes.
- Dirty external-change deferral depends on explicit pending-change state and a post-save disk retry to avoid silently replacing local edits.

## File Structure

index.html - personal homepage with profile summary, interests, and contacts
cv.html - curriculum vitae page
apps.html - listing page linking to mini web apps
art_drawing.html - art/drawing gallery page
cl.html - checklists page; renders markdown via external marked.js CDN
links_backup.html - backup links listing page
html_template.html - reusable blank HTML page template
CNAME - GitHub Pages custom domain (hmhristov.com)
notes.md - scratch notes file
css/
  main.css - shared site-wide stylesheet for root-level pages
images/ - 2 profile photo files
art/ - 13 art/drawing image files matching 20XXXX_*.JPG
202507_china/
  index.html - gallery app entry point
  app.js - multi-event gallery controller; reads GALLERY_EVENT_INDEX, loads GALLERY_ITEMS, renders grid and lightbox
  comments_app.js - utility for uploading, previewing, and downloading event data JS files
  comments_index.html - entry point for comments/preview utility
  sidebar-toggle.js - mobile sidebar toggle behavior
  style.css - primary gallery styles
  _style.css - alternate gallery styles
  comments_styles.css - styles for comments utility
  data_editor.html — standalone full-featured local editor for data/*.js event JS files and events.js; requires Chromium-based browser for File System Access API
  data/ - Contains 47 files: events.js (event registry for GALLERY_EVENT_INDEX), event-20250724-template.js (empty template), and 45 event data files matching event-YYYYMMDD[-_]*.js (one per event)
apps/
  PUK_English_Words.html - simple English/Bulgarian word quiz game with inline word list
  hhwords/
    index.html - flashcard-style English/Bulgarian word learning app
    words.json - word dataset (~180KB) backing hhwords app
links/
  links_md_reader.js - markdown reader/renderer used by links pages
reporead/
  index.html - markdown reader app entry point
  main.js - fetches raw markdown from GitHub repos, builds sidebar file tree, renders content
  setup.js - configures list of GitHub repos for reporead app
  style.css - reporead-specific styles
