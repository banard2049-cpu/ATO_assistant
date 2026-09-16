"""Exercise the native portable launcher with PHP, without opening a browser/server.

Run with Python on Windows or macOS; PHP must be on PATH. The selected native
launcher runs from folders with spaces, parentheses and shell/INI metacharacters
(an extracted ZIP is very often named "... (1)"). The probe also emulates the
built-in server's per-script chdir, so a relative session.save_path (which
silently loses every login) fails the test, and it checks that the runtime's own
php.ini survives the launcher's generated session INI.

The launcher is never allowed to start a real server here: its `php -S ... -t ...`
call is replaced by a single-shot probe, the replacement is verified, and the port
is rewritten to a free ephemeral one anyway.  Every run is bound to a Windows job
object with KILL_ON_JOB_CLOSE (taskkill /F /T is the fallback, killpg on macOS),
so cmd/zsh and php die with the test even when a case fails; afterwards the port
is checked to be released, which is the one leak check that also works where
process listings are denied.
"""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = sys.platform == "win32"
if not WINDOWS and sys.platform != "darwin":
    raise SystemExit("Run this test on Windows or macOS.")
php = shutil.which("php")
if not php:
    raise SystemExit("PHP must be on PATH.")
php = Path(php).resolve()
launcher_name = "start-ato-portable.bat" if WINDOWS else "start-ato-portable.command"
source = (ROOT / "tools/packaging/portable" / launcher_name).read_text(encoding="utf-8")

# 端口换成临时端口：即使启动器的 `php -S` 因为以后的改动没被替换掉而真的起了服务器，
# 也不会撞上正在运行的应用（8793）。
with socket.socket() as _probe:
    _probe.bind(("127.0.0.1", 0))
    PORT = _probe.getsockname()[1]
source = source.replace("8793", str(PORT))
if WINDOWS:
    source = source.replace('start "" "%ATO_URL%"', 'rem Browser disabled in test')
    source = source.replace('-S 0.0.0.0:%ATO_PORT% -t "%CD%"', '-f probe.php')
else:
    source = source.replace('(sleep 1; open "$URL") >/dev/null 2>&1 &', ':')
    source = source.replace('-S "0.0.0.0:${PORT}" -t "$APP_ROOT"', '-f probe.php')
# 替换必须真的生效。没替换成功就会启动一个真正的 php 服务器（永不退出、占用端口），
# 测试会挂住并留下进程；这里直接停下来，而不是留下泄漏。
if "-f probe.php" not in source or "-S " in source or '-S"' in source:
    raise SystemExit(
        f"测试准备失败：没能把 {launcher_name} 里的 php -S 服务器调用替换成单次探测"
        "（启动器的写法变了？）。照这样跑下去会真的起一个服务器，所以直接退出。"
    )


def fail(message):
    """Fail fast with a readable reason instead of hanging or dumping a traceback."""
    print(f"便携版启动器测试失败：{message}", file=sys.stderr)
    raise SystemExit(1)


# 测试目录必须建在仓库里、且被 .gitignore 覆盖（/tools/.packaging-cache/）。
# 这里刻意不用 tempfile.mkdtemp：它以 0700 建目录，在部分受限环境里创建者本人之后
# 也读不回来，启动器就会一直等下去（测试永久挂起），还会在 export/ 里留下一堆
# export/portable-launcher-test-* 这种读不了的目录，连递归工具都被拖坏。
# tools/test_packaging_exclusions.py 记录的是同一个坑。
work = ROOT / "tools" / ".packaging-cache" / "portable-launcher-test"

shutil.rmtree(work, ignore_errors=True)
try:
    work.mkdir(parents=True)
except OSError as error:
    fail(f"无法创建测试目录 {work}：{error}")

# 先自检：目录建出来必须真的能读回来。否则先拷上百 MB 的 PHP 运行时、再等启动器
# 超时，最后只会看到一句莫名其妙的挂起；就在报错最清楚的地方停下来。
probe = work / ".write-probe"
readable = False
try:
    probe.write_text("ok", encoding="utf-8")
    readable = probe.read_text(encoding="utf-8") == "ok" and any(work.iterdir())
