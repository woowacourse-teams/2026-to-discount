# 284 홈 리뉴얼 시안 new-ending-v2 (새로 생김 / 곧 끝남)

버리는 시안(껍데기)이다. 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다. 묶음 이슈는 #230, 앞 시안은 #236(new-ending)이다.

## 1. 목표와 범위

리뉴얼 목표(2026-11-03, 우선순위 순): 1) 값이 언제 어디서 확인됐는지 믿을 수 있게, 2) 핵심(얼마, 어느 앱, 조건)을 빠르게, 3) 누를 곳을 빨리 보여 클릭률과 재방문율을 올린다.

이 시안의 개념: 첫 화면 위쪽에 "오늘 새로 생긴 것" 가로 카드, 아래에 "곧 끝나는 것" 목록. #236 프리뷰는 스타일이 안 붙어 버튼 목록과 기존 카드가 섞여 나왔다(2026-11-03, 360px). 같은 개념을 새로 짠다. 원인은 CSS를 main.jsx 쪽에서 불러오지 않은 것으로 본다(미확인, #236 브랜치를 열어 보지 않았다). 이번에는 CSS import를 완료 조건에 넣는다.

하지 않는 것:
- 기존 로직 파일(`api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`) 수정. 새 계산 로직. 새 npm 의존성. 분석 이벤트.
- `App.jsx`와 다른 기존 컴포넌트 삭제.

## 2. 파일

