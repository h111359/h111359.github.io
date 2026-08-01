---
state:
  request_id: ~
  title: ~
  status: idle
  input_verification_result: null
  context_verification_result: null
options:
  minimum_questions: 8
  input_verification_enabled: true
  context_verification_enabled: true
---

## Input

The tool `china/data_editor.html` has a bug. When the text entered contains multiple rows (there is new line symbols), they are recorded in JS as they are - with the new lines symbols and ruins the .js file sintax and the site crashes. Make so the new lines are handled properly and .js remains a valid JSON file

### Goal

Fix the serialization defect in `china/data_editor.html` so multiline text cannot create raw line terminators inside quoted JavaScript strings, invalidate gallery event files, or crash the China gallery.

The gallery owner must be able to enter or paste multiline content, save it, reopen it in the editor, and view it correctly in the gallery.

### Scope

- Update serialization in `china/data_editor.html`.
- Convert literal LF and CRLF line breaks in rich-text `body` and `desc` fields into HTML `<br>` elements.
- Convert every individual rich-text line break, preserving consecutive breaks as consecutive `<br>` elements.
- Preserve existing rich-text HTML, including existing `<br>`, block, list, and inline-formatting elements.
- Replace literal line breaks in plain-text and structural values with spaces. This includes titles, filenames, preview URLs, registry slugs, registry titles, and registry data paths.
- Ensure every serialized value remains safe inside a double-quoted JavaScript string.
- Inspect unmodified files under `china/data/` and repair any existing raw newline corruption found there.
- Do not modify `china/data/event-20250721_03-frenska-kontsesia.js` or `china/data/event-20250721_05-lui-vuiton.js`, because both contain existing uncommitted user edits.

### Out of Scope

- Changes to `china/app.js` or the gallery data schema.
- Replacement of the current JavaScript assignment format with JSON.
- Modification or normalization of the two event files with existing uncommitted changes.
- Changes to unrelated gallery behavior, content, ordering, visibility settings, or registry entries.
- Introduction of server-side code, build tools, packages, frameworks, or external dependencies.

### Constraints

- Preserve the static-site and vanilla-JavaScript architecture.
- Keep using the File System Access API and the existing in-place save workflow.
- Keep event files in the `window.GALLERY_ITEMS = [...];` JavaScript assignment format.
- Keep `events.js` in the `window.GALLERY_EVENT_INDEX = [...];` JavaScript assignment format.
- Preserve `body` and `desc` rendering through `innerHTML`.
- Preserve Unicode text, quotes, backslashes, existing HTML, item ordering, and media visibility values.
- Do not overwrite or revert unrelated working-tree changes.

### Assumptions

- Rich-text line breaks are intended as visible HTML breaks and should therefore be stored as `<br>`.
- Newlines in structural and plain-text fields are accidental and should become spaces.
- Existing block-level HTML already represents intentional layout and must not be rewritten.
- Excluded modified event files may require separate repair later if they contain corruption.

### Success Criteria

- Saving rich-text content containing LF line endings produces a valid event JavaScript file.
- Saving rich-text content containing CRLF line endings produces a valid event JavaScript file.
- Each literal rich-text line break becomes one `<br>` element.
- Consecutive line breaks remain consecutive `<br>` elements.
- Existing HTML remains unchanged and does not acquire unintended extra breaks.
- Line breaks in plain-text and structural fields become spaces rather than `<br>` elements.
- Quotes, backslashes, Unicode characters, and supported control characters remain correctly serialized.
- A saved event file can be reopened successfully by `china/data_editor.html`.
- A saved event file can be loaded and rendered successfully by the China gallery.
- Multiline formatting remains visible after the complete save, reload, and gallery-rendering workflow.
- Any corrupted unmodified event data files found under `china/data/` are repaired without altering unrelated content.
- The two event files with existing uncommitted edits remain byte-for-byte unchanged.