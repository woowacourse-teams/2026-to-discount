# Design: 요청 ID로 접근 기록과 오류 연결

추적 이슈: [#67](https://github.com/woowacourse-teams/2026-to-discount/issues/67)

상태: 운영 배포 및 실제 요청 ID 연결 인수 검증 완료. 개발 Nginx 설치와 로그 대조는 SSH 접근 제한으로 사용자 승인에 따라 생략.

## 1. 문제

### 배경

Nginx 접근 로그와 API 예외 로그에 공통 요청 ID가 없어 동시 요청의 오류를 시각과 경로로 추정해야 한다. API의 `GlobalExceptionHandler`는 경로와 예외 전체를 기록하지만 요청을 고유하게 식별하지 못한다.

### 해결하려는 문제

하나의 요청을 Nginx 접근 로그, API 처리 로그 및 오류 로그에서 동일한 ID로 검색할 수 있도록 한다. API에 도달하지 못한 502와 504도 Nginx 기록과 응답에서 식별할 수 있어야 한다.

## 2. 목표

- 운영과 개발의 Nginx 및 API 로그에 동일 요청 ID 기록.
- 응답 헤더에서 요청 ID를 확인해 로그를 검색할 수 있도록 지원.
- 동시 요청과 재사용되는 서버 스레드 사이에 요청 ID가 섞이지 않도록 처리.

## 3. Non-goals

- /ops 오류 상세 및 전체 스택트레이스 조회 UI.
- 분산 추적 플랫폼, 성능 지표, 사용자 식별 정보 추가.
- 기존 5xx 감지 주기와 복구 기준 변경.
- 백그라운드 PostHog 전송과 예약 작업에 HTTP 요청 ID를 강제로 연결.

## 4. 요구사항

### 필수

- Nginx를 통과한 요청은 Nginx와 API에서 같은 ID를 사용한다.
- HTTPS API 응답에는 `X-Request-ID` 하나가 포함되며 4xx 및 5xx에도 유지된다. 응답 없이 연결을 끊는 기존 Nginx 444 동작은 그대로 유지하고 접근 로그로만 식별한다.
- Nginx가 직접 반환한 오류와 upstream 연결 실패에도 요청 ID가 남는다.
- API 직접 호출은 전달받은 유효한 ID를 사용하고, 없거나 잘못된 값이면 새 ID를 생성한다.
- 기존 상태 코드와 오류 응답 본문, CORS 허용 출처, 5xx 로그 수집을 유지한다.

### 선택

- 브라우저 코드가 응답 ID를 읽을 수 있도록 CORS 노출 헤더에 `X-Request-ID`를 추가한다. 화면 구현은 제외한다.

## 5. 제약사항

- API는 Spring Boot 3.3.5와 Java 17을 사용한다.
- 운영 Nginx 정본은 `nn98/beggars-ops/deploy/nginx-delivery-discount-api.conf`다.
- 개발은 `api/deploy/dev/nginx-locations.conf`를 기존 HTTPS server 블록에서 include한다. server 바깥 http 문맥의 로그 형식 정의는 별도 설치 지침이 필요하다.
- 기존 수집기는 combined 로그의 앞부분을 파싱한다. 기존 필드 순서를 유지하고 ID를 마지막에 추가한다.
- `proxy_set_header`와 `add_header`는 하위 location의 별도 설정 때문에 상위 설정이 상속되지 않을 수 있다. API 일반, reload, push admin 경로를 각각 검증한다.
- 개발 Nginx 파일은 JAR 자동 배포만으로 갱신되지 않는다. 서버 설정 반영을 별도로 검증한다.
- 클라이언트가 보낸 ID를 Nginx에서 덮어써 외부 요청이 동일 ID를 임의로 반복하지 못하게 한다. API 내부 포트 직접 호출에서의 헤더는 접근 통제와 별개이며 인증 근거로 쓰지 않는다.

## 6. 성공 조건

- [ ] 동일 요청의 응답, Nginx 로그, API 완료 로그 및 예외 로그 ID가 일치한다.
- [ ] 동시 요청은 각각의 ID로 구분되고 다음 요청에 이전 ID가 남지 않는다.
- [ ] Nginx가 직접 반환한 4xx와 upstream 실패의 502에도 ID가 남는다.
- [ ] 기존 5분 수집과 30초 5xx 감시가 새 로그와 기존 회전 로그를 모두 읽는다.
- [ ] 운영 및 개발 환경에 적용 여부와 검증 결과를 각각 기록한다.

## 7. 고려한 접근 방식

| 방식 | 장점 | 한계 |
| --- | --- | --- |
| API에서 생성 후 Nginx가 응답 ID 기록 | API 코드 중심으로 구현 가능 | API에 도달하지 못한 502, 504에는 공통 ID가 없음 |
| Nginx에서 생성 후 API에 전달 | 모든 진입 요청을 식별하고 proxy 오류도 기록 가능 | 운영 및 개발 Nginx 설정 반영이 필요 |
| OpenTelemetry 기반 추적 | 여러 서비스 사이 호출까지 추적 가능 | 현재 단일 API 요청 연결 목표보다 도입 범위가 큼 |

## 8. 선택

선택: Nginx에서 `$request_id`를 생성해 API에 전달하고 API 직접 호출만 자체 생성한다.

이유: API가 처리하지 못한 요청까지 식별할 수 있고 외부 플랫폼 없이 기존 로그에서 연결 관계를 확인할 수 있다. 2026-10-13 사용자 승인 후 구현했다.

## 9. 설계

### Architecture

`클라이언트 → Nginx(request_id 생성) → API(헤더 검증 및 MDC 등록) → 오류 또는 정상 응답`

### Components

- Nginx: `X-Request-ID: $request_id`를 upstream으로 전달하고 combined 로그 마지막에 `request_id=$request_id`를 추가한다. upstream의 같은 이름 응답 헤더는 숨기고 Nginx에서 `always`로 하나만 반환한다.
- API `RequestIdFilter`: `OncePerRequestFilter` 기반으로 32자리 소문자 16진수 ID만 수용하고 없거나 잘못된 값은 UUID의 하이픈을 제거해 생성한다. 요청 attribute와 MDC의 `requestId`에 저장한다.
- API 로그: console 로그 패턴에 `[request_id=...]`를 추가한다. 기존 ERROR/WARN 수준 토큰을 유지한다. HTTP 처리 완료 시 메서드, 쿼리를 제외한 경로, 상태와 ID를 기록해 정상 요청도 연결할 수 있게 한다.
- 필터 수명: 예외 처리까지 MDC를 유지하고 finally에서 이전 값을 복원하거나 제거한다. error dispatch는 같은 요청 attribute를 사용한다. async dispatch 사용 여부를 확인하고 지원한다면 각 dispatch에 동일 ID를 재등록한다. 임의 executor 작업에는 전파하지 않는다.
- CORS: 기존 정책에 응답 헤더 노출만 추가한다.

### Data Flow

1. Nginx가 외부 `X-Request-ID`를 덮어쓰고 요청 ID를 API에 전달한다.
2. API가 ID를 검증하고 요청 attribute, MDC 및 응답 헤더에 설정한다.
3. 컨트롤러 처리 또는 기존 예외 처리기가 실행되는 동안 로그에 ID가 포함된다.
4. API가 처리 완료 로그를 기록하고 MDC를 정리한다.
5. Nginx가 같은 ID를 응답 및 접근 로그에 남긴다. API가 없으면 Nginx 기록만 남는다.

### Error Handling

- 누락, 잘못된 형식 및 복수 ID 헤더: API에서 새 ID 생성. 외부 입력을 로그에 그대로 넣지 않는다.
- 예외, 404, 400, 연결 종료: 기존 예외 처리 기준과 응답 본문 유지, MDC 정리 보장.
- 요청 바깥 로그: 요청 ID는 빈 값 또는 `-`로 표시하고 임의의 HTTP 요청에 연결하지 않는다.
- Nginx 설정 검사 실패: reload 중단 및 기존 설정 복원. 개발도 `nginx -t` 통과 후 reload.

## 10. 테스트 전략

- Unit: 유효 ID, 누락, 잘못된 값, 복수 헤더, 응답 헤더 및 MDC 정리 검증.
- Integration: 정상과 예외 요청의 완료 및 오류 로그 ID 일치, 다음 요청과 동시 요청의 격리, error dispatch 및 실제 사용되는 async 처리 확인.
- Compatibility: 기존 combined, 새 ID 필드, 빈 요청 로그 및 회전 로그를 5분 수집기와 30초 감시가 읽는지 확인.
- Acceptance: 개발 환경에서 응답 ID와 Nginx 및 API 로그 대조. 별도 임시 upstream으로 502를 검증하고 운영 API를 중단하지 않는다. 504는 격리된 지연 upstream에서 검증한다.
- Deployment: API 개발 검증 이후 운영 반영. beggars-ops Nginx는 작업 브랜치에서 main으로 반영하는 예외 적용. 양쪽 배포 사이에도 기존 파서와 헤더 처리 호환 유지.

## 11. 미해결 사항

- 개발 및 운영 환경의 실제 배포 이후 동일 ID 연결 인수 검증.
- 개발 서버 접근 가능 여부와 기존 server 블록의 include 위치는 실제 반영 전 확인한다. 특정 보안그룹 외의 우회 경로는 만들지 않는다.
- 이슈 담당자, 스프린트, 마감일은 현재 지정되지 않았다.

## Implementation Plan

### 변경 대상

#### Create

- `api/src/main/java/com/discounttracker/web/RequestIdFilter.java`: 요청 ID 검증, 생성, MDC 및 응답 처리.
- `api/src/test/java/com/discounttracker/web/RequestIdFilterTest.java`: 필터 수명과 입력 검증.
- API 통합 테스트: 정상, 예외 및 동시 요청의 로그 연결 검증. 기존 테스트 구조에 맞춰 파일명 확정.
- `api/deploy/dev/nginx-request-id.conf`: http 문맥의 로그 형식 정의와 적용 예시.
- beggars-ops 로그 호환 테스트: request_id 필드 추가 후 기존 파서 호환 검증.

#### Modify

- `api/src/main/resources/application.yml`: MDC를 포함하는 console 로그 설정.
- `api/src/main/java/com/discounttracker/web/WebConfig.java`: 응답 ID 헤더 CORS 노출.
- `api/deploy/dev/nginx-locations.conf`: 전달 및 응답 ID 설정.
- `api/deploy/dev/README.md`: 로그 형식 설치, access_log 적용 및 확인 절차.
- `beggars-ops/deploy/nginx-delivery-discount-api.conf`: 운영 로그 형식, API location별 전달 및 응답 ID.
- `beggars-ops/README.md`: ID로 Nginx와 journal을 검색하는 절차.
- `docs/PROJECT-STRUCTURE.md`: 구현 후 새 파일 반영.

### Tasks

#### 1. API 요청 ID 수명과 로그 연결

- 변경: 필터, console 로그, 완료 로그 및 CORS 노출 구현.
- 테스트: 정상과 예외, 직접 호출 fallback, 동시 요청 및 MDC 정리.
- 완료 조건: API 응답과 관련 로그의 ID가 일치하고 요청 간 섞이지 않는다.

#### 2. 운영 및 개발 Nginx 연결

- 변경: 로그 끝의 ID와 API 헤더 전달, upstream 응답 ID 숨김 및 단일 응답 헤더 설정.
- 테스트: nginx -t, API 경로별 헤더, 로그 파서 회귀 테스트.
- 완료 조건: 응답과 Nginx 및 API 로그의 ID가 같으며 Nginx 생성 오류도 식별된다.

#### 3. 배포 검증과 운영 문서

- 변경: 설치 및 검색 절차 기록. 개발 API 검증 후 운영 반영, 운영 Nginx는 beggars-ops main 경로 적용.
- 테스트: 정상 및 예외 ID 대조, 격리된 502와 504, 기존 감시 정상 실행.
- 완료 조건: 환경별 증거를 기록하고 미검증 환경을 완료로 표시하지 않는다.

### Scope Check

- [x] 각 Task는 요청과 오류를 같은 ID로 연결하는 목표에 필요하다.
- [x] 독립적인 모니터링 태스크를 포함하지 않는다.
- [x] API와 운영 Nginx는 저장소별 PR로 제출하고 동일 이슈로 연결한다.
- [x] 완료 조건은 동일 요청 ID의 일치와 요청 간 격리로 검증한다.

### 검증

- `cd api && ./gradlew test`
- `python3 -m unittest discover -s api/deploy/dev -p 'test_*.py'`
- beggars-ops: `python3 -m unittest discover -s tests` (지원되는 Python 버전과 의존성 사용)
- 서버: `sudo nginx -t`
- 환경별 `curl -D -` 응답 ID와 Nginx 및 API journal 검색 결과 대조.
- `git diff --check`

### 구현 및 사전 검증 결과

- 모노레포 브랜치: `feat/67-request-id-correlation`.
- 운영 설정 브랜치: `nn98/beggars-ops`의 `feat/67-request-id-correlation`. 작업 위치는 `/private/tmp/ops-67-worktree`다. 기존 checkout의 외부 모니터 표시 관련 미커밋 변경을 보존하고 별도로 격리했다.
- 요청 ID 필터, 등록, console 로그 패턴과 CORS 노출을 구현했다. error 및 async 재진입에서도 요청 attribute의 같은 ID를 사용하고 MDC를 정리한다. 현재 API에는 비동기 HTTP 처리 코드가 없다.
- 일반 API와 운영 reload 및 push admin 경로에 전달 헤더를 명시했다. upstream의 같은 이름 응답 헤더를 숨기고 Nginx가 단일 ID 헤더를 반환한다.
- 기존 combined 필드를 유지하고 ID를 끝에 추가했다. API 로그의 ID 때문에 WARN 그룹이 요청별로 갈라지지 않도록 수집기 파서를 함께 수정했다.
- `cd api && ./gradlew test build`: API 전체 테스트 382개 통과, 빌드 성공. 이후 405 응답 검증을 보강하고 `./gradlew test --tests '*RequestIdIntegrationTest'`의 3개 테스트도 통과했다.
- `python3 -m unittest discover -s api/deploy/dev -p 'test_*.py'`: 10개 통과.
- 격리된 beggars-ops worktree에서 `PYTHONPATH=/Users/pine/Library/Python/3.9/lib/python/site-packages /opt/homebrew/bin/python3.11 -m unittest discover -s tests`: 255개 통과. 회전 로그와 ID 필드, 빈 요청 및 WARN 그룹 호환 테스트 3개 추가.
- 운영 서버에 설치된 Nginx를 사용하되 별도 임시 설정, 로그, PID, localhost 포트와 가짜 upstream으로 검증했다. 운영 파일, 기존 Nginx 프로세스, 실제 API와 Slack은 테스트 대상으로 사용하지 않았다.
- 임시 후보 설정의 `nginx -t` 통과. 운영 및 개발의 정상 200, upstream 500, timeout 504, 연결 실패 502에서 응답과 로그 ID가 일치했다. upstream이 응답 헤더에 다른 ID를 보내도 외부 응답은 Nginx ID 하나만 포함했다. 외부 입력 ID는 덮어썼다.
- 운영 reload 및 push admin의 인증 없는 401, 개발 reload의 403에도 응답과 로그 ID가 유지됐다. 성공적으로 프록시된 요청은 upstream 전달 ID까지 대조했다.
- 이 검증은 Nginx 후보와 API 통합 테스트의 사전 검증이다. 실제 환경에 배포된 Nginx와 API의 연결 검증을 대체하지 않는다.
- 기본 Python 3.9에서 구조 문서 생성은 기존 `Path.write_text(newline=...)` 미지원으로 실패했다. Python 3.11로 생성 및 `--check` 재실행해 통과했다.
- Gradle 캐시 접근은 sandbox 제한으로 처음 실패했다. 캐시 접근 권한을 사용해 재실행한 관련 테스트와 전체 테스트가 통과했다.
- 양쪽 저장소 `git diff --check` 통과. 코드와 테스트 diff를 검토했다.
- 사용자 요청에 따라 검증된 변경을 커밋하고 저장소별 PR로 제출한다. API는 dev 대상, beggars-ops는 main 대상이다. 병합과 실제 배포 및 환경별 인수 검증은 미수행 상태다.

### 운영 반영 범위

- 2026-10-13 사용자 승인: SSH 접근 제한으로 개발 Nginx 설치 및 로그 대조를 건너뛰고 운영에 반영한다.
- dev의 개발 CI/CD 및 웹 변경을 함께 반영하지 않도록 main 기반 `release/67-request-id-correlation`에 검증한 API 요청 ID 변경만 옮긴다. 개발 인프라 파일과 개발 CORS 설정은 운영 반영에서 제외한다.
- 운영 API 배포 후 beggars-ops PR #12의 Nginx 설정을 반영하고 실제 응답, 접근 로그 및 API journal의 동일 ID를 대조한다.

### 운영 배포 및 최종 검증

- 운영 API PR: https://github.com/woowacourse-teams/2026-to-discount/pull/69
- 운영 Nginx PR: https://github.com/nn98/beggars-ops/pull/12
- API 운영 main 기반 테스트 424개와 빌드 통과. 기존 운영 관리 API CORS 정책을 유지했다.
- API 미러 실행 38398793270 및 서버 배포 실행 38398817863 성공. 설치된 current.jar는 `delivery-discount-api-8999f02.jar`다. 모노레포 운영 병합 커밋은 `0d898f9df67c2d25bd33fc7b3d168098c7057602`다.
- Nginx 운영 배포 실행 38399011890 성공. 병합 커밋은 `49e5ad492e0f3c85b1fc8ba33c29c74ed42671ab`다.
- 실제 HTTPS 응답과 `/var/log/nginx/discount.access.log`, `delivery-discount-api` journal의 ID 일치 확인:
  - brands 200: `141fc4df27ae0fcf7dcd8a7ff08864bd`
  - banners 200: `f70dbdacb011ad26e1dafbebabcf2433`
  - 없는 경로 404: `1c362c7eb1d1b0d87e00749e1f86bdb9`
- 각 ID는 서로 다르고 외부 입력 ID는 교체됐으며 응답 헤더는 하나만 반환됐다.
- `sudo nginx -t` 통과. API 및 fast-check timer active, fast-check Result=success 및 ExecMainStatus=0. 21:40:48 및 21:41:19 KST에 감시 실행 성공.
- 기존 전체 수집의 5분 cron 유지 확인. 운영에서 인위적인 5xx는 만들지 않았다. 예외 로그의 ID는 API 통합 테스트, 502와 504는 격리된 Nginx에서 검증했다.
- 개발 API 배포 실행 38396973713은 성공했다. 개발 Nginx 설치 및 양쪽 로그 대조는 SSH 접근 제한으로 미수행이다. 사용자가 해당 개발 검증을 생략하고 운영에 반영하도록 승인했다.
