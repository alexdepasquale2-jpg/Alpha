#!/usr/bin/env python3
"""Ironfield host.

Serves the game in web/ and provides a small JSON save API backed by files in
saves/. Standard library only -- no pip install, no build step.

    python3 server.py                 # http://localhost:8000
    python3 server.py --port 9000
    python3 server.py --saves-dir /var/ironfield/saves
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import tempfile
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
DEFAULT_SAVES_DIR = ROOT / "saves"

# Save slots become filenames, so keep them boring.
SLOT_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
MAX_BODY_BYTES = 1024 * 1024

# Python's mimetypes database is seeded from the host OS, which on some systems
# still maps .js to text/plain. ES modules are rejected outright under the wrong
# type, so pin the ones we care about.
EXTRA_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
}


class IronfieldHandler(SimpleHTTPRequestHandler):
    """Static files from web/, plus /api/save* endpoints."""

    saves_dir: Path = DEFAULT_SAVES_DIR
    server_version = "Ironfield"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    # ---- routing -----------------------------------------------------------

    def do_GET(self):
        if self.path.split("?", 1)[0].rstrip("/") == "/api/saves":
            return self._list_saves()
        slot = self._slot_from_path()
        if slot is not None:
            return self._read_save(slot)
        if self.path.startswith("/api/"):
            return self._send_json(HTTPStatus.NOT_FOUND, {"error": "unknown endpoint"})
        return super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/api/"):
            return self._send_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "HEAD not supported"})
        return super().do_HEAD()

    def do_POST(self):
        slot = self._slot_from_path()
        if slot is None:
            return self._send_json(HTTPStatus.NOT_FOUND, {"error": "unknown endpoint"})
        return self._write_save(slot)

    def do_DELETE(self):
        slot = self._slot_from_path()
        if slot is None:
            return self._send_json(HTTPStatus.NOT_FOUND, {"error": "unknown endpoint"})
        return self._delete_save(slot)

    def _slot_from_path(self) -> str | None:
        """Return the slot name for /api/save/<slot>, or None if not that route.

        Returns None rather than raising for a malformed slot; callers fall
        through to a 404 so we never leak whether a rejected name exists.
        """
        path = self.path.split("?", 1)[0].rstrip("/")
        prefix = "/api/save/"
        if not path.startswith(prefix):
            return None
        slot = path[len(prefix):]
        return slot if SLOT_RE.match(slot) else None

    # ---- save API ----------------------------------------------------------

    def _slot_path(self, slot: str) -> Path:
        path = (self.saves_dir / f"{slot}.json").resolve()
        # SLOT_RE already forbids separators and dots; this is the belt to that
        # suspenders, in case the pattern is ever loosened.
        if not path.is_relative_to(self.saves_dir.resolve()):
            raise ValueError("slot escapes saves directory")
        return path

    def _list_saves(self):
        slots = []
        if self.saves_dir.is_dir():
            for path in sorted(self.saves_dir.glob("*.json")):
                if not SLOT_RE.match(path.stem):
                    continue
                entry = {"slot": path.stem, "bytes": path.stat().st_size,
                         "modified": path.stat().st_mtime}
                try:
                    with path.open(encoding="utf-8") as fh:
                        meta = (json.load(fh) or {}).get("meta", {})
                    entry["summary"] = {
                        key: meta.get(key)
                        for key in ("farmName", "day", "season", "year", "gold", "savedAt")
                    }
                except (json.JSONDecodeError, OSError, AttributeError):
                    entry["summary"] = None  # corrupt file: list it, flag it
                slots.append(entry)
        self._send_json(HTTPStatus.OK, {"slots": slots})

    def _read_save(self, slot: str):
        try:
            path = self._slot_path(slot)
        except ValueError:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad slot"})
        if not path.is_file():
            return self._send_json(HTTPStatus.NOT_FOUND, {"error": "no such save"})
        try:
            body = path.read_bytes()
        except OSError as exc:
            return self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        self._send_bytes(HTTPStatus.OK, body, "application/json; charset=utf-8")

    def _write_save(self, slot: str):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad content-length"})
        if length <= 0:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "empty body"})
        if length > MAX_BODY_BYTES:
            return self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                                   {"error": f"body exceeds {MAX_BODY_BYTES} bytes"})

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": f"invalid JSON: {exc}"})
        if not isinstance(payload, dict):
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "save must be an object"})

        try:
            path = self._slot_path(slot)
        except ValueError:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad slot"})

        payload.setdefault("meta", {})
        if isinstance(payload["meta"], dict):
            payload["meta"]["savedAt"] = payload["meta"].get("savedAt") or time.time()

        try:
            self.saves_dir.mkdir(parents=True, exist_ok=True)
            self._atomic_write(path, json.dumps(payload, separators=(",", ":")))
        except OSError as exc:
            return self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        self._send_json(HTTPStatus.OK, {"ok": True, "slot": slot,
                                        "savedAt": payload["meta"].get("savedAt")})

    def _delete_save(self, slot: str):
        try:
            path = self._slot_path(slot)
        except ValueError:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad slot"})
        if not path.is_file():
            return self._send_json(HTTPStatus.NOT_FOUND, {"error": "no such save"})
        try:
            path.unlink()
        except OSError as exc:
            return self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        self._send_json(HTTPStatus.OK, {"ok": True, "slot": slot})

    @staticmethod
    def _atomic_write(path: Path, text: str) -> None:
        """Write via temp file + rename so a crash never truncates a save."""
        fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(text)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp_name, path)
        except BaseException:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

    # ---- responses ---------------------------------------------------------

    def _send_json(self, status: HTTPStatus, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self._send_bytes(status, body, "application/json; charset=utf-8")

    def _send_bytes(self, status: HTTPStatus, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def guess_type(self, path):
        suffix = Path(str(path)).suffix.lower()
        return EXTRA_TYPES.get(suffix) or super().guess_type(path)

    def end_headers(self):
        # Dev server: never let a stale module survive a reload.
        if "Cache-Control" not in self._headers_buffer_keys():
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _headers_buffer_keys(self) -> set[str]:
        keys = set()
        for raw in getattr(self, "_headers_buffer", []):
            line = raw.decode("latin-1", "replace")
            if ":" in line:
                keys.add(line.split(":", 1)[0].strip())
        return keys

    def log_message(self, fmt, *args):
        # Quieter than the default, and on stderr so piping the URL works.
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def detect_lan_ip() -> str | None:
    """Best-effort local address, for opening the game on a phone."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(0.2)
            sock.connect(("10.255.255.255", 1))  # never actually sends a packet
            return sock.getsockname()[0]
    except OSError:
        return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Serve the Ironfield game.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--saves-dir", type=Path, default=DEFAULT_SAVES_DIR)
    args = parser.parse_args(argv)

    if not WEB_ROOT.is_dir():
        print(f"error: {WEB_ROOT} not found", file=sys.stderr)
        return 1

    saves_dir = args.saves_dir.resolve()
    saves_dir.mkdir(parents=True, exist_ok=True)
    IronfieldHandler.saves_dir = saves_dir

    httpd = ThreadingHTTPServer((args.host, args.port), IronfieldHandler)
    httpd.daemon_threads = True

    print("Ironfield")
    print(f"  local    http://localhost:{args.port}")
    lan = detect_lan_ip()
    if lan and args.host in ("0.0.0.0", "::"):
        print(f"  phone    http://{lan}:{args.port}")
    print(f"  saves    {saves_dir}")
    print("Ctrl-C to stop.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
