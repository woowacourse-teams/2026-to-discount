# 배달앱 브랜드 할인 비교 웹

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP의 프론트엔드(React + Vite).
백엔드는 [delivery-discount-api](../delivery-discount-api) 별도 레포다.
원본 캡처·데이터는 [delivery-discount-tracker](../delivery-discount-tracker)
파이썬 파이프라인이 판독해 API 레포로 공급한다.

## 성격과 수집 원칙

**개인이 만든 비영리 정보 제공 페이지다.** 광고·제휴 수수료를 받지 않고,
어느 배달앱과도 제휴 관계가 없다. 이 성격은 화면 하단 `SiteFooter`에
그대로 밝혀 두었다 — 문구를 지우지 말 것. 근거는 tracker 레포의
[ADR-015](../delivery-discount-tracker/docs/decisions/ADR-015-open-access-only-and-disclosure.md).

데이터는 각 앱에서 **누구나 볼 수 있는 화면을 사람이 직접 보고 옮겨 적은
것**이다. 자동 크롤링과 기술적 접근 제한 우회는 하지 않는다.

**앱 화면 캡처 이미지는 공개하지 않는다.** 금액·최소주문금액 같은 사실은
옮겨 적을 수 있지만 캡처 이미지 자체는 각 플랫폼의 저작물이다. 판독 근거가
필요하면 tracker 레포의 `ref/delivery/`에서 확인한다(비공개).

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

- `src/App.jsx` — 브랜드 카드 그리드, 브랜드별 상세 패널, 카테고리 필터, 멤버십 드로어, 고지 푸터
  - `CATEGORIES` — 필터 탭 목록(라벨). 브랜드별 분류·앱별 바로가기는
    여기 없다 — API가 `brand.category`/`brand.links`로 내려준다.
    **브랜드를 추가·수정하려면 delivery-discount-api의
    `src/main/resources/brands.yml`을 고친다**(프론트 재배포 불필요).
    새 카테고리를 만들 때만 이 배열에 탭을 추가하면 된다.
  - `SiteFooter` — 비영리·비제휴, 수집 방법, 면책, 상표 고지. 법적 성격을
    밝히는 자리라 임의로 축약하지 않는다.
- `src/api.js` — `API_BASE`(고정 백엔드 주소) + `/api/brands` 호출
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/links/` — 각 앱에서 공유 기능으로 받은 브랜드 바로가기 원본 메모

## 상세 패널

브랜드 카드를 펼치면 앱별 상세(할인금액/최소주문금액 목록, 조건, 판독 원문,
확인일)가 나온다. 펼치는 방법은 둘 — 카드 헤더 클릭, 금액 칩 클릭(바로가기
링크가 있는 칩은 링크가 우선이라 제외). 마우스가 있는 환경에서는 hover 시
"눌러서 펼치기" 안내만 뜨고 펼쳐지지는 않는다.

상세 값은 API가 내려주며 지금은 대부분 비어 있다. 비어 있으면 감추지 않고
"미확인"으로 표시한다 — 조건이 없는 것과 모르는 것은 다르기 때문이다.
채우는 계획은 tracker 레포의
`docs/plans/2026-07-29-offer-detail-collection.md`.
