# Design: PostHog SDK 직접 전송과 이벤트 원장 이중 기록

> 관련 이슈: #10 `[WEB][API] PostHog SDK 직접 전송과 이벤트 원장 이중 기록`
>
> 작성일: 2026-08-20
>
> 상태: 구현 진행

## 1. 문제

### 배경

현재 `web/src/analytics.js`는 제품 이벤트를 같은 오리진의 `/api/events`로
배치 전송한다. API는 이벤트를 `events.jsonl`에 기록하고, 운영 환경에서
활성화된 PostHog outbox가 같은 이벤트를 PostHog에 전달한다.

PR #9로 브라우저 PostHog SDK 초기화와 개발 연결 진단은 추가됐지만, 제품
이벤트를 직접 capture하지는 않는다. 제품 분석 전송을 SDK로 옮기면서도
검증·감사·백필을 위한 원본 JSONL 기록은 유지해야 한다.

### 해결하려는 문제

한 사용자 행동을 SDK와 API outbox가 모두 PostHog로 보내면 이중 집계된다.
반대로 outbox만 끄면 SDK 초기화 전의 이벤트, `page_exit` 또는 개인정보
opt-out의 처리 경계가 불명확해질 수 있다. 이벤트를 한 번 만들고 두 대상에
독립적으로 fan-out하되, PostHog 전달 책임은 SDK 한 곳으로 정한다.

## 2. 목표

- 현재 `track()` 호출이 만드는 10개 이벤트(`page_view` 포함)와 lifecycle
  handler가 만드는 `page_exit`, 총 11개 이벤트를 `/api/events`에 기록한다.
  PostHog에는 도메인 이벤트와 `page_exit`를 명시적으로 보내고, `page_view`는
  SDK의 자동 `$pageview`를 단일 출처로 사용한다.
- API는 `events.jsonl` 기록을 계속 담당하고, PostHog outbox는 운영에서
  비활성화한다.
- 기존 API outbox가 만들던 PostHog 이벤트 이름·분석 속성·익명 방문자 연결을
  최대한 유지한다.
- SDK 지연 로딩으로 최초 `page_view`나 초기 상호작용을 잃지 않는다.
- DNT/GPC opt-out 시 두 전송 경로를 모두 막는다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- GA4 또는 Vercel Analytics의 자동 이벤트를 PostHog로 복제하는 일
- 현재 프론트 호출처가 없는 `classify_change`, `membership_open`,
  `capture_note_seen`, `title_bar_hide_toggle`를 새로 발생시키는 일
- PostHog outbox 구현·과거 outbox 파일·백필 도구를 삭제하는 일
- 과거 `events.jsonl`의 PostHog 백필
- 사용자 식별, 세션 리플레이, feature flag 또는 autocapture 도입

## 4. 요구사항

### 이벤트 범위

현재 프론트 발생 이벤트는 다음 11개다. 새 구현은 이벤트별 호출처를 다시
연결하지 않고 공통 fan-out 경계에서 처리하므로, 아래 모든 `track()` 호출이
자동으로 SDK와 API를 함께 탄다.

| 발생 경로 | 이벤트 |
|---|---|
| `startAnalytics()` → `track()` | `page_view` |
| `App.jsx` → `track()` | `brand_expand`, `offer_link_click`, `platform_filter_toggle`, `membership_toggle`, `filters_reset`, `category_change`, `brands_retry`, `scroll_to_top` |
| `EventBanner.jsx` → `track()` | `banner_click` |
| `sendExit()` lifecycle handler | `page_exit` |

API 허용 목록에만 남은 `classify_change`, `membership_open`,
`capture_note_seen`, `title_bar_hide_toggle`는 현재 발생 코드가 없으므로 SDK가
새로 생성하지 않는다. `posthog_sdk_connection_test`는 위 제품 이벤트 수에
포함하지 않는 연결 진단 전용 이벤트다.

### 필수

- `page_view`를 포함한 모든 `track()` 호출과 `page_exit` handler는 공통
  `createAnalyticsEvent()`로 하나의 이벤트 객체와 UUID `eventId`를 만들고 API에
  기록한다. `page_view`를 제외한 도메인 이벤트와 `page_exit`는 SDK와 그 객체를
  공유한다.
- SDK 이벤트에는 `eventId`를 `$insert_id`로 전달한다.
- `page_view`는 SDK의 `capture_pageview: 'history_change'`가 표준 `$pageview`로
  capture한다. 명시적 도메인 이벤트와 `page_exit`는 기존 이벤트명을 유지한다.
