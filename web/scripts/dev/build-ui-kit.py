"""운영 화면의 DOM·CSS(capture-dom.mjs가 $TMP/dom.json에 떠 놓은 것)로 public/design/ui-kit.html을 만든다.

    npx vite preview --port 4179 &
    node scripts/dev/capture-dom.mjs && python scripts/dev/build-ui-kit.py
"""
import json, os, re
from pathlib import Path

WEB = Path(__file__).resolve().parents[2]
d = json.load(open(os.environ["TMP"] + "/dom.json", encoding="utf-8"))
css = d["css"]

override = """
/* ── ui-kit 전용 덮어쓰기 ─────────────────────────────────────────── */
body { background: #f4f4f2; margin: 0; }
.kit { max-width: 980px; margin: 0 auto; padding: 32px 20px 80px; font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: #1a1a1a; }
.kit h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
.kit > p { color: #666; margin: 0 0 2rem; font-size: .9rem; }
.kit h2 { font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; color: #8a8a8a; margin: 2.4rem 0 .8rem; }
.kit__row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.kit__frame { background: #fafaf9; border: 1px dashed #d0d0cc; border-radius: 12px; padding: 16px; }
.kit__frame--mobile { width: 360px; padding: 12px 0; } .kit__frame--mobile .kit__cap { padding: 0 12px; }
.kit__frame--wide { width: 100%; max-width: 900px; }
.kit__cap { font-size: .72rem; color: #8a8a8a; margin: 0 0 8px; font-family: ui-monospace, monospace; }
.kit .title-bar { position: static !important; transform: none !important; }
.kit .title-bar-spacer { display: none; }
.kit .banner-slot { margin: 0 !important; }
.kit .banner-track { overflow: hidden !important; }
.kit .banner-track > .banner:first-child { display: none; }
.kit .banner__arrow { display: inline-flex !important; }
.kit .brand-card { margin: 0; }
.kit .sheet { position: static !important; transform: none !important; max-width: 360px; box-shadow: 0 8px 30px rgba(0,0,0,.12); animation: none; }
.kit .sheet-scrim { display: none; }
.kit .dev-badge { position: static; display: inline-block; }
.kit .tokens { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.kit .token { border-radius: 10px; padding: 10px; font-family: ui-monospace, monospace; font-size: .72rem; border: 1px solid #e2e2df; background: #fff; }
.kit .token i { display: block; height: 34px; border-radius: 7px; margin-bottom: 6px; border: 1px solid rgba(0,0,0,.08); }
.kit .offer-grid { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
"""

m = re.search(r":root\s*\{([^}]*)\}", css)
tokens = []
if m:
    for line in m.group(1).split(";"):
        line = line.strip()
        if line.startswith("--") and ":" in line:
            k, v = line.split(":", 1)
            tokens.append((k.strip(), v.strip()))
tok_html = "".join(
    f'<div class="token"><i style="background:{v}"></i>{k}<br><span style="color:#888">{v}</span></div>'
    for k, v in tokens if not v.startswith("calc") and len(v) < 60)

bar = d["bar"]
banner = d["banner"]
cards = d["cards"] + ["", "", ""]

def icon(p, alt=""):
    return f'<span class="offer__icon-badge"><span class="platform-badge platform-badge--{p}"><img src="/platform-icons/{p}.png" alt="{alt}"></span></span>'

chips = f"""
<ul class="offer-grid">
  <li class="offer offer--confirmed offer--best offer--hero"><button type="button" class="offer__chip"><span class="offer__amount"><span class="offer__best-tag" aria-label="최고 할인">최고</span>10,000원</span>{icon('baemin','배달의민족')}</button></li>
  <li class="offer offer--confirmed"><button type="button" class="offer__chip"><span class="offer__amount"><span class="offer__status-badge offer__status-badge--membership" data-platform="baemin">배민클럽</span>7,000원</span>{icon('baemin')}</button></li>
  <li class="offer offer--confirmed offer--capped"><button type="button" class="offer__chip"><span class="offer__amount"><span class="offer__range-badge offer__range-badge--plain">최대</span>5,000원</span>{icon('coupangeats')}</button></li>
  <li class="offer offer--held"><button type="button" class="offer__chip"><span class="offer__amount"><span class="offer__status-badge">불확정</span>5,000원</span>{icon('yogiyo')}</button></li>
  <li class="offer offer--confirmed"><button type="button" class="offer__chip"><span class="offer__amount"><s class="offer__amount--soldout">4,000원</s><span class="offer__soldout-label">품절</span></span>{icon('ddangyo')}</button></li>
</ul>"""

