#!/usr/bin/env python3
"""Regression gate: brand mark vs wordmark vertical optical alignment."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOCKUP = ROOT / "apps/web/public/xiaotuanbao-brand-lockup-transparent-v2.png"
MAIN_LAYOUT_CSS = ROOT / "apps/web/src/layouts/MainLayout.module.css"
# Shells that still compose mark + HTML wordmark (not the lockup image).
MARK_WORDMARK_CSS = (
    ROOT / "apps/web/src/layouts/PlatformLayout.module.css",
    ROOT / "apps/web/src/pages/LoginPage.module.css",
)
# Allow tiny raster/antialias noise; 2px at asset native size is still visibly off.
MAX_LOCKUP_DELTA_PX = 2.0


def measure_lockup(path: Path) -> dict[str, float | str | bool]:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    cols = [0] * w
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 20:
                cols[x] += 1

    runs: list[tuple[int, int, int]] = []
    start: int | None = None
    for x in range(w):
        empty = cols[x] < 8
        if empty and start is None:
            start = x
        if not empty and start is not None:
            runs.append((start, x - 1, x - start))
            start = None

    split: int | None = None
    for a, b, c in runs:
        if a > 40 and c > 10:
            split = (a + b) // 2
            break
    if split is None:
        raise AssertionError(f"{path.name}: cannot find mark/text gap")

    mark_ys: list[int] = []
    text_ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] <= 20:
                continue
            (mark_ys if x < split else text_ys).append(y)

    mark_mid = (min(mark_ys) + max(mark_ys)) / 2
    text_mid = (min(text_ys) + max(text_ys)) / 2
    delta = text_mid - mark_mid
    return {
        "asset": path.name,
        "delta": delta,
        "top_inset": float(min(text_ys) - min(mark_ys)),
        "bottom_inset": float(max(mark_ys) - max(text_ys)),
        "ok": abs(delta) <= MAX_LOCKUP_DELTA_PX,
    }


def assert_brand_flex_center(path: Path) -> None:
    css = path.read_text(encoding="utf-8")
    match = re.search(r"\.brand\s*\{([^}]+)\}", css)
    assert match, f"{path.name}: missing .brand"
    block = match.group(1)
    assert "display: flex" in block, f"{path.name}: .brand missing display:flex"
    assert "align-items: center" in block, f"{path.name}: .brand missing align-items:center"


def assert_brand_name_line_height(path: Path) -> None:
    css = path.read_text(encoding="utf-8")
    match = re.search(r"\.brandName\s*\{([^}]+)\}", css)
    assert match, f"{path.name}: missing .brandName"
    block = match.group(1)
    assert re.search(r"line-height:\s*1\b", block), (
        f"{path.name}: .brandName should use line-height: 1 for optical centering"
    )


def assert_sidebar_uses_lockup_image(path: Path) -> None:
    css = path.read_text(encoding="utf-8")
    match = re.search(r"\.brandLockup\s*\{([^}]+)\}", css)
    assert match, f"{path.name}: missing .brandLockup (sidebar should use lockup image)"
    block = match.group(1)
    assert re.search(r"height:\s*\d+px", block), f"{path.name}: .brandLockup needs explicit height"
    assert re.search(r"width:\s*auto", block), f"{path.name}: .brandLockup should use width:auto"
    assert "object-fit: contain" in block, f"{path.name}: .brandLockup missing object-fit:contain"


def main() -> int:
    assert_brand_flex_center(MAIN_LAYOUT_CSS)
    assert_sidebar_uses_lockup_image(MAIN_LAYOUT_CSS)
    print(f"PASS sidebar lockup sizing: {MAIN_LAYOUT_CSS.name}")

    for css in MARK_WORDMARK_CSS:
        if css.name.endswith("PlatformLayout.module.css"):
            assert_brand_flex_center(css)
        assert_brand_name_line_height(css)
        print(f"PASS mark+wordmark css: {css.name}")

    lockup = measure_lockup(LOCKUP)
    status = "PASS" if lockup["ok"] else "FAIL"
    print(
        f"{status} lockup optical mid delta={lockup['delta']:.2f}px "
        f"(top_inset={lockup['top_inset']:.0f}, bottom_inset={lockup['bottom_inset']:.0f}, "
        f"max={MAX_LOCKUP_DELTA_PX})"
    )
    if not lockup["ok"]:
        print(
            "Symptom: lockup 中「小团宝」相对图标垂直中线偏移过大"
            "（正值=文字偏低，负值=文字偏高）"
        )
        return 1

    print("PASS: brand logo alignment checks")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"FAIL: {exc}")
        raise SystemExit(1) from exc
