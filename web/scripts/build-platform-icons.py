"""플랫폼 아이콘을 번들에 박을 수 있게 src/platformIcons.js로 굽는다.

## 왜 파일이 아니라 번들인가

Vercel의 Edge Requests 한도는 **요청 수**로 센다(바이트가 아니다).
아이콘 넷은 카드마다 붙어 방문당 4번의 요청이 됐는데, 다 합쳐야 31KB다 —
작은 자산일수록 파일로 두는 값이 비싸다. WebP로 줄여 base64로 박으면
넷이 13KB이고 요청은 0이 된다(2026-09-07 한도 75% 경고).

## 언제 다시 돌리나

`public/platform-icons/*.png`를 바꿨을 때. 원본은 그대로 두므로(옛 캐시가
가리키는 동안 404를 내지 않게) 여기서 굽기만 한다.

    python scripts/build-platform-icons.py
"""
import base64
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "platform-icons"
OUT = ROOT / "src" / "platformIcons.js"
# 화면에 최대 45px로 그린다. 레티나 2배까지만 담는다.
MAX_PX = 90

HEAD = """// 플랫폼 아이콘을 번들에 박는다 — 파일로 두면 카드마다 붙는 4개가
// 매 방문 4번의 요청이 된다. Vercel Edge Requests 한도가 요청 수로
// 세므로(2026-09-07 75% 경고), 작은 아이콘은 요청을 없애는 편이 낫다.
//
// WebP + base64로 넷을 합쳐 13KB다. scripts/build-platform-icons.py가
// public/platform-icons/*.png에서 만든다 — 아이콘을 바꾸면 다시 돌린다.
export const PLATFORM_ICON_DATA = {"""


def main() -> int:
    if not SRC.is_dir():
        print(f"아이콘 폴더가 없다: {SRC}")
        return 1
    lines = [HEAD]
    total = 0
    for png in sorted(SRC.glob("*.png")):
        with Image.open(png) as im:
            im = im.convert("RGBA")
            if max(im.size) > MAX_PX:
                im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=88, method=6)
        encoded = base64.b64encode(buf.getvalue()).decode()
        total += len(encoded)
        lines.append(f"  {png.stem}: 'data:image/webp;base64,{encoded}',")
    lines.append("}")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{OUT.name}: 아이콘 {len(lines) - 2}개 · {total / 1024:.1f}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
