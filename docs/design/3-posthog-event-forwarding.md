# Design: PostHog 이벤트 자동 전달

> 관련 이슈: #3 `events.jsonl 이벤트 로그 분석툴 구축`
>
> 작성일: 2026-08-14
>
> 상태: 구현·자동 검증 완료 — 운영 연동 및 PR 전

## 1. 문제

### 배경

서비스는 브라우저에서 수집한 사용자 행동 이벤트를 백엔드의
`events.jsonl`에 기록한다. 기존 로그 약 1.3만 건은 PostHog 형식으로
정제하여 한 차례 수동 업로드했으며, PostHog에는 방문부터 배달앱 이동까지의
Funnel이 구성되어 있다.

### 해결하려는 문제

신규 이벤트는 PostHog로 자동 전달되지 않는다. 운영자가 로그를 다시 가공해
업로드하지 않으면 Funnel과 사용자 행동 분석 데이터가 최신 상태를 유지하지
못한다. 자동 전달을 추가하되 PostHog 장애가 기존 이벤트 수집과 원본 로그를
중단시키지 않아야 한다.

## 2. 목표

- 기존 `events.jsonl` 기록을 원본으로 유지한다.
- 백엔드가 수용한 신규 이벤트를 PostHog로 자동 전달한다.
- PostHog의 지연·장애를 공개 이벤트 수집 API와 분리한다.
- 실패한 전송 상태를 재시작 후에도 복구한다.
- 재시도 횟수를 최초 시도 포함 최대 5회로 제한한다.
- 최종 실패 이벤트를 dead-letter로 보존한다.
- 재시도로 인한 PostHog 중복 집계를 방지한다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- 기존 과거 로그의 재이전 도구를 제품 기능으로 만드는 일
- PostHog 대시보드나 Funnel을 새로 구성하는 일
- 외부 배달앱의 실제 주문 완료 여부를 추적하는 일
- 실패 이벤트를 무제한으로 자동 재시도하는 일
- 기존 자체 통계 API와 `events.jsonl` 기반 집계를 제거하는 일
- dead-letter 자동 재투입 도구나 별도 운영 알림 시스템을 구축하는 일

## 4. 요구사항

### 필수

- `events.jsonl` 기록 성공을 기존 API의 `accepted` 기준으로 유지한다.
- PostHog 전달은 요청 처리와 분리하여 비동기로 실행한다.
- 전달 대기 payload와 시도 횟수를 디스크의 영속 outbox에 저장한다.
- 최초 전송 후 실패하면 1시간 간격으로 재시도한다.
- 최초 시도를 포함하여 최대 5회만 자동 전송한다.
- 다섯 번째 실패 후에는 자동 재시도를 중단하고 dead-letter로 이동한다.
- `page_view`를 PostHog의 `$pageview`로 변환한다.
- `visitorId`를 `distinct_id`, `sessionId`를 `source_session_id`로 전달한다.
- `clientTs`가 유효하면 PostHog 이벤트 발생 시각으로 사용한다.
- 클라이언트가 발급하고 서버가 검증하거나 보완한 `eventId`를 PostHog 이벤트의
  최상위 `uuid`와 `properties.$insert_id`에 동일하게 전달한다.
- 이벤트 식별자 세부 계약은
  [PostHog 서버 릴레이 이벤트 UUID 설정](./20-posthog-server-event-uuid.md)을 따른다.
- `ipHash`와 `dev=true` 이벤트는 PostHog에 전달하지 않는다.
- PostHog 프로젝트 토큰을 코드, 문서 예시 값, outbox와 로그에 기록하지 않는다.

### 선택

- due 이벤트를 PostHog batch API로 묶어 요청 수를 줄인다.
- dead-letter에는 마지막 오류와 최종 실패 시각을 함께 보존한다.
- 기능 활성화 시 설정과 outbox 경로를 시작 단계에서 검증한다.

## 5. 제약사항

- 기술적 제약: 현재 API는 DB 없이 JSONL 파일을 원본으로 사용한다.
- 기술적 제약: Java 17과 Spring Boot 3.3.5 환경을 유지한다.
- 기존 시스템 제약: `/api/events`는 `application/json`과 `text/plain`을 모두
  받아야 하며 기존 응답 계약을 바꾸지 않는다.
