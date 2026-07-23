"""
verify_browser.py: Chromium runtime checks for the four-page career site.
Part of AIB request R-20260722-2343 browser-verification evidence.
"""

from __future__ import annotations

import base64
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time
from typing import Any, Callable
from urllib.parse import urlparse
from urllib.request import urlopen


BASE_URL = "http://127.0.0.1:8765"
PAGE_ROUTES = ("index.html", "cv.html", "apps.html", "art_drawing.html")
VIEWPORTS = {"desktop": (1440, 1000), "mobile": (320, 900)}
CHROME_COMMAND = (
    "google-chrome",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
)
LOAD_TIMEOUT_SECONDS = 12.0
WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class DevToolsSocket:
    """Minimal masked WebSocket client that owns one Chrome DevTools connection."""

    def __init__(self, websocket_url: str) -> None:
        """Open and validate a WebSocket upgrade for the supplied DevTools URL."""
        parsed_url = urlparse(websocket_url)
        self._socket = socket.create_connection(
            (parsed_url.hostname or "127.0.0.1", parsed_url.port or 80),
            timeout=LOAD_TIMEOUT_SECONDS,
        )
        self._request_id = 0
        self._events: deque[dict[str, Any]] = deque()
        self._upgrade(parsed_url.path or "/")

    def _upgrade(self, resource_path: str) -> None:
        """Perform the HTTP WebSocket upgrade and verify Chrome's accept token."""
        request_key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {resource_path} HTTP/1.1\r\n"
            "Host: 127.0.0.1\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {request_key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self._socket.sendall(request.encode("ascii"))
        response = self._receive_until(b"\r\n\r\n").decode("latin-1")
        expected_accept = base64.b64encode(
            hashlib.sha1(f"{request_key}{WEBSOCKET_GUID}".encode("ascii")).digest()
        ).decode("ascii")
        _require(" 101 " in response, "Chrome rejected the WebSocket upgrade")
        _require(expected_accept in response, "Chrome returned an invalid WebSocket accept")

    def _receive_until(self, delimiter: bytes) -> bytes:
        """Read socket bytes until a required delimiter is present."""
        received = bytearray()
        while delimiter not in received:
            chunk = self._socket.recv(4096)
            _require(bool(chunk), "DevTools socket closed during handshake")
            received.extend(chunk)
        return bytes(received)

    def _receive_exactly(self, length: int) -> bytes:
        """Read exactly the requested number of bytes from the socket."""
        received = bytearray()
        while len(received) < length:
            chunk = self._socket.recv(length - len(received))
            _require(bool(chunk), "DevTools socket closed during frame read")
            received.extend(chunk)
        return bytes(received)

    def _send_text(self, text: str) -> None:
        """Send one client-masked final text frame to Chrome."""
        payload = text.encode("utf-8")
        mask = os.urandom(4)
        if len(payload) < 126:
            length_header = bytes((0x80 | len(payload),))
        elif len(payload) <= 0xFFFF:
            length_header = bytes((0x80 | 126,)) + struct.pack(">H", len(payload))
        else:
            length_header = bytes((0x80 | 127,)) + struct.pack(">Q", len(payload))
        masked_payload = bytes(
            payload[index] ^ mask[index % 4] for index in range(len(payload))
        )
        self._socket.sendall(b"\x81" + length_header + mask + masked_payload)

    def _receive_message(self) -> dict[str, Any]:
        """Receive the next JSON DevTools message, answering WebSocket pings."""
        while True:
            first_byte, second_byte = self._receive_exactly(2)
            opcode = first_byte & 0x0F
            payload_length = second_byte & 0x7F
            if payload_length == 126:
                payload_length = struct.unpack(">H", self._receive_exactly(2))[0]
            elif payload_length == 127:
                payload_length = struct.unpack(">Q", self._receive_exactly(8))[0]
            payload = self._receive_exactly(payload_length)
            if opcode == 0x8:
                raise ConnectionError("Chrome closed the DevTools WebSocket")
            if opcode == 0x9:
                self._socket.sendall(b"\x8a" + bytes((len(payload),)) + payload)
                continue
            if opcode == 0x1:
                return json.loads(payload.decode("utf-8"))

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Send one CDP command and return its result after preserving events."""
        self._request_id += 1
        request_id = self._request_id
        self._send_text(
            json.dumps({"id": request_id, "method": method, "params": params or {}})
        )
        while True:
            message = self._receive_message()
            if message.get("id") == request_id:
                _require("error" not in message, f"{method}: {message.get('error')}")
                return message.get("result", {})
            if "method" in message:
                self._events.append(message)

    def wait_for_event(
        self,
        method: str,
        predicate: Callable[[dict[str, Any]], bool] | None = None,
    ) -> dict[str, Any]:
        """Wait for one named CDP event whose parameters meet an optional predicate."""
        deadline = time.monotonic() + LOAD_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            for event in tuple(self._events):
                event_params = event.get("params", {})
                event_matches = event.get("method") == method
                predicate_matches = predicate is None or predicate(event_params)
                if event_matches and predicate_matches:
                    self._events.remove(event)
                    return event_params
            message = self._receive_message()
            message_params = message.get("params", {})
            message_matches = message.get("method") == method
            predicate_matches = predicate is None or predicate(message_params)
            if message_matches and predicate_matches:
                return message_params
            if "method" in message:
                self._events.append(message)
        raise TimeoutError(f"Timed out waiting for {method}")

    def close(self) -> None:
        """Close the owned DevTools WebSocket connection."""
        self._socket.close()


def _require(condition: bool, message: str) -> None:
    """Raise a readable browser-verification failure when a condition is false."""
    if not condition:
        raise AssertionError(message)


def _free_port() -> int:
    """Reserve and return one currently free localhost TCP port."""
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        return reservation.getsockname()[1]


def _wait_for_debugger(port: int) -> dict[str, Any]:
    """Wait for Chrome's first debuggable page and return its metadata."""
    deadline = time.monotonic() + LOAD_TIMEOUT_SECONDS
    endpoint = f"http://127.0.0.1:{port}/json"
    while time.monotonic() < deadline:
        try:
            with urlopen(endpoint, timeout=1.0) as response:
                pages = json.loads(response.read().decode("utf-8"))
                page_targets = [page for page in pages if page.get("type") == "page"]
                if page_targets:
                    return page_targets[0]
        except OSError:
            time.sleep(0.1)
    raise TimeoutError("Chrome DevTools endpoint did not become ready")