| 파일 | 내용 |
| --- | --- |
| `web/src/shells/new-ending-v2/NewEndingV2Shell.jsx` | 화면. 데이터를 불러 `data.js`로 넘기고 두 구역을 그린다 |
| `web/src/shells/new-ending-v2/data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꾼다 |
| `web/src/shells/new-ending-v2/new-ending-v2.css` | 이 시안의 CSS 하나 |
| `web/src/main.jsx` | 홈을 `<NewEndingV2Shell />`로 바꾸는 한 줄과 CSS import 한 줄 |
| `docs/PROJECT-STRUCTURE.md` | `python scripts/generate_project_structure.py`로 다시 만든다 |

CSS는 `NewEndingV2Shell.jsx`가 아니라 `main.jsx`에서 불러온다(`import './shells/new-ending-v2/new-ending-v2.css'`). 컴포넌트 안 import는 SSR 하이드레이션 경로에서 빠질 수 있어 #236과 같은 증상이 날 수 있다. `main.jsx`는 `App.css`를 이미 같은 방식으로 불러온다.

`web/src/shells/` 아래 `*.test.js`는 만들지 않는다. 만들면 `web/package.json`의 `test` 명령에 넣어야 한다(AGENTS.md). 계산 로직이 없으므로 시험할 로직도 없다.

## 3. 데이터 (`data.js`)

함수는 둘이고 둘 다 기존 모듈 호출을 모양만 바꾼다. 값을 새로 계산하지 않는다.

### 3-1. 입력

`fetchBrands()`와 `fetchBanners()`(`api.js`)를 컴포넌트가 부른다. 배너는 `setHubLinks(banners)`(`offerLink.js`)에 넘겨야 허브 링크가 선다. `App.jsx`가 하는 일(`App.jsx:280`)과 같다. 배너 실패는 빈 목록으로 삼킨다.

SSR 데이터(`window.__SSR__`)가 있으면 `main.jsx`가 `setHubLinks`를 이미 부르고 `initial`로 넘긴다. 이 시안은 `initial`을 받지 않는다. 서버 HTML(옛 홈)과 첫 클라이언트 렌더가 달라 하이드레이션 불일치가 날 수 있다. 프리뷰에서 보이면 `main.jsx`에서 `ssr`을 무시하는 한 줄(`const ssr = null` 꼴)을 더 바꾼다. 바꾸면 PR 본문에 적는다(이슈 결정).

### 3-2. "오늘 새로 생긴 것"

- 대상: 브랜드의 오퍼 중 `isUpdated(offer)`(`filters.js`)가 참인 것. 판정은 서버의 `isNew`를 따르고, 칸이 없는 옛 응답만 `firstSeenAt` 오늘 규칙이다. 이 규칙을 `data.js`에 다시 쓰지 않는다.
- 순서: 브랜드는 `applyFilters(brands, defaultFilters())`가 낸 순서를 쓴다. 기본 정렬은 신규 브랜드를 앞에 둔다(`filters.js:376`). 오퍼는 그 안에서 `amount` 큰 순으로 `data.js`가 정렬하지 않고, 브랜드별 `displayBestAmount`를 낸 오퍼 하나를 카드로 쓴다.
- 카드에 쓰는 값:

| 칸 | 출처 |
| --- | --- |
| 브랜드 이름 | `brand.name` (`shortBrandName`을 쓸지는 구현에서 정한다) |
| 금액 | `amountText(offer)` |
| 앱 | `offer.platform`. 라벨은 `platforms.js` 기존 상수 |
| 조건 칩 | `chipsOf(offer)`에서 `onCard`인 것을 `headOrder`로 정렬 |
| 첫 주문 등 | `qualifiersOf(offer)`는 `chipsOf`에 이미 들어 있다. 따로 부르지 않는다 |
| 최소주문 | `minLabel(offer.minOrderAmount)`. null이면 "최소주문 미확인"(§5) |
| 링크 | `offerLink(offer, brand.links, brand.name)` |

`brand.links`는 `App.jsx`가 `offerLink`의 두 번째 인자로 넘기는 이름과 같아야 한다. 구현 세션이 `App.jsx`와 `BrandCard` 쪽 호출을 열어 필드 이름을 확인한다(이 설계에서는 확인하지 못했다).

### 3-3. "곧 끝나는 것"

- 대상: `offer.expiresAt`(YYYY-MM-DD)이 있고 오늘(Asia/Seoul) 이후인 오퍼. **종료일이 없는 오퍼는 이 목록에 넣지 않는다.** 모르는 종료일은 끝난 것이 아니고 곧 끝나는 것도 아니다(ADR-008).
- 정렬: `expiresAt` 오름차순. 같은 날이면 `displayBestAmount` 기준 금액이 큰 쪽. 문자열 비교로 충분하다(YYYY-MM-DD).
- 한 줄 구성: 종료일 표시(`~MM.DD`, `couponModel.js`가 상세 표 줄에 쓰는 꼴과 같다), 브랜드, 금액, 최소주문, 앱.
- 구간 종료일: 오퍼에 `tiers[].expiresAt`이 따로 있어도 오퍼 자체의 `expiresAt`만 쓴다. 구간별로 쪼개면 새 로직이다.
- 상한: 시안이라 앞 10개만 그린다. 숫자는 `data.js` 상수 하나.
- "오늘" 기준은 `new Date()`를 한국 시각 날짜로 바꾼 값이다. `filters.js`의 `kstDay`는 내보내지 않았으므로(수정 금지) `data.js`에 같은 한 줄 변환을 둔다. 계산 로직 금지 규칙의 유일한 예외로 PR 본문에 적는다. 이 변환이 `isUpdated`의 KST 변환과 어긋나면 자정 근처에 두 구역이 다른 날을 본다.

## 4. 화면 (360px)

위에서 아래로 한 줄 안내(데이터 확인 시각), 새로 생긴 것, 곧 끝나는 것.

1. **확인 시각 줄(목표 1).** `latestCaptured(모든 오퍼)`(`filters.js`) 값을 "MM.DD HH:mm 기준"으로 그린다. 값이 없으면 줄을 그리지 않는다. "0건"이나 "없음"을 그리지 않는다(AGENTS.md: 부재 주장 전에 양성 신호). 문구는 시안용으로 세션이 정해도 되지만 "확인", "미확인", "판독", "관측"은 쓰지 않는다.
2. **새로 생긴 것.** 가로 스크롤 카드(`scroll-snap`). 카드 폭 약 148px로 360px에서 둘째 카드 일부가 보여 옆으로 넘길 수 있음을 알린다. 카드 안 순서: 앱, 브랜드, 금액(가장 크게), 칩, 최소주문. 카드 전체가 `<a>`다.
3. **곧 끝나는 것.** 세로 목록. 한 줄 전체가 `<a>`고 높이는 최소 48px. 종료일이 가장 왼쪽에 와서 훑을 때 마감이 먼저 읽힌다.

두 구역이 비면 구역 제목은 남기고 "지금 해당하는 쿠폰이 없어요" 같은 시안용 문구를 쓴다. 단 로딩 중과 실패는 비어 있음과 다르게 그린다(로딩은 자리표시, 실패는 "다시 시도" 버튼 하나). 실패가 빈 목록으로 보이면 "없다"를 잘못 말하게 된다.

링크는 `target="_blank" rel="noopener noreferrer"`로 연다. 쿠팡이츠는 `openWithNotice`(`offerLink.js:106`)가 앱 안 안내를 처리하는데, 이 시안은 분석 이벤트를 생략하므로 `openWithNotice`를 쓸지는 구현에서 `BrandCard`의 호출을 보고 정한다. 쿠팡이츠 오퍼를 눌렀을 때 허브 안내 문구(`COUPANGEATS_NOTICE`) 없이 열려도 시안으로는 허용한다.

## 5. 없음, 모름

| 상태 | 그리는 것 |
| --- | --- |
| 그 앱에 오퍼가 없음 | `-` |
| 오퍼는 있는데 최소주문을 모름(`minLabel` null) | "최소주문 미확인"(`couponModel.js`의 기존 정식 라벨, `conditionTable`이 쓰는 것과 같다) |
| 최소주문 0 | "최소주문 없음"(`minLabel`이 낸다) |
| 금액이 없고 `rawText`만 있음 | `amountText`가 낸 `rawText` |
| 종료일을 모름 | "곧 끝나는 것"에 넣지 않음. "새로 생긴 것"에는 종료일 칸을 그리지 않음 |

"최소주문 미확인"은 기존 모듈이 내는 라벨이라 새 문구가 아니다. 칸을 비우지 않는 것이 목표 1(신뢰성)에 맞는다는 것이 이슈 결정이다.

## 6. 변경 전파 점검

`docs/CHANGE-PROPAGATION.md` 대조:

| 묶음 | 이번에 닿나 | 이유 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | `displayBestAmount`, `applyFilters`를 그대로 부른다. 판정을 새로 쓰지 않으므로 서버와 어긋날 자리가 안 생긴다 |
| 2 배너 모양 | 닿지 않음 | 배너는 허브 링크 설정(`setHubLinks`)에만 쓴다. 배너 카드를 그리지 않는다 |
| 4 최소주문 출처 | 읽기만 | 모르면 "최소주문 미확인". 지어내지 않는다 |
| 6 화면에 나가는 글자 | 닿음 | 임시 문구는 시안이라 세션이 정해도 된다(이슈 결정). 수집기 말은 쓰지 않는다. 라벨은 `platforms.js` 상수를 쓴다. 병합하지 않으므로 `COPY-STYLE.md` 승인 절차는 열지 않는다 |
| 7 행동 이벤트 | 닿지 않음 | `track(...)`을 부르지 않는다. 대시보드에 이 시안의 클릭이 집계되지 않는다 |
| 8 저장소 경계와 배포 순서 | 닿음 | 웹만 바꾸므로 API 순서 문제는 없다. 프리뷰 절차는 `WORKFLOW.md` §3-3 |
| 9 새 파일 | 닿음 | `PROJECT-STRUCTURE.md` 재생성. 테스트 파일은 만들지 않으므로 `test` 사슬은 그대로 |

## 7. 결정 기록 대조

- ADR-008(`api/docs/decisions/ADR-008`): 모르는 종료일은 끝난 것이 아니다. §3-3이 종료일 없는 오퍼를 "곧 끝나는 것"에서 뺀다. 이 설계는 ADR-008 본문을 열어 확인하지 못했고 `docs/ORCHESTRATION.md` 인용과 이슈 문장에 기댔다. **구현 세션이 ADR-008을 열어 위 해석이 맞는지 본다.**
- 서버가 이미 내린 오퍼는 응답에 없다. 응답에 있는 오퍼의 `expiresAt`이 과거이면(서버가 아직 안 내린 경우) "곧 끝나는 것"에 넣지 않는다.

## 8. 완료 조건과 확인

- 360px 첫 화면에 "새로 생긴 것" 카드와 "곧 끝나는 것" 목록 제목이 보인다. 스크린샷을 결과 댓글에 단다.
- 운영 API 데이터로 그려지고 카드를 누르면 앱 링크가 열린다.
- `git diff --stat main -- web/src/*.js`에 shells 밖 변경이 없다(`main.jsx`는 `.jsx`라 이 글롭에 안 잡힌다. `git diff --stat main -- web/src`로 따로 본다. 허용: `main.jsx`의 홈 교체 한 줄, CSS import 한 줄, 필요 시 `ssr` 무시 한 줄).
- `npm test`와 `npm run build` 통과.
- 프리뷰: 구현 뒤 `preview/shell-new-ending-v2`로 올린다(사람 또는 sub 세션, `WORKFLOW.md` §3-3). 프리뷰 주소는 PR 본문 맨 위: `https://beggars-git-preview-shell-new-ending-v2-nn98s-projects.vercel.app`.
- 커밋 전에 `python scripts/generate_project_structure.py`를 돌려 `docs/PROJECT-STRUCTURE.md`를 다시 만든다.

## 9. 위험

- **하이드레이션 불일치.** §3-1. 프리뷰에서 콘솔 경고나 옛 홈 깜박임이 보이면 `ssr` 무시 한 줄을 더한다.
- **스타일이 안 붙음.** #236 증상. `main.jsx`의 CSS import와 빌드 결과 CSS에 `new-ending-v2` 클래스가 들어 있는지 `npm run build` 뒤 확인한다.
- **종료일 있는 오퍼가 거의 없음.** "곧 끝나는 것"이 비면 개념이 첫 화면에 안 드러난다. 운영 데이터에서 몇 개인지는 이 설계에서 세지 못했다. **구현 세션이 운영 API로 세어 본다.** 적으면 상한과 무관하게 있는 만큼만 그리고, 비었을 때 문구로 개념(마감 임박)을 설명한다.
- **필드 이름 가정.** `brand.links`, `expiresAt` 위치는 문서와 코드 주석에서 읽었다. 실제 응답을 한 번 열어 확인한다.
