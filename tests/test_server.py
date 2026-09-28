"""Tests for the community server. Run: python3 -m unittest discover -s tests"""

from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("LOOPWRIGHT_QUIET", "1")

import server  # noqa: E402

# The smallest valid PNG: 1x1 transparent pixel.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
AUTHOR = {"id": "device-abc123", "name": "Robin", "color": "#b4481f"}


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.httpd = server.make_server("127.0.0.1", 0, Path(self.tmp.name))
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def call(self, method, path, body=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None and raw is None:
            req.add_header("Content-Type", "application/json")
        req.add_header("X-Loopwright-Client", "device-abc123")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req) as res:
                payload = res.read()
                return res.status, res.headers, payload
        except urllib.error.HTTPError as err:
            return err.code, err.headers, err.read()

    def json(self, method, path, body=None, headers=None):
        status, _, payload = self.call(method, path, body, headers)
        return status, (json.loads(payload) if payload else None)

    def test_health(self):
        status, body = self.json("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["app"], "loopwright")

    def test_post_like_comment_delete(self):
        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "text": "Hello #WIP #granny", "tags": ["WIP", "granny", "bad tag!"]})
        self.assertEqual(status, 201)
        post, token = body["post"], body["token"]
        self.assertEqual(post["tags"], ["wip", "granny"])
        self.assertNotEqual(post["author"]["id"], AUTHOR["id"], "device ids are never published")
        self.assertNotIn("token", post)

        status, body = self.json("GET", "/api/posts?tag=granny")
        self.assertEqual([p["id"] for p in body["posts"]], [post["id"]])
        self.assertIn("granny", body["tags"])

        status, body = self.json("POST", f"/api/posts/{post['id']}/like", {})
        self.assertEqual(body, {"likes": 1, "liked": True})
        status, body = self.json("POST", f"/api/posts/{post['id']}/like", {})
        self.assertEqual(body, {"likes": 0, "liked": False})

        status, body = self.json("POST", f"/api/posts/{post['id']}/comments", {"author": AUTHOR, "text": "Lovely"})
        self.assertEqual(status, 201)
        cid, ctoken = body["comment"]["id"], body["token"]
        status, _ = self.json("DELETE", f"/api/posts/{post['id']}/comments/{cid}", headers={"X-Loopwright-Token": "nope"})
        self.assertEqual(status, 403)
        status, _ = self.json("DELETE", f"/api/posts/{post['id']}/comments/{cid}", headers={"X-Loopwright-Token": ctoken})
        self.assertEqual(status, 204)

        status, _ = self.json("DELETE", f"/api/posts/{post['id']}")
        self.assertEqual(status, 403)
        status, _ = self.json("DELETE", f"/api/posts/{post['id']}", headers={"X-Loopwright-Token": token})
        self.assertEqual(status, 204)
        status, body = self.json("GET", "/api/posts")
        self.assertEqual(body["posts"], [])

    def test_posts_survive_restart(self):
        self.json("POST", "/api/posts", {"author": AUTHOR, "text": "Persist me"})
        store = server.Store(Path(self.tmp.name))
        self.assertEqual(store.posts[0]["text"], "Persist me")

    def test_images_are_validated_and_served(self):
        good = "data:image/png;base64," + base64.b64encode(PNG).decode()
        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "text": "", "images": [good]})
        self.assertEqual(status, 201)
        url = body["post"]["images"][0]
        status, headers, payload = self.call("GET", url)
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertEqual(payload, PNG)

        lying = "data:image/jpeg;base64," + base64.b64encode(PNG).decode()
        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "images": [lying]})
        self.assertEqual(status, 400)
        self.assertIn("does not match", body["error"])

        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "images": ["data:text/html;base64,PHNjcmlwdD4="]})
        self.assertEqual(status, 400)
        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "images": ["https://example.com/x.png"]})
        self.assertEqual(status, 400)

    def test_rejects_bad_posts(self):
        status, body = self.json("POST", "/api/posts", {"text": "no author"})
        self.assertEqual(status, 400)
        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "text": "   "})
        self.assertEqual(status, 400)
        status, _, _ = self.call("POST", "/api/posts", raw=b"not json", headers={"Content-Type": "application/json"})
        self.assertEqual(status, 400)
        status, _, _ = self.call("POST", "/api/posts", raw=b"{}", headers={"Content-Type": "text/plain"})
        self.assertEqual(status, 415)
        status, body = self.json("POST", "/api/posts", {"author": AUTHOR, "text": "x" * 5000})
        self.assertEqual(status, 201)
        self.assertEqual(len(body["post"]["text"]), 4000)

    def test_shares(self):
        env = {"app": "loopwright", "v": 1, "kind": "pattern", "data": {"title": "Whale", "sections": []}}
        status, body = self.json("POST", "/api/shares", {"envelope": env})
        self.assertEqual(status, 201)
        code = body["code"]
        self.assertRegex(code, r"^[A-HJ-NP-Z2-9]{8}$")
        status, body = self.json("GET", f"/api/shares/{code.lower()}")
        self.assertEqual(status, 200)
        self.assertEqual(body["envelope"]["data"]["title"], "Whale")
        status, _ = self.json("POST", "/api/shares", {"envelope": {"app": "other"}})
        self.assertEqual(status, 400)
        status, _ = self.json("GET", "/api/shares/AAAAAAA1")
        self.assertEqual(status, 404)

    def test_no_path_tricks(self):
        for path in ["/media/../server.py", "/media/..%2fserver.py", "/media/server.py", "/api/shares/..%2f..%2fserver"]:
            status, _, payload = self.call("GET", path)
            self.assertIn(status, (400, 404), path)
            self.assertNotIn(b"ThreadingHTTPServer", payload)
        status, _, payload = self.call("GET", "/../server.py")
        self.assertNotIn(b"ThreadingHTTPServer", payload)

    def test_static_files_and_headers(self):
        status, headers, payload = self.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertIn(b"Loopwright", payload)
        status, headers, _ = self.call("GET", "/js/main.js")
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")

    def test_rate_limit(self):
        self.httpd.RequestHandlerClass.limiter = server.RateLimiter(per_minute=3)
        codes = [self.json("POST", "/api/posts", {"author": AUTHOR, "text": f"n{i}"})[0] for i in range(5)]
        self.assertEqual(codes[:3], [201, 201, 201])
        self.assertEqual(codes[3:], [429, 429])


if __name__ == "__main__":
    unittest.main()