def pb(p, alt, on):
    return (f'<span class="platform-badge-wrap"><button type="button" class="platform-badge platform-badge--{p}" '
            f'aria-pressed="{"true" if on else "false"}"><img src="/platform-icons/{p}.png" alt="{alt}"></button></span>')

sheet = f"""
<div class="sheet" role="dialog" aria-modal="true" aria-label="필터"><div class="sheet__grip"></div><div class="sheet__body">
<h3 class="sheet__title">배달앱</h3>
<div class="sheet__apps page-head__apps">{pb('baemin','배달의민족',True)}{pb('coupangeats','쿠팡이츠',True)}{pb('ddangyo','땡겨요',True)}{pb('yogiyo','요기요',False)}</div>
<h3 class="sheet__title">멤버십 <span class="sheet__soon">구현 예정</span></h3>
<div class="sheet__chips"><button type="button" class="sheet__chip sheet__chip--soon">배민클럽</button><button type="button" class="sheet__chip sheet__chip--soon">쿠팡와우</button><button type="button" class="sheet__chip sheet__chip--soon">요기패스</button></div>
<h3 class="sheet__title">분류</h3>
<div class="sheet__chips"><button type="button" class="sheet__chip sheet__chip--on">치킨</button><button type="button" class="sheet__chip">피자</button><button type="button" class="sheet__chip">패스트푸드</button><button type="button" class="sheet__chip">분식</button><button type="button" class="sheet__chip">카페</button></div>
<h3 class="sheet__title">정렬</h3>
<div class="sheet__chips"><button type="button" class="sheet__chip sheet__chip--on">할인액</button><button type="button" class="sheet__chip">최소주문금액</button></div>
<div class="sheet__chips"><button type="button" class="sheet__chip sheet__chip--on">높은 순</button><button type="button" class="sheet__chip">낮은 순</button></div>
<div class="sheet__actions"><button type="button" class="sheet__reset">초기화</button><button type="button" class="sheet__apply">적용</button></div>
</div></div>"""

html = f"""<!doctype html>
<html lang="ko" data-variant="a"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>오늘의할인 UI 키트</title>
<style>{css}{override}</style></head>
<body><div class="kit">
<h1>오늘의할인 UI 키트</h1>
<p>운영 화면에서 그대로 떠낸 마크업과 CSS(2026-09-16, mono <code>best-tag</code>). 피그마에서 <b>html.to.design</b>으로 이 주소를 가져오면 편집 가능한 레이어가 된다. 고친 프레임은 Figma MCP로 읽어 CSS로 역반영한다.</p>

<h2>토큰</h2>
<div class="tokens">{tok_html}</div>

<h2>상단 바 (360px)</h2>
<div class="kit__row"><div class="kit__frame kit__frame--mobile"><p class="kit__cap">.title-bar — 앱 토글 / 홈·필터·초기화·검색 / 분류 캐러셀</p>{bar}</div></div>

<h2>배너 (360px · 900px)</h2>
<div class="kit__row"><div class="kit__frame kit__frame--mobile"><p class="kit__cap">.banner-slot — 묶음 로고 2×2, 우측 하단 조작</p>{banner}</div></div>
<div class="kit__row" style="margin-top:16px"><div class="kit__frame kit__frame--wide"><p class="kit__cap">.banner-slot @900px — 좌우 화살표</p>{banner}</div></div>

<h2>브랜드 카드 (360px)</h2>
<div class="kit__row">
  <div class="kit__frame kit__frame--mobile"><p class="kit__cap">.brand-card 펼침 — 최고 탭, 오퍼 그리드, 구간 4칸 격자</p>{cards[0]}</div>
  <div class="kit__frame kit__frame--mobile"><p class="kit__cap">.brand-card 접힘 — 멤버십 배지</p>{cards[1]}</div>
  <div class="kit__frame kit__frame--mobile"><p class="kit__cap">.brand-card</p>{cards[2]}</div>
</div>

<h2>오퍼 칩 상태</h2>
<div class="kit__row"><div class="kit__frame kit__frame--mobile"><p class="kit__cap">.offer--best (최고 탭) · 멤버십 배지 · .offer--capped (상한, 점선) · .offer--held (보류) · 품절</p>{chips}</div></div>

<h2>필터 시트 (360px)</h2>
<div class="kit__row"><div class="kit__frame kit__frame--mobile"><p class="kit__cap">.sheet — 배달앱 / 멤버십(구현 예정) / 분류 / 정렬 / 초기화·적용</p>{sheet}</div></div>

</div></body></html>"""
out = WEB / "public" / "design" / "ui-kit.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print("written", len(html), out)
