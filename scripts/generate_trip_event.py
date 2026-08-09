"""
generate_trip_event.py: Generate one static trip event file from a public Google Drive folder.
Part of the shared multi-trip publishing workflow; discovery uses no credentials and writes atomically.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Callable, Iterable, Sequence, TextIO
import urllib.error
import urllib.parse
import urllib.request


EMBEDDED_FOLDER_URL = "https://drive.google.com/embeddedfolderview"
FILE_PREVIEW_URL = "https://drive.google.com/file/d/{file_id}/preview"
FILE_VALIDATION_URL = "https://drive.google.com/thumbnail"
DEFAULT_TIMEOUT_SECONDS = 30.0
VALIDATION_READ_BYTES = 512 * 1024
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 TripEventGenerator/1.0"
)
DRIVE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{10,}$")
NATURAL_PART_PATTERN = re.compile(r"(\d+)")
FILE_LINK_PATTERN = re.compile(r"^/file/d/([A-Za-z0-9_-]{10,})(?:/|$)")
FOLDER_LINK_PATTERN = re.compile(r"^/drive/folders/([A-Za-z0-9_-]{10,})(?:/|$)")
DOC_LINK_PATTERN = re.compile(r"^/[^/]+/d/([A-Za-z0-9_-]{10,})(?:/|$)")
SUPPORTED_IMAGE_EXTENSIONS = frozenset(
    {
        ".avif",
        ".bmp",
        ".gif",
        ".heic",
        ".heif",
        ".jpeg",
        ".jpg",
        ".png",
        ".tif",
        ".tiff",
        ".webp",
    }
)
SUPPORTED_VIDEO_EXTENSIONS = frozenset(
    {".3gp", ".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".webm"}
)
ACCESS_FAILURE_MARKERS = (
    "you need access",
    "request access",
    "access denied",
    "the file you have requested does not exist",
    "sorry, the file you have requested does not exist",
)


class GeneratorError(RuntimeError):
    """Represent an actionable discovery, validation, or output failure."""


class FolderParseError(GeneratorError):
    """Represent an unexpected or incomplete public Drive folder response."""


@dataclass(frozen=True)
class DriveItem:
    """Represent one direct child discovered in the public folder listing."""

    file_id: str
    name: str
    kind: str
    resource_key: str = ""


class EmbeddedFolderParser(HTMLParser):
    """Collect the document title and complete anchor records from Drive folder HTML."""

    def __init__(self) -> None:
        """Initialize parser-owned title and anchor collection state."""
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.anchors: list[tuple[dict[str, str], str]] = []
        self._in_title = False
        self._anchor_attributes: dict[str, str] | None = None
        self._anchor_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Capture title and anchor starts while preserving all anchor attributes."""
        if tag.casefold() == "title":
            self._in_title = True
            return
        if tag.casefold() == "a":
            self._anchor_attributes = {key.casefold(): value or "" for key, value in attrs}
            self._anchor_text = []

    def handle_endtag(self, tag: str) -> None:
        """Finalize title or anchor content when its closing tag is encountered."""
        if tag.casefold() == "title":
            self._in_title = False
            return
        if tag.casefold() == "a" and self._anchor_attributes is not None:
            label = "".join(self._anchor_text).strip()
            self.anchors.append((self._anchor_attributes, label))
            self._anchor_attributes = None
            self._anchor_text = []

    def handle_data(self, data: str) -> None:
        """Collect visible title and anchor text without interpreting other page content."""
        if self._in_title:
            self.title_parts.append(data)
        if self._anchor_attributes is not None:
            self._anchor_text.append(data)


def extract_folder_id(folder_input: str) -> str:
    """
    Extract a Google Drive folder identifier from a raw ID or public folder URL.

    Args:
        folder_input: Caller-supplied folder ID or Google Drive folder URL.

    Returns:
        The validated Drive folder identifier.

    Raises:
        GeneratorError: If the input is empty, unsupported, or lacks a valid folder ID.
    """
    candidate = folder_input.strip()
    if DRIVE_ID_PATTERN.fullmatch(candidate):
        return candidate

    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
        "drive.google.com",
        "www.drive.google.com",
    }:
        raise GeneratorError("Folder input must be a Google Drive folder URL or folder ID.")

    folder_match = FOLDER_LINK_PATTERN.match(parsed.path)
    query = urllib.parse.parse_qs(parsed.query)
    folder_id = folder_match.group(1) if folder_match else (query.get("id") or [""])[0]
    if not DRIVE_ID_PATTERN.fullmatch(folder_id):
        raise GeneratorError("The Google Drive folder URL does not contain a valid folder ID.")
    return folder_id


