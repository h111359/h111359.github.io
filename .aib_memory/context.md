# Product Context

## Product

- Personal public website for Hristo M. Hristov, data and analytics professional.
- Hosted as a GitHub Pages site with custom domain hmhristov.com (CNAME record).
- No commercial scope; purely personal/portfolio use.
- Primary audience for the four-page career presentation is professional visitors; the owner and general public remain audiences for the broader personal site.
- Primary career-site pages are Home (index.html), Professional (cv.html), Projects (apps.html), and Creative (art_drawing.html); the China gallery, checklist, Markdown reader, and other utilities remain deployed as auxiliary features outside this primary navigation.

## Concepts

- GitHub Pages static hosting with custom domain configured via CNAME file.
- Multi-event photo/video gallery backed by Google Drive media; each event is a JS data file defining GALLERY_ITEMS.
- Hash-based routing in gallery app using URLSearchParams on location.hash for bookmarkable event navigation.
- Gallery media items referenced by Google Drive file preview URLs; thumbnails and view URLs derived from extracted file IDs.
- English/Bulgarian word learning game mechanic: displays a word, user selects correct translation from multiple options.
- Markdown reader app fetches raw files from configured GitHub repos and renders them in-browser.
- No build toolchain, transpiler, or package manager; pure static HTML, CSS, and vanilla JavaScript.
- css/main.css remains shared by root-level pages, while the modern four-page design system is scoped to body.site-page so excluded legacy consumers retain their prior presentation.
- The four primary pages contain complete semantic navigation in source HTML; js/site.js enhances those nodes in place for active-location and reveal behavior, and essential content remains independent of JavaScript.
- Event registry pattern: each trip defines GALLERY_EVENT_INDEX in data/events.js; trips/shared/gallery.js dynamically loads per-event GALLERY_ITEMS data files.
- HTML markup is stored in body and desc string fields of gallery event data, rendered via innerHTML in trips/shared/gallery.js, and authored through trusted local trips/data_editor.html editing.
- A trip is a static journal under trips/{slug}/ with index.html, trip-config.js and data/; a part is one event data file and its registry entry. Empty, single-part and multiple-part trips are supported.

## Requirements

- MUST: events.js must define window.GALLERY_EVENT_INDEX array with entries containing slug, title, and data fields.
- OPTIONAL: Gallery events may include text block items (type: text) with title and body fields in addition to image and video items.
- OPTIONAL: Comments utility app may be used to upload, preview, and download event data JS files.
- MUST: Each gallery event data file must define window.GALLERY_ITEMS array with media items containing name, preview, and desc fields; media may additionally contain an optional boolean visible field, and only visible: false hides media so legacy records remain visible.
- MUST: The four primary pages must expose visible Home, Professional, Projects, and Creative navigation mapped to index.html, cv.html, apps.html, and art_drawing.html, with a source-level current-page indication and functional no-JavaScript fallback.
- MUST: The four primary pages must reflow at 320 CSS pixels, provide visible keyboard focus and practical target sizes, preserve content under reduced motion or script failure, and use natural-ratio images with intrinsic dimensions.
- MUST: Each primary page must include unique source-level title, description, canonical URL, Open Graph metadata, and accurate page-specific social-preview image metadata.
- MUST: Professional copy must use only facts published in the repository, preserve the developer-selected legacy status wording without stronger currency claims, and keep LinkedIn primary, email secondary, and GitHub tertiary.
- MUST NOT: Original portrait and artwork files must not be modified or replaced when optimized derivatives are created.
- MUST: All published pages and features must operate as static files without a production server.
- MUST NOT: No server-side dependencies or build tools may be introduced for the published site.
- MUST: The local trip authoring helper must use Python 3.10+ standard library only, listen on loopback and constrain file operations to validated repository and trip paths.
- MUST: trips/shared/gallery.js MUST render body and desc fields of gallery items via innerHTML to support trusted authored HTML rich text formatting.

## Solution

