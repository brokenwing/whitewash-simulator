#!/usr/bin/env sh
# 公关洗地模拟器：Linux 兼容性测试总入口
# 用法：tests/linux/run.sh [static|unit|server|keystore|browser ...]   不带参数时全部运行
#   static    文件层面：脚本可执行位 / 换行符、引用路径大小写（node）
#   unit      现有引擎单元测试 + 全部关卡快速通关测试（node tests/run.js）
#   server    本地服务和 start.sh（python3）
#   keystore  API Key 托管；装了 secret-tool + gnome-keyring + dbus-run-session 时额外测真实钥匙串
#   browser   无头 Chromium 冒烟测试（需要 Playwright，见 tests/linux/README.md）
# 退出码：有失败为 1；缺少工具的部分记为跳过，不算失败。
cd "$(dirname "$0")/../.." || exit 1

SECTIONS="${*:-static unit server keystore browser}"
RESULTS=""
FAILED=0

record() {  # record <名称> <通过|失败|跳过>
  RESULTS="$RESULTS
  $2  $1"
  [ "$2" = "失败" ] && FAILED=1
  return 0
}

need() {  # need <命令> <名称>：缺命令时记为跳过
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "没有找到 $1，跳过 $2"
  record "$2" "跳过"
  return 1
}

run() {  # run <名称> <命令...>
  name="$1"; shift
  if "$@"; then record "$name" "通过"; else record "$name" "失败"; fi
}

# 在独立的 D-Bus 会话里起一个已解锁的 gnome-keyring，只跑真实钥匙串那一项；结束后只关掉这次起的守护进程
real_keyring() {
  kr_home="$(mktemp -d /tmp/ww-kr.XXXXXX)"  # 路径要短：钥匙串的 socket 路径超过 108 字节会起不来
  HOME="$kr_home" dbus-run-session -- sh -c '
    printf pw | gnome-keyring-daemon --unlock --components=secrets >/dev/null
    WW_TEST_KEYRING=1 python3 tests/linux/test_keystore.py RealKeyring'
  status=$?
  for pid in $(pgrep -x gnome-keyring-d); do
    tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep -qx "HOME=$kr_home" && kill "$pid"
  done
  rm -rf "$kr_home"
  return $status
}

for s in $SECTIONS; do
  echo
  echo "==================== $s"
  case "$s" in
    static)
      need node "静态检查" && run "静态检查" node tests/linux/static.js ;;
    unit)
      if need node "单元测试与通关测试"; then
        run "单元测试" node tests/run.js
        run "通关测试（quick）" node tests/run.js --check-all --depth quick
      fi ;;
    server)
      need python3 "本地服务与 start.sh" && run "本地服务与 start.sh" python3 tests/linux/test_server.py ;;
    keystore)
      if need python3 "Key 托管"; then
        run "Key 托管" python3 tests/linux/test_keystore.py
        if command -v secret-tool >/dev/null 2>&1 && command -v gnome-keyring-daemon >/dev/null 2>&1 && command -v dbus-run-session >/dev/null 2>&1; then
          run "Key 托管（真实钥匙串）" real_keyring
        else
          echo "没有 secret-tool / gnome-keyring-daemon / dbus-run-session，跳过真实钥匙串测试"
          record "Key 托管（真实钥匙串）" "跳过"
        fi
      fi ;;
    browser)
      if need node "浏览器冒烟测试"; then
        node tests/linux/browser.js
        case $? in
          0) record "浏览器冒烟测试" "通过" ;;
          77) record "浏览器冒烟测试" "跳过" ;;
          *) record "浏览器冒烟测试" "失败" ;;
        esac
      fi ;;
    *)
      echo "未知的测试项：$s（可选 static unit server keystore browser）"
      record "$s" "失败" ;;
  esac
done

echo
echo "==================== 汇总$RESULTS"
exit $FAILED