def extract_resource_key(folder_input: str) -> str:
    """
    Extract an optional resource key from a Google Drive folder URL.

    Args:
        folder_input: Caller-supplied folder ID or Google Drive folder URL.

    Returns:
        The resource key query value, or an empty string when none is present.
    """
    parsed = urllib.parse.urlparse(folder_input.strip())
    if not parsed.scheme:
        return ""
    query = urllib.parse.parse_qs(parsed.query)
    return (query.get("resourcekey") or query.get("resourceKey") or [""])[0]


def natural_sort_key(value: str) -> tuple[tuple[int, object], ...]:
    """
    Build a case-insensitive natural filename sort key.

    Args:
        value: Filename whose digit runs should sort numerically.

    Returns:
        Comparable typed parts that place text and integer runs deterministically.
    """
    parts = NATURAL_PART_PATTERN.split(value.casefold())
    return tuple((1, int(part)) if part.isdigit() else (0, part) for part in parts)


def media_kind(filename: str) -> str | None:
    """
    Classify a supported media filename by its final extension.

    Args:
        filename: Drive filename exposed by the public folder listing.

    Returns:
        ``image`` or ``video`` for supported files; otherwise ``None``.
    """
    suffix = Path(filename).suffix.casefold()
    if suffix in SUPPORTED_IMAGE_EXTENSIONS:
        return "image"
    if suffix in SUPPORTED_VIDEO_EXTENSIONS:
        return "video"
    return None


def _resource_key_from_query(query: str) -> str:
    """Return a case-tolerant resource key from a Drive link query string."""
    values = urllib.parse.parse_qs(query)
    return (values.get("resourcekey") or values.get("resourceKey") or [""])[0]


def _parse_drive_anchor(attributes: dict[str, str], label: str) -> DriveItem | None:
    """Convert one relevant Drive anchor into a typed direct-child record."""
    href = html.unescape(attributes.get("href", "")).strip()
    if not href:
        return None
    parsed = urllib.parse.urlparse(href)
    hostname = (parsed.hostname or "").casefold()
    descriptor = " ".join([label, href, *attributes.values()]).casefold()
    resource_key = _resource_key_from_query(parsed.query)

    if "shortcut" in descriptor:
        item_match = FILE_LINK_PATTERN.match(parsed.path)
        if item_match:
            return DriveItem(item_match.group(1), label.strip(), "shortcut", resource_key)

    if hostname in {"drive.google.com", "www.drive.google.com"}:
        folder_match = FOLDER_LINK_PATTERN.match(parsed.path)
        if folder_match:
            return DriveItem(folder_match.group(1), label.strip(), "folder", resource_key)
        file_match = FILE_LINK_PATTERN.match(parsed.path)
        if file_match:
            return DriveItem(file_match.group(1), label.strip(), "file", resource_key)

    if hostname == "docs.google.com":
        document_match = DOC_LINK_PATTERN.match(parsed.path)
        if document_match:
            return DriveItem(document_match.group(1), label.strip(), "google-native", resource_key)
    return None


def parse_embedded_folder_view(response_text: str) -> list[DriveItem]:
    """
    Parse direct children from Google Drive's public embedded-folder HTML.

    Args:
        response_text: Complete unauthenticated embeddedfolderview response body.

    Returns:
        Deduplicated direct children in their response order.

    Raises:
        FolderParseError: If the page is inaccessible, malformed, or structurally ambiguous.
    """
    normalized_text = response_text.casefold()
    if not response_text.strip() or "<html" not in normalized_text:
        raise FolderParseError("Google Drive returned an empty or non-HTML folder response.")
    for marker in ACCESS_FAILURE_MARKERS:
        if marker in normalized_text:
            raise FolderParseError("The public Google Drive folder is unavailable or requires access.")

    parser = EmbeddedFolderParser()
    try:
        parser.feed(response_text)
        parser.close()
    except Exception as error:
        raise FolderParseError(f"Google Drive folder HTML could not be parsed: {error}") from error

    title = "".join(parser.title_parts).strip()
    if not title:
        raise FolderParseError(
            "Google Drive folder HTML has no title; the public response structure may have changed."
        )

    items: list[DriveItem] = []
    item_by_identity: dict[tuple[str, str], DriveItem] = {}
    for attributes, label in parser.anchors:
        item = _parse_drive_anchor(attributes, label)
        if item is None:
            continue
        if not item.name:
            raise FolderParseError(
                f"Google Drive exposed item {item.file_id} without a filename; refusing incomplete output."
            )
        identity = (item.file_id, item.kind)
        previous = item_by_identity.get(identity)
        if previous and previous != item:
            raise FolderParseError(
                f"Google Drive exposed conflicting records for item {item.file_id}; response may be incomplete."
            )
        if previous is None:
            item_by_identity[identity] = item
            items.append(item)
    return items


