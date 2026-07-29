# 배달앱 브랜드 할인 비교 웹

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP의 프론트엔드(React + Vite).
백엔드는 [delivery-discount-api](../delivery-discount-api) 별도 레포다.
원본 캡처·데이터는 [delivery-discount-tracker](../delivery-discount-tracker)
파이썬 파이프라인이 판독해 API 레포로 공급한다.

## 실행

`npm install && npm run dev` (http://localhost:5173). 백엔드 주소는
`src/api.js`에 `https://bebeggars.duckdns.org`로 고정되어 있어 로컬이든
배포든 항상 그 주소로 API를 호출한다 — 별도 환경변수·프록시 설정이 필요
없다. 백엔드를 바꾸려면 `src/api.js`의 `API_BASE`를 직접 수정한다.
왜 env var/프록시 대신 고정값인지는
[docs/decisions/ADR-001-fixed-backend-origin.md](docs/decisions/ADR-001-fixed-backend-origin.md).

배포는 Vercel(`beggars-five.vercel.app`) — 백엔드 CORS 허용 목록에
이미 등록돼 있다.

## 구조

- `src/App.jsx` — 브랜드 카드 그리드, 브랜드별 상세 패널, 카테고리 필터, 멤버십 드로어, 원본 캡처 갤러리
  - `CATEGORIES` — 필터 탭 목록(라벨). 브랜드별 분류·땡겨요 바로가기는
    여기 없다 — API가 `brand.category`/`brand.link`로 내려준다.
    **브랜드를 추가·수정하려면 delivery-discount-api의
    `src/main/resources/brands.yml`을 고친다**(프론트 재배포 불필요).
    새 카테고리를 만들 때만 이 배열에 탭을 추가하면 된다.
- `src/api.js` — `API_BASE`(고정 백엔드 주소) + `/api/brands` 호출
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/captures/` — 판독에 쓴 원본 캡처. 눌렀을 때만 원본을 열고,
  화면에는 항상 `public/captures/thumbs/`를 쓴다 — 원본은 한 장에 8MB까지
  가는 스크롤 캡처라 7장이면 18MB고, 그대로 두면 모바일 첫 화면이 멎는다.
  캡처를 추가하면 `python scripts/make_capture_thumbs.py`로 썸네일을
  다시 만든다(Pillow 필요, 18MB → 340KB).

## 상세 패널

브랜드 카드를 펼치면 앱별 상세(최소주문금액, 구간 할인, 조건, 판독 원문,
캡처 근거)가 나온다. 펼치는 방법은 셋 — 카드 헤더 클릭, 금액 칩 클릭
(땡겨요 칩은 브랜드 페이지로 나가는 링크가 우선이라 제외), 그리고 마우스가
있는 환경에서만 hover. 주 사용 환경이 모바일이라 탭이 기본이고 hover는 덤이다.

상세 값은 API가 내려주며 지금은 대부분 비어 있다. 비어 있으면 감추지 않고
"미확인"으로 표시한다 — 조건이 없는 것과 모르는 것은 다르기 때문이다.
채우는 계획은 tracker 레포의
`docs/plans/2026-07-29-offer-detail-collection.md`.
