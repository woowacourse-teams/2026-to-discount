# Design: PostHog 프론트엔드 SDK 연동

> 관련 이슈: #8 `[WEB] feat: PostHog 프론트엔드 SDK 연동`
>
> 작성일: 2026-08-19
>
> 상태: 구현·자동 검증 완료 · 운영 Live Events 확인 전

## 1. 문제

### 배경

현재 웹은 `src/analytics.js`에서 UI 이벤트를 자체 `/api/events`로 전송한다.
백엔드는 이를 원본 JSONL에 기록하고 PostHog outbox를 통해 같은 이벤트를
PostHog로 전달한다. 이 경로는 원본 로그·재시도·서버 검증을 보장하지만,
검색·자동 완성·다중 카테고리·정렬·즐겨찾기처럼 새로 추가할 UI 신호를
빠르게 계측하려면 프론트엔드에서 직접 사용할 PostHog SDK 진입점이 필요하다.

### 해결하려는 문제

PostHog SDK를 기존 이벤트와 같은 이름으로 바로 추가하면 API 경유 전달과
중복 집계된다. 개인정보 보호 신호를 존중하고 비밀값을 노출하지 않으면서,
기존 이벤트 경로를 깨지 않고 신규 제품 신호만 직접 전송할 경계를 정의한다.

## 2. 목표

- `posthog-js`를 웹에 안전하게 초기화한다.
- 신규 제품 신호를 SDK로 직접 capture할 공통 인터페이스를 제공한다.
- 기존 API 이벤트와 SDK 이벤트가 같은 익명 방문자·세션으로 연결되게 한다.
- 기존 API 경유 이벤트와 직접 전송 이벤트의 중복을 방지한다.
- GPC와 Do Not Track을 존중한다.
- Project API Key와 호스트를 Vite 환경변수로 관리한다.
- 개발 세션을 PostHog에서 구분할 수 있게 한다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- 기존 `page_view`, `page_exit`, `brand_expand`, `offer_link_click` 등의
  API 경유 전송을 SDK 전송으로 전환하는 일
- 백엔드 outbox 또는 자체 JSONL 통계 제거
- PostHog Personal API Key의 프론트 노출
- 세션 리플레이, Feature Flag, Experiment 또는 사용자 로그인 식별 도입
- 검색·정렬·즐겨찾기 기능과 이벤트 사전 자체의 구현
- 실제 신규 제품 신호 이벤트를 화면에 연결하고 운영 전송하는 일

## 4. 요구사항

### 필수

- `VITE_POSTHOG_KEY`가 없으면 SDK 초기화와 이벤트 전송을 하지 않는다.
- 브라우저에 Project API Key만 노출한다. Personal API Key는 사용하지 않는다.
- `navigator.globalPrivacyControl`, `navigator.doNotTrack`, `window.doNotTrack` 중
  하나가 opt-out을 나타내면 SDK를 초기화하거나 capture하지 않는다.
- SDK 자동 페이지뷰와 자동 캡처를 비활성화한다.
- SDK persistence는 `localStorage`로 고정하고 세션 리플레이를 비활성화한다.
- SDK의 익명 ID는 기존 `dk_visitor`, 세션 속성은 기존 `dk_session`과 일치시킨다.
- 기존 API 경유 이벤트와 동일한 사용자 행동·이벤트 이름을 SDK로 capture하지 않는다.
- SDK 직접 이벤트에는 `dev: true`를 포함해 개발 세션을 식별한다.
- 연결 검증용 `posthog_sdk_connection_test`는
  `?dev=1&posthog_test=1`에서 세션당 한 번 명시적으로 전송한다.
- SDK 초기화 실패나 키 누락이 사용자 기능을 중단시키지 않는다.
- 환경변수 설정, 중복 방지 경계와 검증 방법을 문서화한다.

### 선택

- SDK 초기화·capture 동작을 의존성 주입 가능한 adapter로 감싸 브라우저 API 없이
  단위 테스트한다.
