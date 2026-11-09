# 292 홈 리뉴얼 시안: 토스 디자인 시스템 (toss)

버리는 시안(껍데기)이다. 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-toss`)만 본다. 묶음 이슈 #230.

리뉴얼 목표(우선순위 순): 1 신뢰성(값이 언제 기준인지), 2 핵심(얼마, 어느 앱, 조건)을 빠르게, 3 누를 곳을 빨리.

## 1. 범위

- 새 파일은 `web/src/shells/toss/` 아래에만 둔다: `TossShell.jsx`, `data.js`, `toss.css`.
- 고치는 기존 파일은 `web/src/main.jsx` 하나. 홈을 `<TossShell />`로 바꾼다.
- 고치지 않는 파일: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`, `App.jsx`, 그 밖의 `web/src/*.js(x)`.
- 새 npm 의존성 없음. CSS 파일 하나.
- `web/src/*.test.js`를 새로 만들지 않는다(어댑터는 계산이 없고, 시안은 병합하지 않음). 만들 때는 `web/package.json`의 `test` 사슬에 넣는다.

## 2. 변경 전파 점검 (docs/CHANGE-PROPAGATION.md)

| 묶음 | 닿는가 | 이유 |
| --- | --- | --- |
| 1 확실성 | 읽기만 | `sortBrands`, `applyFilters`, `displayBestAmount`를 그대로 호출. 판정 규칙을 다시 쓰지 않음 |
| 4 최소주문 | 읽기만 | `minLabel`이 null이면 기존 라벨 "최소주문 미확인"을 그림. 틀린 문턱을 만들지 않음 |
| 6 화면 글자 | 닿음 | 새 문구는 아래 §6에 모아 둠. 시안 한정(이슈 결정 2026-11-03). 수집기 말을 새로 만들지 않음 |
| 7 행동 이벤트 | 안 닿음 | `track(...)`을 쏘지 않음. 이벤트 목록 변경 없음 |
| 8 배포 순서 | 안 닿음 | API 변경 없음 |
| 9 새 파일 | 닿음 | `docs/PROJECT-STRUCTURE.md` 재생성(§8) |

## 3. 데이터 (`shells/toss/data.js`, 얇은 어댑터)

계산 로직 금지. 기존 모듈을 불러 껍데기용 모양으로 옮기기만 한다.

- 불러오기: `fetchBrands()`, `fetchBanners()`. 이미 받은 SSR 데이터(`window.__SSR__`)가 있으면 그 값을 쓰고 다시 받지 않는다(`App.jsx`의 `initial` 규칙과 같음).
- 허브 링크: `setHubLinks(banners)`를 부른다(`main.jsx`가 SSR이 있을 때 이미 부름. SSR이 없을 때만 어댑터가 부름).
- 정렬과 거르기: `applyFilters(brands, defaultFilters())`. `defaultFilters`는 `filters.js`에서 불러 씀. 기본값은 5천원 이상, 할인금액 높은 순.
- 줄(row) 모양: 브랜드마다 하나.

```
{
  name,                 // brand.name
  amount,               // displayBestAmount(brand.offers)  → 숫자 또는 null
  amountText,           // amountText(대표 오퍼)             → "8,000원" 또는 rawText
  platform,             // 대표 오퍼의 platform
  minText,              // minLabel(대표.minOrderAmount) ?? '최소주문 미확인'
  chips,                // chipsOf(대표).filter(onCard) 의 text 목록 (쿠팡와우, n시 오픈, 포장, 첫 주문 …)
  href,                 // offerLink(대표, brand.links, brand.name)
  capturedAt,           // latestCaptured(brand.offers)
  perApp: { baemin, coupangeats, ddangyo, yogiyo }  // 앱별 칸, §5
}
```

- 대표 오퍼: `displayBestAmount`가 낸 금액과 `amount`가 같고 `comparable`을 통과한 첫 오퍼. 고르는 규칙을 새로 만들지 않고 `couponModel.js`의 `splitOffers(brand.offers).best[0]`를 그대로 쓴다.
- `splitOffers`는 최고가 없으면 맨 앞 오퍼를 대표로 낸다. 이 경우 `amount`는 null, 금액 칸은 `amountText(대표)`(원문)로 그린다. 값을 지어내지 않는다.
- 기준 시각: 화면 전체의 `latestCaptured(모든 줄의 offers 합)`. 줄마다는 §4 줄 아래 작은 글씨에 넣지 않는다(과밀).

## 4. 화면 (360px 기준)

토스 TDS 토큰과 구조(이슈 "시안의 개념")를 그대로 따른다.

| 토큰 | 값 |
| --- | --- |
| 배경 / 카드 | `#F2F4F6` / `#FFFFFF` |
| 글자 | `#191F28` 본문, `#4E5968` 보조, `#8B95A1` 약함 |
| 강조 | `#3182F6` 하나만 (금액, CTA) |
| 글꼴 | Pretendard(없으면 시스템 글꼴), 본문 굵기 500 이상 |
| 금액 | 32px / 800 (맨 위 Top의 대표 금액). 줄 오른쪽 금액은 17px / 800 |
| 반경, 그림자 | 16px, 없음 |
| 금지 | 그라데이션, 장식, 여러 색 버튼 |

