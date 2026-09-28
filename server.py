#!/usr/bin/env python3
"""Loopwright host.

Serves the app in web/ and a small community API so everyone using the same
server (a crochet circle, a guild, a stall at a craft fair) can post progress,
comment, like, and hand each other patterns by short code.

    python3 server.py                  # http://localhost:8000
    python3 server.py --port 9000
    python3 server.py --data-dir /var/loopwright

Standard library only. No accounts: people pick a display name, and every post
or comment comes back with a secret token that is the only way to delete it.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import socket
import sys
import tempfile
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
DEFAULT_DATA_DIR = ROOT / "data"

ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,40}$")
CODE_RE = re.compile(r"^[A-HJ-NP-Z2-9]{8}$")
MEDIA_RE = re.compile(r"^[A-Za-z0-9_-]{6,40}-\d{1,2}\.(jpg|png|webp|gif)$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
TAG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
DATA_URL_RE = re.compile(r"^data:image/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I

MAX_POST_BODY = 8 * 1024 * 1024
MAX_SMALL_BODY = 64 * 1024
MAX_SHARE_BODY = 2 * 1024 * 1024
MAX_IMAGES = 4
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_POSTS = 5000
MAX_COMMENTS = 300

MAGIC = {
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "gif": (b"GIF87a", b"GIF89a"),
    "webp": (b"RIFF",),
}
EXT = {"jpeg": "jpg", "png": "png", "webp": "webp", "gif": "gif"}

# Python's mimetypes table comes from the host OS, which can map .js to
# text/plain. Module scripts are refused under the wrong type, so pin them.
EXTRA_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

CSP = (
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
    "media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)


def now_ms() -> int:
    return int(time.time() * 1000)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def clean_text(value, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    # Strip control characters except newlines and tabs.
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return value.strip()[:limit]


class Store:
    """Community state: posts in one JSON file, shares and media alongside."""

    def __init__(self, data_dir: Path):
        self.dir = data_dir
        self.media_dir = data_dir / "media"
        self.shares_dir = data_dir / "shares"
        self.posts_path = data_dir / "community.json"
        self.lock = threading.Lock()
        for d in (self.dir, self.media_dir, self.shares_dir):
            d.mkdir(parents=True, exist_ok=True)
        self.posts: list[dict] = []
        if self.posts_path.exists():
            try:
                self.posts = json.loads(self.posts_path.read_text("utf-8")).get("posts", [])
            except (OSError, ValueError):
                backup = self.posts_path.with_suffix(f".broken-{int(time.time())}.json")
                self.posts_path.rename(backup)
                print(f"community.json was unreadable; moved it to {backup.name}", file=sys.stderr)

    def _write_atomic(self, path: Path, data: bytes) -> None:
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def save(self) -> None:
        self._write_atomic(self.posts_path, json.dumps({"posts": self.posts}, separators=(",", ":")).encode("utf-8"))

    def find(self, post_id: str):
        for post in self.posts:
            if post["id"] == post_id:
                return post
        return None

    def remove_media(self, post: dict) -> None:
        for url in post.get("images", []):
            name = url.rsplit("/", 1)[-1]
            if MEDIA_RE.match(name):
                try:
                    (self.media_dir / name).unlink()
                except FileNotFoundError:
                    pass


def public_post(post: dict, client_hash: str | None = None) -> dict:
    """What anyone may see of a post: no token hashes, no like identities."""
    likes = post.get("likes", [])
    return {
        "id": post["id"],
        "at": post["at"],
        "author": post["author"],
        "text": post["text"],
        "tags": post.get("tags", []),
        "images": post.get("images", []),
        "attachment": post.get("attachment"),
        "likes": len(likes),
        "liked": bool(client_hash and client_hash in likes),
        "comments": [
            {"id": c["id"], "at": c["at"], "author": c["author"], "text": c["text"]}
            for c in post.get("comments", [])
        ],
    }


class RateLimiter:
    """A token bucket per client address for anything that writes."""

    def __init__(self, per_minute: int = 30):
        self.rate = per_minute / 60.0
        self.cap = float(per_minute)
        self.buckets: dict[str, tuple[float, float]] = {}
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        t = time.monotonic()
        with self.lock:
            tokens, last = self.buckets.get(key, (self.cap, t))
            tokens = min(self.cap, tokens + (t - last) * self.rate)
            if tokens < 1:
                self.buckets[key] = (tokens, t)
                return False
            self.buckets[key] = (tokens - 1, t)
            if len(self.buckets) > 10000:
                self.buckets.clear()
            return True


class LoopwrightHandler(SimpleHTTPRequestHandler):
    store: Store
    limiter: RateLimiter
    server_version = "Loopwright"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    # ---- plumbing -----------------------------------------------------------

    def guess_type(self, path):
        ext = os.path.splitext(str(path))[1].lower()
        return EXTRA_TYPES.get(ext) or super().guess_type(path)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        if not self.path.startswith("/api/"):
            self.send_header("Content-Security-Policy", CSP)
            # Always revalidate the app shell; the service worker handles offline.
            if not self.path.startswith("/media/"):
                self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):
        # Folders are never browsable; only files the app asks for are served.
        self._error(HTTPStatus.NOT_FOUND, "not found")
        return None

    def log_message(self, fmt, *args):
        if os.environ.get("LOOPWRIGHT_QUIET"):
            return
        super().log_message(fmt, *args)

    def _route(self):
        return urlsplit(self.path).path.rstrip("/") or "/"

    def _query(self):
        return {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}

    def _send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        return self._send_json(status, {"error": message})

    def _read_json(self, limit):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0:
            self._error(HTTPStatus.BAD_REQUEST, "missing length")
            return None
        if length > limit:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, f"body over {limit // 1024} KB")
            return None
        ctype = self.headers.get("Content-Type", "")
        if not ctype.startswith("application/json"):
            self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "send application/json")
            return None
        try:
            data = json.loads(self.rfile.read(length) or b"null")
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "invalid JSON")
            return None
        if not isinstance(data, dict):
            self._error(HTTPStatus.BAD_REQUEST, "expected an object")
            return None
        return data

    def _rate_ok(self):
        if self.limiter.allow(self.client_address[0]):
            return True
        self._error(HTTPStatus.TOO_MANY_REQUESTS, "slow down a little")
        return False

    def _client_hash(self):
        cid = self.headers.get("X-Loopwright-Client", "")
        return digest("client:" + cid)[:24] if ID_RE.match(cid) else None

    def _author(self, raw):
        if not isinstance(raw, dict):
            return None
        name = clean_text(raw.get("name"), 40)
        aid = raw.get("id") if isinstance(raw.get("id"), str) and ID_RE.match(raw.get("id")) else None
        color = raw.get("color") if isinstance(raw.get("color"), str) and COLOR_RE.match(raw.get("color")) else "#b7410e"
        if not name or not aid:
            return None
        # The public author id is a hash, so posting never leaks the device id.
        return {"id": digest("author:" + aid)[:16], "name": name, "color": color}

    # ---- routing ------------------------------------------------------------

    def do_GET(self):
        route = self._route()
        if route == "/api/health":
            return self._send_json(HTTPStatus.OK, {"ok": True, "app": "loopwright", "version": VERSION, "community": True})
        if route == "/api/posts":
            return self._list_posts()
        m = re.match(r"^/api/shares/([A-Za-z0-9]+)$", route)
        if m:
            return self._get_share(m.group(1).upper())
        m = re.match(r"^/media/([^/]+)$", route)
        if m:
            return self._media(m.group(1))
        if route.startswith("/api/"):
            return self._error(HTTPStatus.NOT_FOUND, "unknown endpoint")
        return super().do_GET()

    def do_HEAD(self):
        if self._route().startswith("/api/"):
            return self._error(HTTPStatus.METHOD_NOT_ALLOWED, "HEAD not supported")
        return super().do_HEAD()

    def do_POST(self):
        route = self._route()
        if route == "/api/posts":
            return self._create_post()
        if route == "/api/shares":
            return self._create_share()
        m = re.match(r"^/api/posts/([A-Za-z0-9_-]+)/(like|comments)$", route)
        if m:
            return self._like(m.group(1)) if m.group(2) == "like" else self._comment(m.group(1))
        return self._error(HTTPStatus.NOT_FOUND, "unknown endpoint")

    def do_DELETE(self):
        route = self._route()
        m = re.match(r"^/api/posts/([A-Za-z0-9_-]+)$", route)
        if m:
            return self._delete_post(m.group(1))
        m = re.match(r"^/api/posts/([A-Za-z0-9_-]+)/comments/([A-Za-z0-9_-]+)$", route)
        if m:
            return self._delete_comment(m.group(1), m.group(2))
        return self._error(HTTPStatus.NOT_FOUND, "unknown endpoint")

    def do_PUT(self):
        return self._error(HTTPStatus.METHOD_NOT_ALLOWED, "not supported")

    # ---- posts --------------------------------------------------------------

    def _list_posts(self):
        q = self._query()
        tag = q.get("tag", "").lower()
        author = q.get("author", "")
        try:
            limit = max(1, min(50, int(q.get("limit", "20"))))
            before = int(q.get("before", "0")) or None
        except ValueError:
            return self._error(HTTPStatus.BAD_REQUEST, "bad paging")
        me = self._client_hash()
        with self.store.lock:
            posts = sorted(self.store.posts, key=lambda p: p["at"], reverse=True)
            if tag:
                posts = [p for p in posts if tag in p.get("tags", [])]
            if author:
                posts = [p for p in posts if p["author"]["id"] == author]
            if before:
                posts = [p for p in posts if p["at"] < before]
            page = [public_post(p, me) for p in posts[:limit]]
            counts: dict[str, int] = {}
            for p in self.store.posts[-500:]:
                for t in p.get("tags", []):
                    counts[t] = counts.get(t, 0) + 1
        trending = [t for t, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:12]]
        return self._send_json(HTTPStatus.OK, {"posts": page, "more": len(posts) > limit, "tags": trending})

    def _save_images(self, post_id, images):
        urls = []
        for i, data_url in enumerate(images[:MAX_IMAGES]):
            if not isinstance(data_url, str):
                raise ValueError("image must be a data URL")
            m = DATA_URL_RE.match(data_url)
            if not m:
                raise ValueError("images must be JPEG, PNG, WebP or GIF data URLs")
            kind = m.group(1)
            try:
                raw = base64.b64decode(m.group(2), validate=True)
            except ValueError:
                raise ValueError("image data is not valid base64") from None
            if len(raw) > MAX_IMAGE_BYTES:
                raise ValueError("an image is over 2 MB; shrink it first")
            if not any(raw.startswith(sig) for sig in MAGIC[kind]) or (kind == "webp" and raw[8:12] != b"WEBP"):
                raise ValueError("image content does not match its type")
            name = f"{post_id}-{i}.{EXT[kind]}"
            self.store._write_atomic(self.store.media_dir / name, raw)
            urls.append(f"/media/{name}")
        return urls

    def _create_post(self):
        if not self._rate_ok():
            return None
        data = self._read_json(MAX_POST_BODY)
        if data is None:
            return None
        author = self._author(data.get("author"))
        if not author:
            return self._error(HTTPStatus.BAD_REQUEST, "pick a display name first")
        text = clean_text(data.get("text"), 4000)
        images = data.get("images") or []
        if not isinstance(images, list):
            return self._error(HTTPStatus.BAD_REQUEST, "images must be a list")
        if not text and not images:
            return self._error(HTTPStatus.BAD_REQUEST, "a post needs words or a photo")
        tags = []
        for t in data.get("tags") or []:
            t = str(t).lower().lstrip("#")
            if TAG_RE.match(t) and t not in tags:
                tags.append(t)
        tags = tags[:10]
        attachment = None
        att = data.get("attachment")
        if isinstance(att, dict):
            code = att.get("code")
            if isinstance(code, str) and CODE_RE.match(code):
                attachment = {
                    "code": code,
                    "kind": clean_text(att.get("kind"), 20),
                    "title": clean_text(att.get("title"), 120),
                }
        post_id = secrets.token_urlsafe(9)
        try:
            urls = self._save_images(post_id, images)
        except ValueError as exc:
            return self._error(HTTPStatus.BAD_REQUEST, str(exc))
        token = secrets.token_urlsafe(18)
        post = {
            "id": post_id,
            "at": now_ms(),
            "author": author,
            "text": text,
            "tags": tags,
            "images": urls,
            "attachment": attachment,
            "likes": [],
            "comments": [],
            "token": digest(token),
        }
        with self.store.lock:
            self.store.posts.append(post)
            if len(self.store.posts) > MAX_POSTS:
                for old in self.store.posts[: len(self.store.posts) - MAX_POSTS]:
                    self.store.remove_media(old)
                self.store.posts = self.store.posts[-MAX_POSTS:]
            self.store.save()
        return self._send_json(HTTPStatus.CREATED, {"post": public_post(post), "token": token})

    def _token_ok(self, stored):
        token = self.headers.get("X-Loopwright-Token", "")
        return bool(token) and secrets.compare_digest(digest(token), stored)

    def _delete_post(self, post_id):
        with self.store.lock:
            post = self.store.find(post_id)
            if not post:
                return self._error(HTTPStatus.NOT_FOUND, "no such post")
            if not self._token_ok(post["token"]):
                return self._error(HTTPStatus.FORBIDDEN, "only the author can delete this")
            self.store.posts.remove(post)
            self.store.remove_media(post)
            self.store.save()
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()
        return None

    def _like(self, post_id):
        if not self._rate_ok():
            return None
        me = self._client_hash()
        if not me:
            return self._error(HTTPStatus.BAD_REQUEST, "missing client id")
        with self.store.lock:
            post = self.store.find(post_id)
            if not post:
                return self._error(HTTPStatus.NOT_FOUND, "no such post")
            likes = post.setdefault("likes", [])
            if me in likes:
                likes.remove(me)
            else:
                likes.append(me)
            self.store.save()
            result = {"likes": len(likes), "liked": me in likes}
        return self._send_json(HTTPStatus.OK, result)

    def _comment(self, post_id):
        if not self._rate_ok():
            return None
        data = self._read_json(MAX_SMALL_BODY)
        if data is None:
            return None
        author = self._author(data.get("author"))
        text = clean_text(data.get("text"), 1000)
        if not author or not text:
            return self._error(HTTPStatus.BAD_REQUEST, "a comment needs a name and some words")
        token = secrets.token_urlsafe(18)
        comment = {"id": secrets.token_urlsafe(9), "at": now_ms(), "author": author, "text": text, "token": digest(token)}
        with self.store.lock:
            post = self.store.find(post_id)
            if not post:
                return self._error(HTTPStatus.NOT_FOUND, "no such post")
            comments = post.setdefault("comments", [])
            if len(comments) >= MAX_COMMENTS:
                return self._error(HTTPStatus.CONFLICT, "this post has all the comments it can hold")
            comments.append(comment)
            self.store.save()
        public = {k: comment[k] for k in ("id", "at", "author", "text")}
        return self._send_json(HTTPStatus.CREATED, {"comment": public, "token": token})

    def _delete_comment(self, post_id, comment_id):
        with self.store.lock:
            post = self.store.find(post_id)
            comment = next((c for c in (post or {}).get("comments", []) if c["id"] == comment_id), None)
            if not comment:
                return self._error(HTTPStatus.NOT_FOUND, "no such comment")
            if not (self._token_ok(comment["token"]) or self._token_ok(post["token"])):
                return self._error(HTTPStatus.FORBIDDEN, "only the commenter or the post's author can delete this")
            post["comments"].remove(comment)
            self.store.save()
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()
        return None

    # ---- shares -------------------------------------------------------------

    def _create_share(self):
        if not self._rate_ok():
            return None
        data = self._read_json(MAX_SHARE_BODY)
        if data is None:
            return None
        envelope = data.get("envelope")
        if not isinstance(envelope, dict) or envelope.get("app") != "loopwright" or not isinstance(envelope.get("kind"), str):
            return self._error(HTTPStatus.BAD_REQUEST, "not a Loopwright share")
        body = json.dumps(envelope, separators=(",", ":")).encode("utf-8")
        with self.store.lock:
            for _ in range(20):
                code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
                path = self.store.shares_dir / f"{code}.json"
                if not path.exists():
                    break
            else:
                return self._error(HTTPStatus.SERVICE_UNAVAILABLE, "could not allocate a code")
            self.store._write_atomic(path, body)
        return self._send_json(HTTPStatus.CREATED, {"code": code})

    def _get_share(self, code):
        if not CODE_RE.match(code):
            return self._error(HTTPStatus.NOT_FOUND, "no such share")
        path = self.store.shares_dir / f"{code}.json"
        try:
            envelope = json.loads(path.read_text("utf-8"))
        except (OSError, ValueError):
            return self._error(HTTPStatus.NOT_FOUND, "no such share")
        return self._send_json(HTTPStatus.OK, {"code": code, "envelope": envelope})

    # ---- media --------------------------------------------------------------

    def _media(self, name):
        if not MEDIA_RE.match(name):
            return self._error(HTTPStatus.NOT_FOUND, "no such file")
        path = self.store.media_dir / name
        try:
            raw = path.read_bytes()
        except OSError:
            return self._error(HTTPStatus.NOT_FOUND, "no such file")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", EXTRA_TYPES["." + name.rsplit(".", 1)[1]])
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(raw)
        return None


def lan_address() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def make_server(host: str, port: int, data_dir: Path) -> ThreadingHTTPServer:
    handler = type("Handler", (LoopwrightHandler,), {"store": Store(data_dir), "limiter": RateLimiter()})
    return ThreadingHTTPServer((host, port), handler)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Serve Loopwright and its community board.")
    parser.add_argument("--host", default="0.0.0.0", help="address to bind (default: all interfaces)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    parser.add_argument("--data-dir", type=Path, default=Path(os.environ.get("LOOPWRIGHT_DATA", DEFAULT_DATA_DIR)))
    args = parser.parse_args(argv)
    if not (WEB_ROOT / "index.html").exists():
        print(f"Can't find the app at {WEB_ROOT}. Keep server.py next to the web/ folder.", file=sys.stderr)
        return 1
    httpd = make_server(args.host, args.port, args.data_dir.resolve())
    print(f"Loopwright {VERSION}")
    print(f"  This machine:  http://localhost:{args.port}/")
    lan = lan_address()
    if lan and args.host in ("0.0.0.0", ""):
        print(f"  Same wifi:     http://{lan}:{args.port}/")
    print(f"  Community data in {args.data_dir.resolve()}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nBye.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