- 개발 모드에서 설정 누락을 console warning으로 알린다.

## 5. 제약사항

- 기술적 제약: 웹은 React 18 + Vite 5 ESM 애플리케이션이다.
- 기존 시스템 제약: `src/analytics.js`는 자체 API 배치 전송, `sendBeacon`,
  익명 세션과 체류 시간 측정을 이미 담당한다.
- 기존 시스템 제약: 백엔드는 API 수집 이벤트를 PostHog로 자동 전달한다.
- 보안 제약: Vite의 `VITE_` 환경변수는 브라우저 번들에 포함되므로 Project API Key만 둔다.
- 개인정보 제약: 검색어 원문, 정확한 위치, 자유 입력 텍스트는 SDK 이벤트에 넣지 않는다.
- 개인정보 제약: 현재 쿠키 없는 자체 분석 고지와 일치하도록 PostHog도 쿠키를 사용하지 않는다.
- 운영 제약: 운영 배포 환경에 두 Vite 환경변수를 별도로 설정해야 한다.
- 운영 제약: 브라우저 직접 요청의 IP는 SDK에서 폐기할 수 없으므로 운영 키 설정 전에
  PostHog 프로젝트의 `Discard IP data` 변환을 활성화·검증해야 한다.

## 6. 성공 조건

- [x] 키가 설정된 환경에서만 SDK가 초기화된다.
- [x] opt-out 환경에서는 SDK 초기화와 직접 capture가 모두 발생하지 않는다.
- [x] 신규 직접 전송 이벤트가 기존 `/api/events` 요청을 만들지 않는다.
- [x] 기존 API 경유 이벤트가 SDK로 중복 capture되지 않는다.
- [x] SDK가 기존 `visitorId`, `source_session_id`, `visit_count`, `dev` 컨텍스트를 사용한다.
- [x] SDK가 쿠키·자동 페이지뷰·자동 캡처·세션 리플레이를 사용하지 않는다.
- [x] fake SDK 기반 검증에서 전달한 이벤트명과 props가 제한 없이 한 번 capture된다.
- [ ] `posthog_sdk_connection_test`가 PostHog Live Events에서 `dev: true`와
  기존 익명 방문자·세션 컨텍스트로 한 번 수신된다.
- [ ] 운영 PostHog 프로젝트에서 IP 폐기 변환이 활성화되고 GeoIP 미생성을 확인한다.
- [x] Project API Key 외의 비밀값이 프론트 번들·문서 예시에 없다.
- [x] 환경변수와 전송 경계가 README 및 사용자 고지에 반영된다.

## 7. 고려한 접근 방식

### A. 기존 이벤트를 포함한 전체 SDK 전환

설명: 프론트의 모든 이벤트를 SDK로 직접 전송하고 백엔드의 PostHog 전달을
비활성화한다.

장점:

- 단일 PostHog 전송 경로가 된다.
- SDK 페이지뷰·세션 기능을 일관되게 활용할 수 있다.

단점:

- 운영 환경의 백엔드 전달 설정을 함께 변경해야 한다.
- 자체 통계·원본 로그와 전달 실패 복구 경계를 다시 검증해야 한다.
- 이 이슈의 웹 범위를 넘는다.

### B. 신규 제품 신호만 SDK로 직접 전송

설명: 기존 이벤트는 API 경유 전송을 유지하고, 이번 이슈에서는 이벤트명을
제한하지 않는 SDK capture adapter와 호출 경계를 준비한다. 후속 #7에서
정의·구현할 신규 제품 신호가 이 adapter를 사용한다.

장점:

- 기존 데이터 흐름과 대시보드를 깨지 않는다.
- 중복 집계 위험이 작다.
- 검색·정렬·즐겨찾기 신호를 API 계약 변경과 분리해 준비할 수 있다.

단점:

- 일정 기간 두 전송 경로를 이해·관리해야 한다.
- 실제 제품 이벤트의 호출 지점과 props 계약은 후속 #7에서 추가된다.

