"""打包时把图片重新编码成更小的字节，包内成员名保持不变。

背景：官方版资料包 4.32 GiB 里 99% 是已经压过的位图，zip 层再压只能省 1.7%（实测），
所以体积只能从「重新编码像素」上省。实测（2026-09-20，官方包采样）：

* `map/images` 地砖（真 PNG，多数无透明）→ JPEG q85 只剩 14.7%；
* `technology/images/split_cards`（真 PNG）→ 32.7%；
* `assets/exploration-cards` → 34%；`story-doom-cards` 大图 → ~36%；
* 已经是 JPEG 的：PS 卡面 79.6%、装备卡 59.7%、原书扫描图 87.4%。

所以这里按「收益不够就原样保留」来收口，四条规则：

1. 无透明像素的 PNG → JPEG（要省到 60% 以下才换，避免把界面图/线稿压花）；
2. 已经是 JPEG 的 → 原地重编（省到 85% 以下才换，保住本来就压得很紧的扫描图）；
3. 带透明像素的 PNG → 调色板 PNG（只在 alpha 是 0/255 二值时，且省到 60% 以下才换，
   换完还会把 alpha 逐字节验一遍，对不上就退回原图）；
4. 小图（< 40 KiB）、解不开的、收益不够的，一律不动。

包里成员名照清单目标写，字节换成更小的格式；现有工程本来就有「`.png` 里装 JPEG 字节」
的先例（官方包实测 638 MiB），读取方按内容解码，不需要改前端。
"""
from __future__ import annotations

import fnmatch
import io
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})
MIN_SOURCE_BYTES = 40 * 1024
PNG_TO_JPEG_MAX_RATIO = 0.60
JPEG_MAX_RATIO = 0.85
PALETTE_MAX_RATIO = 0.60
PALETTE_COLORS = 256


def is_image_member(member: str) -> bool:
    """包里这个成员名是不是图片（按扩展名判断，真实格式再看内容）。"""
    return PurePosixPath(str(member or "")).suffix.casefold() in IMAGE_SUFFIXES


def matches_any(member: str, patterns) -> bool:
    """成员路径是否命中豁免名单里的任一条 fnmatch 通配。

    通配大小写不敏感、反斜杠按 `/` 处理；`*` 会跨目录匹配，所以 `aibp/ps/*/*.jpg`
    能覆盖一整层。命中的成员永远按原字节进包，不重编码。
    """
    if not patterns:
        return False
    target = str(member or "").replace("\\", "/").casefold()
    return any(
        fnmatch.fnmatchcase(target, str(pattern).replace("\\", "/").casefold())
        for pattern in patterns
        if str(pattern).strip()
    )


def load_keep_patterns(path) -> list[str]:
    """读豁免名单文件：一行一条通配，`#` 开头是注释，空行忽略。"""
    if path is None:
        return []
    text = Path(path).read_text(encoding="utf-8-sig")
    patterns = []
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            patterns.append(line)
    return patterns


def human(size: int) -> str:
    value = float(size)
    for unit in ("B", "KiB", "MiB"):
        if value < 1024:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.2f} GiB"


@dataclass
class ShrinkStats:
    """重编码账目：换算掉的张数/字节，以及每类「保持原样」的原因计数。"""

    considered: int = 0
    converted: int = 0
    before: int = 0
    after: int = 0
    png_to_jpeg: int = 0
    reencoded_jpeg: int = 0
    palette_png: int = 0
    kept_small: int = 0
    kept_no_gain: int = 0
    kept_alpha: int = 0
    kept_broken: int = 0
    kept_by_rule: int = 0

    @property
    def saved(self) -> int:
        return max(self.before - self.after, 0)

    @property
    def ratio(self) -> float:
        return self.after / self.before if self.before else 1.0

    def describe(self) -> str:
        if not self.converted:
            return "图片瘦身 : 没有需要重编的图（收益都不够）"
        kept = self.kept_no_gain + self.kept_small + self.kept_alpha + self.kept_broken
        extra = f"、名单豁免 {self.kept_by_rule}" if self.kept_by_rule else ""
        return (
            f"图片瘦身 : 重编 {self.converted} 张，{human(self.before)} → {human(self.after)}"
            f"（省 {human(self.saved)}，剩 {self.ratio * 100:.1f}%）"
            f"；PNG→JPEG {self.png_to_jpeg}、JPEG 重编 {self.reencoded_jpeg}、调色板 PNG {self.palette_png}"
            f"；保留原样 {kept}{extra}（收益不够 {self.kept_no_gain}、小图 {self.kept_small}"
            f"、透明 {self.kept_alpha}、读不出 {self.kept_broken}）"
        )

    def as_dict(self) -> dict:
        return {
            "considered": self.considered,
            "converted": self.converted,
            "before": self.before,
            "after": self.after,
            "saved": self.saved,
            "pngToJpeg": self.png_to_jpeg,
            "reencodedJpeg": self.reencoded_jpeg,
            "palettePng": self.palette_png,
            "keptNoGain": self.kept_no_gain,
            "keptSmall": self.kept_small,
            "keptAlpha": self.kept_alpha,
            "keptBroken": self.kept_broken,
            "keptByRule": self.kept_by_rule,
        }


