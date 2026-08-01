#!/usr/bin/env python3
"""
serve.py — run CYBER MERGER from a local web server.

The game itself needs no server: index.html opens straight off the filesystem.
This exists for phones and tablets (Pydroid 3, Termux, iSH) where opening a
file:// path in a browser is awkward, and for browsers that restrict
localStorage on file:// URLs — served over http:// the save always works.

    python3 serve.py            # serve on the first free port from 8000
    python3 serve.py 9000       # serve on a specific port

Then open the printed URL in your browser.

Important: this serves the folder THIS FILE lives in, not the interpreter's
working directory. Pydroid 3 and friends often start scripts in their own
private app folder (/data/data/ru.iiec.pydroid3/files/...), which is why
running a bare `python -m http.server` there finds nothing to serve.
"""

import http.server
import os
import socket
import socketserver
import sys

# The directory holding this script — resolved before anything can chdir away.
ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8000
PORT_TRIES = 20


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler pinned to ROOT, with no-cache so edits show up on reload."""

    def __init__(self, *args, **kwargs):
        # `directory=` landed in Python 3.7. Older builds fall back to a chdir
        # done in main(), so this stays compatible either way.
        try:
            super().__init__(*args, directory=ROOT, **kwargs)
        except TypeError:
            super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One tidy line per request instead of the noisy default.
        sys.stdout.write("  %s\n" % (fmt % args))


def local_ip():
    """Best-effort LAN address, so a phone can serve a laptop and vice versa."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))          # no packets are sent; just routing
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def main():
    index = os.path.join(ROOT, "index.html")
    if not os.path.isfile(index):
        print("ERROR: index.html is not next to serve.py.")
        print("       serve.py is in: %s" % ROOT)
        print("       Put serve.py in the same folder as index.html (the repo root)")
        print("       and run it again.")
        return 1

    # Pre-3.7 fallback for the Handler above.
    os.chdir(ROOT)

    start = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            start = int(sys.argv[1])
        except ValueError:
            print("ERROR: port must be a number, got %r" % sys.argv[1])
            return 1

    socketserver.TCPServer.allow_reuse_address = True
    httpd = None
    port = start
    for port in range(start, start + PORT_TRIES):
        try:
            httpd = socketserver.TCPServer(("0.0.0.0", port), Handler)
            break
        except OSError:
            continue                        # port busy, try the next one

    if httpd is None:
        print("ERROR: no free port between %d and %d." % (start, start + PORT_TRIES - 1))
        return 1

    ip = local_ip()
    print("")
    print("  CYBER MERGER is being served from:")
    print("    %s" % ROOT)
    print("")
    print("  Open this in your browser:")
    print("    http://localhost:%d/" % port)
    if ip:
        print("  Or from another device on the same wifi:")
        print("    http://%s:%d/" % (ip, port))
    print("")
    print("  Press Ctrl-C (or stop the script) to quit.")
    print("")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
