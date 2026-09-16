"""Android versionCode 编码：必须严格单调，预发布排在正式版之前，越界必须报错。

运行：python tools/test_android_version_code.py

Android 依靠 versionCode 判定升级。旧实现把所有数字拼起来，于是
`1.3.10 → 1310` 之后升级到 `1.4.0` 只得到 `140`（被当成降级），预发布转正式版
（`1.3.1-rc.1 → 1311`、`1.3.1 → 131`）同样倒退，`1.2.30` 与 `1.23.0` 还会撞车。
这里直接调用真实的编码函数，验证固定权重编码的映射、单调性、范围与报错行为。
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from export_android import (  # noqa: E402
    ANDROID_VERSION_CODE_LIMIT,
    ANDROID_VERSION_FIELD_LIMIT,
    android_version_code,
)

EXPECTED = {
    "1.3.1": 10_301_900,
    "1.3.1-rc.1": 10_301_301,
    "1.3.10": 10_310_900,
    "1.4.0": 10_400_900,
    "1.23.0": 12_300_900,
    "1.2.30": 10_230_900,
    "2.0.0": 20_000_900,
}

MONOTONIC_SEQUENCES = (
    ("1.3.9", "1.3.10", "1.4.0"),
    ("1.0.0", "1.3.1-rc.1", "1.3.1", "1.3.9", "1.3.10", "1.4.0", "2.0.0"),
    ("2.0.0-rc.1", "2.0.0-rc.2", "2.0.0"),
)

# 越界版本必须报错，不能回绕成越来越小的编码。
OUT_OF_RANGE = ("100.0.0", "1.100.0", "1.3.100", "1.3.1-rc.100", "1.2", "1.2.x.0")


def check_mapping(failures: list[str]) -> None:
    for version, expected in EXPECTED.items():
        actual = android_version_code(version)
        if actual != expected:
            failures.append(f"{version} 的 versionCode 应为 {expected}，实际 {actual}")
        if actual > ANDROID_VERSION_CODE_LIMIT:
            failures.append(f"{version} 的 versionCode {actual} 超过 Android 上限 {ANDROID_VERSION_CODE_LIMIT}")


def check_monotonic(failures: list[str]) -> None:
    for sequence in MONOTONIC_SEQUENCES:
        codes = [(version, android_version_code(version)) for version in sequence]
        for (lower, lower_code), (higher, higher_code) in zip(codes, codes[1:]):
            if lower_code >= higher_code:
                failures.append(f"升级序列倒退：{lower}({lower_code}) 未小于 {higher}({higher_code})")
    # 严格单调要覆盖整个字段网格，而不是只抽查几条。
    grid = [
        (major, minor, patch)
        for major in range(0, 3)
        for minor in range(0, 4)
        for patch in range(0, 4)
    ]
    for release in grid:
        assembled = f"{release[0]}.{release[1]}.{release[2]}"
        prerelease = f"{assembled}-rc.1"
        if android_version_code(prerelease) >= android_version_code(assembled):
            failures.append(f"预发布版未低于正式版：{prerelease} >= {assembled}")
    releases = [f"{major}.{minor}.{patch}" for major, minor, patch in grid]
    ordered = sorted(releases, key=lambda item: tuple(int(part) for part in item.split(".")))
    if [android_version_code(item) for item in releases] != [android_version_code(item) for item in ordered]:
        failures.append("字段网格的 versionCode 顺序与版本号顺序不一致")


def check_distinct(failures: list[str]) -> None:
    for left, right in (("1.2.30", "1.23.0"), ("1.3.1", "1.3.10"), ("1.3.1", "1.3.1-rc.1")):
        if android_version_code(left) == android_version_code(right):
            failures.append(f"{left} 与 {right} 的 versionCode 撞车")


def check_rejections(failures: list[str]) -> None:
    for version in OUT_OF_RANGE:
        try:
            code = android_version_code(version)
        except ValueError:
            continue
        failures.append(f"越界版本未被拒绝：{version} → {code}")
    # 不存在的本地标记（默认的 local / dev）保留历史的占位编码，本地调试构建照常可用。
    for version in ("local", "dev"):
        if android_version_code(version) != 1:
            failures.append(f"本地标记 {version} 的占位编码应为 1，实际 {android_version_code(version)}")
    if android_version_code("99.99.99") > ANDROID_VERSION_CODE_LIMIT:
        failures.append("最大字段组合超出 Android 上限")
    if ANDROID_VERSION_FIELD_LIMIT >= 100:
        failures.append("字段范围上限必须小于权重（每段十进制的进位单位）")


def main() -> int:
    failures: list[str] = []
    check_mapping(failures)
    check_monotonic(failures)
    check_distinct(failures)
    check_rejections(failures)

    if failures:
        print("Android versionCode 编码测试失败：")
        for item in failures:
            print("  " + item)
        return 1

    mapping = "，".join(f"{version} → {code}" for version, code in EXPECTED.items())
    print(f"Android versionCode 编码测试通过：{mapping}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