- SDK는 `bootstrap.distinctID=visitorId`로 `distinct_id`를 만든다. capture 속성에는
  `source_session_id`, `visit_count`, `path`, `referrer`, `device`, `viewport`,
  필요한 경우 `dwell_ms`를 포함한다. `server_timestamp`, IP hash는 SDK에 넣지 않는다.
- SDK capture 옵션의 `timestamp`에는 이벤트 생성 시각인 `clientTs`를 전달해,
  지연 로딩 큐를 flush해도 실제 발생 시각이 바뀌지 않게 한다.
- PostHog 환경변수가 모두 설정된 경우에만 SDK fan-out을 `buffering` 상태로 열고,
  준비 전 이벤트를 최대 100건의 메모리 큐에 넣는다. 초기화 성공 시 순서대로
  flush하고, 설정 누락·import/초기화 실패 시 큐를 비우고 `disabled`로 전환한다.
- API 전송 실패와 SDK 전송 실패는 서로의 시도를 막거나 UI 오류를 일으키지 않는다.
- `page_exit`는 기존 API `sendBeacon` 기록을 유지한다. SDK가 준비된 경우에는
  `capture(..., { send_instantly: true, transport: 'sendBeacon', timestamp })`로
  즉시 전송한다. SDK가 아직 준비되지 않은 초단기 방문에서는 API 원장만 보장한다.
- 기존 서버 mapper와 같은 기준을 유지하기 위해 `dev=true` 제품 이벤트는 SDK로
  보내지 않는다. `posthog_sdk_connection_test`만 개발 진단 이벤트로 직접 보낸다.
- SDK는 자동 `$pageleave`, Web Vitals, 표준 기기·브라우저 속성을 수집한다.
  autocapture와 세션 리플레이는 명시적 도메인 이벤트와 개인정보 고지를 유지하기
  위해 계속 비활성화한다.
- 운영 API의 `DISCOUNT_POSTHOG_ENABLED=false`로 outbox 등록·전달을 끈다.

### 선택

- PostHog SDK 전송의 성공·실패를 개발 모드에서만 관측 가능한 경고로 남긴다.
- API 원장 수와 PostHog Live Events 수의 일간 차이를 운영 점검 항목으로 문서화한다.

## 5. 제약사항

- `posthog-js`는 초기 화면 비용을 줄이기 위해 동적 import한다.
- `VITE_POSTHOG_*`는 빌드 시 브라우저 번들에 주입된다. Project API Key만 사용한다.
- 브라우저 요청은 광고 차단·네트워크 종료로 누락될 수 있다. 원본 JSONL은
  이를 보완하는 감사·백필 원장이지, SDK 전송의 동기 보장 장치가 아니다.
- 지연 로딩이 끝나기 전에 문서가 종료되면 메모리 큐는 전송할 수 없다. 따라서
  `page_exit`의 SDK 전달은 SDK 준비 이후에만 best effort이며 API beacon이 원장
  보존을 책임진다.
- PostHog 프로젝트의 client IP 폐기 설정은 SDK 운영 전제 조건으로 유지한다.
- API 허용 이벤트 목록은 구버전 클라이언트도 받을 수 있다. 현재 프론트 호출처가
  없는 허용값을 SDK에서 인위적으로 생성하지 않는다.

## 6. 성공 조건

- [ ] 도메인 `track()` 이벤트와 `page_exit`가 PostHog Live Events에 각각 한 번만
  나타나고, 같은 이벤트가 `events.jsonl`에도 같은 `eventId`로 기록된다.
- [ ] API `page_view`는 원장에 남고 PostHog에서는 SDK 자동 `$pageview`로 한 번만
  조회된다.
- [ ] SDK가 늦게 준비돼도 최대 100건 안의 첫 `page_view`와 초기 상호작용이
  생성 시각을 유지해 한 번씩 flush된다.
- [ ] outbox 비활성화 후 API pending 파일이 새로 만들어지지 않는다.
- [ ] DNT/GPC에서는 SDK capture와 `/api/events` 요청이 모두 발생하지 않는다.
- [ ] `dev=true` 제품 이벤트는 JSONL에만 남고 PostHog에는 연결 진단 이벤트만 나타난다.

## 7. 고려한 접근 방식

### A. SDK 직접 전송 + API JSONL 기록, 서버 outbox 비활성화

