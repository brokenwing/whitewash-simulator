"""
API Key 托管：Key 只保存在本机服务这一侧，浏览器永远拿不到明文。

每个 Key 绑定一个上游源（scheme://host[:port]），代理只会把它注入发往这个源的请求。
保存方式按平台选最安全的一种（只用 Python 标准库）：
  - env         ：环境变量 WW_API_KEY + WW_API_BASE（不落盘，优先级最高，界面里不能修改）
  - dpapi       ：Windows，用 DPAPI 加密后存文件，只有当前 Windows 用户能解开
  - secret-tool ：Linux 桌面，存进系统钥匙串（libsecret / GNOME Keyring / KWallet）
  - file        ：其他情况，存在权限为 0600 的文件里（与 ~/.ssh、~/.aws/credentials 同级的保护）
索引文件 keys.json 只记录源、保存方式和掩码，dpapi 的密文也在这里；env / secret-tool 的明文从不写入。
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import threading
import urllib.parse

SERVICE = "whitewash-simulator"
MAX_KEY_LENGTH = 512
DEFAULT_PORTS = {"http": 80, "https": 443}


def normalize_origin(base):
    """'https://API.x.com:443/v1' -> 'https://api.x.com'; raises ValueError for anything not http(s)."""
    parsed = urllib.parse.urlsplit(str(base or "").strip())
    scheme = parsed.scheme.lower()
    if scheme not in DEFAULT_PORTS or not parsed.hostname:
        raise ValueError("接口地址必须是 http(s) 地址")
    host = parsed.hostname.lower()
    if ":" in host:
        host = "[%s]" % host
    try:
        port = parsed.port
    except ValueError:
        raise ValueError("接口地址端口无效")
    if port and port != DEFAULT_PORTS[scheme]:
        host = "%s:%d" % (host, port)
    return "%s://%s" % (scheme, host)


def mask(key):
    if len(key) >= 12:
        return key[:3] + "…" + key[-4:]
    return "…" + key[-2:]


def config_dir():
    if os.name == "nt":
        root = os.environ.get("APPDATA") or os.path.expanduser("~")
    else:
        root = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    return os.path.join(root, SERVICE)


# ---------------------------------------------------------------------- Windows DPAPI
if os.name == "nt":
    import ctypes
    from ctypes import wintypes

    class _Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.windll.crypt32
    _kernel32 = ctypes.windll.kernel32
    _kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    _ENTROPY = SERVICE.encode("ascii")
    _UI_FORBIDDEN = 0x1

    def _in_blob(data):
        buf = ctypes.create_string_buffer(data, len(data))
        return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    def _dpapi(fn, data):
        blob, keep = _in_blob(data)
        entropy, keep2 = _in_blob(_ENTROPY)
        out = _Blob()
        if fn is _crypt32.CryptProtectData:
            ok = fn(ctypes.byref(blob), SERVICE, ctypes.byref(entropy), None, None, _UI_FORBIDDEN, ctypes.byref(out))
        else:
            ok = fn(ctypes.byref(blob), None, ctypes.byref(entropy), None, None, _UI_FORBIDDEN, ctypes.byref(out))
        if not ok:
            raise ctypes.WinError()
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            _kernel32.LocalFree(out.pbData)

    def dpapi_protect(text):
        return base64.b64encode(_dpapi(_crypt32.CryptProtectData, text.encode("utf-8"))).decode("ascii")

    def dpapi_unprotect(token):
        return _dpapi(_crypt32.CryptUnprotectData, base64.b64decode(token)).decode("utf-8")


# ---------------------------------------------------------------------- Linux secret-tool
def _secret_tool(args, stdin=None):
    return subprocess.run(["secret-tool"] + args, input=stdin, capture_output=True, text=True, timeout=10)


def _secret_attrs(origin):
    return ["service", SERVICE, "origin", origin]


class KeyStore:
    def __init__(self, directory=None):
        self.dir = directory or config_dir()
        self.path = os.path.join(self.dir, "keys.json")
        self.lock = threading.Lock()
        self.cache = {}
        self.env_origin, self.env_key = None, None
        env_key, env_base = os.environ.get("WW_API_KEY", "").strip(), os.environ.get("WW_API_BASE", "").strip()
        if env_key:
            if not env_base:
                sys.stderr.write("[keystore] 设置了 WW_API_KEY 但没有设置 WW_API_BASE，已忽略（Key 必须绑定接口地址）\n")
            else:
                self.env_origin, self.env_key = normalize_origin(env_base), validate_key(env_key)

    # ------------------------------------------------------------------ index file
    def _read(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _write(self, data):
        os.makedirs(self.dir, exist_ok=True)
        if os.name != "nt":
            os.chmod(self.dir, 0o700)
        tmp = self.path + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)

    # ------------------------------------------------------------------ public
    def status(self, origin):
        if origin == self.env_origin:
            return {"stored": True, "hint": mask(self.env_key), "backend": "env"}
        with self.lock:
            entry = self._read().get(origin)
        if not entry:
            return {"stored": False, "backend": self.preferred_backend()}
        return {"stored": True, "hint": entry.get("hint", ""), "backend": entry.get("backend", "")}

    def get(self, origin):
        if origin == self.env_origin:
            return self.env_key
        with self.lock:
            if origin in self.cache:
                return self.cache[origin]
            entry = self._read().get(origin)
            key = self._load(origin, entry) if entry else None
            if key:
                self.cache[origin] = key
            return key

    def set(self, origin, key):
        if origin == self.env_origin:
            raise PermissionError("这个接口地址的 Key 由环境变量 WW_API_KEY 提供，请修改环境变量")
        key = validate_key(key)
        with self.lock:
            data = self._read()
            old = data.get(origin)
            entry = {"backend": self.preferred_backend(), "hint": mask(key)}
            if entry["backend"] == "secret-tool":
                r = _secret_tool(["store", "--label", "%s API key (%s)" % (SERVICE, origin)] + _secret_attrs(origin), stdin=key)
                if r.returncode != 0:
                    entry["backend"] = "file"  # no keyring daemon (headless / SSH session)
            if entry["backend"] == "dpapi":
                entry["secret"] = dpapi_protect(key)
            elif entry["backend"] == "file":
                entry["secret"] = key
            if old and old.get("backend") == "secret-tool" and entry["backend"] != "secret-tool":
                _secret_tool(["clear"] + _secret_attrs(origin))
            data[origin] = entry
            self._write(data)
            self.cache[origin] = key
            return {"stored": True, "hint": entry["hint"], "backend": entry["backend"]}

    def delete(self, origin):
        if origin == self.env_origin:
            raise PermissionError("这个接口地址的 Key 由环境变量 WW_API_KEY 提供，请修改环境变量")
        with self.lock:
            data = self._read()
            entry = data.pop(origin, None)
            if entry and entry.get("backend") == "secret-tool":
                _secret_tool(["clear"] + _secret_attrs(origin))
            self._write(data)
            self.cache.pop(origin, None)
        return {"stored": False, "backend": self.preferred_backend()}

    # ------------------------------------------------------------------ backends
    @staticmethod
    def preferred_backend():
        if os.name == "nt":
            return "dpapi"
        if sys.platform.startswith("linux") and shutil.which("secret-tool"):
            return "secret-tool"
        return "file"

    @staticmethod
    def _load(origin, entry):
        backend = entry.get("backend")
        try:
            if backend == "dpapi":
                return dpapi_unprotect(entry["secret"])
            if backend == "secret-tool":
                r = _secret_tool(["lookup"] + _secret_attrs(origin))
                return r.stdout.strip() if r.returncode == 0 else None
            if backend == "file":
                return entry.get("secret")
        except Exception as exc:  # corrupted entry, other Windows user, keyring locked
            sys.stderr.write("[keystore] 读取 %s 的 Key 失败：%s\n" % (origin, type(exc).__name__))
        return None


def validate_key(key):
    key = str(key or "").strip()
    if not key:
        raise ValueError("Key 不能为空")
    if len(key) > MAX_KEY_LENGTH:
        raise ValueError("Key 太长")
    if any(ord(c) < 0x21 or ord(c) > 0x7E for c in key):
        raise ValueError("Key 只能包含可见 ASCII 字符")
    return key