def _evaluate(client: DevToolsSocket, expression: str) -> Any:
    """Evaluate JavaScript in the current page and return the serialized value."""
    result = client.call(
        "Runtime.evaluate",
        {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
        },
    )
    value = result.get("result", {})
    _require("exceptionDetails" not in result, f"Runtime exception: {result}")
    return value.get("value")


def _set_viewport(client: DevToolsSocket, width: int, height: int) -> None:
    """Apply an exact CSS-pixel viewport to the active browser page."""
    client.call(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": width,
            "height": height,
            "deviceScaleFactor": 1,
            "mobile": False,
        },
    )


def _wait_for_document(client: DevToolsSocket, route: str) -> None:
    """Wait until the requested route reports a complete DOM through Runtime."""
    deadline = time.monotonic() + LOAD_TIMEOUT_SECONDS
    expected_suffix = f"/{route}"
    last_state: Any = None
    while time.monotonic() < deadline:
        try:
            last_state = _evaluate(
                client,
                "({ url: window.location.href, readyState: document.readyState })",
            )
            if (
                last_state["url"].endswith(expected_suffix)
                and last_state["readyState"] == "complete"
            ):
                return
        except (AssertionError, KeyError, TypeError):
            # Navigation can briefly destroy the previous execution context.
            pass
        time.sleep(0.05)
    raise TimeoutError(f"Timed out waiting for {route}; last state: {last_state!r}")


def _navigate(client: DevToolsSocket, route: str) -> None:
    """Navigate to one local route and wait for layout and observers to settle."""
    client.call("Page.navigate", {"url": f"{BASE_URL}/{route}"})
    _wait_for_document(client, route)
    _evaluate(
        client,
        "new Promise((resolve) => setTimeout(() => { window.scrollTo(0, 0); "
        "resolve(true); }, 250))",
    )