설명: 브라우저가 이벤트를 SDK와 API에 fan-out한다. API는 원장 기록만 하고
PostHog 전달은 하지 않는다.

장점:

- PostHog 전달 경로가 하나라 이중 집계가 없다.
- UI 문맥을 SDK에서 직접 활용할 수 있다.
- JSONL 원장과 백필 가능성을 유지한다.

단점:

- 광고 차단 등으로 SDK 전송이 누락될 수 있다.
- API와 Vercel의 운영 설정 전환이 함께 필요하다.

### B. SDK 직접 전송 + 서버 outbox 유지

설명: SDK와 서버가 같은 논리 이벤트를 모두 PostHog에 보낸다.

장점:

- 서버 전달을 SDK 전송의 백업처럼 볼 수 있다.

단점:

- 동일 `$insert_id`에 의존한 중복 제거는 전송 시점·실패 재시도에 따라 운영
  판단이 복잡하다.
- 두 경로의 속성·이벤트명 차이가 대시보드와 퍼널을 왜곡할 수 있다.

### C. 기존 API outbox만 유지

설명: 현재 경로를 유지하고 SDK는 연결 진단 전용으로 둔다.

장점:

- 변경 범위가 작고 서버 재시도가 가능하다.

단점:

- SDK 기반 제품 분석 기능을 사용하지 못한다.

## 8. 선택

선택한 방법: A. SDK 직접 전송 + API JSONL 기록, 서버 outbox 비활성화

선택 이유: PostHog의 제품 분석 경로를 하나로 제한해 중복을 제거하면서,
`events.jsonl`을 독립 원장으로 남길 수 있다. SDK 누락은 원장 보관과 별도
백필 운영으로 다룬다.

## 9. 설계

### Architecture

```text
track() / page_exit handler
              |
      createAnalyticsEvent()
              |
       +------+------------------+
       |                         |
SDK fan-out state          API batch / sendBeacon
disabled|buffering|ready           |
       |                    events.jsonl 기록
PostHog 직접 capture

API PostHog outbox: DISCOUNT_POSTHOG_ENABLED=false
```

### Components

#### `web/src/analytics.js`

- 책임: 이벤트 envelope 생성, API 큐·`sendBeacon` 유지, SDK sink 등록 전까지의
  메모리 큐와 fan-out을 제공한다.
- 외부 인터페이스:
  - 기존 `track()`·`startAnalytics()` 계약은 유지한다.
  - `enablePostHogFanout()`은 상태를 `disabled → buffering`으로 바꾼다.
  - `registerPostHogSink(sink)`는 대기 큐를 FIFO로 비운 뒤 `ready`로 전환한다.
  - `disablePostHogFanout()`은 대기 큐를 비우고 `disabled`로 전환한다.
- 큐 정책: 최대 100건이며 초과 시 새 이벤트의 SDK fan-out만 버리고 개발 모드에서
  경고한다. API 큐에는 그대로 기록한다.

#### `web/src/posthog.js`

- 책임: SDK 초기화, analytics envelope의 PostHog 이벤트명·속성 변환, capture를
  담당한다.
- 외부 인터페이스: `captureAnalyticsEvent(envelope)`를 추가하고 기존
  `captureProductSignal()`·연결 진단 인터페이스는 유지한다.
- 변환: `page_view`만 `$pageview`로 바꾸고, 모든 이벤트에 `$insert_id`를 넣는다.
  SDK capture options에도 `uuid: eventId`, `timestamp: new Date(clientTs)`를 전달한다.
- 이탈 전송: `page_exit`에만 `send_instantly: true`, `transport: 'sendBeacon'`을 추가한다.
- 개발 트래픽: `envelope.dev === true`이면 제품 이벤트를 capture하지 않는다.
- 의존성: 기존 `analytics-context.js`, `privacy.js`, `posthog-js`.

#### `web/src/main.jsx`

- 책임: 환경변수 존재 여부를 동기적으로 판정해 `startAnalytics()` 전에 fan-out을
  `buffering`으로 연다. 이후 SDK 동적 import와 초기화를 시작한다.
- 성공: `captureAnalyticsEvent`를 sink로 등록해 대기 이벤트를 flush한 뒤 연결 진단을
  수행한다.
- 실패: import 또는 초기화가 실패하면 `disablePostHogFanout()`으로 큐를 폐기한다.

#### API 운영 설정