### C. 기존 API와 SDK에 같은 이벤트를 이중 전송

설명: 기존 `track()`에서 API 전송과 SDK capture를 모두 수행한다.

장점:

- 구현이 짧아 보인다.

단점:

- 동일 행동이 PostHog에 두 번 기록되어 모든 분석 지표가 오염된다.
- 이벤트 ID가 같아도 SDK capture와 ingestion payload의 중복 제거를 보장할 수 없다.

## 8. 선택

선택한 방법: B. 신규 제품 신호만 SDK로 직접 전송

선택 이유: 기존 API → outbox → PostHog 경로를 유지해 원본 로그와 현재 Insight를
보호하면서, 후속 #7에서 정의한 신규 탐색 신호를 빠르게 도입할 수 있다.
자동 페이지뷰·자동 캡처도 비활성화해 기존 `$pageview`와 UI 이벤트가 중복되지 않는다.

## 9. 설계

### Architecture

```text
기존 이벤트
  analytics.js → /api/events → JSONL/outbox → PostHog

신규 제품 신호
  후속 #7의 화면 이벤트 → posthog.js → PostHog SDK
```

### Components

#### `src/privacy.js`

- 책임: GPC·Do Not Track 판정을 하나의 함수로 제공한다.
- 의존성: 브라우저 `navigator`, `window`.
- 외부 인터페이스: `optedOut()`.

#### `src/analytics-context.js`

- 책임: 기존 익명 방문자·세션·재방문·개발 세션 컨텍스트를 한 번 생성하고 공유한다.
- 의존성: `localStorage`, `sessionStorage`, `location`, 브라우저 crypto.
- 외부 인터페이스: `getAnalyticsContext()`.
- 호환성: 기존 `dk_visitor`, `dk_session`, `dk_visits`, `dk_dev` 키와 생성 규칙을 유지한다.

#### `src/analytics.js`

- 책임: 기존 API 이벤트의 큐잉, 배치 전송, 페이지 이탈 전송을 유지한다.
- 변경: privacy 판정과 익명 컨텍스트를 공용 모듈에서 가져온다.
- 외부 인터페이스: 기존 `track()`, `startAnalytics()`를 유지한다.

#### `src/ga4.js`

- 책임: 기존 GA4 임시 측정을 유지한다.
- 변경: `optedOut()`을 `privacy.js`에서 직접 가져온다.

#### `src/posthog.js`

- 책임: SDK 초기화와 안전한 capture adapter를 제공한다.
- 의존성: `posthog-js`, `privacy.js`, `analytics-context.js`, `import.meta.env`.
- 외부 인터페이스: `initPostHog()`, `captureProductSignal(name, props)`.
- 식별: SDK bootstrap 익명 ID를 기존 `visitorId`로 설정하고 `source_session_id`,
  `visit_count`, `dev`를 공통 속성으로 등록한다.
- 설정: `capture_pageview: false`, `autocapture: false`,
  `disable_session_recording: true`, `persistence: 'localStorage'`,
  `person_profiles: 'never'`, `disableDeviceModel: true`, `respect_dnt: true`.
- 전송 경계: `captureProductSignal(name, props)`는 전달받은 이벤트를 제한 없이
  capture한다. 기존 `track()` 호출을 SDK로 미러링하지 않는 호출 경계로 중복을
  방지한다. 진단 이벤트는 `dev: true`와 `posthog_test=1`이 모두 충족될 때
  세션당 한 번만 capture한다.

#### `src/main.jsx`

- 책임: 앱 시작 시 `initPostHog()`를 한 번 호출한다.

### Data Flow