- Static site architecture: all pages are plain HTML files linked from root; no framework or router.
- Gallery lightbox renders images using Google Drive thumbnail URLs and videos using Drive preview embed URLs.
- comments_app.js provides upload/parse/preview utility for event JS files; supports file upload, text edit, and download in-browser without a server.
- reporead/main.js fetches raw markdown files from GitHub repos listed in setup.js, builds a sidebar file tree, and renders markdown content in the main panel.
- apps/hhwords/index.html is a flashcard-style word learning app backed by a large words.json dataset.
- apps/PUK_English_Words.html is a simpler word quiz with an inline English/Bulgarian word list.
- cl.html renders markdown via the external marked.js library loaded from CDN.
- sidebar-toggle.js handles mobile responsive sidebar toggle for the gallery page.
- art/ directory holds static JPG art/drawing images displayed via art_drawing.html.
- The four-page career site uses a scoped cream, charcoal, deep-rust, and muted-sage editorial component system with responsive, focus, reduced-motion, natural-image, and print treatments.
- The Professional page is a one-page executive profile; the Projects page contains exactly the two vocabulary tools; and the Creative page contains all 13 works in a natural-ratio captioned grid grouped as ten oils and three watercolors.
- js/site.js provides dependency-free in-place navigation and subtle opacity-and-short-rise reveal enhancement without generating essential markup.
- Four optimized 1200 by 630 page-specific sharing images live under images/social and are derived without modifying the original portrait or artwork.
- atistat/ai-critique.html is a standalone static audit-report page presenting the ATISTAT site quality evaluation in Bulgarian for the site owner, using the theme CSS and header/footer from atistat/index.html; accessible by direct URL only (no nav link); excluded from search indexing via noindex meta.
- Trip galleries under trips/{slug}/, including trips/china/, use shared trips/shared/gallery.js and gallery.css with per-trip GALLERY_TRIP_CONFIG, GALLERY_EVENT_INDEX and GALLERY_ITEMS data.
- trips/shared/gallery.js builds date-grouped searchable event navigation and uses bookmarkable event hash routing.
- trips/data_editor.html supports Python loopback helper storage and Chromium File System Access fallback, retaining item CRUD, rich text, visibility, corrections, ordering and AI controls; parent config and Drive generation controls require helper mode.
- trips/shared/gallery.js filters image and video records whose optional visible field is exactly false, leaves text blocks unaffected, and displays the configured empty state when successful filtering produces no displayable entries.
- trips/data_editor.html retains event item deletion and guarded selected-file refresh while tracking separate event, registry and config drafts; helper trip identity and manual directory-handle restoration preserve last-valid state and reject stale asynchronous results.
- Repository-local trips/start-editor.sh and trips/start-editor.bat launch trips/scripts/trip_editor_server.py and open the browser editor; trips/scripts/trip_storage.py validates and coordinates authoring writes and trips/scripts/drive_generation.py reuses scripts/generate_trip_event.py.
- Trip creation copies the aligned template exclusively under trips/{ASCII-slug}/, uses documented Bulgarian-to-Latin transliteration, defaults to Bulgarian/bg-BG and offers complete English presets while preserving custom theme and label overrides.
- Trip settings preserve supported and unknown JSON-compatible literal fields without evaluating JavaScript; executable config syntax blocks saving. Saved part slugs and filenames remain stable, and registry mutations require all legacy registry errors repaired.
- Drive generation reviews direct public media and requires consent before coordinated event and registry writes; replacement warns of lost authored content, visibility, corrections and ordering. Part deletion confirms removal of both registration and data, and preview offers confirmed saving of all affected valid drafts before opening the selected event hash.
- Coordinated authoring operations retain originals and roll back caught runtime write failures. Abrupt termination may require manual recovery; failed restoration preserves recovery data and blocks further writes without a restart journal.

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
- Published current-role, Present-date, skill-level, and certification wording is intentionally preserved and may become stale without periodic owner review.
- The vocabulary applications retain out-of-scope inline styling, inline event assignment, debug logging, and innerHTML fallbacks identified during the main-page redesign.
- aib-analyze.md duplicates question variables, declares an impossible three-subsection Proposed Solution count while naming two, skips S05.7, and conflicts with itself about input-reset timing.
- AIB conventions conflict over a prohibited plan Decisions section and over neutral Decision Register choices versus recommended Q-block choices; the requirements gate priority item also fits already-authorized requests poorly.
- atistat/index.html and atistat/index-en.html header and footer SVG elements share duplicate IDs (svg1, defs1, g1, layer2, layer3, namedview1, text1, text2); violates HTML uniqueness requirements and can cause assistive-technology ambiguity.
- atistat/wp-content/themes/atistat/assets/css/main.css hides .at-fade elements by default; atistat/wp-content/themes/atistat/assets/js/main.js must execute successfully to reveal them; content remains invisible if the script is blocked or throws before reveal initialization.
- atistat/index.html: hero LCP image uses loading=lazy causing a measured 3.86 s mobile LCP; should use loading=eager with fetchpriority=high.
- atistat/index.html: empty link rel=preconnect href= on line 6 provides no benefit and should be removed or replaced with a valid origin.
- Trip workflow analysis: trips/shared/gallery.js mixes Bulgarian and English default labels and includes the typo “Журал”; avoid altering shared presentation by writing complete new-trip label presets.
- Trip workflow analysis: trips/shared/gallery.js presents the empty registry as an error/unavailable trip. New empty-trip configs can provide neutral wording, but changing shared empty-state styling exceeds the stated gallery exception.
- Trip workflow analysis: trips/2026/trip-config.js uses English language/locale with Bulgarian identity copy. This existing inconsistency is excluded from edits.
- Trip workflow analysis: trips/data_editor.html evaluates trusted source with new Function; shadowing window is not a security sandbox. The helper must never evaluate arbitrary JavaScript in Python or treat browser parsing as server-side path validation.
- Trip workflow analysis: scripts/generate_trip_event.py depends on undocumented Drive HTML and validates access through a thumbnail probe; success cannot guarantee later full-resolution/video availability.
- Trip workflow analysis: scripts/generate_trip_event.py has preview-oriented validation docstrings despite thumbnail probing, and its replacement warning omits media corrections that the new UI must explicitly mention.
- Trip workflow analysis: scripts/generate_trip_event.py supports more video extensions than the shared viewer classifies as video; preserve existing schemas and record this pre-existing mismatch without broadening gallery changes.
- Trip workflow analysis: .aib_brain/prompts/aib-analyze.md duplicates variables, skips S05.7, names two subsections while demanding three, conflicts on reset timing and plan Decisions headings, and asks for archival input use despite prohibiting archive reads. Use the named two-subsection schema, numbered reset-before-questions sequence and retained original input; record the contradictions rather than modify tooling.
- Trip workflow analysis: .aib_brain/conventions/analysis-convention.md repeats the impossible three-subsection count and requires neutral decision presentation, whereas q-block-convention.md requires one recommendation. Keep alternatives neutral in the Decision Register and mark one recommendation only in Q-blocks.
- Trip workflow analysis: .aib_brain/conventions/plan-convention.md simultaneously requires exact commands and prohibits implementation snippets. Future plan generation must use its four-section schema and the explicitly permitted literal context-edit commands.
- Trip workflow analysis: .aib_brain/tools/verify-input.py and verify-context.py persist verification results, conflicting with the prompt's unchanged-workspace requirement on failure; both passed this run.
- Trip workflow analysis: .aib_brain/tools/finalize-input.py describes an atomic archive/move/reset sequence but implements sequential filesystem operations without rollback; failure during the sequence can leave partial lifecycle changes.
- Trip workflow analysis: Runtime-only rollback cannot guarantee recovery after abrupt termination or after a failed restoration; retained originals and actionable recovery errors are required, without claiming crash atomicity.
- Linux Files uses Run as a Program for the executable shell launcher; interactive startup, Windows launcher/Edge, real Chromium folder permissions and live public Drive generation remain unverified; Chrome/Firefox fixture tests pass.