- 책임: `/api/events`와 `events.jsonl` 계약은 유지한다.
- 변경: systemd 환경 파일에서 `DISCOUNT_POSTHOG_ENABLED=false`를 명시한다.
- 비범위: Java outbox 코드의 삭제·재작성은 하지 않는다.

### Data Flow

1. `main.jsx`는 key·host가 모두 있고 opt-out이 아닐 때만 fan-out을 `buffering`으로
   연다. 설정이 없으면 상태는 `disabled`라 SDK용 메모리를 사용하지 않는다.
2. `track()` 또는 lifecycle handler가 eventId·컨텍스트·props를 가진 이벤트를 만든다.
3. API 큐에는 기존과 동일한 이벤트를 넣고, 일정 시간·배치 크기·이탈 시점 규칙으로
   `/api/events`에 보낸다.
4. SDK sink가 준비됐으면 같은 이벤트를 capture하고, `buffering`이면 메모리 큐에
   보관한다.
5. SDK 초기화 뒤 큐를 순서대로 flush한다. `page_view`는 `$pageview`로, `page_exit`의
   체류 시간은 `dwell_ms`로 변환하고 모든 이벤트의 생성 시각을 capture timestamp로
   유지한다.
6. API는 JSONL 기록만 하고 outbox를 등록하지 않는다.

### Error Handling

- SDK key·host 누락 → fan-out을 열지 않고 API 원장 전송만 수행한다.
- SDK import·초기화 실패 → 대기 큐를 비우고 fan-out을 비활성화한다. API 원장 전송은
  계속 수행한다.
- SDK capture 예외 → 해당 SDK 이벤트만 버리고 개발 모드에서 경고한다. API 원장과
  이후 SDK 이벤트는 계속 처리한다.
- API 요청 실패 → 기존처럼 UI 오류 없이 실패를 무시한다; SDK capture는 계속 시도한다.
- SDK 준비 후 `page_exit` → SDK의 `send_instantly + sendBeacon`과 기존 API beacon을
  각각 호출한다.
- SDK 준비 전 페이지 종료 → API beacon만 보장하고 SDK 메모리 큐는 문서 종료와 함께
  사라진다.
- DNT/GPC → 이벤트 생성·API 전송·SDK 초기화를 모두 하지 않는다.
- `dev=true` → 제품 이벤트는 API JSONL에만 남기고 SDK 연결 진단만 허용한다.

## 10. 테스트 전략

- Unit: adapter가 `$pageview`, `$insert_id`, capture `uuid`·`timestamp`, 공통 속성,
  dev/opt-out과 SDK 예외를 올바르게 처리하는지 fake client로 검증한다.
- Unit: analytics fan-out이 API 본문과 SDK sink에 같은 eventId를 전달하고, 준비 전
  큐가 등록 뒤 정확히 한 번 FIFO flush되는지 검증한다. disabled·failed·100건 초과
  동작도 포함한다.
- Unit: `page_exit` API beacon과 SDK capture의 이벤트명·`dwell_ms`·eventId 및
  `send_instantly + sendBeacon` 옵션을 검증한다.
- Integration: 기존 `disabledForwardingOnlyWritesOriginal` 테스트로 API 비활성
  outbox 설정에서 JSONL 기록만 수행하는 계약을 검증한다.
- Contract: 현재 정적 `track('...')` 이벤트가 모두 API `ALLOWED_EVENTS` 안에 있는지
  검사해 SDK에는 있고 JSONL에는 없는 이벤트 추가를 방지한다.
- Acceptance: 시크릿 창에서 `page_view`, 클릭 이벤트, `page_exit`를 PostHog Live
  Events와 API 원장에서 같은 eventId로 대조한다.

## 11. 미해결 사항

로컬 구현을 막는 미해결 사항은 없다. 설치된 `posthog-js`의 `CaptureOptions`가
`send_instantly`, `transport: 'sendBeacon'`, `timestamp`, `uuid`를 지원함을 확인했다.

운영 반영은 저장소 밖 작업이다. 실제 systemd 환경 파일은 사고 기록상
`/etc/delivery-discount-api.env`이며, 변경·서비스 재시작·Vercel 배포에는 별도 운영
권한과 명시적 실행 승인이 필요하다. 이는 코드 구현의 선행 조건이 아니라 배포 단계의
승인 조건으로 둔다.

## Implementation Plan

### 변경 대상

#### Create