except OSError as error:
    fail(f"测试目录 {work} 建好后读不回来：{error}")
finally:
    probe.unlink(missing_ok=True)
if not readable:
    fail(f"测试目录 {work} 建好后读不回来（目录权限异常），后面每个启动器都会挂住")


def _windows_job():
    """Job object that kills every process assigned to it when it is closed.

    taskkill can be denied outright (restricted sandboxes) and killing only
    cmd.exe leaves php.exe running, so every launcher run is bound to a job with
    KILL_ON_JOB_CLOSE: even if this test is killed halfway through, cmd.exe and
    php.exe go with it and no server can be left behind.  Returns None when job
    objects are unavailable, in which case kill_tree() falls back to taskkill.
    """
    if not WINDOWS:
        return None
    import ctypes
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        return None

    class BasicLimitInformation(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", wintypes.LARGE_INTEGER),
            ("PerJobUserTimeLimit", wintypes.LARGE_INTEGER),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class IoCounters(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_ulonglong),
            ("WriteOperationCount", ctypes.c_ulonglong),
            ("OtherOperationCount", ctypes.c_ulonglong),
            ("ReadTransferCount", ctypes.c_ulonglong),
            ("WriteTransferCount", ctypes.c_ulonglong),
            ("OtherTransferCount", ctypes.c_ulonglong),
        ]

    class ExtendedLimitInformation(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", BasicLimitInformation),
            ("IoInfo", IoCounters),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    info = ExtendedLimitInformation()
    info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not kernel32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):
        kernel32.CloseHandle(job)
        return None
    return kernel32, job


JOB = _windows_job()


def assign_to_job(process):
    if JOB is None:
        return
    import ctypes
    from ctypes import wintypes

    kernel32, job = JOB
    kernel32.AssignProcessToJobObject(job, wintypes.HANDLE(int(process._handle)))


def close_job():
    """Closing the last job handle kills every process still in it."""
    if JOB is None:
        return
    kernel32, job = JOB
    kernel32.CloseHandle(job)