def build_preview_url(item: DriveItem) -> str:
    """
    Build the event preview URL for one discovered media item.

    Args:
        item: Public Drive media record with optional resource key.

    Returns:
        A Drive preview URL retaining the resource key when exposed.
    """
    parameters = [("authuser", "0")]
    if item.resource_key:
        parameters.append(("resourcekey", item.resource_key))
    query = urllib.parse.urlencode(parameters)
    return f"{FILE_PREVIEW_URL.format(file_id=urllib.parse.quote(item.file_id))}?{query}"


def build_validation_url(item: DriveItem) -> str:
    """
    Build a small unauthenticated thumbnail probe for public-access validation.

    Args:
        item: Public Drive media record with optional resource key.

    Returns:
        Drive thumbnail URL expected to return image bytes only for accessible media.
    """
    parameters = [("id", item.file_id), ("sz", "w32")]
    if item.resource_key:
        parameters.append(("resourcekey", item.resource_key))
    return f"{FILE_VALIDATION_URL}?{urllib.parse.urlencode(parameters)}"


def _open_text_url(
    opener: urllib.request.OpenerDirector,
    url: str,
    timeout: float,
    read_limit: int | None = None,
) -> tuple[str, str, str]:
    """Fetch a URL without cookies and return its final URL, decoded body, and content type."""
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"},
        method="GET",
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            status = getattr(response, "status", response.getcode())
            if status < 200 or status >= 300:
                raise GeneratorError(f"Google Drive returned HTTP {status} for {url}.")
            payload = response.read(read_limit) if read_limit is not None else response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            content_type = response.headers.get_content_type()
            return response.geturl(), payload.decode(charset, errors="replace"), content_type
    except urllib.error.HTTPError as error:
        raise GeneratorError(f"Google Drive returned HTTP {error.code} for {url}.") from error
    except urllib.error.URLError as error:
        raise GeneratorError(f"Could not reach Google Drive for {url}: {error.reason}") from error


def discover_folder_items(
    folder_input: str,
    opener: urllib.request.OpenerDirector,
    timeout: float,
) -> list[DriveItem]:
    """
    Fetch and parse every direct child exposed by the public embedded folder view.

    Args:
        folder_input: Public Drive folder URL or ID.
        opener: Cookie-free URL opener used for the unauthenticated request.
        timeout: Network timeout in seconds.

    Returns:
        Direct folder children with nested contents left unvisited.

    Raises:
        GeneratorError: If discovery fails or the undocumented response cannot be interpreted.
    """
    folder_id = extract_folder_id(folder_input)
    parameters = [("id", folder_id)]
    resource_key = extract_resource_key(folder_input)
    if resource_key:
        parameters.append(("resourcekey", resource_key))
    url = f"{EMBEDDED_FOLDER_URL}?{urllib.parse.urlencode(parameters)}"
    _, response_text, _ = _open_text_url(opener, url, timeout)
    return parse_embedded_folder_view(response_text)


def select_media_items(items: Iterable[DriveItem], report_stream: TextIO) -> list[DriveItem]:
    """
    Select supported direct-child media and report every skipped item.

    Args:
        items: Direct children parsed from the public folder response.
        report_stream: Destination for explicit skip diagnostics.

    Returns:
        Supported files in natural filename order.
    """
    selected: list[DriveItem] = []
    kind_labels = {
        "folder": "nested folder",
        "shortcut": "shortcut",
        "google-native": "Google-native document",
    }
    for item in items:
        if item.kind != "file":
            reason = kind_labels.get(item.kind, item.kind)
            print(f"Skipped {reason}: {item.name} ({item.file_id})", file=report_stream)
            continue
        if media_kind(item.name) is None:
            print(f"Skipped unsupported file: {item.name} ({item.file_id})", file=report_stream)
            continue
        selected.append(item)
    return sorted(selected, key=lambda item: natural_sort_key(item.name))