def _page_metrics(client: DevToolsSocket) -> dict[str, Any]:
    """Collect responsive, media, navigation, and natural-image measurements."""
    expression = """
    (() => {
      const navLinks = [...document.querySelectorAll(".site-nav__link")];
      const revealTargets = [...document.querySelectorAll("[data-reveal]")];
      const artImages = [...document.querySelectorAll(".art-card__image")];
      const ratioFailures = artImages.filter((image) => {
        const rect = image.getBoundingClientRect();
        const expected = Number(image.getAttribute("width")) /
          Number(image.getAttribute("height"));
        return rect.height > 0 && Math.abs((rect.width / rect.height) - expected) > 0.015;
      }).length;
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        navCount: navLinks.length,
        currentCount: navLinks.filter((link) => link.matches("[aria-current=page]")).length,
        clippedNavCount: navLinks.filter((link) => {
          const rect = link.getBoundingClientRect();
          return rect.left < 0 || rect.right > window.innerWidth ||
            rect.top < 0 || rect.bottom > window.innerHeight;
        }).length,
        hiddenRevealCount: revealTargets.filter((target) => {
          const style = getComputedStyle(target);
          return style.display === "none" || style.visibility === "hidden" ||
            Number(style.opacity) === 0;
        }).length,
        transformedRevealCount: revealTargets.filter((target) =>
          getComputedStyle(target).transform !== "none"
        ).length,
        projectCardCount: document.querySelectorAll(".project-card").length,
        artFigureCount: document.querySelectorAll(".art-card").length,
        profilePanelCount: document.querySelectorAll(".profile-panel").length,
        ratioFailures,
        bodyTextLength: document.body.innerText.trim().length
      };
    })()
    """
    return _evaluate(client, expression)


def _save_screenshot(
    client: DevToolsSocket,
    route: str,
    viewport_name: str,
) -> None:
    """Capture the current top-of-page viewport into a PNG under /tmp."""
    result = client.call(
        "Page.captureScreenshot",
        {"format": "png", "fromSurface": True, "captureBeyondViewport": False},
    )
    output_name = f"aib-{Path(route).stem}-{viewport_name}.png"
    Path("/tmp", output_name).write_bytes(base64.b64decode(result["data"]))


def _verify_normal_layout(client: DevToolsSocket) -> None:
    """Verify both viewports for overflow, navigation clipping, and image ratios."""
    client.call("Emulation.setScriptExecutionDisabled", {"value": False})
    client.call("Emulation.setEmulatedMedia", {"media": "screen", "features": []})
    for viewport_name, (width, height) in VIEWPORTS.items():
        _set_viewport(client, width, height)
        for route in PAGE_ROUTES:
            _navigate(client, route)
            metrics = _page_metrics(client)
            _require(metrics["innerWidth"] == width, f"{route}: viewport is not {width}")
            _require(
                metrics["scrollWidth"] <= metrics["clientWidth"],
                f"{route}: horizontal overflow at {width}px",
            )
            _require(metrics["clippedNavCount"] == 0, f"{route}: clipped navigation")
            _require(metrics["navCount"] == 4, f"{route}: navigation count")
            _require(metrics["currentCount"] == 1, f"{route}: current-page count")
            _require(metrics["ratioFailures"] == 0, f"{route}: distorted artwork")
            _save_screenshot(client, route, viewport_name)


