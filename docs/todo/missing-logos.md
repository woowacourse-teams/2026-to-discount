# 로고 없는 브랜드

2026-11-18 기준 `brands.yml`에 있는데 로고가 없는 곳은 6곳이다(`web/src/logoManifest.js`에 없는 것). 2026-11-01에는 59곳이었고 53곳을 채웠다. 이 곳들은 카드에 글자만 나온다.

## 채우는 법

로고 링크를 받으면 PR 없이 main에 바로 적용한다(핫픽스, 사용자 결정 2026-11-01).

1. 이미지를 내려받아 정사각 192px PNG로 맞춘다. 파일 이름은 `web/src/logoSrc.js`의 `logoFileName` 규칙(공백, 기호는 `_`)을 따른다.
2. `web/public/logos/`에 넣고 `python web/scripts/make-logo-webp.py`, `node web/scripts/build-logo-manifest.mjs`를 돌린다.
3. `cd web && npm test`가 통과하는지 보고, 바뀐 파일(PNG, WebP, `logoManifest.js`)만 이름으로 담아 커밋한다.

채운 곳은 이 표에서 지운다.

## 한식 (3)

- 천지두루치기
- 땅스부대찌개
- 곱분이곱창

## 분식 (1)

- 땅스즉석떡볶이

## 치킨 (1)

- 피자주는치킨사장

## 피자 (1)

- 클랩피자

## 2026-11-26 네이버페이 현장결제로 등록 (3)

- 밀로티
- 다우닝
- 후라토식당