def validate_public_media(
    item: DriveItem,
    opener: urllib.request.OpenerDirector,
    timeout: float,
) -> None:
    """
    Verify one selected file is reachable through its unauthenticated preview URL.

    Args:
        item: Selected Drive media record.
        opener: Cookie-free URL opener used for validation.
        timeout: Network timeout in seconds.

    Raises:
        GeneratorError: If the preview is inaccessible or resolves to an access-control page.
    """
    validation_url = build_validation_url(item)
    final_url, response_text, content_type = _open_text_url(
        opener,
        validation_url,
        timeout,
        read_limit=VALIDATION_READ_BYTES,
    )
    if content_type.startswith("image/"):
        return
    if (urllib.parse.urlparse(final_url).hostname or "").casefold() == "accounts.google.com":
        raise GeneratorError("preview redirected to Google sign-in")
    normalized_text = response_text.casefold()
    for marker in ACCESS_FAILURE_MARKERS:
        if marker in normalized_text:
            raise GeneratorError(f"preview response contains access failure marker: {marker}")
    if "application/vnd.google-apps.shortcut" in normalized_text:
        raise GeneratorError("item is a Google Drive shortcut")
    if "application/vnd.google-apps." in normalized_text:
        raise GeneratorError("item is a Google-native document")
    raise GeneratorError(
        f"unauthenticated media probe returned {content_type or 'an unknown content type'}"
    )


def validate_selected_media(
    items: Sequence[DriveItem],
    opener: urllib.request.OpenerDirector,
    timeout: float,
) -> None:
    """
    Validate every selected item and aggregate filename-specific failures.

    Args:
        items: Supported direct-child media selected for output.
        opener: Cookie-free URL opener used for validation.
        timeout: Network timeout in seconds.

    Raises:
        GeneratorError: If any selected item cannot be verified as publicly accessible.
    """
    failures: list[str] = []
    for item in items:
        try:
            validate_public_media(item, opener, timeout)
        except GeneratorError as error:
            failures.append(f"{item.name} ({item.file_id}): {error}")
    if failures:
        details = "\n  - ".join(failures)
        raise GeneratorError(f"Public-access validation failed:\n  - {details}")


def js_string_literal(value: str) -> str:
    """
    Serialize arbitrary text as a safe double-quoted JavaScript string literal.

    Args:
        value: Filename or URL to encode.

    Returns:
        JSON-compatible JavaScript literal with line-separator characters escaped.
    """
    literal = json.dumps(value, ensure_ascii=False)
    return literal.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def serialize_event(items: Sequence[DriveItem]) -> str:
    """
    Serialize selected media into the established window.GALLERY_ITEMS schema.

    Args:
        items: Validated media in desired event order.

    Returns:
        Complete JavaScript event file text ending with a newline.
    """
    lines = ["window.GALLERY_ITEMS = ["]
    for item in items:
        name = js_string_literal(item.name)
        preview = js_string_literal(build_preview_url(item))
        lines.append(
            f"  {{ name: {name}, preview: {preview}, desc: \"\", visible: true }},"
        )
    lines.append("];")
    return "\n".join(lines) + "\n"


def should_replace_output(
    output_path: Path,
    overwrite: bool,
    confirm: Callable[[str], str] = input,
    report_stream: TextIO = sys.stderr,
) -> bool:
    """
    Obtain explicit replacement consent when an output file already exists.

    Args:
        output_path: Destination event JavaScript file.
        overwrite: Whether the caller supplied the explicit overwrite option.
        confirm: Prompt callback used only for an interactive replacement decision.
        report_stream: Destination for the destructive replacement warning.

    Returns:
        True when writing may proceed; False when replacement was declined.
    """
    if not output_path.exists() or overwrite:
        return True
    print(
        "WARNING: Replacing this event file removes descriptions, text blocks, visibility "
        "settings, and custom ordering.",
        file=report_stream,
    )
    if not sys.stdin.isatty():
        print("Replacement requires an interactive confirmation or --overwrite.", file=report_stream)
        return False
    answer = confirm(f"Replace {output_path}? [y/N] ").strip().casefold()
    return answer in {"y", "yes"}


