"""router.php 私有路径拦截测试（永久化自 tmp/item01-verify/verify_router.py）。

运行：python tools/test_router_private_paths.py

启动器都把仓库根目录当作 web 根，把 router.php 作为 `php -S` 的最后一个参数，所以
匿名请求曾经可以直接下载 /data/ato-users.json（口令哈希）、/data/ato-campaign-<账号>.json
（完整存档）、data/sessions、data/backups 与旁边的 *.lock。这里用真实 router.php 把
「私有路径一律 403/404、公开页面与静态资源照常、API 往返仍然可用」钉死。

安全做法（沿用 tmp/code-review/repro_php.py）：只把 api/ 与 router.php 复制到一份
临时目录里，配上全是虚构内容的 data/、tmp/、.git/ 夹具，在回环地址的随机端口上启动
PHP 内建服务器。仓库真实的 data/ 既不读也不写，更不会通过 HTTP 暴露。
"""
from __future__ import annotations

import http.cookiejar
import json
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
assert (ROOT / "api").is_dir(), ROOT

# 匿名请求绝不能拿到的内容：只要出现在响应体里就算泄露。
MARKERS = ("FIXTURE-PASSWORD-HASH", "SYNTHETIC-PRIVATE-HERO", "session fixture",
           "SYNTHETIC-BACKUP", 'fixture": true', "SYNTHETIC-GIT-TOKEN", "SYNTHETIC-TMP-NOTE",
           "SYNTHETIC-EXPORT-PACK", "SYNTHETIC-TTS-CREDENTIAL")

PRIVATE_PATHS = [
    "/data/ato-users.json",
    "/data/ato-campaign-fixture.json",
    "/data/ato-campaign-fixture.json.lock",
    "/data/ato-second-screens.json",
    "/data/sessions/sess_fixture",
    "/data/backups/fixture/recent/default/c1/day-T1/backup-01.json",
    "/data",
    "/data/",
    "/DATA/ato-users.json",
    "/data./ato-users.json",
    "//data/ato-users.json",
    "/./data/ato-users.json",
    "/assets/../data/ato-users.json",
    "/data%2Fato-users.json",
    "/%64ata/ato-users.json",
    "/.htaccess/../data/ato-users.json",
    "/data%20/ato-users.json",
    "/data.../ato-users.json",
    "/tmp/note.txt",
    "/.git/config",
    "/.git/config/../config",
    # tools/ 必须保持可达（map/app.js 会打开 ../tools/tag-editor.html），
    # 所以凭据文件是按文件名挡的，不是按目录。
    "/tools/xfyun-long-tts.config.json",
    "/tools/xfyun-long-tts.config.json?x=1",
    "/tools/../tools/xfyun-long-tts.config.json",
    "/TOOLS/XFYUN-LONG-TTS.CONFIG.JSON",
    # export/ 放本地构建产物与使用者自备的 *.atopack 资料包，应用从不通过 HTTP 取它。
    "/export/",
    "/export",
    "/export/pack/manifest.json",
    "/export/pack/map/images/tile.png",
    "/EXPORT/pack/manifest.json",
    "/.htaccess",
]

# HTTP/1.1 绝对形式请求目标（"GET http://host/data/x HTTP/1.1"）：curl -x 与
# 代理式客户端会这么发。此时 REQUEST_URI 是整个 URL 而服务器仍然按路径取文件，
# 只读 REQUEST_URI 首段会看到 "http:" 从而放行——这条曾经是可以真实下载
# /data/ato-users.json 的绕过，所以必须逐条回归。
ABSOLUTE_FORM_PRIVATE = [
    ("http://127.0.0.1:{port}/data/ato-users.json", "FIXTURE-PASSWORD-HASH"),
    ("http://127.0.0.1:{port}/data/ato-campaign-fixture.json", "SYNTHETIC-PRIVATE-HERO"),
    ("http://127.0.0.1:{port}/%64ata/ato-users.json", "FIXTURE-PASSWORD-HASH"),
    ("http://127.0.0.1:{port}//data/ato-users.json", "FIXTURE-PASSWORD-HASH"),
    ("http://127.0.0.1:{port}/assets/../data/ato-users.json", "FIXTURE-PASSWORD-HASH"),
    ("http://127.0.0.1:{port}/DATA/ato-users.json", "FIXTURE-PASSWORD-HASH"),
    ("http://127.0.0.1:{port}/data./ato-users.json", "FIXTURE-PASSWORD-HASH"),
    ("http://127.0.0.1:{port}/tmp/note.txt", "SYNTHETIC-TMP-NOTE"),
    ("http://127.0.0.1:{port}/.git/config", "SYNTHETIC-GIT-TOKEN"),
    ("http://127.0.0.1:{port}/tools/xfyun-long-tts.config.json", "SYNTHETIC-TTS-CREDENTIAL"),
    ("http://127.0.0.1:{port}/export/pack/manifest.json", "SYNTHETIC-EXPORT-PACK"),
    # 任意的 authority 也必须被挡（此前 http://evil.invalid/data/... 一样能下载）。
    ("http://evil.invalid/data/ato-users.json", "FIXTURE-PASSWORD-HASH"),
]

