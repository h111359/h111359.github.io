"""test_trip_editor.py: Network-free regression tests for local trip authoring.

Uses disposable repositories, synthetic Drive responses and fault injection;
never modifies real trips or accesses external services.
"""

from __future__ import annotations

import http.client
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

REPOSITORY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY / 'trips/scripts'))
from drive_generation import DriveGeneration, load_generator
from trip_editor_server import EditorServer
from trip_storage import (StorageError, TripStorage, language_preset, parse_assignment,
                          serialize_assignment, slugify, validate_slug)


class TripFixture(unittest.TestCase):
    """Owns disposable trip fixtures and helper operations for all test groups."""

    def setUp(self) -> None:
        """Copy only the template into a disposable repository and create a trip."""
        self.temporary = tempfile.TemporaryDirectory(prefix='trip editor България ')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        shutil.copytree(REPOSITORY / 'trips/template', self.root / 'trips/template')
        self.store = TripStorage(self.root)
        self.store.create('Тест София', 'test')
        self.trip = self.root / 'trips/test'

    def add_part(self, slug: str = 'event-one') -> dict:
        """Commit an empty synthetic part and return its registry entry."""
        registry = self.store.read('test', 'data/events.js')
        entry = {'slug': slug, 'title': slug, 'data': f'data/{slug}.js'}
        self.store.commit('test', {entry['data']: serialize_assignment('GALLERY_ITEMS', []),
                                  'data/events.js': serialize_assignment('GALLERY_EVENT_INDEX', [*registry['value'], entry])},
                          {entry['data']: None, 'data/events.js': registry['version']})
        return entry

    def deletion(self) -> tuple[dict, dict]:
        """Return a confirmed delete batch for a newly created synthetic part."""
        entry = self.add_part()
        registry = self.store.read('test', 'data/events.js')
        event = self.store.read('test', entry['data'])
        return ({entry['data']: None, 'data/events.js': serialize_assignment('GALLERY_EVENT_INDEX', [])},
                {entry['data']: event['version'], 'data/events.js': registry['version']})