- `docs/design/10-posthog-sdk-event-ledger.md`: #10의 설계, fan-out 계약,
  운영 전환과 검증 계획을 기록한다.
- `web/scripts/verify-analytics-event-contract.mjs`: 현재 정적 `track()` 이벤트와
  `page_exit`가 API 허용 목록에 포함되는지 검증한다.

#### Modify

- `web/src/analytics.js`: `createAnalyticsEvent()`, fan-out 상태 머신, 최대 100건
  준비 큐를 추가하고 기존 API batch와 `page_exit` beacon을 유지한다.
- `web/src/posthog.js`: analytics envelope capture, `$pageview` 변환, `$insert_id`와
  capture options(`uuid`, `timestamp`, 이탈 transport), 기존 분석 컨텍스트 속성
  매핑과 dev 제외를 추가한다.
- `web/src/main.jsx`: `startAnalytics()` 전에 설정된 fan-out을 buffering으로 열고,
  SDK 초기화 성공·실패에 따라 sink 등록 또는 비활성화를 수행한다.
- `web/src/App.jsx`: 사용자 고지를 서버 경유 PostHog 전달에서 SDK 직접 전송과
  API 원장 기록으로 변경한다.
- `web/scripts/verify-analytics-event-id.mjs`: API와 SDK가 동일 eventId를 받는 fan-out,
  준비 큐·최초 페이지뷰·페이지 이탈 회귀를 검증한다.
- `web/scripts/verify-posthog-sdk.mjs`: 이벤트명·속성 변환, `$insert_id`, capture options,
  dev/opt-out과 예외 처리를 검증한다.
- `web/package.json`: 새 이벤트 계약 검증을 기존 `npm test` 체인에 포함한다.
- `web/README.md`: 직접 SDK 전송과 JSONL 원장의 역할, 이벤트 범위, Vercel 설정과
  운영 검증 절차를 최신화한다.
- `api/README.md`, `api/docs/traffic-analytics.md`: 이 배포에서는 outbox를 명시적으로
  비활성화하고 JSONL 원장을 유지한다는 운영 경계를 기록한다.

### Tasks

#### 1. 공통 이벤트 envelope와 SDK fan-out 경계 구현

- 변경:
  - `page_view`를 포함한 `track()`과 `page_exit`가 `createAnalyticsEvent()`에서
    eventId·컨텍스트·발생 시각을 한 번만 만들게 한다.
  - `enablePostHogFanout()`, `registerPostHogSink(sink)`,
    `disablePostHogFanout()` 상태 전환을 구현한다.
  - `disabled`에서는 버퍼링하지 않고, `buffering`에서는 최대 100건을 FIFO로 보관하며,
    `ready`에서는 sink를 즉시 호출한다. 초과 이벤트는 SDK 경로에서만 버린다.
  - 기존 API 배치 크기, 3초 flush, `sendBeacon` 및 DNT/GPC 동작을 변경하지 않는다.
- 테스트:
  - API 본문과 SDK sink에 같은 eventId가 전달되는지 검증한다.
  - SDK 등록 전의 `page_view`와 상호작용이 등록 후 FIFO로 한 번씩 flush되는지 검증한다.
  - fan-out 미설정, 명시적 비활성화, 100건 초과에서 메모리가 무한히 늘지 않고 API
    경로가 유지되는지 검증한다.
  - `page_exit`가 API beacon을 계속 사용하고 SDK 경로도 한 번만 호출하는지 검증한다.
- 완료 조건:
  - 정상 초기화 경로에서 현재 11개 이벤트가 공통 fan-out을 타고, 모든 실패 상태에서도
    API 원장 기록 경로가 유지된다.

#### 2. PostHog payload 호환성 구현

- 변경:
  - `page_view`를 `$pageview`로, 다른 이벤트는 원래 이름으로 capture한다.
  - `$insert_id`, 세션·방문 회차·화면·유입·기기·체류 속성을 기존 mapper와 호환되는
    이름으로 전달하고 익명 ID는 기존 SDK bootstrap에 맡긴다.
  - 모든 제품 이벤트에 `uuid`와 생성 시각 `timestamp` capture option을 전달한다.
  - `page_exit`에만 `send_instantly: true`, `transport: 'sendBeacon'`을 추가한다.
  - `dev=true` 제품 이벤트는 capture하지 않는다.
  - `posthog_sdk_connection_test`는 개발 연결 진단으로 유지하되 제품 fan-out과
    별도로 취급한다.