def write_event_atomically(output_path: Path, content: str) -> None:
    """
    Replace or create one event file atomically in its existing parent directory.

    Args:
        output_path: Caller-selected JavaScript destination.
        content: Fully generated event source.

    Raises:
        GeneratorError: If the path is unsafe, its parent is absent, or writing fails.
    """
    if output_path.name.casefold() == "events.js":
        raise GeneratorError("Refusing to write events.js; register event files through the data editor.")
    if output_path.suffix.casefold() != ".js":
        raise GeneratorError("Output path must end in .js.")
    parent = output_path.parent
    if not parent.is_dir():
        raise GeneratorError(f"Output directory does not exist: {parent}")

    temporary_name = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            prefix=f".{output_path.name}.",
            suffix=".tmp",
            dir=parent,
            delete=False,
        ) as temporary_file:
            temporary_name = temporary_file.name
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_name, output_path)
    except OSError as error:
        if temporary_name:
            try:
                Path(temporary_name).unlink(missing_ok=True)
            except OSError:
                pass  # The original error remains the actionable failure for the caller.
        raise GeneratorError(f"Could not write {output_path}: {error}") from error


def build_argument_parser() -> argparse.ArgumentParser:
    """
    Build the command-line interface and its workflow documentation.

    Returns:
        Configured argument parser for one-folder, one-event generation.
    """
    parser = argparse.ArgumentParser(
        description=(
            "Generate one window.GALLERY_ITEMS event file from every supported direct-child "
            "image and video in a public Google Drive folder."
        ),
        epilog=(
            "Examples:\n"
            "  python scripts/generate_trip_event.py FOLDER_ID -o my-trip/data/event-day-1.js\n"
            "  python scripts/generate_trip_event.py 'https://drive.google.com/drive/folders/FOLDER_ID' "
            "-o my-trip/data/event-day-1.js --overwrite\n\n"
            "Limitations: Google has no supported credential-free files.list endpoint. This tool "
            "parses the undocumented public embedded-folder page, validates each selected preview "
            "without credentials, and fails rather than producing partial output when that response "
            "changes. Update the isolated parse_embedded_folder_view() parser if Google changes it. "
            "Nested folders, shortcuts, Google-native documents, and unsupported extensions are skipped."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("folder", help="Public Google Drive folder URL or folder ID (no credentials).")
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        type=Path,
        help="Local event .js path to create; events.js is never modified.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace an existing event file without an interactive confirmation.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        metavar="SECONDS",
        help=f"Per-request timeout (default: {DEFAULT_TIMEOUT_SECONDS:g} seconds).",
    )
    return parser


def run_generation(args: argparse.Namespace, report_stream: TextIO = sys.stderr) -> bool:
    """
    Execute discovery, filtering, validation, consent, and atomic event writing.

    Args:
        args: Parsed CLI namespace containing folder, output, overwrite, and timeout.
        report_stream: Destination for progress, skip, and warning diagnostics.

    Returns:
        True when a file was written; False when replacement was explicitly declined.

    Raises:
        GeneratorError: If discovery, validation, or output preparation fails.
    """
    if args.timeout <= 0:
        raise GeneratorError("--timeout must be greater than zero.")
    output_path = args.output.expanduser()
    if output_path.name.casefold() == "events.js":
        raise GeneratorError("Refusing to write events.js; register event files through the data editor.")
    if output_path.suffix.casefold() != ".js":
        raise GeneratorError("Output path must end in .js.")

    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    print("Inspecting public Google Drive folder without credentials…", file=report_stream)
    discovered = discover_folder_items(args.folder, opener, args.timeout)
    selected = select_media_items(discovered, report_stream)
    if not selected:
        raise GeneratorError("The folder contains no supported direct-child image or video files.")
    print(f"Validating {len(selected)} selected media file(s)…", file=report_stream)
    validate_selected_media(selected, opener, args.timeout)
    content = serialize_event(selected)

    if not should_replace_output(output_path, args.overwrite, report_stream=report_stream):
        print(f"Output left unchanged: {output_path}", file=report_stream)
        return False
    write_event_atomically(output_path, content)
    print(f"Wrote {len(selected)} media record(s) to {output_path}", file=report_stream)
    return True


def main(argv: Sequence[str] | None = None) -> int:
    """
    Run the command-line generator and translate actionable failures into a non-zero exit.

    Args:
        argv: Optional argument sequence; defaults to process arguments.

    Returns:
        Process status code: zero for success or declined replacement, two for failure.
    """
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    try:
        run_generation(args)
    except GeneratorError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