class StorageTests(TripFixture):
    """Owns a disposable repository per test, including an empty created trip."""



    def test_creation_defaults_and_collision_preserve_original(self) -> None:
        """Name-only creation uses BG and correct assets; collisions cannot overwrite."""
        config = self.store.read('test', 'trip-config.js')['value']
        self.assertEqual(config['heading'], 'Тест София')
        self.assertEqual(config['locale'], 'bg-BG')
        self.assertIn('../shared/gallery.js', (self.trip / 'index.html').read_text())
        original = (self.trip / 'trip-config.js').read_bytes()
        with self.assertRaises(StorageError):
            self.store.create('Replace', 'test')
        self.assertEqual((self.trip / 'trip-config.js').read_bytes(), original)
        (self.root / 'trips/Other').mkdir()
        with self.assertRaises(StorageError):
            self.store.create('Collision', 'other')

    def test_portable_slug_and_path_validation(self) -> None:
        """Reject traversal, reserved names and non-ASCII manual identities."""
        self.assertEqual(slugify('Щастливо пътуване до София!'), 'shtastlivo-patuvane-do-sofiya')
        for value in ('', '../outside', 'CON', 'con', 'aux', 'com1', 'hello.', 'hi ', 'София', 'A'):
            with self.subTest(value=value), self.assertRaises(StorageError):
                validate_slug(value)
        for value in ('../config.js', '/tmp/event-x.js', 'data/../event-x.js', 'data\\event-x.js', 'C:\\x', '//host/share', 'data/events.js/child'):
            with self.subTest(value=value), self.assertRaises(StorageError):
                self.store.file_path('test', value)
        for value in ('shared', 'template', 'scripts'):
            with self.assertRaises(StorageError):
                self.store.trip_path(value)

    def test_symlink_escape_is_rejected(self) -> None:
        """Both trip and file symlinks are refused even if readable."""
        outside = self.root / 'outside'
        outside.mkdir()
        try:
            (self.root / 'trips/linked').symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f'Symlinks unavailable: {error}')
        with self.assertRaises(StorageError):
            self.store.trip_path('linked')
        (self.trip / 'data/event-link.js').symlink_to(outside / 'target')
        with self.assertRaises(StorageError):
            self.store.file_path('test', 'data/event-link.js')

    def test_discovery_excludes_nontrip_directories(self) -> None:
        """Template/shared/scripts never appear, while malformed candidates have diagnostics."""
        for name in ('shared', 'scripts', 'broken'):
            (self.root / 'trips' / name).mkdir()
        result = self.store.discover()
        self.assertEqual([trip['slug'] for trip in result['trips']], ['test'])
        self.assertTrue(any('broken' in error for error in result['errors']))

    def test_literals_preserve_unknown_values_and_escapes(self) -> None:
        """Round-trip nested unknown literals, comments and Unicode without executing source."""
        source = r'''/* identity */ window.GALLERY_TRIP_CONFIG = {
          language: 'bg', unknown: { nested: [true, null, -1.5e2, '\uD83D\uDE00'], },
          quote: 'it\'s safe', link: "https://example.test/a//b", theme: {heroWash: 'rgb(1 2 3 / 6%)'}
        }; // trailing comment'''
        parsed = parse_assignment(source, 'GALLERY_TRIP_CONFIG')
        self.assertEqual(parsed['unknown']['nested'][-1], '😀')
        self.assertEqual(parsed, parse_assignment(serialize_assignment('GALLERY_TRIP_CONFIG', parsed), 'GALLERY_TRIP_CONFIG'))

    def test_executable_syntax_is_rejected_without_writes(self) -> None:
        """Expressions, functions, extra statements and ambiguous keys never reach disk."""
        before = self.store.read('test', 'trip-config.js')
        for value in ('{x: alert(1)}', '{...window.foo}', '{x: `template`}', '{x: 1 + 2}', '{x: undefined}', '{x: NaN}', '{x:1,x:2}'):
            source = f'window.GALLERY_TRIP_CONFIG = {value};'
            with self.subTest(value=value), self.assertRaises(StorageError):
                self.store.commit('test', {'trip-config.js': source}, {'trip-config.js': before['version']})
        with self.assertRaises(StorageError):
            parse_assignment(before['text'] + 'alert(1);', 'GALLERY_TRIP_CONFIG')
        self.assertEqual(self.store.read('test', 'trip-config.js'), before)

    def test_presets_cover_all_gallery_labels(self) -> None:
        """Both presets include every label the shared controller requests."""
        import re
        controller = (REPOSITORY / 'trips/shared/gallery.js').read_text()
        keys = set(re.findall(r'formatLabel\("([^"]+)"', controller))
        for language in ('en', 'bg'):
            self.assertFalse(keys - language_preset(language)['labels'].keys())

    def test_version_conflict_preserves_external_change(self) -> None:
        """A stale browser snapshot cannot replace a newer external edit."""
        before = self.store.read('test', 'trip-config.js')
        external = before['text'] + '\n// external edit\n'
        (self.trip / 'trip-config.js').write_text(external)
        with self.assertRaisesRegex(StorageError, 'changed on disk'):
            self.store.commit('test', {'trip-config.js': before['text']}, {'trip-config.js': before['version']})
        self.assertEqual((self.trip / 'trip-config.js').read_text(), external)

    def test_legacy_errors_allow_event_edit_but_block_registry_save(self) -> None:
        """Blank-title/duplicate registries do not block editing an existing event."""
        entry = self.add_part()
        malformed = [{**entry, 'title': ''}, entry]
        (self.trip / 'data/events.js').write_text(serialize_assignment('GALLERY_EVENT_INDEX', malformed))
        event = self.store.read('test', entry['data'])
        self.store.commit('test', {entry['data']: event['text']}, {entry['data']: event['version']})
        registry = self.store.read('test', 'data/events.js')
        with self.assertRaises(StorageError):
            self.store.commit('test', {'data/events.js': registry['text']}, {'data/events.js': registry['version']})
        self.assertTrue(self.store.registry_errors('test', malformed))

    def test_identity_lock_and_required_coordinated_delete(self) -> None:
        """Saved identities cannot be renamed or silently unregistered."""
        entry = self.add_part()
        registry = self.store.read('test', 'data/events.js')
        for replacement in ([{**entry, 'slug': 'event-renamed'}], []):
            with self.assertRaises(StorageError):
                self.store.commit('test', {'data/events.js': serialize_assignment('GALLERY_EVENT_INDEX', replacement)},
                                  {'data/events.js': registry['version']})


    def test_delete_requires_consent_and_removes_both(self) -> None:
        """The coordinated delete enforces consent and removes both artifacts."""
        changes, versions = self.deletion()
        with self.assertRaises(StorageError):
            self.store.commit('test', changes, versions)
        self.store.commit('test', changes, versions, delete_confirmed=True)
        self.assertFalse((self.trip / 'data/event-one.js').exists())
        self.assertEqual(self.store.read('test', 'data/events.js')['value'], [])

    def test_delete_still_referenced_is_rejected(self) -> None:
        """Deleting an event referenced by the final registry is forbidden."""
        changes, versions = self.deletion()
        changes['data/events.js'] = self.store.read('test', 'data/events.js')['text']
        with self.assertRaises(StorageError):
            self.store.commit('test', changes, versions, delete_confirmed=True)
        self.assertTrue((self.trip / 'data/event-one.js').exists())

    def test_registry_failure_rolls_back_created_event(self) -> None:
        """Failure replacing the registry restores it and removes the new event."""
        registry = self.store.read('test', 'data/events.js')
        replace = os.replace
        def fail_registry(source: str, target: str) -> None:
            if Path(target).name == 'events.js' and str(source).endswith('.new'):
                raise OSError('Injected registry failure')
            replace(source, target)
        with patch('trip_storage.os.replace', side_effect=fail_registry), self.assertRaises(StorageError):
            self.add_part()
        self.assertFalse((self.trip / 'data/event-one.js').exists())
        self.assertEqual(self.store.read('test', 'data/events.js'), registry)

    def test_deletion_failure_restores_both(self) -> None:
        """A failed registry replacement restores a deleted event and original registry."""
        changes, versions = self.deletion()
        original = (self.trip / 'data/event-one.js').read_bytes()
        replace = os.replace
        def fail_registry(source: str, target: str) -> None:
            if Path(target).name == 'events.js' and str(source).endswith('.new'):
                raise OSError('Injected registry failure')
            replace(source, target)
        with patch('trip_storage.os.replace', side_effect=fail_registry), self.assertRaises(StorageError):
            self.store.commit('test', changes, versions, delete_confirmed=True)
        self.assertEqual((self.trip / 'data/event-one.js').read_bytes(), original)
        self.assertEqual(len(self.store.read('test', 'data/events.js')['value']), 1)

    def test_preview_batch_failure_restores_config_and_event(self) -> None:
        """A late failure in a multi-draft save cannot leave settings partially saved."""
        entry = self.add_part()
        config = self.store.read('test', 'trip-config.js')
        event = self.store.read('test', entry['data'])
        changes = {'trip-config.js': serialize_assignment('GALLERY_TRIP_CONFIG', {**config['value'], 'heading': 'changed'}), entry['data']: event['text']}
        replace = os.replace
        def fail_event(source: str, target: str) -> None:
            if Path(target).name == 'event-one.js' and str(source).endswith('.new'):
                raise OSError('Injected event failure')
            replace(source, target)
        with patch('trip_storage.os.replace', side_effect=fail_event), self.assertRaises(StorageError):
            self.store.commit('test', changes, {'trip-config.js': config['version'], entry['data']: event['version']})
        self.assertEqual(self.store.read('test', 'trip-config.js'), config)
        self.assertEqual(self.store.read('test', entry['data']), event)

    def test_failed_restoration_retains_originals_and_blocks_writes(self) -> None:
        """Failed rollback preserves recovery copies and refuses subsequent mutation."""
        changes, versions = self.deletion()
        with patch('trip_storage.os.replace', side_effect=OSError('disk failure')), self.assertRaisesRegex(StorageError, 'Rollback failed'):
            self.store.commit('test', changes, versions, delete_confirmed=True)
        recovery = list(self.trip.rglob('.trip-editor-recovery-*'))
        self.assertEqual(len(recovery), 1)
        self.assertTrue(list(recovery[0].glob('*.original')))
        with self.assertRaisesRegex(StorageError, 'Rollback failed'):
            self.store.create('Other', 'other')

    def test_unregistered_new_event_rejected(self) -> None:
        """New files require a matching registry change in the same commit."""
        with self.assertRaises(StorageError):
            self.store.commit('test', {'data/event-orphan.js': serialize_assignment('GALLERY_ITEMS', [])}, {'data/event-orphan.js': None})