- 테스트:
  - `$pageview`, `page_exit`, 클릭 이벤트의 이름·속성·`$insert_id`·capture options를
    검증한다.
  - dev, key 누락, opt-out, SDK 예외에서 제품 capture가 발생하지 않는지 검증한다.
- 완료 조건:
  - 기존 PostHog 대시보드에서 페이지뷰와 제품 이벤트가 새 이름·중복 없이 이어진다.

#### 3. 자동 검증과 문서 갱신

- 변경:
  - 두 기존 Node 검증 스크립트에 fan-out 상태, 표준 페이지뷰, 페이지 이탈 계약을
    추가한다.
  - 새 계약 검사로 현재 정적 `track('...')` 이름과 `page_exit`가 API
    `ALLOWED_EVENTS`에 포함되는지 확인하고 `npm test`에 연결한다.
  - README와 API 운영 문서에서 “기존 이벤트는 서버 outbox, 신규 신호만 SDK”라는
    이전 경계를 제거하고 새 책임 분리를 기록한다.
- 테스트:
  - `cd web && npm test`
  - `cd web && npm run build`
  - `cd api && ./gradlew test --tests '*AnalyticsEventServiceTest*' --tests '*PostHogPropertiesTest*'`
- 완료 조건:
  - CI가 SDK·API 원장 분리의 회귀를 잡고, 운영자가 필요한 Vite·systemd 설정과
    Live Events 대조 방법을 문서만으로 수행할 수 있다.

#### 4. 운영 전환과 수동 검증

이 Task는 저장소 구현이 끝난 뒤 별도 승인을 받아 수행하는 rollout runbook이다.
코드 작성·로컬 검증만 요청된 경우에는 실행하지 않는다.

- 변경:
  1. PostHog의 client IP 폐기 설정과 Vercel Production의 `VITE_POSTHOG_KEY`,
     `VITE_POSTHOG_HOST`를 먼저 확인한다.
  2. `/etc/delivery-discount-api.env`에 `DISCOUNT_POSTHOG_ENABLED=false`를 적용하고
     API를 재시작한다. `/api/brands` 200과 `/api/events` JSONL 기록을 확인한다.
  3. outbox 비활성 상태에서 새 웹 빌드를 배포한다. 이 순서는 짧은 PostHog 공백을
     허용하되 이중 집계를 만들지 않는다.
- 테스트:
  - 시크릿 창에서 `page_view`, `offer_link_click`, `page_exit`를 발생시킨다.
  - PostHog Live Events와 `events.jsonl`에서 eventId·이벤트명·중복 여부를 대조한다.
  - outbox pending 경로에 새 파일이 생성되지 않는지 확인한다.
- 롤백:
  1. 이전 웹 배포로 먼저 되돌린다.
  2. 그 다음 `DISCOUNT_POSTHOG_ENABLED=true`를 복구하고 API를 재시작한다.
  3. 기존 pending 파일은 삭제하지 않고 worker가 이어서 처리하게 한다.
- 완료 조건:
  - 운영 PostHog에는 SDK 경로의 단일 이벤트만 보이고 API 원장은 같은 이벤트를
    유지한다.

### Scope Check

- [x] 모든 Task가 #10의 SDK 직접 전송·JSONL 원장 보존·outbox 비활성화를 직접 달성한다.
- [x] 구버전 클라이언트 이벤트와 과거 JSONL 백필은 현재 목표의 독립 산출물이 아니므로
  포함하지 않는다.
- [x] 웹 코드, API 운영 전환, 테스트·문서는 단일 배포 단위로 검토해야 중복 집계를
  피할 수 있으므로 서브 이슈로 분리하지 않는다.
- [x] 운영 전환은 코드 구현과 독립된 권한이 필요하지만 단독으로 제품 가치를 만들지
  않으므로 서브 이슈가 아니라 같은 이슈의 승인된 rollout 단계로 둔다.
- [x] 하나의 명확한 완료 조건: 현재 프론트 분석 이벤트가 PostHog에는 SDK로 한 번,
  API에는 JSONL 원장으로 한 번 기록된다.

## 검증

- `cd web && npm test`
- `cd web && npm run build`
- `cd api && ./gradlew test --tests '*AnalyticsEventServiceTest*' --tests '*PostHogPropertiesTest*'`
- `git diff --check`
- 배포 후 PostHog Live Events와 `events.jsonl`의 eventId·이벤트명·중복 여부 수동 대조