# 绝对形式下的公开路径不得连坐。
ABSOLUTE_FORM_PUBLIC = ["http://127.0.0.1:{port}/", "http://127.0.0.1:{port}/index.html"]

# Windows 8.3 短名写法：内建服务器在本机不一定解析到真实目录，所以只核对不泄露。
OBSERVED_PATHS = ["/GIT~1/config", "/DATA~1/ato-users.json"]

# 公开路径：deny 规则绝不能连坐（database/ 与 tmp-notes.txt 是 data/、tmp/ 的形近名）。
PUBLIC_EXPECTATIONS = {
    "/": ("index fixture",),
    "/index.html": ("index fixture",),
    "/database/index.html": ("database fixture",),
    "/tmp-notes.txt": ("public tmp-notes fixture",),
    "/tools/tag-editor.html": ("tag editor fixture",),
}


def build_scratch() -> Path:
    """搭一棵只有虚构内容的临时站点，绝不碰仓库真实的 data/。"""
    scratch = ROOT / "tmp" / ("router-private-paths-" + uuid.uuid4().hex[:8])
    (scratch / "api").mkdir(parents=True)
    (scratch / "data" / "sessions").mkdir(parents=True)
    (scratch / "data" / "backups" / "fixture" / "recent" / "default" / "c1" / "day-T1").mkdir(parents=True)
    (scratch / "assets").mkdir(parents=True)
    for source in sorted((ROOT / "api").glob("*.php")):
        shutil.copy2(source, scratch / "api" / source.name)
    shutil.copy2(ROOT / "router.php", scratch / "router.php")
    shutil.copy2(ROOT / ".htaccess", scratch / ".htaccess")
    shutil.copy2(ROOT / "map" / "images" / "c5-face-b.png", scratch / "assets" / "fixture.png")
    (scratch / "index.html").write_text("<!doctype html><title>fixture</title>index fixture", encoding="utf-8")
    (scratch / "data" / "ato-users.json").write_text(
        json.dumps({"users": [{"username": "fixture", "passwordHash": "FIXTURE-PASSWORD-HASH"}]}), encoding="utf-8")
    (scratch / "data" / "ato-campaign-fixture.json").write_text(
        json.dumps({"sections": {"heroes": {"heroes": [{"id": "SYNTHETIC-PRIVATE-HERO"}]}}}), encoding="utf-8")
    (scratch / "data" / "ato-campaign-fixture.json.lock").write_text("lock fixture\n", encoding="utf-8")
    (scratch / "data" / "ato-second-screens.json").write_text('{"fixture": true}', encoding="utf-8")
    (scratch / "data" / "sessions" / "sess_fixture").write_text("session fixture\n", encoding="utf-8")
    (scratch / "data" / "backups" / "fixture" / "recent" / "default" / "c1" / "day-T1" / "backup-01.json").write_text(
        '{"SYNTHETIC-BACKUP": true}', encoding="utf-8")
    (scratch / ".git").mkdir()
    (scratch / ".git" / "config").write_text(
        '[remote "origin"]\n\turl = https://SYNTHETIC-GIT-TOKEN@example.invalid/x\n', encoding="utf-8")
    (scratch / "tmp").mkdir()
    (scratch / "tmp" / "note.txt").write_text("SYNTHETIC-TMP-NOTE\n", encoding="utf-8")
    (scratch / "database").mkdir()
    (scratch / "database" / "index.html").write_text("<!doctype html>database fixture", encoding="utf-8")
    (scratch / "tmp-notes.txt").write_text("public tmp-notes fixture\n", encoding="utf-8")
    # export/ 放本地构建产物与使用者自备的 *.atopack 资料包：应用从不通过 HTTP 取它。
    (scratch / "export" / "pack" / "map" / "images").mkdir(parents=True)
    (scratch / "export" / "pack" / "manifest.json").write_text(
        '{"SYNTHETIC-EXPORT-PACK": true}', encoding="utf-8")
    (scratch / "export" / "pack" / "map" / "images" / "tile.png").write_bytes(
        b"\x89PNG\r\n\x1a\n" + b"SYNTHETIC-EXPORT-PACK".ljust(32, b"\x00"))
    # tools/ 必须保持可达（map/app.js 会打开 ../tools/tag-editor.html），
    # 所以只按文件名挡凭据文件。
    (scratch / "tools").mkdir()
    (scratch / "tools" / "xfyun-long-tts.config.json").write_text(
        '{"apiKey": "SYNTHETIC-TTS-CREDENTIAL"}', encoding="utf-8")
    (scratch / "tools" / "tag-editor.html").write_text(
        "<!doctype html>tag editor fixture", encoding="utf-8")
    return scratch


