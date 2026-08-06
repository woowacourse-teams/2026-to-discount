# 브랜드 로고 위치

파일명 = **대표명**(`brand-aliases.yml` 적용 후, API가 내려주는 `brand.name`) + `.png`.
원장에 찍힌 원본 표기가 아니다 — `BHC`/`bhc`/`BHC치킨`은 전부 대표명 `bhc` 하나로
묶이므로 파일도 `bhc.png` 하나만 있으면 된다.

예: `도미노피자.png`, `피자헛.png`, `bhc.png`

- 표시 크기 38×38px, `object-fit: cover`. 정사각형 원본이면 가장 깨끗하게 나온다.
- 없으면 브랜드명 첫 글자로 자동 대체되므로, 없는 브랜드는 그냥 비워둬도 화면이 깨지지 않는다.
- 코드에서 파일명은 `encodeURIComponent(대표명)`으로 조회한다 (`App.jsx`의 `assetSrc`).
- 화질 우선순위: **파비콘보다 실제 로고/앱 아이콘 원본이 훨씬 낫다.** 파비콘 프록시로
  채운 기존 52개 중 상당수가 16~32px 원본이라 38px에서도 흐릿하다(예: 또래오래,
  파파존스). 애플스토어/플레이스토어 앱 아이콘, 브랜드 프레스킷, 인스타그램
  프로필 사진(정사각형) 쪽이 보통 해상도가 높다.

## 미보유 21개 — 채워 넣을 파일 경로 (2026-07-28 기준)

아래 파일이 없으면 첫 글자로 대체된다. 채우려면 정확히 이 경로에 `.png`로 저장:

```
web/public/logos/기영이숯불두마리치킨.png
web/public/logos/냠냠숯불두마리치킨.png
web/public/logos/던킨.png
web/public/logos/두찜.png
web/public/logos/디디치킨.png
web/public/logos/떡참.png
web/public/logos/빽보이피자.png
web/public/logos/빽보이피자 오구샌.png
web/public/logos/수피자.png
web/public/logos/아메리칸피자.png
web/public/logos/오구쌀피자.png
web/public/logos/육회야문연어.png
web/public/logos/일미리금계찜닭.png
web/public/logos/자담치킨.png
web/public/logos/전통숙성황실김치찜&찌개.png
web/public/logos/팀홀튼.png
web/public/logos/파스쿠찌.png
web/public/logos/프레드피자.png
web/public/logos/하남돼지집.png
web/public/logos/해두리치킨.png
web/public/logos/후라이드참잘하는집.png
```

이 21개는 공식 도메인을 못 찾았거나(하남돼지집·팀홀튼·아메리칸피자·수피자·
자담치킨·육회야문연어 — 공식 홈페이지 자체가 없거나 검색으로 특정 안 됨),
도메인은 확인했지만 파비콘 경로가 표준(`/favicon.ico`, 구글 프록시,
`/apple-touch-icon.png`)과 달라 자동으로 못 받은 것(던킨·파스쿠찌·프레드피자·
디디치킨·오구쌀피자·일미리금계찜닭·후라이드참잘하는집·기영이숯불두마리치킨)이다.
`빽보이피자`/`빽보이피자 오구샌`은 더본코리아 그룹 사이트만 있어 브랜드
전용 로고가 아니라 일부러 비워뒀다(잘못된 로고보다 낫다).

## 새로 발견/확인한 것은 이 목록도 같이 갱신할 것

브랜드 목록 자체가 export.json이 바뀌면 달라진다. 최신 미보유 목록은 아래로 재계산:

```bash
python -c "
import json, os
export = json.load(open('src/main/resources/data/export.json', encoding='utf-8'))
lines = open('src/main/resources/brand-aliases.yml', encoding='utf-8').read().splitlines()
alias_to_canon = {}
cur = None
for line in lines:
    if not line.strip() or line.strip().startswith('#'): continue
    if not line.startswith(' '):
        cur = line.split(':')[0].strip()
    else:
        name = line.strip().lstrip('-').strip()
        if cur and name: alias_to_canon[name] = cur
canon = sorted({alias_to_canon.get(x['brand'], x['brand']) for x in export})
have = {f[:-4] for f in os.listdir('web/public/logos') if f.endswith('.png')}
for n in canon:
    if n not in have: print(n)
"
```
