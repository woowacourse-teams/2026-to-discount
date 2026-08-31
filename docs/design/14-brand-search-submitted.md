# Design: 브랜드 검색 제출 이벤트 계측

> 관련 이슈: #14 `[WEB][API] feat: 브랜드 검색 제출 이벤트 계측 추가`
>
> 상태: 설계 및 구현 계획

## 1. 문제

### 배경

현재 검색어가 적용된 뒤 발생하는 다른 이벤트에는 `fSearch=true`가 붙는다.
그러나 검색을 확정하는 순간에는 이벤트를 보내지 않아, 검색만 하고 후속
행동 없이 종료한 사용자는 검색 사용자로 집계할 수 없다. PostHog에서
관찰되는 검색 신호 19명 중 개발 의심 트래픽을 제외하면 12명뿐이지만, 이는
실제 검색 제출자가 아니라 검색 상태에서 다른 추적 행동까지 남긴 사용자다.

### 해결하려는 문제

A/B 두 검색 UI에서 사용자가 검색을 명시적으로 확정한 시점을 같은 계약으로
기록한다. 검색어 원문 없이 제출 규모와 결과 유무를 파악해, 후속 자동완성
가설의 기준선을 만든다.

## 2. 목표

- 비어 있지 않은 브랜드 검색을 확정할 때 `brand_search_submitted`를 1회
  발생시킨다.
- 검색어 길이, 결과 브랜드 수, 제출 방식을 기록한다.
- 브라우저 SDK와 자체 이벤트 원장 양쪽에 기존 fan-out 경계를 통해 기록한다.
- A/B 검색 UI가 동일한 이벤트 의미와 속성 계약을 사용한다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- 자동완성 UI와 추천 알고리즘 구현
- 자동완성 노출·선택 이벤트 추가
- 검색어 원문 또는 입력 중 키 입력 수집
- PostHog 인사이트나 대시보드 수정
- 검색 필터 동작 자체 변경

## 4. 요구사항

### 필수

- trim한 검색어가 비어 있지 않을 때만 이벤트를 보낸다.
- 엔터 제출은 `submitMethod=enter`, 버튼 제출은
  `submitMethod=button`으로 기록한다.
- `inputLength`는 trim한 검색어의 JavaScript 문자열 길이다.
- `resultCount`는 제출 직후 현재 필터·담기 상태와 검색어를
  `applyFilters()`에 적용했을 때 표시될 브랜드 수다.
- 브랜드 데이터가 아직 로드되지 않았으면 거짓 0을 만들지 않고
  `resultCount`를 생략한다.
- 같은 검색어를 다시 명시적으로 제출하면 새로운 제출로 기록한다.
- Escape, 검색 초기화, 빈 문자열 제출에서는 이벤트를 보내지 않는다.
- API 허용 목록과 프론트/API 이벤트 계약 검사가 신규 이벤트를 포함한다.
- 분석 문서에 이벤트 발생 조건, props, 개인정보 경계를 기록한다.

### 선택

- 없음.

## 5. 제약사항

- 기술적 제약: 이벤트 API는 문자열 길이를 120자로 제한하고 props를 최대
  8개만 보존한다. 신규 이벤트의 자체 props 3개와 공통 필터 맥락 4개는
  상한 안에 들어온다.
- 일정 제약: 검색 제출 계측만 빠르게 추가하며 자동완성 구현과 분리한다.
- 기존 시스템 제약: 검색 필터의 단일 출처는 `applyFilters()`이고,
  `track()`은 API 원장과 PostHog SDK로 fan-out한다.
- 기타: GitHub 토큰에 `read:project` 권한이 없어 칸반 상태·스프린트·
  마감일은 확인하지 못했다.

## 6. 성공 조건

- [ ] 사용자가 엔터 또는 버튼으로 검색을 확정하면 정확히 한 이벤트가 남는다.
- [ ] A/B 검색 UI에서 동일한 props 의미를 보장한다.
- [ ] 검색 결과 0건과 브랜드 미로딩 상태를 구분한다.
- [ ] 검색어 원문이 브라우저 이벤트, API 원장, PostHog에 포함되지 않는다.
- [ ] 이벤트 계약 검사와 관련 프론트·API 검증이 통과한다.