def check_private_list_parity(failures: list[str]) -> None:
    """router.php 的 $privateDirectories 与 .htaccess 的正则必须逐项一致。

    两处注释都写着「Keep the two lists in sync」，但 Apache 部署（docker-compose*.yml
    的 ./:/var/www/html 挂载）只有 .htaccess 生效，php -S 部署只有 router.php 生效，
    所以任何一侧漏项都会在某一种部署上直接放行 data/ 之类的目录。这里用解析而不是
    人工比对来锁住它。
    """
    router_source = (ROOT / "router.php").read_text(encoding="utf-8")
    match = re.search(r"\$privateDirectories\s*=\s*\[([^\]]*)\]", router_source)
    if not match:
        failures.append("router.php 里找不到 $privateDirectories 列表")
        return
    router_names = {item.strip().strip("'\"").lower()
                    for item in match.group(1).split(",") if item.strip()}

    htaccess = (ROOT / ".htaccess").read_text(encoding="utf-8")
    groups = re.findall(r"/\(\?:([a-z0-9\\.|]+)\)\(\?:/", htaccess, flags=re.IGNORECASE)
    if not groups:
        failures.append(".htaccess 里找不到私有目录正则 (?:...)(?:/|$)")
        return
    htaccess_names = set()
    for group in groups:
        for item in group.split("|"):
            item = item.strip().replace("\\", "").lower()
            if item:
                htaccess_names.add(item)

    missing_in_htaccess = router_names - htaccess_names
    missing_in_router = htaccess_names - router_names
    if missing_in_htaccess:
        failures.append(".htaccess 缺少 router.php 里的私有目录：" + ", ".join(sorted(missing_in_htaccess)))
    if missing_in_router:
        failures.append("router.php 缺少 .htaccess 里的私有目录：" + ", ".join(sorted(missing_in_router)))

    # 凭据文件必须两侧都点名（tools/ 目录本身不能拉黑）。
    for name in ("xfyun-long-tts", ".htaccess"):
        if name not in router_source:
            failures.append(f"router.php 的 $privateFiles 没有覆盖 {name}")
        if name not in htaccess:
            failures.append(f".htaccess 的 <FilesMatch> 没有覆盖 {name}")


