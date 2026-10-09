"""局域网入口的转发边界校验（纯 Python 复刻，不需要 JDK）。

运行：python tools/test_android_query_parameter.py

背景一：LocalSecondScreenServer.java 早期只放行 action=second-screen 的只读请求，其余 action
一律不转发给本机 API。此前这里写的是 uri.getQueryParameter("action")，而 uri 是 java.net.URI
—— 那个方法只存在于 android.net.Uri，所以整个 Android 工程从来没编译过（构建一直被密钥检查
跳过，错误一直藏着）。修复改成手写解析，只依赖 JDK 的 getRawQuery / URLDecoder。

背景二：安卓的局域网入口现在把整个应用（主控台 + 各模块 + 第二屏）开放给同一网段的设备，
**读和写都开放**，只有登录 / 注册 / 退出不转发 —— 那三个 action 改的是这台手机的登录态
（SharedPreferences 里的 currentUser），别的设备一提交就会把手机上的账号换掉或退出。
局域网页面读到的 currentUser 就是手机上的账号，所以它本来也不需要登录。

另外钉住手写解析与转发的几个细节：
  1. 键名匹配是精确的（actionx / action 前缀不算）；
  2. 取「第一个出现的 action」，避免重复参数造成的歧义；
  3. action 名字里带 + 时**不匹配 login**（JDK 的 URLDecoder 按表单规则把 + 解成空格，
     而 android.net.Uri.getQueryParameter 会保留 +；两者会给出不同答案），这条差异必须留档；
  4. POST 的请求体按 ISO-8859-1 读字符再还原成 UTF-8（否则中文 JSON 会乱码），
     带 Content-Length 或 chunked 都要能读。
"""
from __future__ import annotations

import pathlib
import re
import urllib.parse

BLOCKED_ACTIONS = {"login", "register", "logout"}


def query_parameter(raw_query: str | None, name: str) -> str | None:
    """复刻 Java 侧的手写解析：按 & 切分、取第一个同名键、两边各自 URL 解码。

    注意 Java 的 URLDecoder.decode(String) 是表单语义（+ 变空格），Python 对应的是
    urllib.parse.unquote_plus。
    """
    if raw_query is None or raw_query == "":
        return None
    for pair in raw_query.split("&"):
        if pair == "":
            continue
        separator = pair.find("=")
        key = pair if separator < 0 else pair[:separator]
        if name != urllib.parse.unquote_plus(key):
            continue
        value = "" if separator < 0 else pair[separator + 1:]
        return urllib.parse.unquote_plus(value)
    return None


def allowed_api_action(raw_query: str | None) -> bool:
    """复刻 allowedApiAction()：只挡登录态相关的 action，其余（读写）都转发。"""
    try:
        action = query_parameter(raw_query, "action")
        return action is None or action not in BLOCKED_ACTIONS
    except ValueError:
        return False


ALLOWED = (
    # 只读的 action
    "action=me",
    "action=second-screen",
    "action=second-screen-status",
    "action=second-screen-mode",
    # 写存档的 action / 按 section 读写的请求（写请求只是换 POST 方法，查询串一样）
    "action=restore-previous-day",
    "action=import-sections",
    "section=dashboard",
    "section=map&foo=1",
    "section=",
    "",
    None,
    # 键名必须精确匹配：actionx 不是 action，落到「没有 action」的读写分支
    "actionx=login",
    # 未知 action 交给本机 API 判断（它自己会回 400/405），局域网入口不猜
    "action=future-action",
    # action 名字大小写敏感，LOGIN 不是 login
    "action=LOGIN",
    # 重复参数取第一个，第一个不是登录态 action 就放行
    "action=second-screen&action=login",
)

DENIED = (
    "action=login",
    "action=register",
    "action=logout",
    "foo=1&action=login",
    # 重复参数取第一个：第一个是 login 就拦
    "action=login&action=me",
    "action=logout&section=dashboard",
    # 百分号编码解出来的仍是 login，同样拦
    "action=log%69n",
)

failures: list[str] = []

for raw in ALLOWED:
    if not allowed_api_action(raw):
        failures.append(f"应当放行却被拒绝：{raw!r}")

for raw in DENIED:
    if allowed_api_action(raw):
        failures.append(f"应当拒绝却被放行：{raw!r}")

# 第一条命中的同键参数生效（与「取第一个」的实现一致），重复参数不会互相覆盖
if query_parameter("action=second-screen&action=login", "action") != "second-screen":
    failures.append("重复参数时应取第一个 action")
if query_parameter("action=login&action=second-screen", "action") != "login":
    failures.append("重复参数时应取第一个 action（顺序敏感）")