구조, 위에서 아래로:

1. **Top**: 제목 "오늘 받을 수 있는 할인", 한 줄 설명(§6), 그 아래 기준 시각 한 줄(목표 1).
2. **ListHeader**: 섹션 제목 "할인 큰 순" (정렬이 `applyFilters` 기본이라 사실과 맞음).
3. **ListRow** × 줄 수: 흰 카드 안에 줄을 이어 붙임.
   - 왼쪽: `BrandLogo` 40px (기존 `logos.jsx` 컴포넌트 재사용. 로고 없는 브랜드는 첫 글자 폴백이 이미 있음).
   - 가운데 두 줄: 1줄 브랜드명(굵게, 한 줄 말줄임), 2줄 앱 이름 · 최소주문 라벨(보조 색, 한 줄 말줄임).
   - 오른쪽: 금액 "n원 할인"(강조 파랑). 그 아래 줄에 조건 배지(쿠팡와우, n시 오픈, 포장, 첫 주문). 배지는 최대 둘, 넘으면 뒤를 자름.
   - 줄 전체가 `<a href>`다. 누르면 그 브랜드의 앱 링크.
4. **BottomCTA**: 화면 아래 고정 버튼 하나, "가장 큰 할인 받으러 가기". 첫 줄의 `href`로 연다. 주 행동은 이것 하나(파랑 채움). 줄 위에 CTA가 겹치지 않게 목록 아래에 CTA 높이만큼 여백.

링크 열기: 쿠팡이츠 줄은 `openWithNotice(e, href)`를 `onClick`에 걸어 기존 안내 동작을 유지한다(`offerLink.js`의 `COUPANGEATS_NOTICE`, 파일 수정 없음). 나머지 앱은 `watchAppOpen` 경로를 `openWithNotice`가 이미 태운다. 분석 이벤트는 생략.

로딩과 실패:
- 받는 동안: 회색 막대 5줄(문구 없음).
- `fetchBrands` 실패: "불러오지 못했어요" 한 줄과 다시 시도 텍스트 버튼. 이 두 문구는 §6.
- 거른 뒤 줄이 0: Top과 기준 시각은 그리고 목록 자리에 같은 실패 문구는 쓰지 않는다. "지금 받을 수 있는 할인이 없어요".

## 5. 없음과 모름 (목표 1)

| 상태 | 그림 |
| --- | --- |
| 그 앱에 오퍼가 없음 | `-` |
| 오퍼는 있는데 최소주문을 모름 | `minLabel`이 null → "최소주문 미확인" (기존 정식 라벨) |
| 최소주문 0 | `minLabel`이 낸 "최소주문 없음" |
| 오퍼는 있는데 금액 없음 | `amountText`의 원문(rawText). 빈 칸으로 두지 않음 |

- 2줄의 "앱 이름"은 대표 오퍼의 앱이다. 앱별 비교(perApp)는 줄을 누르지 않고도 보이는 한 줄로 만들지 않고, 데이터 모양에만 둔다(구현자가 쓰지 않아도 됨. 쓸 때는 위 표를 따름). 시안이 줄 하나에 앱 하나를 보이는 구조라 perApp은 선택이다.
- 금액과 조건은 줄이되 숨기지 않는다: 최소주문과 첫 주문, 월 1회 같은 조건이 `chipsOf`나 `minLabel`에서 나오면 반드시 그린다.

## 6. 임시 문구 (시안 한정, 세션이 정함)

수집기 말(확인, 미확인, 판독, 관측 등)을 새로 만들지 않는다. "최소주문 미확인"은 기존 모듈이 내는 라벨이라 새 문구가 아니다.

| 자리 | 문구 |
| --- | --- |
| Top 제목 | 오늘 받을 수 있는 할인 |
| Top 설명 | 앱별 쿠폰을 한눈에 비교해요 |
| 기준 시각 | 오늘 14:30 기준 (`latestCaptured` 값을 한국 시각 HH:MM으로. 어제 이전이면 "M월 D일 14:30 기준") |
| 섹션 | 할인 큰 순 |
| 금액 | n원 할인 |
| CTA | 가장 큰 할인 받으러 가기 |
| 실패 | 불러오지 못했어요 / 다시 시도 |
| 빈 목록 | 지금 받을 수 있는 할인이 없어요 |

"n원 할인" 만들기: 금액 문자열은 `amountText`가 내는 "8,000원"에 " 할인"만 붙인다. 원문(rawText)이 금액이 아니면(예: 1+1) 그 원문을 그대로 쓰고 "할인"을 붙이지 않는다. 시각 포맷은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 표준 API 한 번 호출이다. 계산이 아니라 표시 변환이라 어댑터에 둔다.

