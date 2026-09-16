"""utils/queryParameter 的逻辑校验（纯 Python 复刻，不需要 JDK）。

运行：python tools/test_android_query_parameter.py

背景：LocalSecondScreenServer.java 的局域网入口只放行 action=second-screen 的只读请求，
其余 action（登录、退出、读写存档）一律不转发给本机 API。此前这里写的是
uri.getQueryParameter("action")，而 uri 是 java.net.URI —— 那个方法只存在于
android.net.Uri，所以整个 Android 工程从来没编译过（构建一直被密钥检查跳过，
错误一直藏着）。修复改成手写解析，只依赖 JDK 的 getRawQuery / URLDecoder。

这个测试复刻修复后的判定逻辑，钉住：
  1. 放行与拒绝的边界 —— 只放行 action=second-screen；
  2. 键名匹配是精确的（actionx / action 前缀不算）；
  3. 取「第一个出现的 action」，避免重复参数造成的歧义；
  4. action 名字里带 + 时**不放行**（JDK 的 URLDecoder 按表单规则把 + 解成空格，
   而 android.net.Uri.getQueryParameter 会保留 +；两者会给出不同答案），
   这条差异必须留档，将来若改回 android.net.Uri 就知道要一起改。
"""
from __future__ import annotations

import urllib.parse


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
    try:
        return query_parameter(raw_query, "action") == "second-screen"
    except ValueError:
        return False


ALLOWED = (
    "action=second-screen",
    "foo=1&action=second-screen",
    "action=second-screen&foo=1",
    "action=second-screen&action=login",
    # 值在取出来之后才解码，所以百分号编码的连字符同样命中（android.net.Uri 也是这个行为）
    "action=second%2Dscreen",
)

DENIED = (
    None,
    "",
    "action=login",
    "action=delete-account",
    "action=",
    "action",
    "actionx=second-screen",
    "action=second-screen-x",
    "action=second-screen+",
    "action=second+screen",
    "foo=action=second-screen",
    "action=login&action=second-screen",
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
if allowed_api_action("action=second+screen"):
    failures.append("带 + 的 action 不应被放行（当前实现的既定行为）")

# 没有 = 的裸键：键名匹配、值为空串，不匹配 second-screen
if query_parameter("action", "action") != "":
    failures.append("裸键的取值应为空串")

if failures:
    print("queryParameter 逻辑校验失败：")
    for item in failures:
        print("  " + item)
    raise SystemExit(1)

print(f"queryParameter 逻辑校验通过：放行 {len(ALLOWED)} 例，拒绝 {len(DENIED)} 例")
