"""Exercise the native portable launcher with PHP, without opening a browser/server.

Run with Python on Windows or macOS; PHP must be on PATH. The selected native
launcher runs from folders with spaces, parentheses and shell/INI metacharacters.
The probe also emulates the built-in server's per-script chdir, so a relative
session.save_path (which silently loses every login) fails the test.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

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
if WINDOWS:
    source = source.replace('start "" "%ATO_URL%"', 'rem Browser disabled in test')
    source = source.replace('-S 0.0.0.0:%ATO_PORT% -t "%CD%"', '-f probe.php')
else:
    source = source.replace('(sleep 1; open "$URL") >/dev/null 2>&1 &', ':')
    source = source.replace('-S "0.0.0.0:${PORT}" -t "$APP_ROOT"', '-f probe.php')

scratch = ROOT / "export"
scratch.mkdir(exist_ok=True)
work = Path(tempfile.mkdtemp(prefix="portable-launcher-test-", dir=scratch))


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
    (folder / "probe.php").write_text(r'''<?php
$savePath = (string) ini_get('session.save_path');
$isAbsolute = $savePath !== ''
  && ($savePath[0] === '/' || $savePath[0] === '\\' || (strlen($savePath) > 1 && $savePath[1] === ':'));
if (!$isAbsolute) exit(10);
chdir(__DIR__ . '/api');
if (!session_start()) exit(11);
$_SESSION['portable_test'] = 'ok';
if (!session_write_close()) exit(12);
if (!glob(__DIR__ . '/data/sessions/sess_*')) exit(13);
exit((int) getenv('ATO_TEST_EXIT'));
''', encoding="utf-8")
    if runtime:
        dest = folder / ("runtime/php" if WINDOWS else "runtime/php/bin")
        dest.mkdir(parents=True)
        if WINDOWS:
            shutil.copy2(php, dest / "php.exe")
            for library in php.parent.glob("*.dll"):
                shutil.copy2(library, dest / library.name)
        else:
            (dest / "php").symlink_to(php)


def run(folder, expected, php_exit=0):
    env = dict(os.environ, ATO_TEST_EXIT=str(php_exit))
    # Inherited delayed expansion must not corrupt '!' in the Windows path.
    command = ["cmd.exe", "/d", "/v:on", "/c", launcher_name] if WINDOWS else ["/bin/zsh", launcher_name]
    result = subprocess.run(command, cwd=folder, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
    assert result.returncode == expected, (folder.name, result.returncode,
                                           result.stdout.decode("utf-8", errors="replace"))


for name in ["plain", "ATO (1) & test ! 中文"]:
    folder = work / name
    prepare(folder)
    run(folder, 0)
    run(folder, 7, php_exit=7)
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
print(f"Test files: {work}")