1. 공용 analytics context가 기존 storage key로 익명 방문자와 세션을 준비한다.
2. 앱 시작 시 `initPostHog()`가 key 존재 여부와 opt-out 상태를 확인한다.
3. 조건을 만족하면 기존 익명 ID를 bootstrap하고 SDK를 Project API Key와 host로 초기화한다.
4. `?dev=1&posthog_test=1`이면 진단 이벤트를 세션당 한 번 보내 SDK 연결을 검증한다.
5. 후속 #7이 `captureProductSignal()`을 호출하면 adapter가 동일 세션 컨텍스트를
   붙여 PostHog에 직접 전송한다.
6. 기존 `track()`은 호출 경로와 payload를 바꾸지 않고 `/api/events`로만 전송한다.
7. 초기화 실패, key 누락 또는 opt-out이면 adapter는 no-op으로 끝난다.

### Error Handling

- key 또는 host 누락 → SDK 초기화 생략, 앱 기능은 계속 제공.
- opt-out → SDK 초기화·capture 생략.
- SDK 초기화 예외 → 개발 모드에서 경고, 운영에서는 앱 기능을 중단하지 않음.
- 미초기화 상태의 capture → no-op.
- 기존 `track()`과 SDK adapter를 같은 행동에서 함께 호출 → 테스트·코드 리뷰에서 차단.

## 10. 테스트 전략

- Unit: key 누락, opt-out, 초기화 성공·실패, 기존 익명 ID bootstrap, 공통 세션 속성,
  쿠키·자동수집 비활성화, no-op capture를 fake SDK로 검증한다.
- Integration: SDK capture가 `/api/events`를 호출하지 않고, 기존 `track()`이 SDK를
  호출하지 않는 것을 mock으로 검증한다.
- Build: `npm run build`로 Vite 환경변수 접근과 번들을 검증한다.
- Acceptance: `?dev=1&posthog_test=1`로 진단 이벤트를 발생시키고 PostHog Live Events에서
  `dev: true`, 기존 익명 ID와 세션 속성, 단일 수신을 확인한다. 실제 제품 이벤트의
  Live Events 검증은 후속 #7의 완료 조건으로 둔다.

## 11. 미해결 사항

- SDK로 직접 전송할 첫 제품 이벤트명과 props 계약은 후속 #7에서 정한다.
- `posthog_sdk_connection_test`는 연결 검증 전용이며 제품 Insight에서 제외한다.
- 운영 Vercel 환경에 `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`를 설정할 권한과 절차가 필요하다.
- 운영 키 설정 전에 PostHog 프로젝트의 `Discard IP data` 변환을 확인해야 한다.
- 자동 페이지뷰를 SDK로 전환하는 작업은 백엔드 전달 중지와 함께 별도 이슈로 다룬다.

## Implementation Plan

### 변경 대상

#### Create

- `web/src/privacy.js`: GPC·Do Not Track 판정을 공용으로 제공한다.
- `web/src/analytics-context.js`: 기존 익명 방문자·세션·개발 컨텍스트를 공유한다.
- `web/src/posthog.js`: SDK 초기화와 신규 제품 신호 capture adapter를 제공한다.
- `web/scripts/verify-posthog-sdk.mjs`: SDK 초기화·opt-out·전송 경계 단위 검증을 추가한다.
- `web/.env.example`: Project API Key와 host의 비밀값 없는 예시를 기록한다.

#### Modify

- `web/package.json`: `posthog-js` 의존성과 SDK 검증 스크립트를 추가한다.
- `web/package-lock.json`: 의존성 lockfile을 갱신한다.
- `web/src/analytics.js`: privacy 판정을 공용 모듈로 옮기되, API 전송 동작은 유지한다.
- `web/src/ga4.js`: 공용 privacy 모듈을 사용하도록 import를 변경한다.
- `web/src/main.jsx`: 앱 시작 시 SDK 초기화를 한 번 수행한다.
- `web/src/App.jsx`: PostHog의 외부 전송과 쿠키 없는 사용을 사용자 고지에 반영한다.
- `web/README.md`: 환경변수, 직접 전송 이벤트 경계, Live Events 검증 절차를 문서화한다.

### Tasks