## 7. 고려한 접근 방식

### A. 각 검색 UI에서 직접 `track()` 호출

설명: `SearchControl`과 `SearchControlA`의 submit 함수가 각각 이벤트를
보낸다.

장점:

- 변경 위치가 제출 버튼과 가깝다.

단점:

- 두 UI의 props 계산과 빈 검색 처리 규칙이 중복된다.
- 검색 컴포넌트는 전체 브랜드와 필터 상태를 몰라 `resultCount`를 정확히
  계산할 수 없다.

### B. App의 공통 검색 제출 경계에서 기록

설명: 두 검색 UI는 정규화한 검색어와 제출 방식만 App에 전달한다. App은
다음 필터 상태로 결과 수를 계산하고 검색 상태 변경과 이벤트 발행을 함께
처리한다.

장점:

- 두 UI가 같은 계약을 공유한다.
- `applyFilters()`를 재사용해 화면과 동일한 `resultCount`를 계산한다.
- 개인정보 및 빈 검색 규칙을 한곳에서 보장한다.

단점:

- 검색 컴포넌트 콜백 계약을 변경해야 한다.

### C. 기존 `fSearch`만으로 검색 제출 추론

설명: 별도 이벤트 없이 검색 상태에서 발생한 기존 이벤트를 계속 사용한다.

장점:

- 코드 변경이 없다.

단점:

- 검색 후 후속 행동이 없는 사용자를 계속 놓친다.
- 검색 제출 수와 결과 0건을 알 수 없어 이슈 목적을 달성하지 못한다.

## 8. 선택

선택한 방법: B. App의 공통 검색 제출 경계에서 기록

선택 이유: 화면 결과 계산에 필요한 상태가 App에 있고, 두 UI의 이벤트
의미를 한곳에서 보장할 수 있다. 기존 필터 함수와 분석 fan-out을 재사용해
새 전송 경로를 만들지 않는다.

## 9. 설계

### Architecture

```text
SearchControl / SearchControlA
  └─ onSubmit(query, submitMethod)
       └─ App.handleSearchSubmit()
            ├─ trim 및 빈 검색 차단
            ├─ 다음 filters 생성
            ├─ applyFilters()로 resultCount 계산
            ├─ setFilters()
            └─ track('brand_search_submitted', props)
                 ├─ /api/events → JSONL 원장
                 └─ PostHog SDK
```

### Components

#### `SearchControl`, `SearchControlA`

- 책임: 엔터와 버튼 제출을 구분해 정규화 전 입력값과 제출 방식을 전달한다.
- 의존성: App이 제공하는 `onSubmit` 콜백.
- 외부 인터페이스: `onSubmit(value, 'enter' | 'button')`.

#### `App`

- 책임: 검색 제출 계약, 결과 수 계산, 검색 상태 변경, 이벤트 발행.
- 의존성: `applyFilters()`, `track()`, 현재 brands/filters/cart 상태.
- 외부 인터페이스: 검색 컴포넌트에 공통 제출 콜백 제공.

#### `EventController`

- 책임: `brand_search_submitted`를 공개 이벤트 API의 허용 이벤트로 수용한다.
- 의존성: 기존 payload 제한과 원장 기록 서비스.

### Data Flow

1. 사용자가 검색어를 엔터 또는 버튼으로 확정한다.
2. 검색 컴포넌트가 입력값과 제출 방식을 App에 전달한다.
3. App이 trim한 값이 비었으면 검색 상태만 갱신하고 이벤트는 보내지 않는다.
4. App이 다음 검색 상태를 만든다.
5. brands가 로드된 경우 `applyFilters()`로 결과 브랜드 수를 계산한다.
6. App이 검색 상태를 반영하고 `brand_search_submitted`를 발행한다.
7. 기존 분석 fan-out이 API 원장과 PostHog로 전달한다.

### Error Handling

- 검색어가 비어 있음 → 검색 상태만 갱신하고 이벤트 미발행.
- 브랜드 데이터 미로딩 → 제출 이벤트는 보내되 `resultCount` 생략.
- 분석 전송 실패 → 기존 메모리 큐와 API/PostHog 독립 fan-out 정책을 따른다.
- props 제한 초과 → 이번 이벤트는 공통 맥락 포함 최대 7개라 상한 8 이내다.

