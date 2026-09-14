#!/usr/bin/env python3
"""Static landing server. Proxies /imoex-api/* to the desk on :8080 (no CORS)."""
from __future__ import annotations

import argparse
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DESK = "http://127.0.0.1:8080"
PREFIX = "/imoex-api"


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == PREFIX or self.path.startswith(PREFIX + "/"):
            self.proxy()
            return
        super().do_GET()

    def log_message(self, fmt: str, *args) -> None:
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def proxy(self) -> None:
        dest = DESK + (self.path[len(PREFIX) :] or "/")
        req = urllib.request.Request(
            dest,
            method="GET",
            headers={"Accept": self.headers.get("Accept", "application/json")},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header(
                    "Content-Type",
                    resp.headers.get("Content-Type", "application/json"),
                )
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            body = exc.read()
            self.send_response(exc.code)
            self.send_header(
                "Content-Type",
                exc.headers.get("Content-Type", "application/json"),
            )
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            msg = str(exc).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(msg)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("http://127.0.0.1:%s/  (desk proxy %s → %s)" % (args.port, PREFIX, DESK))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
