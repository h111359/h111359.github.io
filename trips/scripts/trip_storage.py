"""trip_storage.py: Validated persistence for the local trip editor.

Owns literal parsing, portable trip paths and serialized runtime transactions.
Published data remains ordinary JavaScript; this module never executes it.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
from typing import Any

MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_LITERAL_DEPTH = 64
RESERVED_TRIPS = {'template', 'shared', 'scripts'}
RESERVED_NAMES = {'con', 'prn', 'aux', 'nul', *(f'com{i}' for i in range(1, 10)),
                  *(f'lpt{i}' for i in range(1, 10))}
SLUG_PATTERN = re.compile(r'[a-z0-9]+(?:[-_][a-z0-9]+)*\Z')
# Bulgarian-to-Latin mapping; ь -> y, ъ -> a, щ -> sht, ю -> yu, я -> ya.
TRANSLITERATION = dict(zip('абвгдежзийклмнопрстуфхцчшщъьюя',
                          ('a','b','v','g','d','e','zh','z','i','y','k','l','m','n',
                           'o','p','r','s','t','u','f','h','ts','ch','sh','sht','a','y','yu','ya')))
TOKEN_PATTERN = re.compile(
    r'\s+|//[^\r\n]*|/\*[\s\S]*?\*/|'
    r'"(?:\\[\s\S]|[^"\\\r\n])*"|\'(?:\\[\s\S]|[^\'\\\r\n])*\'|'
    r'-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_$][\w$]*|[{}\[\]:,.;=]')
ASSIGNMENTS = {'trip-config.js': 'GALLERY_TRIP_CONFIG', 'data/events.js': 'GALLERY_EVENT_INDEX'}


BG_LABELS = {'skipLink': 'Към съдържанието',
 'openNavigator': 'Отвори избора на събитие',
 'events': 'Събития',
 'navigatorAria': 'Събития от пътуването',
 'routeKicker': 'Маршрут',
 'journalHeading': 'Дневник на пътуването',
 'closeNavigator': 'Затвори избора на събитие',
 'searchLabel': 'Търсене в събитията',
 'searchPlaceholder': 'Място или преживяване',
 'eventsByDate': 'Събития по дата',
 'loadingTrip': 'Зареждане на пътуването…',
 'lightboxTitle': 'Преглед на медия',
 'close': 'Затвори',
 'missingElementsLog': 'Липсват задължителни елементи на галерията:',
 'eventCountSingular': '{count} събитие',
 'eventCountPlural': '{count} събития',
 'eventFallbackPrefix': 'Събитие',
 'untitledEvent': 'Събитие без заглавие',
 'unknownDate': 'Без посочена дата',
 'noSearchResults': 'Няма събития, които отговарят на търсенето.',
 'filteredSummary': 'Показани {visible} от {total}',
 'staleLoad': 'Остаряло зареждане на събитие.',
 'missingEventData': 'Липсват данни за събитието {event}.',
 'eventLoadFailed': 'Неуспешно зареждане на {path}.',
 'imageNoun': 'снимка',
 'videoNoun': 'видео',
 'currentEventFallback': 'събитието',
 'openMedia': 'Отвори {media} {number}: {event}',
 'imageAlt': 'Снимка {number} — {event}',
 'videoAlt': 'Кадър от видео {number} — {event}',
 'imageUnavailable': 'Снимката не може да се зареди. Опитайте да я отворите.',
 'videoUnavailable': 'Кадърът не може да се зареди. Видеото може да се отвори.',
 'retry': 'Опитайте отново',
 'emptyEvent': 'За това събитие няма съдържание за показване.',
 'loadingContent': 'Зареждане на снимките и разказите…',
 'contentLoading': 'Съдържанието се зарежда.',
 'contentLoadFailed': 'Съдържанието не можа да се зареди.',
 'eventFailure': 'Възникна проблем при зареждането на това събитие. Проверете връзката и опитайте '
                 'отново.',
 'videoUrlErrorLog': 'Адресът за видеото не може да бъде обработен:',
 'mediaPreview': 'Преглед на {media}: {event}',
 'eventErrorLog': 'Събитието не можа да се зареди:',
 'tripUnavailable': 'Нов пътепис',
 'registryMissing': 'Все още няма добавени части.',
 'noTripEvents': 'Добавете първата част чрез редактора.',
 'noEvents': 'Няма събития'}
EN_LABELS = {'skipLink': 'Skip to content',
 'openNavigator': 'Open event navigator',
 'events': 'Events',
 'navigatorAria': 'Trip events',
 'routeKicker': 'Route',
 'journalHeading': 'Trip journal',
 'closeNavigator': 'Close event navigator',
 'searchLabel': 'Search events',
 'searchPlaceholder': 'Place or experience',
 'eventsByDate': 'Events by date',
 'loadingTrip': 'Loading the trip…',
 'lightboxTitle': 'Media preview',
 'close': 'Close',
 'missingElementsLog': 'Required gallery elements are missing:',
 'eventCountSingular': '{count} event',
 'eventCountPlural': '{count} events',
 'eventFallbackPrefix': 'Event',
 'untitledEvent': 'Untitled event',
 'unknownDate': 'Unknown date',
 'noSearchResults': 'No events match the search.',
 'filteredSummary': 'Showing {visible} of {total}',
 'staleLoad': 'The event load is no longer current.',
 'missingEventData': 'No data was defined for event {event}.',
 'eventLoadFailed': 'Failed to load {path}.',
 'imageNoun': 'image',
 'videoNoun': 'video',
 'currentEventFallback': 'the event',
 'openMedia': 'Open {media} {number}: {event}',
 'imageAlt': 'Image {number} — {event}',
 'videoAlt': 'Video frame {number} — {event}',
 'imageUnavailable': 'The image could not be loaded. Try opening it.',
 'videoUnavailable': 'The frame could not be loaded. The video can still be opened.',
 'retry': 'Try again',
 'emptyEvent': 'This event has no content to display.',
 'loadingContent': 'Loading photos and stories…',
 'contentLoading': 'Content is loading.',
 'contentLoadFailed': 'The content could not be loaded.',
 'eventFailure': 'There was a problem loading this event. Check the connection and try again.',
 'videoUrlErrorLog': 'The video URL could not be processed:',
 'mediaPreview': 'Preview of {media}: {event}',
 'eventErrorLog': 'The event could not be loaded:',
 'tripUnavailable': 'New trip journal',
 'registryMissing': 'No parts have been added yet.',
 'noTripEvents': 'Add the first part using the editor.',
 'noEvents': 'No events'}

class StorageError(ValueError):
    """An actionable validation/conflict error; no successful write is implied."""


def slugify(name: str) -> str:
    """Return a portable transliterated slug for name; callers validate empty results."""
    converted = ''.join(TRANSLITERATION.get(char, char) for char in name.lower())
    return re.sub(r'[^a-z0-9]+', '-', converted).strip('-')


def validate_slug(slug: str) -> str:
    """Return slug unchanged or raise StorageError for unsafe/cross-platform names."""
    if not isinstance(slug, str) or len(slug) > 100 or not SLUG_PATTERN.fullmatch(slug):
        raise StorageError('Use 1–100 lowercase ASCII letters/digits separated by hyphens or underscores.')
    if slug.lower() in RESERVED_NAMES:
        raise StorageError(f'Reserved filename: {slug}')
    return slug


def _decode_string(token: str) -> str:
    """Decode JS literal escapes only; reject ambiguous legacy/octal escapes."""
    output = []
    index = 1
    escapes = {'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f',
               'v': '\v', '0': '\0', '\\': '\\', "'": "'", '"': '"', '/': '/'}
    while index < len(token) - 1:
        char = token[index]
        index += 1
        if char != '\\':
            output.append(char)
            continue
        char = token[index]
        index += 1
        if char in ('u', 'x'):
            count = 4 if char == 'u' else 2
            digits = token[index:index + count]
            if not re.fullmatch(r'[0-9a-fA-F]{' + str(count) + '}', digits):
                raise StorageError('Unsupported string escape.')
            output.append(chr(int(digits, 16)))
            index += count
        elif char in escapes:
            if char == '0' and token[index:index + 1].isdigit():
                raise StorageError('Octal escapes are unsupported.')
            output.append(escapes[char])
        else:
            raise StorageError('Unsupported string escape; use JSON-compatible literals.')
    # Combine escaped UTF-16 surrogate pairs, retaining unmatched ones for JSON serialization.
    return ''.join(output).encode('utf-16', 'surrogatepass').decode('utf-16', 'surrogatepass')


class _LiteralParser:
    """Consumes a bounded literal token stream; functions/expressions are forbidden."""

    def __init__(self, source: str) -> None:
        self.tokens = []
        end = 0
        for match in TOKEN_PATTERN.finditer(source):
            if match.start() != end:
                raise StorageError('Unsupported executable JavaScript syntax; edit this file manually.')
            end = match.end()
            token = match.group()
            if not token.isspace() and not token.startswith(('//', '/*')):
                self.tokens.append(token)
        if end != len(source):
            raise StorageError('Unsupported JavaScript syntax or unfinished comment/string.')
        self.index = 0

    def _take(self, expected: str | None = None) -> str:
        if self.index == len(self.tokens):
            raise StorageError('Incomplete literal assignment.')
        token = self.tokens[self.index]
        self.index += 1
        if expected is not None and token != expected:
            raise StorageError(f'Expected {expected}; executable JavaScript is unsupported.')
        return token

    def _value(self, depth: int = 0) -> Any:
        if depth > MAX_LITERAL_DEPTH:
            raise StorageError('Literal nesting exceeds the supported depth.')
        token = self._take()
        if token in ('{', '['):
            return self._container(token, depth)
        if token.startswith(('"', "'")):
            return _decode_string(token)
        if token in ('true', 'false', 'null'):
            return {'true': True, 'false': False, 'null': None}[token]
        try:
            value = json.loads(token)
        except json.JSONDecodeError as error:
            raise StorageError('Only JSON-compatible literal values are supported.') from error
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            raise StorageError('Only finite literal numbers are supported.')
        return value

    def _container(self, opening: str, depth: int) -> Any:
        result = {} if opening == '{' else []
        closing = '}' if opening == '{' else ']'
        while self.index < len(self.tokens) and self.tokens[self.index] != closing:
            if opening == '{':
                key = self._take()
                key = _decode_string(key) if key.startswith(('"', "'")) else key
                if key in result:
                    raise StorageError(f'Duplicate literal key: {key}')
                self._take(':')
                result[key] = self._value(depth + 1)
            else:
                result.append(self._value(depth + 1))
            if self.index < len(self.tokens) and self.tokens[self.index] == closing:
                break
            self._take(',')
        self._take(closing)
        return result


def parse_assignment(source: str, name: str) -> Any:
    """Parse one window.name literal assignment, raising StorageError without executing it."""
    if len(source.encode('utf-8')) > MAX_SOURCE_BYTES:
        raise StorageError('File exceeds the editor size limit.')
    parser = _LiteralParser(source.lstrip('\ufeff'))
    for token in ('window', '.', name, '='):
        parser._take(token)
    value = parser._value()
    if parser.index < len(parser.tokens):
        parser._take(';')
    if parser.index != len(parser.tokens):
        raise StorageError('Additional executable statements are unsupported.')
    expected = dict if name == 'GALLERY_TRIP_CONFIG' else list
    if not isinstance(value, expected):
        raise StorageError(f'{name} must contain a {expected.__name__}.')
    return value


def serialize_assignment(name: str, value: Any) -> str:
    """Return safe literal JS for value; reject non-JSON values and non-finite numbers."""
    try:
        return f'window.{name} = ' + json.dumps(value, ensure_ascii=True, indent=2, allow_nan=False) + ';\n'
    except (TypeError, ValueError) as error:
        raise StorageError('Only JSON-compatible values may be saved.') from error


def version_of(content: bytes | None) -> str | None:
    """Return a content version, or None for an absent file."""
    return hashlib.sha256(content).hexdigest() if content is not None else None


class TripStorage:
    """Owns the repository root and mutation lock; blocked stores require manual recovery."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.trips = self.root / 'trips'
        self.lock = threading.RLock()
        self.blocked = ''

    def trip_path(self, slug: str) -> Path:
        """Return a contained real trip path; slug is a validated directory identity."""
        validate_slug(slug)
        if slug in RESERVED_TRIPS:
            raise StorageError('Template, shared and scripts are not editable trips.')
        path = self.trips / slug
        self._check_path(path)
        return path

    def _check_path(self, path: Path) -> None:
        if not path.resolve().is_relative_to(self.trips.resolve()) or self.trips.is_symlink():
            raise StorageError('Path escapes the trips directory.')
        for parent in (path, *path.parents):
            if parent == self.root:
                break
            if parent.is_symlink():
                raise StorageError('Symlinks are not supported for trip operations.')

    def file_path(self, slug: str, relative: str) -> Path:
        """Return an allowed config/registry/event path or raise StorageError."""
        if relative not in ASSIGNMENTS:
            match = re.fullmatch(r'data/(event-[a-z0-9_-]+)\.js', relative or '')
            if not match:
                raise StorageError('Only trip-config.js, data/events.js and data/event-*.js are writable.')
            validate_slug(match.group(1))
        path = self.trip_path(slug) / relative
        self._check_path(path)
        if path.parent.exists():
            for sibling in path.parent.iterdir():
                if sibling.name.casefold() == path.name.casefold() and sibling.name != path.name:
                    raise StorageError(f'Case-insensitive filename collision: {sibling.name}')
        return path

    def read(self, slug: str, relative: str) -> dict:
        """Read versioned literal file data; relative is trip-relative, errors never alter files."""
        with self.lock:
            path = self.file_path(slug, relative)
            content = path.read_bytes()
            if len(content) > MAX_SOURCE_BYTES:
                raise StorageError('File exceeds the editor size limit.')
            text = content.decode('utf-8')
            name = ASSIGNMENTS.get(relative, 'GALLERY_ITEMS')
            return {'text': text, 'version': version_of(content), 'value': parse_assignment(text, name)}

    def discover(self) -> dict:
        """Return valid trip summaries and separate actionable diagnostics; writes nothing."""
        trips, errors = [], []
        for path in sorted(self.trips.iterdir()):
            if path.name in RESERVED_TRIPS or path.name.startswith('.') or not path.is_dir():
                continue
            try:
                self.trip_path(path.name)
                self._check_path(path / 'index.html')
                if not (path / 'index.html').is_file():
                    raise StorageError('Missing index.html.')
                # Unsupported configs remain selectable so existing events can still be edited.
                title = path.name
                try:
                    title = self.read(path.name, 'trip-config.js')['value'].get('heading', title)
                except (StorageError, OSError, UnicodeError) as error:
                    errors.append(f'{path.name}: {error}')
                self.read(path.name, 'data/events.js')
                trips.append({'slug': path.name, 'title': str(title)})
            except (StorageError, OSError, UnicodeError) as error:
                errors.append(f'{path.name}: {error}')
        return {'trips': trips, 'errors': errors}

    def create(self, name: str, slug: str, language: str = 'bg') -> dict:
        """Exclusively copy a new trip from template; cleanup failed creation, never replace a trip."""
        if not isinstance(name, str) or not name.strip():
            raise StorageError('A trip name is required.')
        with self.lock:
            if self.blocked:
                raise StorageError(self.blocked)
            path = self.trip_path(slug)
            if any(p.name.casefold() == slug.casefold() for p in self.trips.iterdir()):
                raise StorageError(f'Trip {slug} already exists; open it from the trip selector.')
            template = self.trips / 'template'
            for source in (template, *template.rglob('*')):
                self._check_path(source)
            config = parse_assignment((template / 'trip-config.js').read_text(), 'GALLERY_TRIP_CONFIG')
            config.update(language_preset(language))
            config.update(pageTitle=name.strip(), heading=name.strip())
            path.mkdir()  # exclusive ownership begins here; cleanup only our new directory
            try:
                shutil.copytree(template, path, dirs_exist_ok=True)
                (path / 'trip-config.js').write_text(serialize_assignment('GALLERY_TRIP_CONFIG', config), encoding='utf-8')
            except OSError:
                shutil.rmtree(path)
                raise
            return {'slug': slug}

    def registry_errors(self, slug: str, entries: list, changes: dict | None = None) -> list[str]:
        """Return all registry violations against the proposed changes, without modifying disk."""
        errors, slugs, targets = [], set(), set()
        for index, entry in enumerate(entries):
            try:
                if not isinstance(entry, dict):
                    raise StorageError('Entry must be an object.')
                identity = validate_slug(entry.get('slug', ''))
                if not isinstance(entry.get('title'), str) or not entry['title'].strip():
                    raise StorageError('A title is required.')
                target = entry.get('data', '')
                path = self.file_path(slug, target)
                if target in ASSIGNMENTS:
                    raise StorageError('Part data must reference an event file.')
                if identity in slugs or target.casefold() in targets:
                    raise StorageError('Duplicate slug or data target; manually repair saved identities.')
                slugs.add(identity)
                targets.add(target.casefold())
                exists = path.is_file() if target not in (changes or {}) else changes[target] is not None
                if not exists:
                    raise StorageError(f'Missing event file: {target}')
            except (StorageError, TypeError) as error:
                errors.append(f'Entry {index + 1}: {error}')
        return errors

    def commit(self, slug: str, changes: dict, versions: dict, delete_confirmed: bool = False) -> dict:
        """Validate and commit a versioned file batch; failures restore originals or block writes.

        changes maps allowed paths to source strings or None (confirmed deletion).
        versions must cover every changed path. Returns new versions after success.
        """
        with self.lock:
            if self.blocked:
                raise StorageError(self.blocked)
            if not isinstance(changes, dict) or not changes or len(changes) > 100:
                raise StorageError('Provide between 1 and 100 file changes.')
            paths, originals = {}, {}
            for relative, text in changes.items():
                path = self.file_path(slug, relative)
                paths[relative] = path
                original = path.read_bytes() if path.exists() else None
                originals[relative] = original
                if relative not in versions or versions[relative] != version_of(original):
                    raise StorageError(f'{relative} changed on disk; reload before saving.')
                if text is not None:
                    if not isinstance(text, str):
                        raise StorageError('File content must be text.')
                    parse_assignment(text, ASSIGNMENTS.get(relative, 'GALLERY_ITEMS'))
            self._validate_batch(slug, changes, originals, delete_confirmed)
            self._transaction(paths, originals, changes)
            return {'versions': {key: version_of(value.encode('utf-8') if value is not None else None)
                                 for key, value in changes.items()}}

    def _validate_batch(self, slug: str, changes: dict, originals: dict, consent: bool) -> None:
        removed = [key for key, value in changes.items() if value is None]
        if any(key in ASSIGNMENTS for key in removed):
            raise StorageError('Config and registry cannot be deleted.')
        if removed and (not consent or 'data/events.js' not in changes):
            raise StorageError('Deletion requires confirmation and a coordinated registry change.')
        if 'data/events.js' not in changes:
            if any(key.startswith('data/') and originals[key] is None for key in changes):
                raise StorageError('A new event requires a coordinated registry entry.')
            return  # Existing event edits do not require unrelated legacy registry repair.
        entries = parse_assignment(changes['data/events.js'], 'GALLERY_EVENT_INDEX')
        errors = self.registry_errors(slug, entries, changes)
        if errors:
            raise StorageError('\n'.join(errors))
        previous = self.read(slug, 'data/events.js')['value']
        for entry in previous:
            if not isinstance(entry, dict):
                raise StorageError('Manually repair malformed legacy registry records first.')
            matching = [new for new in entries if new['slug'] == entry.get('slug') or new['data'] == entry.get('data')]
            if matching and any((new['slug'], new['data']) != (entry.get('slug'), entry.get('data')) for new in matching):
                raise StorageError('Saved slugs and filenames are locked; repair invalid identities manually.')
            if not matching and entry.get('data') not in removed:
                raise StorageError('Removing a saved part must also delete its data file with confirmation.')
        if any(key.startswith('data/event-') and originals[key] is None and key not in {entry['data'] for entry in entries} for key in changes):
            raise StorageError('New event files must be registered in the same operation.')
        if any(entry['data'] in removed for entry in entries):
            raise StorageError('A deleted file is still referenced.')

    def _transaction(self, paths: dict, originals: dict, changes: dict) -> None:
        """Retain disk originals until all replacements succeed; recover on caught I/O errors."""
        parent = next(iter(paths.values())).parents[0]
        recovery = Path(tempfile.mkdtemp(prefix='.trip-editor-recovery-', dir=parent))
        staged, applied = {}, []
        try:
            for index, (key, text) in enumerate(changes.items()):
                if originals[key] is not None:
                    (recovery / f'{index}-{paths[key].name}.original').write_bytes(originals[key])
                if text is not None:
                    staged[key] = recovery / f'{index}.new'
                    staged[key].write_text(text, encoding='utf-8')
            for key, text in changes.items():
                self._check_path(paths[key])
                applied.append(key)
                if text is None:
                    paths[key].unlink()
                else:
                    os.replace(staged[key], paths[key])
        except (OSError, StorageError) as error:
            failures = []
            for key in reversed(applied):
                try:
                    self._restore(paths[key], originals[key])
                except (OSError, StorageError) as restore_error:
                    failures.append(str(restore_error))
            if failures:
                self.blocked = f'Rollback failed. Stop editing and recover originals from {recovery}: ' + '; '.join(failures)
                raise StorageError(self.blocked) from error
            raise StorageError(f'Write failed; originals restored: {error}') from error
        finally:
            if not self.blocked:
                shutil.rmtree(recovery)

    def _restore(self, path: Path, original: bytes | None) -> None:
        """Restore one original using same-directory replacement, or remove a new file."""
        self._check_path(path)
        if original is None:
            path.unlink(missing_ok=True)
            return
        descriptor, temporary = tempfile.mkstemp(prefix='.restore-', dir=path.parent)
        try:
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(original)
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)


def language_preset(language: str) -> dict:
    """Return independent complete BG/EN config defaults; reject unsupported language values."""
    if language not in ('bg', 'en'):
        raise StorageError('Choose Bulgarian or English.')
    bulgarian = language == 'bg'
    return {
        'language': language, 'locale': 'bg-BG' if bulgarian else 'en-US',
        'pageTitle': 'Нов пътепис' if bulgarian else 'New trip journal',
        'heading': 'Нов пътепис' if bulgarian else 'New trip journal',
        'heroEyebrow': 'Семеен пътепис' if bulgarian else 'Family travel journal',
        'subtitle': 'Снимки, видеа и разкази' if bulgarian else 'Photos, videos, and stories',
        'pageDescription': 'Семеен пътепис със снимки, видеа и разкази.' if bulgarian else 'A family trip journal with photos, videos, and stories.',
        'tripFacts': '', 'labels': dict(BG_LABELS if bulgarian else EN_LABELS),
    }
