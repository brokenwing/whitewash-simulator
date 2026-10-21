"""
Linux 下 API Key 托管（tools/keystore.py）的测试，只用标准库，不碰真实的 ~/.config 和钥匙串。
  python3 tests/linux/test_keystore.py -v
真实钥匙串那一项需要在独立的 D-Bus 会话里跑（tests/linux/run.sh 会自动准备），否则跳过：
  dbus-run-session -- sh -c 'printf pw | gnome-keyring-daemon --unlock --components=secrets >/dev/null; WW_TEST_KEYRING=1 python3 tests/linux/test_keystore.py -v'
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
import keystore  # noqa: E402

ORIGIN = "https://api.example.com"
KEY = "sk-test-0123456789abcdef"
SLEEP = shutil.which("sleep")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ww-keystore-")
        self.cfg = os.path.join(self.tmp, "cfg")
        self.bin = os.path.join(self.tmp, "bin")
        os.mkdir(self.bin)
        env = {k: v for k, v in os.environ.items() if k not in ("WW_API_KEY", "WW_API_BASE")}
        env["XDG_CONFIG_HOME"] = self.cfg
        self.env = mock.patch.dict(os.environ, env, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def only_fake_bin(self):
        """PATH 里只剩假命令目录，真实的 secret-tool 找不到（假脚本里的命令要写绝对路径）。"""
        os.environ["PATH"] = self.bin

    def fake_secret_tool(self, body):
        path = os.path.join(self.bin, "secret-tool")
        with open(path, "w") as f:
            f.write("#!/bin/sh\n" + body + "\n")
        os.chmod(path, 0o755)
        self.only_fake_bin()

    def index(self):
        with open(os.path.join(self.cfg, keystore.SERVICE, "keys.json"), encoding="utf-8") as f:
            return json.load(f)


class ConfigDir(Base):
    def test_follows_xdg_config_home(self):
        self.assertEqual(keystore.config_dir(), os.path.join(self.cfg, keystore.SERVICE))

    def test_defaults_to_home_config(self):
        del os.environ["XDG_CONFIG_HOME"]
        os.environ["HOME"] = self.tmp
        self.assertEqual(keystore.config_dir(), os.path.join(self.tmp, ".config", keystore.SERVICE))


class FileBackend(Base):
    def test_no_secret_tool_stores_in_private_file(self):
        self.only_fake_bin()
        ks = keystore.KeyStore()
        self.assertEqual(ks.preferred_backend(), "file")
        self.assertEqual(ks.set(ORIGIN, KEY)["backend"], "file")
        self.assertEqual(stat.S_IMODE(os.stat(ks.path).st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(os.stat(ks.dir).st_mode), 0o700)
        self.assertEqual(keystore.KeyStore().get(ORIGIN), KEY)  # new instance: read back from disk, not the cache

    def test_delete(self):
        self.only_fake_bin()
        ks = keystore.KeyStore()
        ks.set(ORIGIN, KEY)
        self.assertFalse(ks.delete(ORIGIN)["stored"])
        self.assertIsNone(keystore.KeyStore().get(ORIGIN))
        self.assertNotIn(ORIGIN, self.index())


class SecretToolFallback(Base):
    def test_failing_secret_tool_falls_back_to_file(self):
        # 装了 libsecret-tools 但没有钥匙串服务（SSH / 无桌面会话）：secret-tool 立刻返回非 0
        self.fake_secret_tool("exit 1")
        ks = keystore.KeyStore()
        self.assertEqual(ks.preferred_backend(), "secret-tool")
        self.assertEqual(ks.set(ORIGIN, KEY)["backend"], "file")
        self.assertEqual(keystore.KeyStore().get(ORIGIN), KEY)

    def test_hanging_secret_tool_on_save_falls_back_to_file(self):
        # 钥匙串被锁、解锁弹窗出不来时 secret-tool 会一直等；超时后应该和"返回非 0"一样降级到文件
        self.fake_secret_tool("exec %s 30" % SLEEP)
        ks = keystore.KeyStore()
        started = time.monotonic()
        try:
            result = ks.set(ORIGIN, KEY)
        except subprocess.TimeoutExpired:
            self.fail("secret-tool 超时没有降级，set() 直接抛出 TimeoutExpired（%.0f 秒后）" % (time.monotonic() - started))
        self.assertEqual(result["backend"], "file")

    def test_hanging_secret_tool_on_delete(self):
        self.only_fake_bin()
        os.makedirs(os.path.join(self.cfg, keystore.SERVICE))
        keystore.KeyStore()._write({ORIGIN: {"backend": "secret-tool", "hint": "sk-…cdef"}})
        self.fake_secret_tool("exec %s 30" % SLEEP)
        try:
            keystore.KeyStore().delete(ORIGIN)
        except subprocess.TimeoutExpired:
            self.fail("secret-tool 超时时 delete() 直接抛出 TimeoutExpired，索引里的记录也没删掉")
        self.assertNotIn(ORIGIN, self.index())


class EnvKey(Base):
    def test_env_key_is_bound_to_base(self):
        os.environ["WW_API_KEY"], os.environ["WW_API_BASE"] = KEY, ORIGIN + "/v1"
        ks = keystore.KeyStore()
        self.assertEqual(ks.status(ORIGIN), {"stored": True, "hint": keystore.mask(KEY), "backend": "env"})
        self.assertEqual(ks.get(ORIGIN), KEY)
        self.assertIsNone(ks.get("https://other.example.com"))
        with self.assertRaises(PermissionError):
            ks.set(ORIGIN, "sk-other-0123456789")
        self.assertFalse(os.path.exists(ks.path))  # env key is never written to disk

    def test_env_key_without_base_is_ignored(self):
        os.environ["WW_API_KEY"] = KEY
        with mock.patch.object(sys, "stderr"):
            ks = keystore.KeyStore()
        self.assertIsNone(ks.env_origin)


@unittest.skipUnless(os.environ.get("WW_TEST_KEYRING") == "1" and shutil.which("secret-tool"),
                     "需要已解锁的钥匙串会话（WW_TEST_KEYRING=1，见文件开头）")
class RealKeyring(Base):
    def lookup(self):
        r = subprocess.run(["secret-tool", "lookup"] + keystore._secret_attrs(ORIGIN), capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else None

    def test_roundtrip_keeps_plaintext_out_of_index(self):
        ks = keystore.KeyStore()
        self.assertEqual(ks.set(ORIGIN, KEY)["backend"], "secret-tool")
        with open(ks.path, encoding="utf-8") as f:
            self.assertNotIn(KEY, f.read())
        self.assertEqual(self.lookup(), KEY)
        self.assertEqual(keystore.KeyStore().get(ORIGIN), KEY)
        ks.delete(ORIGIN)
        self.assertIsNone(self.lookup())


if __name__ == "__main__":
    unittest.main()
