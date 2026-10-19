@echo off
rem 公关洗地模拟器：Windows 一键启动（本地服务 + 自动打开浏览器）
rem 用法：双击，或 start.bat [端口]
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=8765"
if not "%~1"=="" set "PORT=%~1"

rem 依次尝试 py 启动器、python、python3；实际运行一次，排除应用商店的占位程序和 Python 2
set "PY="
for %%C in ("py -3" "python" "python3") do (
  if not defined PY (
    %%~C -c "import sys; sys.exit(sys.version_info[0] < 3)" >nul 2>nul && set "PY=%%~C"
  )
)
if not defined PY (
  echo 没有找到 Python 3。请从 https://www.python.org/downloads/ 安装，安装时勾选 "Add python.exe to PATH"。
  echo 也可以直接双击 Start.html 离线游玩（不能使用本地代理）。
  pause
  exit /b 1
)

%PY% tools\serve.py --port %PORT% --open
if errorlevel 1 pause
endlocal
