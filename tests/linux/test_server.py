"""
Linux 下本地服务（tools/serve.py）和一键启动脚本（start.sh）的测试，只用标准库。
  python3 tests/linux/test_server.py -v
每个用例在临时端口、临时配置目录里启动真实的服务进程，不碰真实的 ~/.config，也不访问外网。
"""
import ast
import glob
import http.client
import http.server
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SERVE = os.path.join(ROOT, "tools", "serve.py")
PROXY_VARS = ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_port(port, proc=None, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc is not None and proc.poll() is not None:
            return False
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return True
        except OSError:
            time.sleep(0.05)
    return False


class ServerCase(unittest.TestCase):
    """启动一个 serve.py 进程；XDG_CONFIG_HOME 指向临时目录，没有图形界面，不走代理。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ww-serve-")
        self.env = {k: v for k, v in os.environ.items() if k not in PROXY_VARS + ("DISPLAY", "WAYLAND_DISPLAY", "BROWSER", "WW_API_KEY", "WW_API_BASE")}
        self.env.update(XDG_CONFIG_HOME=os.path.join(self.tmp, "cfg"), PYTHONUNBUFFERED="1")
        self.procs = []

    def tearDown(self):
        for p in self.procs:
            if p.poll() is None:
                p.kill()
            p.communicate()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def spawn(self, args, port=None, wait=True):
        p = subprocess.Popen(args, cwd=ROOT, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.procs.append(p)
        if wait:
            self.assertTrue(wait_port(port, p), "服务没有在 %d 端口启动：%s" % (port, p.communicate()[1] if p.poll() is not None else ""))
        return p

    def serve(self, *extra):
        self.port = free_port()
        return self.spawn([sys.executable, SERVE, "--port", str(self.port)] + list(extra), self.port)

    def request(self, method, path, body=None, headers=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": host or "127.0.0.1:%d" % self.port}
        h.update(headers or {})
        conn.request(method, path, body=body, headers=h)
        r = conn.getresponse()
        data = r.read()
        conn.close()
        return r, data

    def key_api(self, payload, origin=True):
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin if isinstance(origin, str) else "http://127.0.0.1:%d" % self.port
        r, data = self.request("POST", "/api/key", json.dumps(payload), headers)
        return r.status, json.loads(data.decode("utf-8")) if data and r.getheader("Content-Type", "").startswith("application/json") else data

    def stop(self, p):
        p.send_signal(signal.SIGINT)
        out, err = p.communicate(timeout=10)
        return p.returncode, out, err


class StaticFiles(ServerCase):
    def setUp(self):
        super().setUp()
        self.serve()

    def test_pages_and_scripts(self):
        for path, ctype in (("/Start.html", "text/html"), ("/LevelEditor.html", "text/html"),
                            ("/js/core/ns.js", "javascript"), ("/css/common.css", "text/css"), ("/levels/manifest.js", "javascript")):
            r, data = self.request("GET", path)
            self.assertEqual(r.status, 200, path)
            self.assertIn(ctype, r.getheader("Content-Type", ""), path)
            self.assertEqual(r.getheader("Cache-Control"), "no-store", path)
            self.assertTrue(data, path)

    def test_localhost_host_accepted(self):
        r, _ = self.request("GET", "/Start.html", host="localhost:%d" % self.port)
        self.assertEqual(r.status, 200)

    def test_foreign_host_rejected(self):
        r, _ = self.request("GET", "/Start.html", host="evil.example.com")
        self.assertEqual(r.status, 403)

    def test_dot_paths_hidden(self):
        for path in ("/.git/config", "/%2egit/config", "/.gitignore", "/js/../.git/HEAD", "/.claude/settings.json"):
            r, _ = self.request("GET", path)
            self.assertEqual(r.status, 404, path)


class KeyApi(ServerCase):
    def setUp(self):
        super().setUp()
        self.env["PATH"] = os.path.dirname(sys.executable)  # 没有 secret-tool：固定走 file，结果可预期
        self.serve()

    def test_requires_page_origin(self):
        self.assertEqual(self.key_api({"action": "status", "base": "https://api.example.com"}, origin=False)[0], 403)
        self.assertEqual(self.key_api({"action": "status", "base": "https://api.example.com"}, origin="http://evil.example.com")[0], 403)
        self.assertEqual(self.key_api({"action": "status", "base": "https://api.example.com"}, origin="null")[0], 403)

    def test_set_status_delete(self):
        base = "https://api.example.com/v1"
        status, res = self.key_api({"action": "set", "base": base, "key": "sk-test-0123456789abcdef"})
        self.assertEqual(status, 200, res)
        self.assertEqual(res["backend"], "file")
        self.assertNotIn("0123456789abcdef", json.dumps(res))
        path = os.path.join(self.tmp, "cfg", "whitewash-simulator", "keys.json")
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        self.assertTrue(self.key_api({"action": "status", "base": base})[1]["stored"])
        self.assertFalse(self.key_api({"action": "delete", "base": base})[1]["stored"])
        self.assertFalse(self.key_api({"action": "status", "base": base})[1]["stored"])

    def test_bad_requests(self):
        self.assertEqual(self.key_api({"action": "status", "base": "file:///etc/passwd"})[0], 400)
        self.assertEqual(self.key_api({"action": "nope", "base": "https://api.example.com"})[0], 400)


class Upstream(http.server.BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        Upstream.seen.append((self.path, dict(self.headers), body))
        data = b'{"ok": true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class Proxy(ServerCase):
    """转发到本机的假上游，验证 Key 注入和 CORS 头（不访问外网）。"""

    def setUp(self):
        super().setUp()
        self.env["PATH"] = os.path.dirname(sys.executable)
        self.serve()
        self.upstream = http.server.HTTPServer(("127.0.0.1", 0), Upstream)
        threading.Thread(target=self.upstream.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d" % self.upstream.server_address[1]
        Upstream.seen = []

    def tearDown(self):
        self.upstream.shutdown()
        self.upstream.server_close()
        super().tearDown()

    def test_forward_with_held_key(self):
        import base64
        self.assertEqual(self.key_api({"action": "set", "base": self.base, "key": "sk-held-0123456789"})[0], 200)
        enc = base64.urlsafe_b64encode((self.base + "/v1").encode()).decode().rstrip("=")
        origin = "http://127.0.0.1:%d" % self.port
        r, data = self.request("POST", "/llm-proxy/%s/chat/completions" % enc, b'{"q":1}',
                               {"Origin": origin, "Content-Type": "application/json", "Authorization": "Bearer from-browser"})
        self.assertEqual(r.status, 200, data)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), origin)
        path, headers, body = Upstream.seen[-1]
        self.assertEqual(path, "/v1/chat/completions")
        self.assertEqual(body, b'{"q":1}')
        self.assertEqual({k.lower(): v for k, v in headers.items()}.get("authorization"), "Bearer sk-held-0123456789")


class Lifecycle(ServerCase):
    def test_port_in_use_reports_and_exits(self):
        self.serve()
        p = self.spawn([sys.executable, SERVE, "--port", str(self.port)], wait=False)
        out, err = p.communicate(timeout=10)
        self.assertEqual(p.returncode, 1)
        self.assertIn("无法监听", out)
        self.assertNotIn("Traceback", err)

    def test_ctrl_c_then_immediate_restart(self):
        p = self.serve()
        self.request("GET", "/Start.html")  # leave a connection in TIME_WAIT
        code, out, err = self.stop(p)
        self.assertEqual(code, 0, err)
        self.assertIn("已退出", out)
        self.assertNotIn("Traceback", err)
        p2 = self.spawn([sys.executable, SERVE, "--port", str(self.port)], self.port)
        self.assertEqual(self.request("GET", "/Start.html")[0].status, 200)
        self.stop(p2)

    def test_open_without_desktop_does_not_crash(self):
        p = self.serve("--open")
        time.sleep(1.5)  # webbrowser.open runs 0.5 s after start
        self.assertIsNone(p.poll(), "没有图形界面时 --open 让服务退出了")
        self.assertEqual(self.request("GET", "/Start.html")[0].status, 200)
        code, out, err = self.stop(p)
        self.assertNotIn("Traceback", err)


class StartScript(ServerCase):
    def run_script(self, script, port):
        p = self.spawn([script, str(port)], port)
        self.port = port
        self.assertEqual(self.request("GET", "/Start.html")[0].status, 200)
        code, out, err = self.stop(p)
        self.assertNotIn("Traceback", err)

    def test_start_sh_with_port(self):
        self.run_script(os.path.join(ROOT, "start.sh"), free_port())

    def test_start_sh_from_path_with_spaces(self):
        link = os.path.join(self.tmp, "my games", "白净 公关")
        os.makedirs(os.path.dirname(link))
        os.symlink(ROOT, link)
        self.run_script(os.path.join(link, "start.sh"), free_port())

    def test_start_sh_without_python(self):
        bin_dir = os.path.join(self.tmp, "bin")
        os.mkdir(bin_dir)
        os.symlink(shutil.which("dirname"), os.path.join(bin_dir, "dirname"))
        self.env["PATH"] = bin_dir
        p = subprocess.run(["/bin/sh", os.path.join(ROOT, "start.sh")], env=self.env, capture_output=True, text=True, timeout=10)
        self.assertEqual(p.returncode, 1)
        self.assertIn("没有找到 Python 3", p.stdout)


class PythonCompat(unittest.TestCase):
    """README 只要求 Python 3；老一些的发行版自带 3.8，语法上要能被 3.8 解析。"""

    def test_tools_parse_as_python_3_8(self):
        for path in glob.glob(os.path.join(ROOT, "tools", "*.py")):
            with open(path, encoding="utf-8") as f:
                ast.parse(f.read(), filename=path, feature_version=(3, 8))


if __name__ == "__main__":
    unittest.main()