- 운영 제약: 애플리케이션은 단일 OCI 인스턴스에서 systemd로 실행된다.
- 운영 제약: 런타임 데이터는 jar 외부의 영속 경로에 저장해야 한다.
- 보안 제약: 운영 토큰은 systemd 환경을 통해서만 주입한다.
- 범위 제약: 새로운 외부 라이브러리 없이 JDK HTTP client와 기존 Jackson을
  우선 사용한다.

## 6. 성공 조건

- [ ] 신규 정상 이벤트가 PostHog에서 원래 발생 시각과 방문자 식별자로 조회된다.
- [ ] 기존 `$pageview → offer_link_click` Funnel이 신규 데이터로 갱신된다.
- [ ] PostHog 장애 중에도 `/api/events`가 원본 JSONL을 정상 기록한다.
- [ ] 애플리케이션 재시작 후에도 pending payload와 시도 횟수가 유지된다.
- [ ] 이벤트 하나당 자동 전송이 최초 시도 포함 5회를 넘지 않는다.
- [ ] 다섯 번째 실패 이벤트를 dead-letter에서 식별할 수 있다.
- [ ] 응답 유실 후 재전송되어도 동일한 `$insert_id`가 사용된다.
- [ ] `ipHash`와 `dev=true` 이벤트가 PostHog payload에 포함되지 않는다.
- [ ] PostHog 비활성 기본값에서 테스트와 빌드가 외부 네트워크 없이 성공한다.

## 7. 고려한 접근 방식

### A. 요청 안에서 동기식 이중 기록

설명: `events.jsonl` 기록 직후 같은 요청 스레드에서 PostHog 응답까지 기다린다.

장점:

- 구현과 실행 흐름이 단순하다.
- 요청 시점에 전송 성공 여부를 알 수 있다.

단점:

- PostHog 지연과 장애가 `/api/events` 응답 시간과 가용성에 영향을 준다.
- 핵심 수집 경로가 외부 분석 서비스에 직접 결합된다.

### B. 메모리 기반 비동기 best-effort 전달

설명: 원본 기록 후 메모리 큐나 비동기 작업으로 PostHog에 전달한다.

장점:

- 사용자 요청과 외부 전송을 분리할 수 있다.
- 현재 규모에서 구현이 비교적 간단하다.

단점:

- 프로세스 종료 시 대기 이벤트와 재시도 횟수가 사라진다.
- 최종 누락 이벤트를 식별하기 어렵다.

### C. 영속 outbox 기반 비동기 전달

설명: 전달 payload와 재시도 상태를 디스크의 outbox에 보존하고, 별도 worker가
즉시 전송과 주기적 재시도를 담당한다.

장점:

- PostHog 장애를 요청 경로와 분리한다.
- 애플리케이션 재시작 후에도 재시도를 이어갈 수 있다.
- 최종 실패를 dead-letter로 격리하여 확인할 수 있다.

단점:

- 파일 상태 전이, 동시성, 원자성과 운영 경로를 설계해야 한다.
- 단순 비동기 전달보다 구현과 테스트 범위가 크다.

## 8. 선택

선택한 방법: **C. 영속 outbox 기반 비동기 전달**

선택 이유: 외부 분석 서비스의 장애가 기존 이벤트 수집을 방해하지 않으면서,
메모리 큐보다 명확하게 누락을 식별하고 재시작 후 복구할 수 있다. 분석 데이터는
초 단위 실시간성보다 복구 가능성이 중요하므로 1시간 간격 재시도를 허용한다.

## 9. 설계

### Architecture

```text
Browser
  │ POST /api/events
  ▼
EventController ── validate/normalize
  ▼
AnalyticsEventService
  ├── EventLog ──────────────► events.jsonl
  └── PostHogOutbox ─────────► pending/{eventId}.json
                                  │
                                  ▼
                         PostHogForwardingWorker
                                  │ /batch/
                                  ▼
                               PostHog
                                  │ 5회 실패
                                  ▼
                         dead-letter/{eventId}.json
```

### Components

#### AnalyticsEventService

