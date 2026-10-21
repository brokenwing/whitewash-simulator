# Linux 兼容性测试

项目平时在 Windows 上开发，这套测试专门检查到了 Linux 才会暴露的问题：文件名大小写、脚本权限和换行符、`start.sh`、本地服务、API Key 托管的钥匙串和降级逻辑，以及游戏在 Linux 浏览器里能不能正常玩。

```bash
tests/linux/run.sh                  # 全部运行，最后打印汇总
tests/linux/run.sh server keystore  # 只跑其中几项
```

有失败时退出码为 1。缺少某个工具的部分记为「跳过」，不算失败。全部运行大约 2 分钟（其中通关测试约 40 秒，Key 托管的两个超时用例各 10 秒）。

## 测试项

| 名称 | 内容 | 需要 |
|---|---|---|
| `static` | `*.sh` 在 git 里有可执行位、LF 换行、无 BOM；`Start.html`、`LevelEditor.html`、关卡清单、`tests/harness.js` 引用的路径大小写和磁盘完全一致；仓库里没有只差大小写的文件 | node |
| `unit` | 现有的 `node tests/run.js` 和 `--check-all --depth quick` | node |
| `server` | `tools/serve.py`：静态文件、Host / Origin 校验、`.` 开头路径隐藏、`/api/key`、转发到本机假上游时注入 Key；端口被占用的提示、Ctrl+C 后立即重启、无图形界面时 `--open` 不崩溃；`start.sh` 带端口、从带空格和中文的路径启动、没有 Python 时的提示；`tools/*.py` 能按 Python 3.8 语法解析 | python3 |
| `keystore` | `tools/keystore.py`：遵守 `XDG_CONFIG_HOME`、文件方式权限 0600 / 目录 0700、secret-tool 失败或卡住时降级到文件、环境变量 `WW_API_KEY` | python3 |
| `keystore`（真实钥匙串） | 在独立的 D-Bus 会话里起一个临时 gnome-keyring，确认 Key 真的进了钥匙串、`keys.json` 里没有明文 | `secret-tool`、`gnome-keyring-daemon`、`dbus-run-session`（Debian / Ubuntu：`sudo apt install libsecret-tools gnome-keyring dbus-daemon`） |
| `browser` | 无头 Chromium 分别通过本地服务和 `file://` 打开游戏：首页、签下教程关、用技能并结束两回合、刷新后存档还在、关卡编辑器能打开；页面没有报错、游戏内「🐞 异常」面板为空；报告委托书三种字体栈实际用到的字体 | Playwright（见下） |

所有测试都用临时端口和临时配置目录，不会碰你的 `~/.config/whitewash-simulator`、真实钥匙串或正在运行的游戏。

## 浏览器测试

```bash
cd tests/linux && npm install && npx playwright install chromium   # 只需一次
node tests/linux/browser.js --out /tmp/ww-shots                     # 截图写到这个目录
node tests/linux/browser.js --no-cjk-fonts                          # 模拟没装中文字体的系统，只看效果
```

已经有 Chrome / Chromium 的话，可以跳过 `playwright install`，用 `WW_CHROMIUM=/usr/bin/chromium node tests/linux/browser.js` 指定。

## 容器里测不到、需要手动确认的

- 在真实桌面上 `./start.sh` 能自动打开默认浏览器（GNOME / KDE，X11 和 Wayland 各试一次）。
- 桌面钥匙串处于锁定状态时，在「AI 设置」里保存 Key：会弹出解锁窗口，解锁后保存成功。
- Firefox 里用 `file://` 打开 `Start.html`，存档能保存、刷新后还在。
- 系统没有中文字体时（`fc-list :lang=zh` 为空），界面中文会显示成方块，需要先安装中文字体，比如 `sudo apt install fonts-noto-cjk`。
