"""drive_generation.py: Reviewed Drive generation for the local trip editor.

Reuses the existing CLI parser and media validation; owns expiring, single-use
preparations and delegates all file changes to the runtime transaction store.
"""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path
import secrets
import sys
import threading
import time
from typing import Any
import urllib.request

from trip_storage import StorageError, TripStorage, serialize_assignment, validate_slug, version_of

PREPARATION_SECONDS = 600
MAX_PREPARATIONS = 16
NETWORK_TIMEOUT = 30


def load_generator(root: Path) -> Any:
    """Return the existing repository CLI module without invoking its writing entry point."""
    name = '_trip_editor_cli_generator'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, root / 'scripts/generate_trip_event.py')
        if spec is None or spec.loader is None:
            raise StorageError('The existing Drive generator could not be loaded.')
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module  # dataclass annotations require the registered module
        spec.loader.exec_module(module)
    return sys.modules[name]


class DriveGeneration:
    """Owns bounded preparations and a discovery gate; static preview stays responsive."""

    def __init__(self, storage: TripStorage, generator: Any = None) -> None:
        self.storage = storage
        self.generator = generator or load_generator(storage.root)
        self.prepared = {}
        self.lock = threading.Lock()
        self.discovery_gate = threading.Lock()

    def _snapshot(self, body: dict) -> dict:
        trip = body.get('trip')
        entry = {key: body.get(key, '') for key in ('slug', 'title', 'data')}
        validate_slug(entry['slug'])
        if not isinstance(entry['title'], str) or not entry['title'].strip():
            raise StorageError('A part title is required.')
        with self.storage.lock:
            target = self.storage.file_path(trip, entry['data'])
            if entry['data'] in ('trip-config.js', 'data/events.js'):
                raise StorageError('Choose an event-*.js filename.')
            original = target.read_bytes() if target.exists() else None
            registry = self.storage.read(trip, 'data/events.js')
            errors = self.storage.registry_errors(trip, registry['value'])
            if errors:
                raise StorageError('Repair the registry before generation:\n' + '\n'.join(errors))
            entries = registry['value']
            matches = [index for index, item in enumerate(entries)
                       if item['slug'] == entry['slug'] or item['data'] == entry['data']]
            if matches:
                old = entries[matches[0]]
                if old['slug'] != entry['slug'] or old['data'] != entry['data']:
                    raise StorageError('Saved slug and filename are locked.')
                entries[matches[0]] = entry
            else:
                entries.append(entry)
            return {'trip': trip, 'entry': entry, 'entries': entries,
                    'versions': {'data/events.js': registry['version'], entry['data']: version_of(original)},
                    'overwrite': original is not None}

    def prepare(self, body: dict) -> dict:
        """Discover and validate direct public media for body; return review details without writes."""
        if not self.discovery_gate.acquire(blocking=False):
            raise StorageError('Drive discovery is already running. Wait for it to finish.')
        try:
            prepared = self._snapshot(body)
            report = io.StringIO()
            opener = urllib.request.build_opener()
            module = self.generator
            try:
                found = module.discover_folder_items(body.get('folder', ''), opener, NETWORK_TIMEOUT)
                selected = module.select_media_items(found, report)
                if not selected:
                    raise StorageError('No supported media found; nothing was written.')
                module.validate_selected_media(selected, opener, NETWORK_TIMEOUT)
                prepared['source'] = module.serialize_event(selected)
            except module.GeneratorError as error:
                raise StorageError(str(error)) from error
            identifier = secrets.token_urlsafe(24)
            prepared['expires'] = time.monotonic() + PREPARATION_SECONDS
            with self.lock:
                self.prepared = {key: value for key, value in self.prepared.items()
                                 if value['expires'] > time.monotonic()}
                if len(self.prepared) >= MAX_PREPARATIONS:
                    raise StorageError('Too many pending reviews. Finish one or wait ten minutes.')
                self.prepared[identifier] = prepared
            return {'id': identifier, 'count': len(selected), 'report': report.getvalue(),
                    'names': [item.name for item in selected], 'overwrite': prepared['overwrite'],
                    'entry': prepared['entry'], 'expiresIn': PREPARATION_SECONDS}
        finally:
            self.discovery_gate.release()

    def commit(self, body: dict) -> dict:
        """Consume confirmed preparation once; recheck versions and commit registry plus event."""
        if body.get('confirmed') is not True:
            raise StorageError('Review and confirmation are required before generation.')
        with self.lock:
            prepared = self.prepared.get(body.get('id'))
            if not prepared or prepared['expires'] <= time.monotonic():
                raise StorageError('Review expired or was already used. Discover again.')
            if body.get('trip') != prepared['trip']:
                raise StorageError('Review belongs to a different trip.')
            if prepared['overwrite'] and body.get('overwriteConfirmed') is not True:
                raise StorageError('Replacement discards descriptions, text blocks, visibility, corrections and custom ordering. Explicit consent required.')
            del self.prepared[body['id']]
        changes = {prepared['entry']['data']: prepared['source'],
                   'data/events.js': serialize_assignment('GALLERY_EVENT_INDEX', prepared['entries'])}
        return self.storage.commit(prepared['trip'], changes, prepared['versions'])