#### 1. SDK 설정과 privacy 공용 모듈 도입

- 변경:
  - `posthog-js`를 설치하고 Vite 환경변수 예시를 추가한다.
  - 기존 `optedOut()` 판단을 공용 모듈로 추출하고 GA4도 이를 직접 사용한다.
  - 익명 방문자·세션·재방문·개발 세션 계산을 공용 context 모듈로 추출한다.
  - key 누락·opt-out·초기화 예외에서 안전하게 no-op 하는 SDK 초기화 모듈을 만든다.
- 테스트:
  - key 누락과 opt-out에서 `init()`이 호출되지 않는지 검증한다.
  - key와 host가 있을 때 기존 익명 ID와 세션 속성이 사용되는지 검증한다.
  - 쿠키, 자동 페이지뷰·자동 캡처·세션 리플레이를 끄는지 검증한다.
  - 기존 analytics eventId 검증과 GA4 빌드가 회귀하지 않는지 확인한다.
- 완료 조건:
  - 개인정보 설정과 SDK 설정 오류가 앱 동작을 막지 않는다.

#### 2. 범용 제품 신호 capture adapter와 중복 방지 경계 구현

- 변경:
  - `captureProductSignal()`에 `source_session_id`, `visit_count`, `dev`를 붙인다.
  - 진단 이벤트는 `dev=true`, `posthog_test=1` 조건과 sessionStorage 중복 방지를 적용한다.
  - 이벤트명과 props를 제한하거나 변형하지 않고 SDK로 전달한다.
  - fake SDK client를 주입할 수 있는 factory로 테스트 경계를 만든다.
- 테스트:
  - 진단 이벤트가 허용 조건에서 세션당 한 번만 capture되는지 검증한다.
  - 임의의 이벤트명과 props가 한 번 capture되는지 검증한다.
  - adapter capture는 `/api/events` 요청을 만들지 않는지 검증한다.
  - 기존 `track()`은 SDK capture를 호출하지 않는지 검증한다.
- 완료 조건:
  - 같은 사용자 행동이 두 전송 경로에서 PostHog로 중복 집계되지 않는다.

#### 3. 앱 초기화·문서·운영 검증 정리

- 변경:
  - `main.jsx`에서 SDK 초기화를 추가한다.
  - SiteFooter에 PostHog 외부 전송과 쿠키 없는 사용을 고지한다.
  - README에 key 관리, Vercel 재빌드, 개발·운영 설정, 직접/간접 전송 경계와
    IP 폐기 선행 조건, #7의 Live Events 확인 책임을 기록한다.
- 테스트:
  - `npm run test:analytics`, 새 SDK 검증 명령, `npm run build`를 실행한다.
  - `?dev=1&posthog_test=1`로 진단 이벤트를 전송하고 Live Events에서 단일 수신을 확인한다.
- 완료 조건:
  - 배포자가 설정과 중복 방지 규칙을 따라 안전하게 직접 이벤트를 추가할 수 있다.

### Scope Check

- [x] 각 Task가 이슈 #8의 SDK 직접 전송 경계와 안전한 초기화를 직접 달성한다.
- [x] 이벤트 사전·실제 제품 이벤트·신규 기능 구현·백엔드 outbox 변경은 후속 #7로 분리한다.
- [x] 웹 의존성, 초기화, 테스트, 문서가 하나의 PR에서 리뷰 가능한 범위다.
- [x] 하나의 명확한 완료 조건: 후속 #7이 신규 제품 신호를 동일 방문자·세션으로
  중복 없이 직접 전송할 SDK 기반을 제공한다.

## 검증

- `cd web && npm run test:analytics`
- `cd web && npm run test:posthog`
- `cd web && npm run build`
- `posthog_sdk_connection_test`의 Live Events 단일 수신, `dev: true`, 익명 ID·세션 속성 확인
- 실제 제품 이벤트의 PostHog Live Events 검증은 후속 #7에서 실행