## 7. main.jsx 변경 (이 브랜치 한정)

```jsx
import App from './App.jsx'
import TossShell from './shells/toss/TossShell.jsx'
window.__legacyApp = App           // 남긴다
...
<ErrorBoundary><TossShell /></ErrorBoundary>
```

- `import App`과 `window.__legacyApp = App` 한 줄은 반드시 남긴다. `App`을 렌더하지 않으면 빌드가 쿠폰 카드 CSS 조각을 만들지 않아 `scripts/ssr-template.mjs`가 "CouponCard CSS를 못 찾았다"로 실패하고 프리뷰 배포가 깨진다(#254, #280, #289).
- `<App initial={ssr} />`를 `<TossShell />`로 바꾼 한 줄이 허용된 한 줄 변경이다. 위 `window.__legacyApp` 줄은 추가 한 줄이다. 둘을 PR 본문에 적는다.
- SSR 하이드레이션 불일치가 프리뷰에서 보이면 `if (ssr) { hydrateRoot… } else createRoot` 분기에서 `ssr`을 무시하고 항상 `createRoot(...).render(tree)`로 그린다. 한 줄 더 바뀌므로 필요할 때만 하고 PR 본문에 적는다.
- `setHubLinks(ssr.banners)`는 그대로 둔다.

## 8. 점검

- `cd web && npm test` 통과, `npm run build` 통과(`ssr-template.mjs` 포함).
- 기존 로직 파일 diff 0줄: `git diff --stat main -- web/src/*.js`에 shells 밖 변경 없음, `main.jsx` 제외.
- 360px에서 가로 넘침 없음: 브라우저에서 `document.documentElement.scrollWidth <= 360`. 금액 칸과 CTA가 잘리지 않아야 한다(#282, #284). 구현 방법: 줄은 `grid-template-columns: 40px minmax(0, 1fr) auto`, 가운데 칸 말줄임, 금액 칸 `white-space: nowrap`, CTA 좌우 여백 `16px`와 `box-sizing: border-box`.
- 360px 스크린샷을 결과 댓글에 단다(첫 화면에 Top, 기준 시각, 첫 줄 이상, CTA가 보임).
- 운영 API 데이터로 그려지고 줄을 누르면 앱 링크가 열리는지 프리뷰에서 본다. 못 본 것은 PR 본문 `**미확인:**`에 적는다.
- 커밋 전 `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만든다.
- 프리뷰: 구현 뒤 `preview/shell-toss` push는 사람 또는 sub 세션이 한다(`docs/WORKFLOW.md` §3-3). 주소 `https://beggars-git-preview-shell-toss-nn98s-projects.vercel.app`.

## 9. 하지 않는 것

- 필터, 검색, 정렬 바꾸기, 시트, 배너, 푸시, 설문, 푸터, 브랜드 페이지 링크.
- 분석 이벤트.
- 새 규칙(대표 오퍼 고르기, 정렬, 최고 후보 판정)을 어댑터에 쓰기.
- 병합.

## 10. 리뷰 포인트

- 대표 오퍼를 `splitOffers(...).best[0]`로 고르는 것이 맞는가? (동점 최고 중 신규, 최소주문 낮은 순이 먼저 옴)
- 기준 시각 한 줄을 화면 전체의 `latestCaptured`로 쓰는 것이 "값이 언제 확인됐는지"에 충분한가, 줄마다 달아야 하는가?
- **가정(미확인):** `fetchBrands` 응답의 `capturedAt`이 오퍼마다 실려 있다고 본다. 안 실려 있으면 기준 시각 줄은 그리지 않는다(지어내지 않음).
- **가정(미확인):** 문구 "앱별 쿠폰을 한눈에 비교해요"는 문장 끝(`요.`)이라 `docs/COPY-STYLE.md` 2번(문장 금지)과 어긋난다. 시안 한정으로 둔다.

## 변경 이력

- 2026-11-03 (구현): 서버가 그린 HTML은 `App`이라 `TossShell`과 반드시 어긋난다. §7의 선택 항목대로 `main.jsx`에서 `ssr`을 무시하고 항상 `createRoot`로 그린다(`if (false && ssr)`). 그래서 `TossShell`은 `window.__SSR__.brands`가 있으면 다시 받지 않고 그 값을 쓴다.
- 2026-11-09 (사용자 지시): 머리말(제목, 부제, 기준 시각 줄)과 "할인 큰 순" 목록 머리를 뺐다. 기존 홈의 타이틀바(`TopBarB`: 검색, 분류 메뉴 바, 제보, 필터)와 정렬 바(`quick-bar`)를 그대로 붙였고, 조건 상태(`filters`)를 `TossShell`이 가진다. 줄의 앱 이름 글자는 앱 로고(`PlatformBadge`)로 바꾸고 브랜드 로고는 기존 크기(45px)로 돌렸다. 기준 시각 줄과 `capturedLabel`은 삭제.
