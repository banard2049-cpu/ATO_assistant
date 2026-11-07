"""故事书页面的代码必须在 git 里；私有素材必须不在 git 里。

背景（2026-10-05 发现）：`story/assets/mixed-media/renderer.js`、`story/assets/mixed-media/styles.css`
与 `story/assets/story-tables.js` 被页面引用、也没有被 `.gitignore` 拦住，却从来没有 `git add` 过
（`git ls-files` 为空、`HEAD` 里不存在、历史 0 次提交）。后果是从干净检出构建的 APK、Docker 镜像、
便携包都不含这些文件：故事页 404，行内混排与正文表格整体退化成纯文本，在线更新也永远送不到。

口径（本测试固化）：
1. 页面引用的本地 `.js` / `.css`，只要文件存在且**没有被 `.gitignore` 忽略** → 必须已被 git 跟踪；
2. 页面引用的本地 `.js` / `.css` 若**被忽略** → 必须不在 git 里（私有素材走 `.atopack`，不进仓库）；
3. 文件不存在（例如按需生成的本地音频包清单）→ 跳过，不作断言。

运行：`python tools/test_story_code_in_git.py`
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 应用自己的页面入口（工具类页面不在此列）
PAGES = [
    "index.html",
    "story/index.html",
    "ss/index.html",
    "record/index.html",
    "technology/index.html",
    "map/index.html",
    "aibp/index.html",
    "briefing/index.html",
    "hero/index.html",
]

REF = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
CODE_SUFFIXES = (".js", ".css")
SKIP_PREFIXES = ("http://", "https://", "//", "data:", "#", "mailto:")


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def in_git_worktree() -> bool:
    return git("rev-parse", "--is-inside-work-tree").returncode == 0


def is_tracked(rel: str) -> bool:
    return git("ls-files", "--error-unmatch", "--", rel).returncode == 0


def is_ignored(rel: str) -> bool:
    # check-ignore 退出码 0 表示命中忽略规则
    return git("check-ignore", "-q", "--", rel).returncode == 0


def normalise(page: str, ref: str) -> str:
    ref = ref.split("?")[0].split("#")[0]
    parts: list[str] = []
    for segment in (Path(page).parent / ref).as_posix().split("/"):
        if segment == "..":
            if parts:
                parts.pop()
        elif segment not in ("", "."):
            parts.append(segment)
    return "/".join(parts)


def collect() -> tuple[dict[str, list[str]], list[str]]:
    """返回 {相对路径: [引用它的页面]} 与缺失页面列表。"""
    refs: dict[str, list[str]] = {}
    missing_pages: list[str] = []
    for page in PAGES:
        path = ROOT / page
        if not path.is_file():
            missing_pages.append(page)
            continue
        for match in REF.finditer(path.read_text(encoding="utf-8")):
            raw = match.group(1).strip()
            # 先去掉 ?v=... 缓存参数与 #fragment，再判断后缀：本仓库的引用几乎都带 ?v=
            ref = raw.split("?")[0].split("#")[0]
            if not ref or raw.startswith(SKIP_PREFIXES) or not ref.lower().endswith(CODE_SUFFIXES):
                continue
            refs.setdefault(normalise(page, ref), []).append(page)
    return refs, missing_pages


def main() -> int:
    git_ok = in_git_worktree()
    refs, missing_pages = collect()
    failures: list[str] = []

    if not refs:
        print("故事书页面代码 git 口径测试失败：没有解析到任何本地 js/css 引用")
        return 1

    checked_code = checked_private = 0
    for rel, pages in sorted(refs.items()):
        where = "、".join(sorted(set(pages)))
        ignored = is_ignored(rel) if git_ok else False
        tracked = is_tracked(rel) if git_ok else False
        if ignored:
            # 被 .gitignore 命中的一律算私有素材（例如 story/audio-packs/、story/data/），
            # 允许不存在，但绝不允许进 git。
            checked_private += 1
            if tracked:
                failures.append(f"{rel}（被 {where} 引用）已被 .gitignore 忽略，却仍然进了 git；"
                                f"私有素材应走 .atopack，不进仓库")
            continue
        # 没被忽略的代码引用必须在仓库里：这条在 CI 的干净检出上同样有意义——
        # 只要有人引用了没提交的文件，这里就会红。
        if not (ROOT / rel).is_file():
            failures.append(f"{rel}（被 {where} 引用）在仓库里不存在；"
                            f"干净检出会缺这个文件，请提交它或改用私有素材通道")
            continue
        checked_code += 1
        if git_ok and not tracked:
            failures.append(f"{rel}（被 {where} 引用）存在于工作区但没有进 git；"
                            f"干净检出会缺这个文件，必须 git add")

    for page in missing_pages:
        failures.append(f"页面不存在：{page}")

    print(f"检查页面 {len(PAGES) - len(missing_pages)} 个；"
          f"代码引用 {checked_code} 个、私有素材引用 {checked_private} 个"
          + ("（未在 git 工作树内，只做存在性检查）" if not git_ok else ""))
    if failures:
        print("故事书页面代码 git 口径测试失败：")
        for item in failures:
            print("  " + item)
        return 1
    print("故事书页面代码 git 口径测试通过：引用的代码都在 git 里，私有素材都不在 git 里")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
