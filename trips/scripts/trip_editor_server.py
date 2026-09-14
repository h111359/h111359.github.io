"""trip_editor_server.py: Loopback HTTP service for the local trip editor.

Owns authenticated authoring endpoints and constrained static preview serving.
The service has no production role and uses only Python's standard library.
"""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import secrets
import signal
import sys
import threading
from typing import BinaryIO
from urllib.parse import parse_qs, unquote, urlsplit
import webbrowser

from trip_storage import MAX_SOURCE_BYTES, StorageError, TripStorage, language_preset, slugify

DEFAULT_PORT = 8765
SOCKET_TIMEOUT = 60
MAX_BODY_BYTES = MAX_SOURCE_BYTES * 2


class EditorServer(ThreadingHTTPServer):
    """Owns storage, one session token and prepared Drive work; workers finish before shutdown."""

    daemon_threads = False
    block_on_close = True

    def __init__(self, root: Path, port: int = DEFAULT_PORT) -> None:
        self.storage = TripStorage(root)
        self.token = secrets.token_urlsafe(32)
        self.generation = None
        super().__init__(('127.0.0.1', port), partial(EditorHandler, directory=str(root)))
        self.origin = f'http://127.0.0.1:{self.server_port}'


class EditorHandler(SimpleHTTPRequestHandler):
    """Routes same-origin editor API requests and denies private/path-escaping static reads."""

    def setup(self) -> None:
        """Set a timeout on the accepted socket before reading any request bytes."""
        self.request.settimeout(SOCKET_TIMEOUT)
        super().setup()

    def _check_request(self, mutation: bool = False) -> None:
        origin = self.server.origin
        if self.headers.get('Host') != origin.removeprefix('http://'):
            raise StorageError('Invalid Host; use the URL opened by the launcher.')
        supplied_origin = self.headers.get('Origin')
        if supplied_origin is not None and supplied_origin != origin:
            raise StorageError('Cross-origin access is not allowed.')
        if self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
            raise StorageError('Cross-site access is not allowed.')
        if mutation and (supplied_origin != origin or not secrets.compare_digest(
                self.headers.get('X-Trip-Token', ''), self.server.token)):
            raise StorageError('Editor session authorization required; reload the editor.')

    def _json(self, status: int, value: dict) -> None:
        data = json.dumps(value, ensure_ascii=True).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        """Serve a validated API read or static file; reject unsafe requests with JSON errors."""
        try:
            self._check_request()
            if urlsplit(self.path).path.startswith('/api/'):
                self._json(200, self._get_api())
            else:
                super().do_GET()
        except FileNotFoundError as error:
            self._json(404, {'error': str(error), 'code': 'not_found'})
        except (StorageError, OSError, UnicodeError, ValueError) as error:
            self._json(400, {'error': str(error)})

    def do_HEAD(self) -> None:
        """Apply the same Host and path checks to static HEAD requests."""
        try:
            self._check_request()
            super().do_HEAD()
        except (StorageError, OSError, ValueError):
            self.send_error(403, 'Request denied')

    def send_head(self) -> BinaryIO | None:
        """Return an opened contained static file; do not expose directories or private paths."""
        relative = unquote(urlsplit(self.path).path).lstrip('/')
        parts = relative.split('/')
        if any(part.startswith('.') or part in ('scripts', '__pycache__') for part in parts) or '\\' in relative:
            raise StorageError('Private paths and traversal are not served.')
        root = self.server.storage.root
        path = root / relative
        if not path.resolve().is_relative_to(root):
            raise StorageError('Path escapes repository.')
        if path.is_dir():
            path = path / 'index.html'
        if not path.resolve().is_relative_to(root) or not path.is_file():
            self.send_error(404, 'File not found')
            return None
        for parent in (path, *path.parents):
            if parent == root:
                break
            if parent.is_symlink():
                raise StorageError('Symlink files are not served.')
        stream = path.open('rb')
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(path.stat().st_size))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        return stream

    def _get_api(self) -> dict:
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == '/api/session':
            return {'token': self.server.token, 'presets': {'bg': language_preset('bg'), 'en': language_preset('en')}}
        if parsed.path == '/api/trips':
            return self.server.storage.discover()
        if parsed.path == '/api/slug':
            return {'slug': slugify(query.get('name', [''])[0])}
        if parsed.path == '/api/file':
            return self.server.storage.read(query.get('trip', [''])[0], query.get('path', [''])[0])
        if parsed.path == '/api/registry-errors':
            slug = query.get('trip', [''])[0]
            registry = self.server.storage.read(slug, 'data/events.js')['value']
            return {'errors': self.server.storage.registry_errors(slug, registry)}
        raise StorageError('Unknown endpoint.')

    def _body(self) -> dict:
        if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
            raise StorageError('Use a bounded JSON request.')
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= MAX_BODY_BYTES:
            raise StorageError('Request is empty or exceeds the size limit.')
        body = json.loads(self.rfile.read(length))
        if not isinstance(body, dict):
            raise StorageError('Request must be a JSON object.')
        return body

    def do_POST(self) -> None:
        """Authorize and execute a bounded mutation; errors never masquerade as success."""
        try:
            self._check_request(mutation=True)
            self._json(200, self._post_api(self._body()))
        except (StorageError, OSError, UnicodeError, ValueError, TypeError, KeyError) as error:
            self._json(400, {'error': str(error)})

    def _post_api(self, body: dict) -> dict:
        path = urlsplit(self.path).path
        store = self.server.storage
        if path == '/api/create':
            return store.create(body.get('name'), body.get('slug'), body.get('language', 'bg'))
        if path == '/api/commit':
            return store.commit(body.get('trip'), body.get('changes'), body.get('versions', {}),
                                body.get('deleteConfirmed') is True)
        if path in ('/api/prepare', '/api/generate'):
            # Import lazily: ordinary offline editing has no Drive work or network dependency.
            from drive_generation import DriveGeneration
            with store.lock:
                if self.server.generation is None:
                    self.server.generation = DriveGeneration(store)
            if path == '/api/prepare':
                return self.server.generation.prepare(body)
            return self.server.generation.commit(body)
        raise StorageError('Unknown endpoint.')


def main() -> int:
    """Run the foreground local service; return failure on missing Python or occupied port."""
    if sys.version_info < (3, 10):
        print('Python 3.10 or newer is required.', file=sys.stderr)
        return 1
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        server = EditorServer(root, args.port)
    except OSError as error:
        print(f'Cannot start editor on port {args.port}: {error}. Close the other server and retry.', file=sys.stderr)
        return 1
    # Signal handlers cannot call shutdown synchronously while serve_forever is on this thread.
    def stop_server(signum: int, frame: object) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop_server)
    if hasattr(signal, 'SIGHUP'):
        signal.signal(signal.SIGHUP, stop_server)
    if hasattr(signal, 'SIGBREAK'):
        signal.signal(signal.SIGBREAK, stop_server)
    url = server.origin + '/trips/data_editor.html'
    print(f'Trip editor: {url}\nPress Ctrl+C or close this terminal to stop. Pending writes finish first.', flush=True)
    if not args.no_browser and not webbrowser.open(url):
        print(f'Browser did not open. Open {url} manually.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping trip editor…', flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
