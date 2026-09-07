# 브랜드 로고 위치

파일명 = **대표명**(`brand-aliases.yml` 적용 후, API가 내려주는 `brand.name`)에
`src/logos.jsx`의 `brandLogoSrc()`가 적용하는 치환을 거친 것 + `.png`.
원장에 찍힌 원본 표기가 아니다 — `BHC`/`bhc`/`BHC치킨`은 전부 대표명 `bhc` 하나로
묶이므로 파일도 `bhc.png` 하나만 있으면 된다.

**대표명에 공백이나 `&` 등이 있으면 파일명은 그 문자를 `_`로 바꾼 것이다.**
`brandLogoSrc()`가 `name.replace(/[^a-zA-Z0-9가-힣]+/g, '_')`로 만들기
때문이다 — 대표명을 그대로 파일명에 쓰면 파일은 여기 있는데 화면에는 안
뜬다(2026-09-07에 실제로 그랬다. `docs/decisions/ADR-027`).

```
대표명                    파일명
백종원의 미정국수&덮밥  ->  백종원의_미정국수_덮밥.png
빽보이피자 오구샌       ->  빽보이피자_오구샌.png
도미노피자             ->  도미노피자.png   (특수문자 없으면 그대로)
```

예: `도미노피자.png`, `피자헛.png`, `bhc.png`

- 표시 크기 38×38px, `object-fit: cover`. 정사각형 원본이면 가장 깨끗하게 나온다.
- 없으면 브랜드명 첫 글자로 자동 대체되므로, 없는 브랜드는 그냥 비워둬도 화면이 깨지지 않는다.
- 코드에서 파일명은 `encodeURIComponent(대표명)`으로 조회한다 (`App.jsx`의 `assetSrc`).
- 화질 우선순위: **파비콘보다 실제 로고/앱 아이콘 원본이 훨씬 낫다.** 파비콘 프록시로
  채운 기존 52개 중 상당수가 16~32px 원본이라 38px에서도 흐릿하다(예: 또래오래,
  파파존스). 애플스토어/플레이스토어 앱 아이콘, 브랜드 프레스킷, 인스타그램
  프로필 사진(정사각형) 쪽이 보통 해상도가 높다.

## 먼저 자동 추출을 돌려라

브랜드 딥링크 순회(`sweep_baemin_links.py`, tracker 저장소)가 브랜드 페이지
스크린샷을 남긴다. 그 화면 위쪽에 이미 앱 아이콘이 있다 — 파비콘보다
해상도가 높고, 새로 찾으러 다닐 필요가 없다. `tracker` 저장소에서:

```bash
python scripts/extract_brand_logos.py            # 무엇을 채울지 미리 본다
python scripts/extract_brand_logos.py --apply    # web/public/logos/에 저장한다
```

기존 파일은 건드리지 않는다 — 빈 자리만 채운다. 모양이 아이콘 같지
않으면(검색창, 제목 줄 등이 잘못 걸리면) 저장하지 않고 실패로 보고한다.
자세한 판단 근거는 `docs/decisions/ADR-027`(tracker 저장소).

## 그래도 안 채워지는 브랜드 — 손으로

순회 스크린샷이 없거나(그 브랜드로 순회를 아직 안 돌렸다) 화면 모양이
달라 자동 추출이 실패한 곳은 사람이 채운다. 화질 우선순위: **파비콘보다
실제 로고/앱 아이콘 원본이 훨씬 낫다**(애플/플레이스토어 아이콘, 브랜드
프레스킷, 인스타그램 프로필 사진 쪽이 보통 해상도가 높다).

최신 미보유 목록은 tracker 저장소에서 재계산한다(brands.yml이 대표명·
별칭의 단일 출처다 — [ADR-025](../../../../docs/decisions/ADR-025-single-source-for-sweep-targets.md)):

```bash
python check_brands.py   # tracker 저장소. "카테고리 미기입"이 아니라
                          # 아래 코드로 로고 기준을 따로 본다
python -c "
import io, os, re, yaml
data = yaml.safe_load(io.open('mono/api/src/main/resources/brands.yml', encoding='utf-8'))['brands']
have = {os.path.splitext(f)[0] for f in os.listdir('mono/web/public/logos') if f.endswith('.png')}
def sanitize(n): return re.sub(r'[^a-zA-Z0-9가-힣]+', '_', n).strip('_')
for n in sorted(data):
    if sanitize(n) not in have:
        print(n, '->', sanitize(n) + '.png')
"
```