- 책임: 원본 기록 후 PostHog 전달 대상을 outbox에 등록한다.
- 의존성: `EventLog`, `PostHogEventMapper`, `PostHogOutbox`, worker.
- 외부 인터페이스: 정제된 `List<VisitEvent>`를 받는다.

#### PostHogEventMapper

- 책임: 자체 이벤트를 PostHog payload로 변환하고 전달 금지 필드를 제거한다.
- 의존성: 서버 시계.
- 외부 인터페이스: `VisitEvent`를 선택적 PostHog 이벤트로 변환한다.

#### PostHogOutbox

- 책임: pending 등록, due 조회, 시도 횟수 갱신, 성공 삭제와 dead-letter 이동.
- 의존성: Jackson, 런타임 파일시스템, 서버 시계.
- 외부 인터페이스: enqueue, claim, success, failure 상태 전이.

#### PostHogForwardingWorker

- 책임: outbox의 due 항목을 단일 스레드에서 읽어 PostHog로 전달한다.
- 의존성: `PostHogOutbox`, `PostHogClient`.
- 외부 인터페이스: 신규 등록 직후 trigger와 주기적 scan.

#### PostHogClient

- 책임: PostHog `/batch/` HTTP 요청을 생성하고 결과를 반환한다.
- 의존성: JDK `HttpClient`, Jackson, 운영 환경의 host와 project token.
- 외부 인터페이스: PostHog 이벤트 batch 전송.

### Data Flow

1. 컨트롤러가 기존 화이트리스트와 길이 제한으로 요청을 정제한다.
2. 클라이언트가 이벤트별 UUID `eventId`를 생성하고, 서버는 유효한 값을 유지하며
   누락되거나 잘못된 값만 새 UUID로 보완한다.
3. `EventLog`가 정제된 이벤트를 `events.jsonl`에 기록한다.
4. 기능이 활성화된 경우 mapper가 `dev=true` 이벤트를 제외하고 payload를 만든다.
5. outbox가 이벤트별 pending 파일을 임시 파일 작성 후 원자적으로 이동한다.
6. worker가 등록 직후 due 항목을 가져오며 요청 전에 시도 횟수를 영속화한다.
7. PostHog 2xx 응답이면 pending 파일을 제거한다.
8. 실패하면 다음 시도 시각을 1시간 뒤로 갱신한다.
9. 다섯 번째 실패면 pending을 dead-letter로 이동한다.

### Error Handling

- PostHog HTTP 실패·타임아웃·네트워크 오류 → 1시간 뒤 재시도한다.
- 다섯 번째 실패 → 자동 재시도를 중단하고 dead-letter로 이동한다.
- 응답 유실 → 동일한 `$insert_id`로 재전송하여 중복 집계를 방지한다.
- worker 실행 중 프로세스 종료 → pending과 시도 횟수를 다음 시작에서 복구한다.
- outbox 등록 실패 → 원본 JSONL과 기존 API 응답은 유지하고 오류를 기록한다.
- 토큰 누락 또는 outbox 초기화 실패 → 기능이 명시적으로 활성화된 경우 시작을
  실패시켜 조용한 미전송을 막는다.
- 깨진 pending 파일 → 전송을 반복하지 않고 corrupt dead-letter로 격리한다.

## 10. 테스트 전략

- Unit: 이벤트 변환, 개인정보 제외, 시도 횟수와 due 시각 계산.
- Persistence: outbox 재생성 후 상태 복구, 성공 삭제와 dead-letter 이동.
- Integration: 로컬 HTTP 서버를 사용한 PostHog batch request/response 검증.
- Controller: 기존 JSON·text/plain·화이트리스트·응답 계약 회귀 테스트.
- Acceptance: 개발 이벤트 한 건으로 JSONL 기록, pending 제거와 PostHog 조회 확인.

## 11. 미해결 사항

- dead-letter 수동 재투입 도구는 현재 이슈의 완료 조건에서 제외하고
  `FOLLOW-UP` 후보로 둔다.
- dead-letter 적재량 알림과 운영 메트릭도 `FOLLOW-UP` 후보로 둔다.

## Implementation Plan

### 변경 대상

#### Create

