"""원본 캡처에서 썸네일을 만든다.

원본은 앱 화면을 이어붙인 스크롤 캡처라 한 장에 8MB까지 나간다. 7장이면
18MB — 모바일에서 첫 화면이 그것 때문에 멎는다. 화면에 실제로 보이는 건
위쪽 일부뿐이라, 폭을 줄이고 위에서 잘라 쓴다. 눌러서 여는 원본은 그대로다.

    python scripts/make_capture_thumbs.py

Pillow 필요: pip install Pillow
"""
from pathlib import Path

from PIL import Image

WIDTH = 480       # 가장 큰 표시 크기(갤러리 카드)의 배쯤
MAX_HEIGHT = 800  # 갤러리는 위 160px, 상세는 위 28px만 보여준다

SRC = Path(__file__).resolve().parent.parent / "public" / "captures"
DST = SRC / "thumbs"


def main() -> int:
    DST.mkdir(exist_ok=True)
    for path in sorted(SRC.glob("*.jpg")):
        img = Image.open(path)
        img = img.resize(
            (WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS
        ).crop((0, 0, WIDTH, min(MAX_HEIGHT, round(img.height * WIDTH / img.width))))
        out = DST / path.name
        img.save(out, "JPEG", quality=80, optimize=True)
        print(f"{path.name}: {path.stat().st_size // 1024}KB "
              f"-> {out.stat().st_size // 1024}KB {img.size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