# + 的语义差异：JDK URLDecoder（表单语义）会把它解成空格，android.net.Uri 不会。
# 这里钉住当前实现的行为，避免以后换实现时悄悄改变判定。
if query_parameter("action=second+screen", "action") != "second screen":
    failures.append("URLDecoder 的表单语义应把 + 解成空格")
if not allowed_api_action("action=second+screen"):
    failures.append("「second screen」不是被拦的 action，应当照常转发（由本机 API 判断）")

# 没有 = 的裸键：键名匹配、值为空串，空 action 不是登录态 action，所以放行
if query_parameter("action", "action") != "":
    failures.append("裸键的取值应为空串")

# 静态检查 Java 侧与这份复刻一致：被拦的三个 action、POST 请求体转发、以及 / 打开主控台。
server_source = (
    pathlib.Path(__file__).with_name("packaging")
    / "android" / "app" / "src" / "main" / "java" / "com" / "ato" / "assistant" / "LocalSecondScreenServer.java"
)
source = server_source.read_text(encoding="utf-8")
for action in sorted(BLOCKED_ACTIONS):
    if f'"{action}"' not in source:
        failures.append(f"Java 里没有被拦的 action={action}")
if "allowedApiAction" not in source:
    failures.append("Java 侧缺少 allowedApiAction()")
if '"/briefing/api.php".equals(uri.getPath())' not in source:
    failures.append("局域网简报接口必须转发给本机 API，不能作为静态 PHP 文件返回")
if "handleForJavascript(android.net.Uri.parse(\"http://127.0.0.1\" + target), method, body)" not in source:
    failures.append("Java 侧必须把方法和请求体一起转给本机 API（否则写不进去）")
if "readBody(" not in source:
    failures.append("Java 侧缺少请求体读取")
if "StandardCharsets.ISO_8859_1" not in source:
    failures.append("请求体必须按 ISO-8859-1 读字符再还原 UTF-8，否则中文 JSON 会乱码")
if "MAX_BODY_BYTES" not in source or "Payload Too Large" not in source:
    failures.append("请求体要有上限并回 413")
if '"POST".equals(method)' not in source:
    failures.append("HTTP 层要接受 POST")
if '"/index.html"' not in source:
    failures.append("局域网入口的 / 应当打开主控台 index.html")
if 'path = "/ss/"' in source:
    failures.append("/ 不应再被改写到第二屏（/ss/ 仍可显式访问）")

# 方法可用性：应用声明的最低系统是 API 24（app/build.gradle.kts 的 minSdk），而
# URLDecoder.decode(String, Charset) 与 URLEncoder.encode(String, Charset) 是 API 33 才加入的
# 重载。写成新重载编译期能过，旧手机运行到那一行却会抛 NoSuchMethodError；这段代码跑在
# 线程池里，handle() 只 catch IOException，未捕获的 Error 会直接结束整个应用。
# 所以这里钉住：这两个类只能用 API 1 起就存在的 (String, String) 重载。
gradle_source = (server_source.parents[6] / 'build.gradle.kts').read_text(encoding='utf-8')
if 'minSdk = 24' not in gradle_source:
    failures.append("app/build.gradle.kts 的 minSdk 变了：请确认新最低版本是否已支持 (String, Charset) 重载")
if re.search(r"URL(?:Decoder|Encoder)\.(?:decode|encode)\([^;{]*StandardCharsets\.", source):
    failures.append("URLDecoder/URLEncoder 的 (String, Charset) 重载是 API 33 才有的，不能使用")
if 'URLDecoder.decode(value, "UTF-8")' not in source:
    failures.append('查询串解码必须走 decode(String, "UTF-8") 旧重载（见 decodeQueryPart）')

# 上面这条改动最容易犯的错是漏 import：CI 里只有 Android 工程真的用 javac 编译一次才会发现
# （本机没有 Android SDK，跑不了）。这里把用到的 JDK 类型和 import 钉在一起。
for symbol, import_line in (
    ('UnsupportedEncodingException', 'import java.io.UnsupportedEncodingException;'),
    ('StandardCharsets', 'import java.nio.charset.StandardCharsets;'),
    ('URLDecoder', 'import java.net.URLDecoder;'),
):
    if symbol in source and import_line not in source:
        failures.append(f'用到了 {symbol} 却没有 {import_line}')

if failures:
    print("局域网转发边界校验失败：")
    for item in failures:
        print("  " + item)
    raise SystemExit(1)

print(f"局域网转发边界校验通过：放行 {len(ALLOWED)} 例，拦截 {len(DENIED)} 例")
