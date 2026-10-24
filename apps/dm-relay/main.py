#!/usr/bin/env python3
"""
OnyxChin media relay for hosts that reject non-browser TLS (Dailymotion CDN).

Dailymotion's Fastly edge answers 403 to curl/undici but 200 to a real Chrome
handshake, so the API proxies DM manifests and segments through this service,
which uses curl_cffi's Chrome impersonation. Range is forwarded so <video> and
hls.js can seek.

    DM_RELAY_TOKEN=... PORT=10000 python3 main.py

GET /health
GET /fetch?u=<encoded url>[&ref=<referer>]   header: x-relay-token
"""
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
from curl_cffi import requests as creq

TOKEN = os.environ.get("DM_RELAY_TOKEN", "")
PORT = int(os.environ.get("PORT", "10000"))
TIMEOUT = 40
ALLOW = re.compile(r"(^|\.)(dailymotion\.com|dmcdn\.net|dm-event\.net)$", re.I)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
PASS_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep Render logs quiet
        if os.environ.get("DM_RELAY_DEBUG") == "1":
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "*")
        self.send_header("access-control-allow-methods", "GET,OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self._json({"ok": True, "relay": "onyxchin-dm", "tls": "chrome"})
        if parsed.path != "/fetch":
            return self._json({"error": "not found"}, 404)
        if TOKEN and self.headers.get("x-relay-token") != TOKEN:
            return self._json({"error": "bad token"}, 401)

        qs = parse_qs(parsed.query)
        target = unquote(qs.get("u", [""])[0])
        referer = unquote(qs.get("ref", ["https://geo.dailymotion.com/"])[0])
        if not target:
            return self._json({"error": "missing u"}, 400)
        try:
            host = urlparse(target).hostname or ""
        except ValueError:
            return self._json({"error": "bad url"}, 400)
        if not ALLOW.search(host):
            return self._json({"error": "host not allowed", "host": host}, 403)

        headers = {
            "User-Agent": UA,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer,
        }
        rng = self.headers.get("range")
        if rng:
            headers["Range"] = rng

        try:
            r = creq.get(target, headers=headers, impersonate="chrome", timeout=TIMEOUT, stream=True)
        except Exception as exc:  # network failure
            return self._json({"error": "upstream failed", "detail": str(exc)[:160]}, 502)

        self.send_response(r.status_code)
        for name in PASS_HEADERS:
            value = r.headers.get(name)
            if value:
                self.send_header(name, value)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("cache-control", "private, max-age=60")
        self.end_headers()
        try:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            r.close()

    def _json(self, payload, status=200):
        import json

        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("access-control-allow-origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"onyxchin dm-relay on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