class GenerationTests(TripFixture):
    """Synthetic Drive preparations using existing serialization/filtering code."""

    def setUp(self) -> None:
        """Initialize fake discovery/public validation while retaining the real serializer."""
        super().setUp()
        module = load_generator(REPOSITORY)
        item = SimpleNamespace(name='photo.jpg', file_id='synthetic_file_12345', kind='file', resource_key='')
        self.module = SimpleNamespace(
            GeneratorError=module.GeneratorError,
            discover_folder_items=lambda *_: [item],
            select_media_items=lambda found, report: found,
            validate_selected_media=lambda *_: None,
            serialize_event=module.serialize_event,
        )
        self.generation = DriveGeneration(self.store, self.module)
        self.body = {'trip': 'test', 'slug': 'event-one', 'title': 'One', 'data': 'data/event-one.js', 'folder': 'synthetic_folder_id'}

    def test_preparation_is_read_only_and_single_use(self) -> None:
        """Discovery does not write; confirmed results are consumed exactly once."""
        prepared = self.generation.prepare(self.body)
        self.assertFalse((self.trip / 'data/event-one.js').exists())
        with self.assertRaises(StorageError):
            self.generation.commit({'id': prepared['id'], 'trip': 'test'})
        commit = {'id': prepared['id'], 'trip': 'test', 'confirmed': True}
        self.generation.commit(commit)
        self.assertEqual(len(self.store.read('test', 'data/events.js')['value']), 1)
        with self.assertRaises(StorageError):
            self.generation.commit(commit)

    def test_expiry_and_changed_versions(self) -> None:
        """Expired or stale review cannot overwrite changed files."""
        prepared = self.generation.prepare(self.body)
        self.generation.prepared[prepared['id']]['expires'] = time.monotonic() - 1
        with self.assertRaises(StorageError):
            self.generation.commit({'id': prepared['id'], 'trip': 'test', 'confirmed': True})
        prepared = self.generation.prepare(self.body)
        with (self.trip / 'data/events.js').open('a') as stream:
            stream.write('\n// external\n')
        with self.assertRaises(StorageError):
            self.generation.commit({'id': prepared['id'], 'trip': 'test', 'confirmed': True})
        self.assertFalse((self.trip / 'data/event-one.js').exists())

    def test_overwrite_requires_explicit_consent(self) -> None:
        """Existing data is unchanged until the replacement-loss warning is accepted."""
        self.add_part()
        before = (self.trip / 'data/event-one.js').read_bytes()
        prepared = self.generation.prepare(self.body)
        self.assertTrue(prepared['overwrite'])
        body = {'id': prepared['id'], 'trip': 'test', 'confirmed': True}
        with self.assertRaises(StorageError):
            self.generation.commit(body)
        self.assertEqual((self.trip / 'data/event-one.js').read_bytes(), before)
        self.generation.commit({**body, 'overwriteConfirmed': True})
        self.assertEqual(len(self.store.read('test', 'data/event-one.js')['value']), 1)

    def test_discovery_validation_failures_leave_registry_unchanged(self) -> None:
        """Failed access, zero media and busy discovery cannot create a registry entry."""
        registry = self.store.read('test', 'data/events.js')
        self.module.validate_selected_media = lambda *_: (_ for _ in ()).throw(self.module.GeneratorError('private child'))
        with self.assertRaisesRegex(StorageError, 'private child'):
            self.generation.prepare(self.body)
        self.module.select_media_items = lambda *_: []
        with self.assertRaises(StorageError):
            self.generation.prepare(self.body)
        self.generation.discovery_gate.acquire()
        try:
            with self.assertRaisesRegex(StorageError, 'already running'):
                self.generation.prepare(self.body)
        finally:
            self.generation.discovery_gate.release()
        self.assertEqual(self.store.read('test', 'data/events.js'), registry)


