#!/usr/bin/env python3
"""Fast regression gate for the login layout and illustration alpha channel."""

from pathlib import Path
import re
import struct
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
CSS_PATH = ROOT / "apps/web/src/pages/LoginPage.module.css"
ALPHA_ASSETS = (
    ROOT / "apps/web/public/login-travel-operations-transparent-v2.png",
    ROOT / "apps/web/public/xiaotuanbao-brand-lockup-transparent-v2.png",
)
BRAND_ALIGN_CHECK = ROOT / "scripts/check_brand_logo_alignment.py"


def png_color_type(path: Path) -> int:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path} 不是 PNG")
    ihdr_length = struct.unpack(">I", data[8:12])[0]
    if data[12:16] != b"IHDR" or ihdr_length != 13:
        raise AssertionError(f"{path} 缺少有效 IHDR")
    return data[25]


css = CSS_PATH.read_text(encoding="utf-8")
desktop_narrow_stack = re.search(
    r"@media\s*\(max-width:\s*960px\)[\s\S]*?\.page\s*\{\s*flex-direction:\s*column;",
    css,
)
assert desktop_narrow_stack is None, "820–960px 桌面窄视口仍会把登录页堆叠成单列"

for asset_path in ALPHA_ASSETS:
    color_type = png_color_type(asset_path)
    assert color_type in (4, 6), f"{asset_path.name} 没有 alpha 通道，矩形底色会暴露"

align = subprocess.run([sys.executable, str(BRAND_ALIGN_CHECK)], check=False)
if align.returncode != 0:
    raise SystemExit(align.returncode)

print("PASS: 登录页中间断点保持双栏，旅游插画具备 alpha 通道，品牌 lockup 垂直对齐")