def main() -> int:
    failures: list[str] = []

    # 不依赖服务器：先锁住 router.php 与 .htaccess 的私有目录名单一致。
    check_private_list_parity(failures)

    php = shutil.which("php")
    if not php:
        print("router.php 私有路径拦截测试失败：")
        print("  找不到 PHP 运行时（php 不在 PATH 上）")
        return 1

    scratch = build_scratch()
    # 语法先过一遍：内建服务器把语法错误当成 500，会掩盖真正的拦截结论。
    for source in sorted((ROOT / "api").glob("*.php")) + [ROOT / "router.php"]:
        lint = subprocess.run([php, "-l", str(source)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if lint.returncode != 0:
            failures.append(f"PHP 语法检查失败：{source.name}")

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"

    proc: subprocess.Popen | None = None
    log = None
    try:
        log = (scratch / "server.log").open("wb")
        proc = subprocess.Popen(
            [php, "-d", f"session.save_path={scratch / 'data' / 'sessions'}",
             "-S", f"127.0.0.1:{port}", "-t", str(scratch), str(scratch / "router.php")],
            stdout=log, stderr=log, cwd=str(scratch),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        started = False
        for _ in range(100):
            try:
                urllib.request.urlopen(base + "/", timeout=1).close()
                started = True
                break
            except (OSError, urllib.error.URLError):
                time.sleep(0.05)
        if not started:
            failures.append(f"PHP 内建服务器没能在 {base} 上起来（见 {scratch / 'server.log'}）")

        def anonymous(path: str) -> tuple[int, bytes]:
            """没有任何 cookie 的请求：状态码 + 前 400 字节。"""
            request = urllib.request.Request(base + path)
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    return response.status, response.read(400)
            except urllib.error.HTTPError as error:
                return error.code, error.read(400)

        def absolute_form(target: str) -> tuple[int, bytes]:
            """用 raw socket 发绝对形式请求目标（urllib 只会发 origin-form）。"""
            with socket.create_connection(("127.0.0.1", port), timeout=10) as conn:
                conn.sendall((
                    f"GET {target} HTTP/1.1\r\n"
                    f"Host: 127.0.0.1:{port}\r\n"
                    "Connection: close\r\n\r\n"
                ).encode("ascii"))
                chunks = []
                while True:
                    data = conn.recv(65536)
                    if not data:
                        break
                    chunks.append(data)
            raw = b"".join(chunks)
            head, _, body = raw.partition(b"\r\n\r\n")
            status_line = head.split(b"\r\n", 1)[0].decode("latin-1")
            try:
                status = int(status_line.split()[1])
            except (IndexError, ValueError):
                status = 0
            return status, body[:400]

        # 1. 私有路径：必须 403/404，且响应体里不得出现任何虚构机密。
        if started:
            for path in PRIVATE_PATHS:
                status, body = anonymous(path)
                text = body.decode("utf-8", "replace")
                leaked = [marker for marker in MARKERS if marker in text]
                if status not in (403, 404):
                    failures.append(f"私有路径 {path} 返回 {status}（应为 403/404）")
                if leaked:
                    failures.append(f"私有路径 {path} 泄露内容：{leaked}")

            for path in OBSERVED_PATHS:
                status, body = anonymous(path)
                text = body.decode("utf-8", "replace")
                leaked = [marker for marker in MARKERS if marker in text]
                if leaked:
                    failures.append(f"短名写法 {path}（{status}）泄露内容：{leaked}")

            # 2. 公开路径照常：deny 规则不得连坐形近名。
            for path, expected in PUBLIC_EXPECTATIONS.items():
                status, body = anonymous(path)
                text = body.decode("utf-8", "replace")
                if status != 200:
                    failures.append(f"公开路径 {path} 返回 {status}（应为 200）")
                for snippet in expected:
                    if snippet not in text:
                        failures.append(f"公开路径 {path} 没有返回期望内容 {snippet!r}")

            status, body = anonymous("/assets/fixture.png")
            if status != 200 or not body.startswith(b"\x89PNG"):
                failures.append(f"静态资源 /assets/fixture.png 返回 {status}，内容不是 PNG")

            # API 仍然可达（匿名要求登录），router.php 不能把它当私有路径挡掉。
            status, body = anonymous("/api/campaign-state.php")
            text = body.decode("utf-8", "replace")
            if status != 401 or "AUTH_REQUIRED" not in text:
                failures.append(f"匿名访问 API 返回 {status}（应为 401 AUTH_REQUIRED），响应：{text[:80]!r}")

            # 首段不是私有目录名时（story/data/...）不得被 deny 规则吃掉。
            status, body = anonymous("/story/data/missing.js")
            if status == 403:
                failures.append("/story/data/missing.js 被 deny 规则误拦（403）")

            # 1b. 绝对形式请求目标：REQUEST_URI 是整个 URL 而服务器按路径取文件，
            #     只读 REQUEST_URI 首段会看到 "http:" —— 这条曾经能真实下载
            #     /data/ato-users.json，所以逐条回归。
            for template, marker in ABSOLUTE_FORM_PRIVATE:
                target = template.format(port=port)
                status, body = absolute_form(target)
                text = body.decode("utf-8", "replace")
                if status not in (403, 404):
                    failures.append(f"绝对形式 {target} 返回 {status}（应为 403/404）")
                if marker in text:
                    failures.append(f"绝对形式 {target} 泄露内容：{marker}")

            # 绝对形式下的公开路径不得连坐。
            for template in ABSOLUTE_FORM_PUBLIC:
                target = template.format(port=port)
                status, body = absolute_form(target)
                text = body.decode("utf-8", "replace")
                if status != 200 or "index fixture" not in text:
                    failures.append(f"绝对形式公开路径 {target} 返回 {status}（应为 200 index fixture）")

        # 3. 真实 API 往返：注册 → 保存 → 读回，并且落盘的文件仍然匿名不可读。
        if started:
            jar = http.cookiejar.CookieJar()
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

            def post(path: str, payload: dict):
                request = urllib.request.Request(base + path, json.dumps(payload).encode(),
                                                 {"Content-Type": "application/json"})
                with client.open(request, timeout=10) as response:
                    return response.status, json.load(response)

            def get(path: str):
                with client.open(urllib.request.Request(base + path), timeout=10) as response:
                    return response.status, json.load(response)

            register_status, registered = post("/api/campaign-state.php?action=register",
                                               {"username": "router_fixture", "password": "fixture-password"})
            save_status, saved = post("/api/campaign-state.php",
                                      {"section": "heroes", "expectedRevision": 0,
                                       "state": {"heroes": [{"id": "SYNTHETIC-PRIVATE-HERO"}]}})
            read_status, loaded = get("/api/campaign-state.php")
            saved_heroes = (loaded.get("campaign") or {}).get("sections", {}).get("heroes")
            save_file = scratch / "data" / "ato-campaign-router_fixture.json"
            on_disk = json.loads(save_file.read_text(encoding="utf-8")) if save_file.exists() else None
            if not (register_status == 200 and registered.get("ok")):
                failures.append(f"API 注册失败：{register_status} {registered}")
            if not (save_status == 200 and saved.get("ok")):
                failures.append(f"API 保存失败：{save_status} {saved}")
            if read_status != 200 or saved_heroes != {"heroes": [{"id": "SYNTHETIC-PRIVATE-HERO"}]}:
                failures.append(f"API 读回失败：{read_status} {saved_heroes}")
            if on_disk is None or on_disk.get("sections", {}).get("heroes") != saved_heroes:
                failures.append("API 保存没有在磁盘上留下一致的存档")
            status, _ = anonymous("/data/ato-campaign-router_fixture.json")
            if status not in (403, 404):
                failures.append(f"API 刚写入的存档文件匿名可读：{status}")
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:  # pragma: no cover - 兜底
                proc.kill()
        if log is not None:
            log.close()
        if failures:
            print(f"（临时站点保留在 {scratch}，server.log 里有 PHP 内建服务器的访问日志）")
        else:
            # Windows 上 PHP 可能还握着目录句柄，清理失败不影响测试结论。
            shutil.rmtree(scratch, ignore_errors=True)

    if failures:
        print("router.php 私有路径拦截测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    print("router.php 私有路径拦截测试通过：data/、tmp/、export/、.git/ 与 tools/ 下的凭据文件，"
          "含 HTTP/1.1 绝对形式请求目标（GET http://host/data/... 、curl -x 代理式写法、任意 authority）"
          "以及 /data.、//data/、/%64ata/、/assets/../data/、%2F 等混淆写法一律 403/404，"
          "公开页面、tools 工具页、静态资源与 API 往返照常")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
