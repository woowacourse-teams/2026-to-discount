"""public/logos/*.png마다 작은 WebP를 public/logos/webp/<이름>.<png해시>.webp로 만든다.

카드 로고는 화면에서 64px 이하라 3배 화면에서도 192px이면 충분하다. PNG 원본(평균 21KB)을
192px WebP(q85)로 바꾸면 첫 화면 로고 전송량이 약 160KB에서 약 35KB로 준다(2026-10-14 실측).

파일 이름에 PNG 내용 해시를 넣는다. PNG를 바꾸고 이 스크립트를 안 돌리면 해시가 안 맞아
웹은 PNG를 그대로 쓴다(build-logo-manifest.mjs). 옛 WebP가 화면에 남지 않는다.

    python scripts/make-logo-webp.py      (로고를 넣거나 바꾼 뒤, Pillow 필요)
"""
import hashlib
from pathlib import Path

from PIL import Image

LOGOS = Path(__file__).resolve().parent.parent / "public" / "logos"
OUT = LOGOS / "webp"
SIZE = 192


def main():
    OUT.mkdir(exist_ok=True)
    want = set()
    for png in sorted(LOGOS.glob("*.png")):
        h = hashlib.sha256(png.read_bytes()).hexdigest()[:8]
        dst = OUT / f"{png.stem}.{h}.webp"
        want.add(dst.name)
        if dst.exists():
            continue
        im = Image.open(png).convert("RGBA")
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        im.save(dst, "WEBP", quality=85, method=6)
    stale = [p for p in OUT.glob("*.webp") if p.name not in want]
    for p in stale:
        p.unlink()
    print(f"webp {len(want)}개, 지운 옛 파일 {len(stale)}개")


if __name__ == "__main__":
    main()
