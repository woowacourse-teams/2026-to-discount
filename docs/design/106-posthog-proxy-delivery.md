# Design: 광고 차단 환경의 PostHog 전송 안정화

이슈: https://github.com/woowacourse-teams/2026-to-discount/issues/106

## 1. 문제

VPN이 us.i.posthog.com 수집 요청에 HTTP 500과 Blocked Request 본문을 반환한다.
SDK는 서버 장애로 보고 반복 재시도하며 새 이벤트의 실패도 누적된다.

## 2. 목표

API 도메인 프록시로 외부 도메인 차단 영향을 줄이고 실패가 지속될 때 전송을 제한한다.
사용자는 제품 기능을 계속 사용할 수 있어야 한다.

## 3. Non-goals

기존 원장과 서버 릴레이 재설계, 분석 수집 거부 우회, 실패를 200으로 변환,
콘솔 필터, 신규 분석 기능과 운영 배포는 포함하지 않는다.

## 4. 요구사항

필수: API 도메인 경유, 추가 재시도 두 번, 명시적 차단 시 즉시 중단,
5분 중단과 단일 복구 요청, 제한된 대기열, 이벤트 ID 보존, DNT/GPC 유지.
선택: 없음.

## 5. 제약사항

PostHog JS 1.418.1에는 재시도 횟수의 공개 설정이 없다. 내부 메서드를 덮어쓰지 않는다.
현재 웹은 Vercel, 운영 Nginx는 beggars-ops, 개발 API는 별도 서버에서 배포한다.
프록시는 브라우저의 도메인 차단을 완전히 해결하지 못하며 중단 중 SDK 전용 이벤트는 유실될 수 있다.

## 6. 성공 조건

- 사용자의 제품 기능과 기존 원장 수집에 영향 없음
- 프록시를 통해 SDK 속성과 같은 UUID가 PostHog에 도착함
- 연속 장애에도 최초 요청과 추가 두 번 이후 5분간 요청 없음
- 복구 요청은 한 건만 전송하며 성공 후 정상화
- 개발과 운영 도메인 분리 및 수집 거부 유지

## 7. 고려한 접근 방식

A. SDK 직송과 내부 재시도 유지: 변경은 작지만 현재 문제를 해결하지 못한다.
B. Vercel 동일 출처 프록시: CORS가 단순하지만 과거 요청 한도 문제를 재도입한다.
C. API 도메인 프록시와 공개 before_send 기반 전송 대기열: 기존 서버를 활용하며
재시도를 제어할 수 있다. 자체 전송 로직의 검증과 브라우저 종료 시 일부 유실을 감수한다.

## 8. 선택

사용자가 API 도메인 경유와 단일 이슈 및 PR 두 개를 승인했다. C를 선택한다.
대기열은 100건과 10분으로 제한한다. 차단 중 새 이벤트를 저장하지 않고
실패 이벤트만 보관해 차단 중 메모리와 요청이 증가하지 않게 한다.

## 9. 설계

### Architecture와 Components

브라우저 SDK → before_send → posthogDelivery → API /ph/batch/ → PostHog /batch/.
SDK는 속성과 Web Vitals 수집을 담당하며 공개 훅이 null을 반환해 SDK 내부 전송을 막는다.
Web Vitals 의존성은 로컬 번들에 포함하고 flags 및 외부 자산 로딩을 끈다.
프록시는 고정 대상과 제한된 출처만 허용하며 원장에 쓰지 않는다.
기존 /api/events → 원장 → outbox → worker → PostHog 경로는 유지한다.

### Data Flow

UUID와 발생 시각을 캡처 시점에 고정해 메모리에 보관한다. 정상 시 1초 간격으로
최대 20건, 48KiB를 배치 전송한다. page_exit와 $pageleave는 즉시 flush를 시도한다.
keepalive를 쓰며 쿠키는 보내지 않는다. SDK 내부 전송 큐에는 이벤트를 넣지 않는다.

### Error Handling

네트워크, 408, 429, 5xx는 약 5초와 30초 후 재시도한다. 10% 무작위 지연을 더한다.
Retry-After가 길면 그 시간을 우선한다. 명시적 Blocked Request, 재시도 소진,
복구 요청 실패는 최소 5분 중단한다. 기타 4xx는 해당 배치를 버리고 중단한다.
중단 후 최대 한 이벤트로 복구를 확인하며 만료 이벤트는 버린다.
전송 직전과 응답 후 DNT/GPC를 확인해 대기열과 재시도를 제거한다.

## 10. 테스트 전략

Unit: 가상 시계로 재시도 횟수, 중단, 복구, Retry-After, 보관 한도, 수집 거부 검증.
Integration: 실제 SDK에서 before_send 이후 /ph/batch/만 전송하는지 로컬 브라우저 검증.
프록시 PR은 실제 Nginx와 로컬 upstream으로 CORS와 실패 응답 보존을 검증한다.
Acceptance: 프록시 배포 후 VPN 상태의 진단 이벤트 단일 수신과 장애 및 복구 확인.

## 11. 미해결 사항

개발 서버의 프록시 include는 별도 설치가 필요하다. 실제 VPN과 PostHog 수신은
두 환경의 프록시가 준비된 뒤 검증한다. PR 생성까지 수행하고 병합과 배포는 별도다.

## Implementation Plan

PR 1 (beggars-ops): 고정 batch 경로, 환경별 CORS, TLS 검증, 본문 한도, 실패 보존,
배포 시 설정 롤백, Nginx 통합 테스트 및 개발 설치 절차.

PR 2 (mono): posthogDelivery.js의 제한된 대기열, posthog.js의 공개 훅 연결과
API 도메인 주소 결정, 불필요한 Vite 프록시 제거, 문서와 검증 스크립트 갱신.

검증 명령: npm test, npm run build, npm run test:posthog,
python3 scripts/generate_project_structure.py --check, git diff --check.
