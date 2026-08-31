# Design: PostHog 서버 릴레이 이벤트 UUID 설정

## 1. 문제

### 배경

브라우저에서 생성한 제품 이벤트는 PostHog SDK와 자체 API를 거친 서버 릴레이 두 경로로 PostHog에 전달된다. 두 경로는 같은 `eventId`를 `properties.$insert_id`로 사용한다.

브라우저 SDK는 `eventId`를 최상위 `uuid`로도 전달하지만, 서버 릴레이의 `PostHogEvent`에는 최상위 `uuid` 필드가 없다. 실제 PostHog 데이터에서 같은 `$insert_id`를 가진 SDK 이벤트와 서버 이벤트가 서로 다른 UUID의 두 행으로 저장된 사례가 확인됐다.

### 해결하려는 문제

서버 릴레이 이벤트에도 브라우저에서 생성한 `eventId`를 최상위 `uuid`로 전달해 두 경로의 동일 이벤트가 같은 식별자를 사용하도록 한다.

## 2. 목표

- 서버 릴레이 이벤트의 최상위 `uuid`와 `properties.$insert_id`에 같은 `VisitEvent.eventId`를 설정한다.
- outbox 저장과 재시도 과정에서도 최초 UUID를 유지한다.
- 실제 `/batch/` 요청 JSON에 최상위 `uuid`가 포함되는 것을 검증한다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- SDK 이벤트가 서버 릴레이 이벤트보다 먼저 저장되도록 전송 순서를 제어하지 않는다.
- 서버 릴레이의 지연 전송 또는 SDK 전송 성공 확인 절차를 추가하지 않는다.
- SDK와 서버 이벤트의 속성 또는 timestamp 차이를 통합하지 않는다.
- PostHog에 이미 저장된 중복 이벤트를 삭제하거나 보정하지 않는다.

## 4. 요구사항

### 필수

- `PostHogEvent`가 최상위 `uuid` 필드를 가진다.
- `PostHogEventMapper`가 `VisitEvent.eventId`를 `uuid`와 `$insert_id`에 동일하게 설정한다.
- PostHog 배치 요청의 각 이벤트에 최상위 `uuid`가 직렬화된다.
- outbox가 저장한 이벤트를 재로딩하고 재시도해도 UUID가 바뀌지 않는다.

### 선택

- 없음

## 5. 제약사항

- 기술적 제약: PostHog `/batch/` 이벤트 형식의 최상위 `uuid` 필드를 사용한다.
- 일정 제약: 없음
- 기존 시스템 제약: outbox는 `PostHogEvent` 전체를 JSON으로 저장하고 실패 시 같은 payload를 재사용한다.
- 기타: 운영 이벤트의 `eventId`는 `EventController`에서 UUID 형식으로 검증하거나 새 UUID로 보완된다.

## 6. 성공 조건

- [ ] 서버 릴레이 이벤트의 최상위 `uuid`가 최초 `eventId`와 같다.
- [ ] 최상위 `uuid`와 `properties.$insert_id`가 같다.
- [ ] outbox 재시도 전후 UUID가 같다.
- [ ] SDK와 서버에서 같은 UUID를 전송한 이벤트가 PostHog에서 별도 행으로 저장되지 않는다.

## 7. 고려한 접근 방식

### A. `PostHogEvent`에 `uuid` 필드 추가

설명: PostHog 전송 모델에 최상위 `uuid`를 명시하고 매퍼가 `VisitEvent.eventId`를 설정한다.

장점:

- 모델과 실제 전송 JSON의 구조가 일치한다.
- outbox에 UUID가 포함된 payload가 저장된다.
- 재시도 과정에서 같은 UUID가 자연스럽게 유지된다.
- 매퍼와 직렬화 결과를 독립적으로 테스트하기 쉽다.

단점:

- `PostHogEvent`를 생성하는 기존 테스트 fixture를 수정해야 한다.
- 배포 전에 만들어진 구형 outbox payload에는 `uuid`가 없을 수 있다.

### B. JSON 직렬화 과정에서 `$insert_id`를 `uuid`로 복사

설명: 모델은 유지하고 커스텀 직렬화 로직이 최상위 `uuid`를 추가한다.

장점:

- `PostHogEvent` 생성자 변경이 적다.

단점:

- 모델과 실제 JSON 구조가 달라진다.
- UUID 생성 규칙이 직렬화 계층에 숨는다.
- outbox payload만으로 최상위 UUID를 확인하기 어렵다.

### C. `PostHogClient`가 전송 직전에 `uuid` 추가

설명: 배치 요청 생성 시 각 이벤트의 `$insert_id`를 읽어 최상위 `uuid`로 복사한다.

장점:

- 전송 단계에서 누락된 UUID를 보완할 수 있다.

단점:

- HTTP adapter가 이벤트 변환 책임까지 갖게 된다.
- 매퍼 결과와 실제 전송 결과가 달라진다.
- 잘못된 `$insert_id`를 전송 직전에 발견하게 된다.

## 8. 선택

선택한 방법: A. `PostHogEvent`에 `uuid` 필드 추가

선택 이유: 이벤트 식별자가 전송 모델과 outbox payload에 명시적으로 남고, 매핑부터 저장, 재시도, 직렬화까지 같은 값을 유지하는지 계층별로 검증할 수 있다.

## 9. 설계

### Architecture

```text
VisitEvent.eventId
        |
        v
PostHogEventMapper
        |
        +--> PostHogEvent.uuid
        +--> PostHogEvent.properties.$insert_id
        |
        v
PostHogOutbox 저장 및 재시도
        |
        v
PostHogClient /batch/ 전송
```

