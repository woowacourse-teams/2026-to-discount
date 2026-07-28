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

- `src/App.jsx` — 브랜드 카드 그리드, 카테고리 필터, 멤버십 드로어, 원본 캡처 갤러리
  - `CATEGORIES`/`BRAND_CATEGORY` — 카테고리 필터. API가 카테고리를 안
    내려주므로 브랜드명 → 카테고리 매핑을 여기서 직접 유지한다. 새
    브랜드가 추가되면 여기도 같이 갱신해야 필터에 걸린다(안 하면
    "전체"에서만 보임 — 에러는 안 나지만 조용히 누락된다).
  - `DDANGYO_LINKS` — 땡겨요 오퍼 클릭 시 이동할 브랜드별 실제 쿠폰
    공유링크. 새 땡겨요 브랜드가 생겨도 자동으로는 안 채워지므로
    수동 추가 필요(없으면 그냥 정적 표시로 남는다, 에러 없음).
- `src/api.js` — `API_BASE`(고정 백엔드 주소) + `/api/brands` 호출
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/captures/` — 판독에 쓴 원본 캡처 (화면 하단 갤러리에 노출)