## File Structure

index.html - editorial Home page with first-person leadership proposition, portrait, contact hierarchy, and three career-pillar previews
cv.html - one-page third-person Professional executive profile for screen and print
apps.html - two-card Projects page linking directly to the supported vocabulary tools
art_drawing.html - Creative gallery containing all 13 works as ten oils and three watercolors
cl.html - checklists page; renders markdown via external marked.js CDN
links_backup.html - backup links listing page
html_template.html - reusable blank HTML page template
CNAME - GitHub Pages custom domain (hmhristov.com)
notes.md - scratch notes file
css/
  main.css - legacy-compatible shared stylesheet with four-page presentation rules scoped to body.site-page
js/
  site.js - dependency-free in-place navigation-state and reveal enhancement script
images/ - 2 original profile photos plus 4 page-specific 1200 by 630 sharing derivatives under images/social/
art/ - 13 art/drawing image files matching 20XXXX_*.JPG
trips/
  data_editor.html - shared local editor with loopback helper and Chromium manual-folder modes
  start-editor.sh - executable Linux shell launcher
  start-editor.bat - Windows Python launcher
  scripts/
    trip_editor_server.py - constrained loopback API and static preview server
    trip_storage.py - literal parser, portable paths, version checks and runtime transactions
    drive_generation.py - reviewed reuse of existing public Drive generator
  shared/
    gallery.js - shared date-grouped navigation, event loading, rich text and corrected media
    gallery.css - responsive static gallery presentation
  template/ - Bulgarian shell/config, complete localized labels and empty data registry for new trips
  china/ - existing China index.html, trip-config.js and data/ event files; auxiliary comments tools retained
  2026/ - existing 2026 index.html, trip-config.js and data/ event files
scripts/
  generate_trip_event.py - unchanged standalone public Drive event generator
tests/
  test_generate_trip_event.py - existing network-free generator tests
  test_trip_editor.py - disposable helper, transaction, literal, path and HTTP regression tests
  trip_editor_browser.html - in-memory editor and gallery browser regression harness

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
