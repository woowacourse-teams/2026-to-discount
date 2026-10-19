# Design: 알림 아이콘 클릭 이벤트

## 1. 문제

알림 안내에서 권한 거부를 경험한 사용자가 헤더 알림 아이콘으로 다시 시도하는 행동을 수집하지 않는다. 현재는 활성화 성공, 비활성화, 권한 거부 결과만 기록하므로 결과 없이 끝난 클릭을 Paths에서 확인할 수 없다.

## 2. 목표

- 헤더 알림 아이콘 클릭을 처리 결과와 무관하게 수집한다.
- 클릭 시점의 상태로 알림 켜기 재시도와 끄기 행동을 구분한다.

## 3. Non-goals

- 알림 권한 요청, 구독, 안내 노출 동작 변경
- PostHog 대시보드 변경과 운영 배포
- 운영체제 수집 보완과 과거 데이터 복원

## 4. 요구사항

- 이벤트 이름: `push_setting_clicked`
- 속성: `source=header`, `enabled`(클릭 전 구독 상태), `availability`(클릭 전 지원 및 권한 상태)
- `enabled`는 문자열 `"true"` 또는 `"false"`로 전송한다. 서버의 문자열 속성 계약과 SDK 경로의 타입을 일치시킨다.
- 기존 헤더 버튼의 클릭 처리 시작 시 한 번 기록한다. 권한 차단 안내 및 iOS 설치 안내로 이어지는 클릭도 포함한다.
- 기존 `track()` 경로를 재사용해 SDK와 서버 릴레이의 중복 제거 및 분석 수집 거부 정책을 유지한다.
- 서버 이벤트 허용 목록에 추가한다.

## 5. 제약사항

- 기존 작업의 문서 변경을 보존한다.
- 현재 코드와 배포된 코드의 일치 여부는 배포 검증 시 확인한다.
- `enabled=false`는 클라이언트가 인식한 상태이며 서버의 전체 구독 현황을 의미하지 않는다.

## 6. 성공 조건

- [x] 헤더 클릭 처리 시작 시 이벤트를 한 번 생성한다. 로컬 Chrome에서 실제 클릭 2회에 이벤트 2건 기록 확인.
- [x] 권한 차단 안내 분기 전에도 클릭을 기록한다. 코드 확인 완료.
- [x] 클릭 직전 `enabled` 값을 문자열로 기록한다.
- [x] API 수신 및 상태 속성 보존 테스트 통과.
- [x] 기존 알림 분기와 `track()`의 수집 거부 처리를 유지한다. 관련 자동 검사 통과.

## 7. 고려한 접근 방식

### A. 기존 결과 이벤트로 재시도 추정

추가 구현은 없지만 권한 차단 안내만 표시되는 클릭과 결과 없는 시도를 놓친다.

### B. 헤더 클릭 이벤트 추가

실제 클릭을 직접 관측하고 기존 결과 이벤트와 시간순으로 연결할 수 있다. 프론트와 API 허용 목록 변경이 필요하다.

## 8. 선택

B를 선택한다. 사용자가 지정한 재시도 정의인 알림 아이콘 클릭을 직접 기록한다.

## 9. 설계

- `web/src/PushNotificationSetting.jsx`: 헤더 버튼에서 상태를 기록한 후 기존 분기를 실행한다.
- `web/src/analytics.js`: 기존 전송 경로를 재사용한다.
- `api/src/main/java/com/discounttracker/analytics/EventController.java`: 이벤트 허용 목록에 추가한다.
- `api/src/test/java/com/discounttracker/analytics/EventControllerTest.java`: 수신과 속성 보존을 검증한다.
- 이벤트 전송 실패는 기존 분석 모듈 정책으로 처리하며 알림 설정 동작을 바꾸지 않는다.
- Paths에서 `push_setting_clicked` 중 `enabled="false"`를 켜기 시도로 해석한다. 이후 성공과 거부 이벤트를 연결한다.

## 10. 테스트 전략

- API: 새 이벤트가 허용되고 `source`, `enabled`, `availability`가 보존되는지 검증한다.
- 웹: 저장소 검증 명령과 빌드를 실행한다. 기존 테스트 구조에 맞춰 클릭 계측 검증 방법을 결정한다.
- 인수 확인: 권한 차단, 정상 켜기, 정상 끄기, iOS 설치 안내에서 클릭 한 건과 클릭 전 상태를 확인한다.
- 운영 PostHog 수집 검증은 배포 이후 수행한다.

## 11. 미해결 사항

- 없음. 2026-10-19 대화에서 설계 승인.

## Implementation Plan

1. `feat/push-setting-click-analytics` 브랜치에서 작업한다.
2. 구현 전 `docs/`의 전체 Markdown 문서를 확인하고 필요한 세부 규칙을 반영한다.
3. 헤더 클릭 계측과 API 허용 목록을 추가한다.
4. 관련 검증을 실행하고 `git diff`로 범위를 점검한다.

## 검증 결과

- `web`: `npm run test:event-contract`, `npm run test:analytics`, `npm run test:posthog` 통과.
- `web`: `npm run test:push` 15개 통과.
- `web`: `npm run build` 성공. 브랜드 API 연결 실패로 프리렌더는 건너뜀. 클라이언트 및 SSR 번들 생성은 완료.
- `api`: `./gradlew test --tests com.discounttracker.analytics.EventControllerTest` 13개 통과.
- `git diff --check` 통과.
- 로컬 Chrome에서 헤더 아이콘을 2회 클릭하고 `/tmp/push-setting-click-local-events.jsonl`에서 실제 API 수신을 확인했다. 클릭 전 `enabled="true"`, `enabled="false"`가 각각 기록됐고 두 건의 `eventId`가 달랐다. 두 건 모두 `source="header"`, `availability="ready"`, `dev=true`였다.
- 로컬 검증은 웹 SDK와 서버의 외부 PostHog 전송을 끈 상태로 수행했다.
- `denied`와 `ios-install` 분기의 실브라우저 클릭 및 운영 PostHog 수집은 미검증. 프론트와 API 배포 후 확인 필요.

## 최신 main 병합 후 검증

- 기존 알림 안내 이벤트 허용 목록을 보존하고 클릭 이벤트를 추가해 병합 충돌을 해결했다.
- 이벤트 계약, analytics, PostHog 검사와 푸시 테스트 17개 통과.
- EventControllerTest 14개 통과.
- 웹 빌드 및 브랜드 페이지 113개 프리렌더 완료.