def kill_tree(process):
    """Kill the launcher and everything it started (cmd/zsh → php), not just the shell."""
    if process.poll() is None:
        killed = False
        if WINDOWS:
            # taskkill /T 连子进程一起收掉：只杀 cmd.exe 会把 php.exe 留在后台。
            result = subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            killed = result.returncode == 0
            if not killed and JOB is None:
                # 受限环境里 taskkill 会被拒绝；作业对象兜底，实在不行至少收掉自己的子进程。
                process.kill()
        else:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                process.kill()
    try:
        process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def stray_php_processes():
    """php processes started from this test's scratch tree.

    Returns None when the operating system refuses to list processes (restricted
    sandboxes deny Get-CimInstance / tasklist): the caller then reports that the
    command-line check was unavailable instead of pretending it found nothing.
    """
    marker = str(work)
    if WINDOWS:
        script = (
            "Get-CimInstance Win32_Process -Filter \"Name='php.exe'\" | "
            "Where-Object { $_.CommandLine -and $_.CommandLine.Contains('%s') } | "
            "ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"
        ) % marker.replace("'", "''")
        result = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
        output = result.stdout.decode("utf-8", errors="replace")
        if result.returncode != 0 or "denied" in output.lower() or "拒绝访问" in output:
            return None
    else:
        result = subprocess.run(["pgrep", "-fl", "php"],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
        if result.returncode not in (0, 1):  # 1 = 没有匹配
            return None
        output = result.stdout.decode("utf-8", errors="replace")
    lines = [
        line for line in output.splitlines()
        if (marker in line or work.as_posix() in line) and line.strip()
    ]
    for line in lines:
        pid = line.split(" ", 1)[0].strip()
        if pid.isdigit():
            subprocess.run(["taskkill", "/F", "/PID", pid] if WINDOWS else ["kill", "-9", pid],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return lines


def server_still_listening():
    """True when something is still accepting connections on our ephemeral port.

    A leaked `php -S` server is exactly what keeps this port open, and unlike a
    process listing this probe works even in restricted sandboxes.
    """
    with socket.socket() as probe:
        probe.settimeout(1)
        return probe.connect_ex(("127.0.0.1", PORT)) == 0


def prepare(folder, runtime=True):
    folder.mkdir(parents=True)
    (folder / "api").mkdir()
    script = source.replace('\n', '\r\n') if WINDOWS else source
    (folder / launcher_name).write_bytes(script.encode("utf-8"))
    # PHP's built-in server changes the working directory to the requested
    # script's directory before running it, so a relative session.save_path
    # silently resolves to api/data/sessions and every login is dropped.  The
    # probe therefore demands an absolute save_path and emulates that chdir;
    # otherwise it would sit in the package root and never catch the bug.
    # ATO_TEST_EXPECT_INI additionally proves the runtime's own php.ini is still
    # in effect, i.e. the launcher's generated session INI did not replace it.
    # 会话文件用 scandir 找，不用 glob：目录名里的 [ ] 会被 glob 当成字符组
    # （"ATO [2] ..." 永远匹配不上），那样测试会误报启动器失败。
    (folder / "probe.php").write_text(r'''<?php
$savePath = (string) ini_get('session.save_path');
$isAbsolute = $savePath !== ''
  && ($savePath[0] === '/' || $savePath[0] === '\\' || (strlen($savePath) > 1 && $savePath[1] === ':'));
if (!$isAbsolute) exit(10);
if (getenv('ATO_TEST_EXPECT_INI') === '1' && ini_get('memory_limit') !== '123M') exit(14);
// post_max_size 必须留在 API 自己的上限（6 MiB）之上：否则超大请求体会在 PHP
// request startup 阶段被丢掉，接口只能回 200 + HTML 警告而不是结构化的 413。
$post = (string) ini_get('post_max_size');
$unit = strtolower(substr($post, -1));
$bytes = (float) $post * ['k' => 1024, 'm' => 1048576, 'g' => 1073741824][$unit] ?? 1;
if ($bytes <= 6 * 1024 * 1024) exit(15);
// 启动期警告绝不能被写进响应正文；但日志必须留着（log_errors=1 且不设 error_log，
// PHP 会写到 stderr，也就是启动器自己那个控制台窗口）——两个都关掉的话，致命错误
// 会不留任何痕迹，用户只能看到一个空白的 500。
if (!in_array((string) ini_get('display_errors'), ['', '0', 'Off', 'off'], true)) exit(16);
if (!in_array((string) ini_get('display_startup_errors'), ['', '0', 'Off', 'off'], true)) exit(17);
if ((int) ini_get('log_errors') !== 1) exit(18);
if ((string) ini_get('error_log') !== '') exit(19);
chdir(__DIR__ . '/api');
if (!session_start()) exit(11);
$_SESSION['portable_test'] = 'ok';
if (!session_write_close()) exit(12);
$found = false;
foreach (scandir($savePath) ?: [] as $entry) {
  if (str_starts_with($entry, 'sess_')) { $found = true; break; }
}
if (!$found) exit(13);
exit((int) getenv('ATO_TEST_EXIT'));
''', encoding="utf-8")
    if runtime:
        dest = folder / ("runtime/php" if WINDOWS else "runtime/php/bin")
        dest.mkdir(parents=True)
        if WINDOWS:
            shutil.copy2(php, dest / "php.exe")
            for library in php.parent.glob("*.dll"):
                shutil.copy2(library, dest / library.name)
            # 便携包里的运行时可能自带 php.ini：启动器改用 -c 之后必须把它照抄过去，
            # 否则扩展与其它设置会一起丢掉。这里放一个标记值，由 probe.php 检验。
            (dest / "php.ini").write_text("memory_limit = 123M\n", encoding="utf-8")
        else:
            (dest / "php").symlink_to(php)


def run(folder, expected, php_exit=0, expect_runtime_ini=False):
    env = dict(os.environ, ATO_TEST_EXIT=str(php_exit))
    if expect_runtime_ini:
        env["ATO_TEST_EXPECT_INI"] = "1"
    # Inherited delayed expansion must not corrupt '!' in the Windows path.
    command = ["cmd.exe", "/d", "/v:on", "/c", launcher_name] if WINDOWS else ["/bin/zsh", launcher_name]
    # 独立进程组：超时/失败时可以连同 cmd → php 一起杀掉，绝不留下后台服务器。
    extra = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS else {"start_new_session": True}
    process = subprocess.Popen(command, cwd=folder, env=env, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **extra)
    assign_to_job(process)
    try:
        output_bytes, _ = process.communicate(timeout=30)
        code = process.returncode
    except subprocess.TimeoutExpired:
        # 挂起时给一句人能看懂的话，并且先把子进程收掉再报错。
        kill_tree(process)
        fail(f"{folder.name}：启动器 30 秒内没有退出（命令：{' '.join(command)}）")
    finally:
        kill_tree(process)
    output = output_bytes.decode("utf-8", errors="replace")
    if code != expected:
        hint = ""
        if "syntax error, unexpected" in output:
            hint = ("\n  提示：PHP 把 -d 的取值当 INI 文本解析，值里未加引号的 |&~!(){} 字符会被截断；"
                    "启动器必须把 session.save_path 写进 INI 文件用 -c 传（或写成 INI 引号形式）。")
        fail(f"{folder.name}：启动器返回 {code}，期望 {expected}\n{output}{hint}")


try:
    # 现实中最常见的目录名就被解压工具加了 " (1)"，另外再压一遍 & ! [] 与中文。
    for name in ["plain", "ATO-Assistant-Portable-1.3.1-windows-x64 (1)", "ATO [2] & test ! 中文"]:
        folder = work / name
        prepare(folder)
        run(folder, 0, expect_runtime_ini=WINDOWS)
        run(folder, 7, php_exit=7, expect_runtime_ini=WINDOWS)
        print(f"PASS: {name}: session creation and exit code 7")

    missing = work / "missing (1) & PHP !"
    prepare(missing, runtime=False)
    run(missing, 1)
    print("PASS: missing runtime reports failure")

    blocked = work / "plain"
    sessions = blocked / "data/sessions"
    # Move only this test's directory to simulate a file blocking session storage.
    assert sessions.resolve().is_relative_to(work.resolve())
    sessions.rename(blocked / "saved-sessions")
    sessions.write_text("blocked", encoding="utf-8")
    run(blocked, 1)
    print("PASS: session directory creation failure")
finally:
    # 先收掉可能残留的 php（它可能还占着测试目录里的文件），再清目录。
    # 关掉作业对象 = 连同 cmd.exe / php.exe 一起收掉，即使上面某个用例已经异常退出。
    close_job()
    leftovers = stray_php_processes()
    if leftovers:
        print("便携版启动器测试失败：测试结束后仍有 php 进程残留（已强制结束）：", file=sys.stderr)
        for line in leftovers:
            print("  " + line, file=sys.stderr)
        # 已经有别的失败原因时不要覆盖它，只保证退出码不是 0。
        if sys.exc_info()[0] is None:
            sys.exit(1)
    # 端口检查：真被留下的服务器一定还占着这个临时端口。进程清单查不了的环境
    # （CIM/tasklist 被拒）也照样能查这一项，所以它才是「没有残留」的硬证据。
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and server_still_listening():
        time.sleep(0.25)
    if server_still_listening():
        print(f"便携版启动器测试失败：临时端口 {PORT} 仍在响应，说明留下了 php 服务器进程。",
              file=sys.stderr)
        if sys.exc_info()[0] is None:
            sys.exit(1)
    # 绝不能留下测试树：以前 mkdtemp 留下的 export/portable-launcher-test-* 目录
    # 连自己也读不回来，会一直拖坏递归工具。
    shutil.rmtree(work, ignore_errors=True)
    sweep = ("命令行清单：没发现本测试启动的 php 进程" if leftovers is not None
             else "命令行清单：本环境不允许查询进程（Get-CimInstance/tasklist 被拒），"
                  "以端口是否释放为准")
    print(f"测试目录已清理：{work}；残留检查：端口 {PORT} 已释放；{sweep}")