def _alpha_channel(image):
    """有 alpha 就返回 alpha 通道，否则 None。"""
    if image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info):
        return image.convert("RGBA").getchannel("A")
    return None


def _alpha_is_binary(alpha) -> bool:
    """alpha 只有 0/255 时才允许走调色板（软边透明量化后会变硬边）。"""
    histogram = alpha.histogram()
    return sum(histogram[1:255]) == 0


def _jpeg_bytes(rgb_image, quality: int) -> bytes:
    buffer = io.BytesIO()
    rgb_image.save(buffer, "JPEG", quality=quality, optimize=True, progressive=True)
    return buffer.getvalue()


def _palette_png(image, alpha) -> bytes | None:
    """调色板 PNG：alpha 必须逐字节不变，否则返回 None 让调用方保留原图。"""
    from PIL import Image

    if not _alpha_is_binary(alpha):
        return None
    quantized = image.convert("RGBA").quantize(colors=PALETTE_COLORS, method=Image.FASTOCTREE)
    buffer = io.BytesIO()
    quantized.save(buffer, "PNG", optimize=True, compress_level=9)
    payload = buffer.getvalue()
    try:
        with Image.open(io.BytesIO(payload)) as check:
            check.load()
            if check.convert("RGBA").getchannel("A").tobytes() != alpha.tobytes():
                return None
    except Exception:  # noqa: BLE001 - 校验过不了就当没换
        return None
    return payload


def shrink_image(
    data: bytes,
    quality: int = 85,
    *,
    member: str = "",
    stats: ShrinkStats | None = None,
) -> bytes | None:
    """尝试把图片压小；返回新字节，None 表示保持原样（调用方写原始字节）。

    ``member`` 只用于区分「清单目标是 PNG 还是 JPEG」，从而选不同的收益门槛。
    """
    if stats is not None:
        stats.considered += 1
    if len(data) < MIN_SOURCE_BYTES:
        if stats is not None:
            stats.kept_small += 1
        return None
    try:
        from PIL import Image
    except ImportError as error:  # pragma: no cover - 打包机没装 Pillow 时给出人话
        raise RuntimeError("图片重编码需要 Pillow：pip install pillow") from error

    Image.MAX_IMAGE_PIXELS = None
    target_is_png = PurePosixPath(str(member or "")).suffix.casefold() == ".png"
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            alpha = _alpha_channel(image)
            if alpha is not None:
                payload = _palette_png(image, alpha)
                if payload is None:
                    if stats is not None:
                        stats.kept_alpha += 1
                    return None
                if len(payload) > len(data) * PALETTE_MAX_RATIO:
                    if stats is not None:
                        stats.kept_no_gain += 1
                    return None
                if stats is not None:
                    stats.converted += 1
                    stats.palette_png += 1
                    stats.before += len(data)
                    stats.after += len(payload)
                return payload
            payload = _jpeg_bytes(image.convert("RGB"), quality)
    except Exception:  # noqa: BLE001 - 解不开就原样写
        if stats is not None:
            stats.kept_broken += 1
        return None

    limit = PNG_TO_JPEG_MAX_RATIO if target_is_png else JPEG_MAX_RATIO
    if len(data) and len(payload) > len(data) * limit:
        if stats is not None:
            stats.kept_no_gain += 1
        return None
    if stats is not None:
        stats.converted += 1
        if target_is_png:
            stats.png_to_jpeg += 1
        else:
            stats.reencoded_jpeg += 1
        stats.before += len(data)
        stats.after += len(payload)
    return payload
