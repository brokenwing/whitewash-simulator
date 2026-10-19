#!/usr/bin/env python3
"""
本地静态服务 + LLM 跨域转发（可选）。只用 Python 标准库，只监听 127.0.0.1。

用法：
    python tools/serve.py              # http://127.0.0.1:8765/Start.html
    python tools/serve.py --port 9000

转发：浏览器请求  http://127.0.0.1:8765/llm-proxy/<base64url(上游BaseURL)>/<路径>
      会被原样转发到 <上游BaseURL>/<路径>，响应（含 SSE 流）原样回传，并附带 CORS 头。
      游戏里在「AI 设置」勾选“通过本地代理转发请求”即可。

安全：
  - Host 头必须是 127.0.0.1:<端口> 或 localhost:<端口>，防 DNS 重绑定；
  - 转发只接受 POST，且必须带白名单内的 Origin（即本服务页面）。file:// 页面、沙箱 iframe
    （Origin: null）和其他网站一律拒绝，避免本机被当成开放代理；
  - 任何以 . 开头的路径段（.git、.claude……）都不对外提供。
"""
import argparse
import base64
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROXY_PREFIX = "/llm-proxy/"
DROP_REQUEST_HEADERS = {
    "host", "origin", "referer", "cookie", "connection", "content-length", "accept-encoding",
    "sec-fetch-mode", "sec-fetch-site", "sec-fetch-dest", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
}
DROP_RESPONSE_HEADERS = {
    "transfer-encoding", "connection", "content-length", "content-encoding", "keep-alive",
    "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods",
}


def b64url_decode(text):
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    allowed_origins = set()
    allowed_hosts = set()

    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
                           ".md": "text/markdown; charset=utf-8", ".html": "text/html; charset=utf-8"})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] %s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        if not self.path.startswith(PROXY_PREFIX):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ------------------------------------------------------------------ guards
    def host_ok(self):
        host = (self.headers.get("Host") or "").lower()
        if host in self.allowed_hosts:
            return True
        self.send_error(403, "host not allowed")
        return False

    def origin_ok(self):
        # Browsers always send Origin on cross-origin and same-origin POST/preflight requests;
        # a missing or "null" Origin is not one of our pages.
        if self.headers.get("Origin") in self.allowed_origins:
            return True
        self.send_error(403, "origin not allowed: %s" % self.headers.get("Origin"))
        return False

    def path_ok(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if any(part.startswith(".") for part in path.replace("\\", "/").split("/")):
            self.send_error(404, "not found")
            return False
        return True

    # ------------------------------------------------------------------ CORS
    def cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        requested = self.headers.get("Access-Control-Request-Headers")
        self.send_header("Access-Control-Allow-Headers", requested or "*")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin")

    def do_OPTIONS(self):
        if not self.host_ok():
            return
        if not self.path.startswith(PROXY_PREFIX):
            self.send_error(405, "method not allowed")
            return
        if not self.origin_ok():
            return
        self.send_response(204)
        self.cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ------------------------------------------------------------------ proxy
    def do_POST(self):
        if not self.host_ok():
            return
        if not self.path.startswith(PROXY_PREFIX):
            self.send_error(405, "only the LLM proxy accepts POST")
            return
        if not self.origin_ok():
            return
        self.proxy("POST")

    def do_GET(self):
        if not self.host_ok():
            return
        if self.path.startswith(PROXY_PREFIX):
            self.send_error(405, "the LLM proxy only accepts POST")
            return
        if self.path_ok():
            super().do_GET()

    def do_HEAD(self):
        if not self.host_ok():
            return
        if self.path.startswith(PROXY_PREFIX):
            self.send_error(405, "the LLM proxy only accepts POST")
            return
        if self.path_ok():
            super().do_HEAD()

    def target_url(self):
        rest = self.path[len(PROXY_PREFIX):]
        encoded, _, tail = rest.partition("/")
        base = b64url_decode(encoded).rstrip("/")
        parsed = urllib.parse.urlparse(base)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("unsupported upstream: %r" % base)
        return base + "/" + tail

    def proxy(self, method):
        try:
            url = self.target_url()
        except Exception as exc:  # malformed prefix or scheme
            self.send_error(400, str(exc))
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in DROP_REQUEST_HEADERS}
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            upstream = urllib.request.urlopen(req, timeout=600)
            status = upstream.status
        except urllib.error.HTTPError as err:
            upstream = err
            status = err.code
        except Exception as exc:
            self.send_response(502)
            self.cors_headers()
            payload = ("upstream error: %s" % exc).encode("utf-8")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(status)
        self.cors_headers()
        for key, value in upstream.headers.items():
            if key.lower() not in DROP_RESPONSE_HEADERS:
                self.send_header(key, value)
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        try:
            while True:
                chunk = upstream.read1(8192) if hasattr(upstream, "read1") else upstream.read(8192)
                if not chunk:
                    break
                self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            upstream.close()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description="公关洗地模拟器：本地静态服务 + LLM 跨域转发")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    Handler.allowed_hosts = {"127.0.0.1:%d" % args.port, "localhost:%d" % args.port}
    Handler.allowed_origins = {"http://" + host for host in Handler.allowed_hosts}
    httpd = Server(("127.0.0.1", args.port), Handler)
    print("公关洗地模拟器已启动：http://127.0.0.1:%d/Start.html" % args.port)
    print("关卡编辑器：http://127.0.0.1:%d/LevelEditor.html" % args.port)
    print("LLM 转发前缀：http://127.0.0.1:%d%s<base64url(BaseURL)>/..." % (args.port, PROXY_PREFIX))
    print("按 Ctrl+C 退出。")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
