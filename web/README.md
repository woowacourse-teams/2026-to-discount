# 배달앱 브랜드 할인 비교 웹

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP의 프론트엔드(React + Vite).
백엔드는 [delivery-discount-api](../delivery-discount-api) 별도 레포다.
원본 캡처·데이터는 [delivery-discount-tracker](../delivery-discount-tracker)
파이썬 파이프라인이 판독해 API 레포로 공급한다.

## 실행

1. delivery-discount-api 레포에서 `./gradlew bootRun` (http://localhost:8080)
2. 이 레포에서: `npm install && npm run dev` (http://localhost:5173, `/api`는 8080으로 프록시)

## 구조

- `src/App.jsx` — 브랜드 카드 그리드, 멤버십 드로어, 원본 캡처 갤러리
- `src/api.js` — `/api/brands` 호출
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/captures/` — 판독에 쓴 원본 캡처 (화면 하단 갤러리에 노출)