class HttpTests(TripFixture):
    """Actual loopback HTTP tests in a disposable repository; no Internet access."""

    def setUp(self) -> None:
        """Start an ephemeral local helper and register deterministic cleanup."""
        super().setUp()
        self.server = EditorServer(self.root, 0)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self) -> None:
        """Stop serving and wait for all request worker threads to finish."""
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, method: str, path: str, body: dict | None = None, headers: dict | None = None) -> tuple[int, bytes]:
        """Return status/body for one local HTTP request with optional headers."""
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        data = json.dumps(body) if body is not None else None
        request_headers = {'Content-Type': 'application/json', **(headers or {})}
        connection.request(method, path, data, request_headers)
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_host_origin_and_session_authorization(self) -> None:
        """Mutation needs exact origin and token; session reads reject hostile origins/hosts."""
        self.assertEqual(self.request('GET', '/api/session')[0], 200)
        for headers in ({'Host': 'evil.test'}, {'Origin': 'https://evil.test'}, {'Sec-Fetch-Site': 'cross-site'}):
            self.assertEqual(self.request('GET', '/api/session', headers=headers)[0], 400)
        body = {'name': 'Other', 'slug': 'other'}
        self.assertEqual(self.request('POST', '/api/create', body)[0], 400)
        headers = {'Origin': self.server.origin, 'X-Trip-Token': self.server.token}
        self.assertEqual(self.request('POST', '/api/create', body, headers)[0], 200)

    def test_static_paths_and_private_files(self) -> None:
        """Static serving rejects private, encoded traversal and symlink paths."""
        self.assertEqual(self.request('GET', '/trips/test/index.html')[0], 200)
        status, body = self.request('GET', '/api/file?trip=test&path=data/event-missing.js')
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)['code'], 'not_found')
        for path in ('/.git/config', '/trips/scripts/trip_storage.py', '/%2e%2e/outside', '/trips/test/data/'):
            self.assertIn(self.request('GET', path)[0], (400, 404))

    def test_bounded_request_and_occupied_port(self) -> None:
        """Oversized requests and an already-bound port fail explicitly."""
        headers = {'Origin': self.server.origin, 'X-Trip-Token': self.server.token, 'Content-Length': str(20 * 1024 * 1024)}
        self.assertEqual(self.request('POST', '/api/create', {}, headers)[0], 400)
        with self.assertRaises(OSError):
            EditorServer(self.root, self.server.server_port)


if __name__ == '__main__':
    unittest.main()