def _verify_script_failure(client: DevToolsSocket) -> None:
    """Verify essential content remains visible when page JavaScript is disabled."""
    _set_viewport(client, *VIEWPORTS["mobile"])
    for route in PAGE_ROUTES:
        client.call("Emulation.setScriptExecutionDisabled", {"value": True})
        client.call("Page.navigate", {"url": f"{BASE_URL}/{route}"})
        # Static local pages complete well inside this pause while scripts remain disabled.
        time.sleep(0.5)
        client.call("Emulation.setScriptExecutionDisabled", {"value": False})
        _wait_for_document(client, route)
        metrics = _page_metrics(client)
        _require(metrics["navCount"] == 4, f"{route}: no-script navigation")
        _require(metrics["hiddenRevealCount"] == 0, f"{route}: no-script hidden content")
        _require(metrics["bodyTextLength"] > 300, f"{route}: no-script content absent")
        if route == "apps.html":
            _require(metrics["projectCardCount"] == 2, "apps.html: no-script projects")
        if route == "art_drawing.html":
            _require(metrics["artFigureCount"] == 13, "art: no-script figures")
        _save_screenshot(client, route, "nojs")


def _verify_reduced_motion(client: DevToolsSocket) -> None:
    """Verify reduced-motion preference removes all reveal transforms."""
    client.call(
        "Emulation.setEmulatedMedia",
        {
            "media": "screen",
            "features": [{"name": "prefers-reduced-motion", "value": "reduce"}],
        },
    )
    for route in PAGE_ROUTES:
        _navigate(client, route)
        metrics = _page_metrics(client)
        _require(metrics["hiddenRevealCount"] == 0, f"{route}: reduced-motion hidden")
        _require(metrics["transformedRevealCount"] == 0, f"{route}: reduced transform")
        _save_screenshot(client, route, "reduced-motion")
    client.call("Emulation.setEmulatedMedia", {"media": "screen", "features": []})


def _dispatch_key(client: DevToolsSocket, key: str, code: str) -> None:
    """Dispatch one complete keyboard key press through the browser input domain."""
    client.call(
        "Input.dispatchKeyEvent",
        {"type": "rawKeyDown", "key": key, "code": code},
    )
    client.call(
        "Input.dispatchKeyEvent",
        {"type": "keyUp", "key": key, "code": code},
    )


def _verify_keyboard(client: DevToolsSocket) -> None:
    """Verify skip-link focus, visible focus treatment, and Enter activation."""
    _set_viewport(client, *VIEWPORTS["desktop"])
    _navigate(client, "index.html")
    _evaluate(client, "document.activeElement.blur(); true")
    _dispatch_key(client, "Tab", "Tab")
    focus_state = _evaluate(
        client,
        """
        (() => {
          const active = document.activeElement;
          const style = getComputedStyle(active);
          return {
            className: active.className,
            outlineWidth: parseFloat(style.outlineWidth),
            rectTop: active.getBoundingClientRect().top
          };
        })()
        """,
    )
    _require("site-skip-link" in focus_state["className"], "Tab did not reach skip link")
    _require(focus_state["outlineWidth"] > 0, "Skip link lacks visible focus")
    _require(focus_state["rectTop"] >= 0, "Focused skip link is obscured")
    _dispatch_key(client, "Enter", "Enter")
    _require(
        _evaluate(client, "window.location.hash") == "#main-content",
        "Skip link did not activate with Enter",
    )


def _run_browser_checks(client: DevToolsSocket) -> None:
    """Enable required CDP domains and run the complete browser check suite."""
    client.call("Page.enable")
    client.call("Runtime.enable")
    _verify_normal_layout(client)
    _verify_script_failure(client)
    _verify_reduced_motion(client)
    _verify_keyboard(client)


def main() -> None:
    """Launch isolated Chromium, execute runtime checks, and report success."""
    debugger_port = _free_port()
    with tempfile.TemporaryDirectory(prefix="aib-browser-profile-") as profile_dir:
        command = (
            *CHROME_COMMAND,
            f"--remote-debugging-port={debugger_port}",
            f"--user-data-dir={profile_dir}",
            "about:blank",
        )
        chrome = subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        client: DevToolsSocket | None = None
        try:
            page = _wait_for_debugger(debugger_port)
            client = DevToolsSocket(page["webSocketDebuggerUrl"])
            _run_browser_checks(client)
        finally:
            if client is not None:
                client.close()
            chrome.terminate()
            chrome.wait(timeout=5)
    print("PASS: desktop, 320px, no-script, reduced-motion, natural-ratio, keyboard")


if __name__ == "__main__":
    main()