## 10. 테스트 전략

- Unit/정적 검증: 두 UI의 엔터·버튼 경로가 제출 방식을 전달하고, 공통
  handler가 이벤트명을 정적으로 사용함을 확인한다.
- Contract: 프론트 발생 이벤트와 `EventController.ALLOWED_EVENTS`가
  일치하는지 검사한다.
- API: 신규 이벤트가 허용되고 props가 원장 입력으로 보존되는지 확인한다.
- Acceptance: 빈 검색과 Escape에서는 미발행, 결과 0건은
  `resultCount=0`, 미로딩은 `resultCount` 생략을 확인한다.
- Build: Vite production build와 전체 Gradle 테스트를 실행한다.

## 11. 미해결 사항

- GitHub 프로젝트 권한이 확보되면 이슈 상태·스프린트·마감일을 확인해야 한다.

## Implementation Plan

## 변경 대상

### Create

- 없음.

### Modify

- `web/src/App.jsx`: 공통 검색 제출 handler, 결과 수 계산, 이벤트 발행,
  A/B 검색 컴포넌트 콜백 계약 변경.
- `api/src/main/java/com/discounttracker/analytics/EventController.java`:
  신규 이벤트 허용.
- `api/src/test/java/com/discounttracker/analytics/EventControllerTest.java`:
  신규 이벤트 수용과 props 보존 회귀 검증.
- `web/scripts/verify-analytics-event-contract.mjs`: 필요 시 검색 컴포넌트
  소스 범위와 이벤트 계약 검증 보강.
- `docs/ANALYTICS.md`: 이벤트 발생 조건, props, 개인정보 경계 추가.
- `api/docs/traffic-analytics.md`: API 허용 이벤트 목록 갱신.

## Tasks

### 1. 검색 제출 계약을 공통 handler로 연결

- 변경: 두 UI가 `query`와 `submitMethod`를 App에 전달하고, App이 trim,
  빈 값 처리, 다음 filters와 `resultCount` 계산을 담당한다.
- 테스트: 엔터·버튼·빈 값·Escape·동일 검색어 재제출 경로를 확인한다.
- 완료 조건: 두 UI가 동일한 handler를 통해 검색 상태를 적용한다.

### 2. `brand_search_submitted`를 발행

- 변경: `inputLength`, 선택적 `resultCount`, `submitMethod`로
  `track()`을 호출한다. 원문 검색어는 props에 넣지 않는다.
- 테스트: 결과 있음·0건·미로딩에서 payload를 확인한다.
- 완료 조건: 각 명시적 비어 있지 않은 제출마다 이벤트가 정확히 1회 발생한다.

### 3. API 계약과 회귀 테스트 갱신

- 변경: 허용 이벤트 목록에 신규 이벤트를 추가하고 API 테스트를 보강한다.
- 테스트: 이벤트 계약 검사와 `EventControllerTest`를 실행한다.
- 완료 조건: API가 이벤트와 props를 버리지 않고 기존 제한을 유지한다.

### 4. 분석 문서 갱신

- 변경: 웹 분석 명세와 API 허용 이벤트 문서에 신규 이벤트 계약 및 검색어
  원문 미수집 원칙을 기록한다.
- 테스트: 코드의 이벤트명·props와 문서 정의를 대조한다.
- 완료 조건: 구현자가 아닌 분석자도 분모와 결과 0건의 의미를 이해할 수 있다.

## Scope Check

- [x] 각 Task가 현재 이슈의 목표를 직접 달성하기 위해 필요하다.
- [x] 독립적으로 먼저 병합할 가치가 있는 별도 작업은 포함하지 않는다.
- [x] 하나의 PR에서 리뷰 가능한 범위다.
- [x] 하나의 완료 조건인 검색 제출 계측 추가로 설명할 수 있다.

서브 이슈로 분리하지 않는다. 자동완성 UI와 자동완성 노출·선택 계측은
현재 이슈 완료에 필요하지 않은 FOLLOW-UP 범위다.

## 검증

- `cd web && npm test`
- `cd web && npm run build`
- `cd api && ./gradlew test`
- `git diff --check`