### Components

#### `PostHogEvent`

- 책임: PostHog `/batch/`가 받는 이벤트 한 건의 구조 표현
- 변경: 최상위 `uuid` 필드 추가

#### `PostHogEventMapper`

- 책임: `VisitEvent`를 PostHog 전송 형식으로 변환
- 변경: `source.eventId()`를 `uuid`와 `$insert_id`에 설정

#### `PostHogOutbox`

- 책임: 전송할 `PostHogEvent` 저장과 재시도 상태 유지
- 변경: 동작 변경 없이 새 `uuid` 필드가 저장 후 복원되는지 검증

#### `PostHogClient`

- 책임: 이벤트 목록을 PostHog `/batch/` 요청으로 직렬화해 전송
- 변경: 동작 변경 없이 새 `uuid` 필드가 요청 JSON에 포함되는지 검증

### Data Flow

1. 브라우저가 UUID 형식의 `eventId`를 포함한 이벤트를 자체 API에 보낸다.
2. `EventController`가 유효한 `eventId`를 유지하고 잘못된 값은 새 UUID로 보완한다.
3. `PostHogEventMapper`가 같은 값을 `PostHogEvent.uuid`와 `properties.$insert_id`에 설정한다.
4. `AnalyticsEventService`가 변환된 이벤트를 outbox에 저장한다.
5. `PostHogForwardingWorker`가 저장된 payload를 `PostHogClient`에 전달한다.
6. `PostHogClient`가 최상위 `uuid`를 포함한 JSON을 `/batch/`로 전송한다.

### Error Handling

- PostHog 전송 실패: 기존 outbox 재시도 정책을 그대로 사용하며 저장된 payload의 UUID를 재사용한다.
- `eventId` 누락 또는 잘못된 형식: 기존 `EventController`가 새 UUID를 발급한다.
- 구형 outbox payload의 `uuid` 누락: 이번 변경의 구현 과정에서 역직렬화 동작을 확인하고 운영 배포에 영향을 주는 경우 후속 호환 방안을 제안한다.

## 10. 테스트 전략

- Unit: `PostHogEventMapperTest`에서 `uuid`, `$insert_id`, `VisitEvent.eventId`가 같은지 확인한다.
- Integration: `PostHogClientTest`에서 `/batch/` 요청 JSON의 각 이벤트에 최상위 `uuid`가 포함되는지 확인한다.
- Persistence: `PostHogOutboxTest`에서 저장 후 새 outbox 인스턴스로 복원한 payload의 UUID가 유지되는지 확인한다.
- Acceptance: 배포 후 같은 이벤트를 SDK와 서버 릴레이로 전송하고 PostHog에서 해당 `$insert_id`의 저장 행 수와 UUID를 확인한다.

## 11. 미해결 사항

- 배포 전에 생성된 구형 outbox 파일에 `uuid`가 없을 때의 역직렬화 및 전송 동작을 구현 전에 확인한다.
- 같은 UUID가 충돌할 때 SDK 이벤트의 속성이 우선 저장되는지는 이번 이슈에서 보장하지 않는다.

## Implementation Plan

## 변경 대상

### Create

- 없음

### Modify

- `api/src/main/java/com/discounttracker/analytics/PostHogEvent.java`: 최상위 `uuid` 필드 추가
- `api/src/main/java/com/discounttracker/analytics/PostHogEventMapper.java`: `VisitEvent.eventId`를 최상위 `uuid`로 매핑
- `api/src/test/java/com/discounttracker/analytics/PostHogEventMapperTest.java`: UUID 매핑 검증 추가
- `api/src/test/java/com/discounttracker/analytics/PostHogClientTest.java`: `/batch/` 요청의 최상위 UUID 직렬화 검증 추가
- `api/src/test/java/com/discounttracker/analytics/PostHogOutboxTest.java`: 저장과 재로딩 후 UUID 유지 검증 추가
- 기타 `PostHogEvent` 테스트 fixture: 새 생성자 인자 반영

## Tasks

### 1. PostHog 이벤트 UUID 매핑

- 변경: `PostHogEvent`에 `uuid` 필드를 추가하고 매퍼가 `source.eventId()`를 전달한다.
- 테스트: 매퍼 결과의 `uuid`와 `$insert_id`가 원본 `eventId`와 같은지 확인한다.
- 완료 조건: 서버에서 생성한 모든 새 PostHog 이벤트가 최상위 UUID를 가진다.

### 2. 직렬화와 재시도 안정성 검증

- 변경: 기존 테스트 fixture를 새 모델에 맞게 갱신한다.
- 테스트: `/batch/` JSON의 최상위 UUID와 outbox 저장 및 복원 후 UUID를 확인한다.
- 완료 조건: 전송과 재시도 과정에서 UUID가 누락되거나 변경되지 않는다.

## Scope Check

- [x] 각 Task가 현재 이슈의 목표를 직접 달성하기 위해 필요하다.
- [x] 서로 독립적으로 완료 가능한 작업이 포함되어 있지 않다.
- [x] 하나의 PR에서 리뷰 가능한 범위다.
- [x] 하나의 명확한 완료 조건으로 설명할 수 있다.

서브 이슈로 분리하지 않는다.

## 검증

- `api` 디렉터리에서 `./gradlew test --tests '*PostHogEventMapperTest*' --tests '*PostHogClientTest*' --tests '*PostHogOutboxTest*'`
- `api` 디렉터리에서 `./gradlew test`
