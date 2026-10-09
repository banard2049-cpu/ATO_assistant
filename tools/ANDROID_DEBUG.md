# 安卓本地调试

在项目根目录运行，需要 Python 3.10 或更新版本。SDK、JDK、Gradle、Android 15
镜像和模拟器数据均保存在 `tools/.packaging-cache/android/`，不会进入版本库。
下载会沿用电脑的 HTTPS 代理设置。

```powershell
python tools/debug_android.py setup
python tools/debug_android.py build
python tools/debug_android.py start
```

模拟器启动后，运行 `python tools/debug_android.py status`，返回 `1` 表示系统启动完成。
然后安装并打开调试版：

```powershell
python tools/debug_android.py install
```

调试版使用 `com.ato.assistant` 包名，脚本固定操作 `emulator-5554`，不操作连接的实体手机。
`install` 会更新模拟器里的应用并保留它的存档。APK 位于
`tools/.packaging-cache/android/project-build/app/build/outputs/apk/debug/app-debug.apk`。
该 APK 仅用于本地调试；正式发行继续使用原有发布流程。

在 Chrome 的 `chrome://inspect/#devices` 中可以检查应用的 WebView、Console 和 Network。
只有可调试 APK 会启用 WebView 检查。

本机的系统扩展 DLL 会导致 `adb.exe` 客户端退出时崩溃，因此调试脚本通过 Python
连接官方 ADB 的本地服务。模拟器、安装、日志和状态命令均已验证可以正常使用。

```powershell
python tools/debug_android.py logs
python tools/debug_android.py stop
```

自动验证时可使用 `start --headless`。模拟器日志保存在
`tools/.packaging-cache/android/emulator.log`。模拟器使用软件图形渲染和 WHPX CPU 加速，
便于在不同显卡环境下运行。`setup` 最后的加速检查可以确认当前电脑是否满足要求。

## 自动回归

模拟器开机并安装调试 APK 后运行：

```powershell
python -m pip install websocket-client
python tools/test_android_emulator.py
```

该测试创建独立的 `emutest-*` 合成账号，覆盖七个模块的导入、逐日备份、恢复前一天、
图片附件、账号隔离、fetch 桥接、第二屏服务、强制结束进程后的持久化，以及八个页面
加载。测试报告位于 `tools/.packaging-cache/android/emulator-test-results.json`。
测试会切换模拟器内的当前账号并重启应用；其他账号的已有存档会保留。

不启动模拟器也可以运行核心回归：

```powershell
python tools/test_android_campaign_import.py
python tools/test_android_atopack_import.py
node tests/hero-export.test.cjs
```