- `api/src/main/java/com/discounttracker/analytics/AnalyticsEventService.java`:
  원본 로그 기록과 outbox 등록 순서를 조정한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogProperties.java`:
  활성화 여부, host, token과 outbox 경로를 읽고 검증한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogEventMapper.java`:
  `VisitEvent`를 개인정보가 제거된 PostHog payload로 변환한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogEvent.java`:
  PostHog ingestion payload 모델을 정의한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogDelivery.java`:
  outbox payload와 시도 횟수·다음 시각·오류 상태를 정의한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogOutbox.java`:
  pending과 dead-letter의 파일 상태 전이를 담당한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogClient.java`:
  JDK HTTP client로 PostHog batch API를 호출한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogConfiguration.java`:
  단일 전송 executor, HTTP client와 scheduler를 구성한다.
- `api/src/main/java/com/discounttracker/analytics/PostHogForwardingWorker.java`:
  최초 비동기 전송과 주기적 due scan을 수행한다.
- `api/src/test/java/com/discounttracker/analytics/PostHogEventMapperTest.java`:
  변환 및 제외 규칙을 검증한다.
- `api/src/test/java/com/discounttracker/analytics/PostHogOutboxTest.java`:
  영속 상태와 최대 5회 재시도를 검증한다.
- `api/src/test/java/com/discounttracker/analytics/PostHogClientTest.java`:
  batch HTTP 계약을 검증한다.
- `api/src/test/java/com/discounttracker/analytics/PostHogForwardingWorkerTest.java`:
  즉시 시도, 1시간 간격과 dead-letter 이동을 검증한다.
- `api/src/test/java/com/discounttracker/analytics/AnalyticsEventServiceTest.java`:
  원본 기록과 외부 전달의 분리를 검증한다.

#### Modify

- `api/src/main/java/com/discounttracker/analytics/VisitEvent.java`:
  클라이언트가 발급하고 서버가 검증하거나 보완한 `eventId`를 원본 이벤트에 추가한다.
- `api/src/main/java/com/discounttracker/analytics/EventController.java`:
  이벤트 ID를 검증하거나 보완하고 `AnalyticsEventService`에 배치를 전달한다.
- `api/src/main/resources/application.yml`:
  활성화, host, token과 outbox 경로 환경변수를 추가한다.
- `api/src/test/java/com/discounttracker/analytics/EventControllerTest.java`:
  기존 API 계약과 이벤트 ID 기록을 검증한다.
- `api/src/test/java/com/discounttracker/analytics/EventLogTest.java`:
  변경된 원본 이벤트 스키마를 반영한다.
- `api/src/test/java/com/discounttracker/analytics/TrafficStatsServiceTest.java`:
  이벤트 ID 추가 후 기존 통계 회귀를 검증한다.
- `api/docs/traffic-analytics.md`:
  자동 전달, 재시도와 dead-letter 운영 방법을 기록한다.
- `api/docs/ORCHESTRATION-CONTRACT.md`:
  `/api/events`의 원본 기록과 비동기 전달 경계를 반영한다.
- `api/README.md`:
  systemd 환경변수와 런타임 경로를 기록한다.

### Tasks

#### 1. 이벤트 식별자와 PostHog 변환 모델 추가

- 변경:
  - `VisitEvent`에 클라이언트가 발급하고 서버가 검증하거나 보완한 `eventId`를 추가한다.
  - `eventId`를 PostHog 최상위 `uuid`와 `properties.$insert_id`에 동일하게 전달한다.
  - 기존 수동 이전과 동일한 이름·속성·timestamp 변환 규칙을 구현한다.
  - 서버 소유 속성을 클라이언트 `props`가 덮어쓰지 못하게 한다.
  - `ipHash`와 `dev=true` 이벤트를 전달 대상에서 제외한다.
- 테스트:
  - `$pageview`, `distinct_id`, `$insert_id`, timestamp fallback을 검증한다.
  - 개인정보 제외와 예약 속성 충돌을 검증한다.
- 완료 조건:
  - 동일한 원본 이벤트가 재시도마다 동일한 안전한 payload로 변환된다.

#### 2. 파일 기반 영속 outbox 구현

- 변경:
  - 이벤트별 pending 파일을 임시 파일 작성과 원자적 이동으로 생성한다.
  - HTTP 요청 전에 시도 횟수와 다음 시도 시각을 저장한다.
  - 성공 시 제거하고 다섯 번째 실패 시 dead-letter로 이동한다.
  - 새 프로세스가 기존 pending 상태를 읽어 이어서 처리하게 한다.
- 테스트:
  - 재시작 복구, 1시간 이전 미선택과 시도 횟수 보존을 검증한다.
  - 성공 삭제, 다섯 번째 실패 이동과 6회차 차단을 검증한다.
- 완료 조건:
  - 메모리 상태 없이 디스크 파일만으로 다음 처리 대상을 결정할 수 있다.

#### 3. PostHog client와 단일 worker 구현

- 변경:
  - due 이벤트를 최대 20건씩 `/batch/`에 전달한다.
  - outbox 등록 직후 최초 시도를 비동기로 실행한다.
  - 주기적 scan으로 재시작 후 due 항목을 회수한다.
  - worker 실행을 단일 스레드로 직렬화한다.
- 테스트:
  - 2xx, 비정상 HTTP 응답, 타임아웃과 연결 실패를 검증한다.
  - 고정 시계로 최초 시도와 1시간 뒤 재시도를 검증한다.
- 완료 조건:
  - 외부 장애 중에도 요청 스레드가 PostHog 응답을 기다리지 않는다.

#### 4. 기존 이벤트 수집 경로에 연결

- 변경:
  - 원본 로그 성공 후 outbox에 등록하도록 서비스 경계를 추가한다.
  - 비활성 상태에서는 기존과 동일하게 JSONL만 기록한다.
  - outbox 런타임 등록 실패가 기존 `accepted` 응답을 바꾸지 않게 한다.
  - 활성 상태 설정 누락은 시작 시 명시적으로 실패시킨다.
- 테스트:
  - 기존 JSON·text/plain·잘못된 이벤트·rate limit 계약을 회귀 검증한다.
  - PostHog 실패 중에도 JSONL과 `accepted`가 유지되는지 검증한다.
- 완료 조건:
  - PostHog 상태가 공개 이벤트 수집 API의 가용성과 응답 계약을 바꾸지 않는다.

#### 5. 운영 문서와 배포 설정 정리

- 변경:
  - systemd 환경변수와 런타임 경로 예시를 기록한다.
  - pending/dead-letter 확인과 5회 소진 후 대응 방법을 기록한다.
  - 토큰과 실데이터가 저장소에 포함되지 않는지 점검한다.
- 테스트:
  - 비활성 기본값으로 전체 빌드가 네트워크 없이 성공하는지 확인한다.
- 완료 조건:
  - 운영자가 문서로 활성화 상태와 최종 실패 위치를 확인할 수 있다.

### Scope Check

- [x] 모든 Task가 신규 이벤트 자동 전달이라는 현재 이슈의 목표를 직접 달성한다.
- [x] outbox, client와 수집 경로 연결은 단독 병합 시 사용자 가치가 없으므로
  하나의 PR로 함께 리뷰한다.
- [x] 이벤트 변환, 영속성, 재시도와 API 비결합을 각각 검증할 수 있다.
- [x] 하나의 완료 조건인 자동 전달과 최대 5회 후 dead-letter 격리로 설명된다.

서브 이슈는 분리하지 않는다. dead-letter 재투입 도구와 운영 알림은 현재
이슈 완료에 필요하지 않으므로 `FOLLOW-UP` 후보로 남긴다.

### 검증

```bash
cd api && ./gradlew test --tests 'com.discounttracker.analytics.*'
cd api && ./gradlew test
cd api && ./gradlew build
git diff --check
```

실제 운영 토큰을 사용하는 자동 테스트는 수행하지 않는다. 로컬 HTTP 서버로
전송 계약을 검증하고 배포 후 개발 이벤트 한 건으로 실제 연동을 확인한다.

### 구현 결과

- analytics 테스트 39개 통과
- 전체 `./gradlew test` 통과
- `./gradlew build` 통과
- `git diff --check` 통과
- 운영 토큰을 사용한 실제 PostHog 조회는 배포 후 acceptance test로 남음
