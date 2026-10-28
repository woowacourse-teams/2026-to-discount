# Design: 짧은 API 장애 감지 지연 개선

> 2026-10-15: 실제 서버 및 실행 환경 경로 표기를 외부 설정 이름 또는 용도로 정정했다. 설계 결정은 유지한다.

추적 이슈: [#65](https://github.com/woowacourse-teams/2026-to-discount/issues/65)

상태: 운영 배포, 30초 감시 실행 및 실제 Slack 장애, 복구, 재발 알림 수신 검증 완료.

## 1. 문제

### 배경

운영 콘솔의 전체 수집기는 5분 간격으로 실행된다. Nginx 5xx 알림은 최근 24시간 누적 수가 50건을 넘을 때 발생하므로 짧은 오류나 트래픽이 적은 시간대의 장애를 빠르게 발견하지 못할 수 있다.

### 해결하려는 문제

전체 수집과 이력 기록은 5분 간격으로 유지하면서 Nginx access log의 새 5xx를 30초 간격으로 확인해 Slack에 알린다. 서버 접속 불가 감지는 별도로 진행 중인 외부 가용성 모니터가 담당한다.

## 2. 목표

- Nginx access log의 새 HTTP 5xx를 30초 간격으로 감지한다.
- 5xx 한 건에도 기존 Slack 경로로 장애 알림을 보낸다.
- 같은 장애의 반복 알림은 억제하고, 복구 시 Slack 복구 알림을 보낸다.
- 전체 콘솔 데이터와 시계열 이력은 기존 5분 주기를 유지한다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- Better Stack 모니터 주기 변경
- Nginx와 API 간 요청 ID 전파
- 오류 스택트레이스 수집 및 표시
- CPU, JVM, GC 등 새 성능 지표 수집
- 전체 수집기의 실행 주기 변경

## 4. 요구사항

### 필수

- 전용 장애 감시가 약 30초마다 Nginx access log의 새 5xx를 검사한다.
- 감지된 장애는 기존 운영 Slack 알림 경로로 전달한다.
- 동일 장애가 지속되는 동안 같은 내용의 알림을 매 검사마다 반복하지 않는다.
- 장애가 복구되면 Slack에 복구 알림을 보내고, 이후 재발하면 새 장애 알림을 보낸다.
- 기존 5분 수집, 대시보드 파일, 시계열 기록의 동작을 유지한다.

### 선택

- 없음

## 5. 제약사항

- 기술적 제약: 운영 콘솔과 수집기 정본은 별도 저장소 `nn98/beggars-ops`다. 운영 서버의 수집기는 현재 cron에서 5분마다 실행된다.
- 일정 제약: 없음.
- 기존 시스템 제약: 운영 Slack 설정과 알림 중복 방지 상태 파일은 서버 사용자 계정의 홈 디렉터리에 있다.
- 기타: 이번 구현은 운영 서버에 상주하는 추가 프로세스를 두지 않고 systemd timer로 짧은 작업을 반복 실행하는 방안을 우선 검토한다.

## 6. 성공 조건

- [ ] 감시 작업이 약 30초마다 Nginx access log의 새 5xx를 검사한다.
- [ ] 새 5xx 한 건을 감지하면 운영 Slack에 장애 알림이 전달된다.
- [ ] 같은 장애 중에는 반복 알림이 억제되고, 복구 시 복구 알림이 전달되며, 재발 시 새 장애 알림이 전달된다.
- [ ] 전체 수집과 시계열 이력은 5분 간격으로만 갱신된다.
- [ ] Slack 설정 또는 로그를 읽을 수 없는 상황이 전체 수집 작업을 중단시키지 않는다.

## 7. 고려한 접근 방식

### A. 전체 수집기를 30초마다 실행

설명: 기존 cron 주기를 30초로 바꿔 오류와 상태를 더 자주 집계한다.

장점:

- 예약 설정이 단순하다.
- 기존 알림 로직을 그대로 호출할 수 있다.

단점:

- 서버 자원, journal, access log, 배포 정보를 불필요하게 자주 읽는다.
- 콘솔 파일과 이력의 갱신 주기도 함께 바뀌어 요구사항을 위반할 수 있다.
- cron은 초 단위 주기를 지원하지 않는다.

### B. 전용 fast-check 모드와 systemd timer

설명: 기존 운영 수집기 안에 장애만 확인하는 경량 실행 경로를 추가하고, systemd timer가 약 30초마다 실행한다. 5분 cron은 그대로 둔다.

장점:

- 감지 주기와 전체 수집 주기를 분리한다.
- 기존 Slack 설정과 로그 판독 코드를 재사용할 수 있다.
- 별도 상주 데몬 없이 systemd가 실패와 실행 상태를 관리한다.

단점:

- systemd service와 timer를 배포 및 설치해야 한다.
- 단기 로그 검색 범위와 중복 방지 상태를 별도로 설계해야 한다.

### C. 외부 모니터의 검사 간격에 의존

설명: Better Stack의 기존 URL 검사를 더 자주 실행하도록 플랜이나 설정을 바꾼다.

장점:

- 애플리케이션 서버와 별개로 감지할 수 있다.
- 자체 감시 코드를 추가하지 않는다.

단점:

- 서버 접속 여부는 확인할 수 있지만 Nginx access log의 새 5xx는 검사할 수 없다.

## 8. 선택

선택한 방법: B. 전용 fast-check 모드와 systemd timer.

선택 이유: 기존 전체 수집이 5분 간격이어서 짧은 5xx를 놓치거나 늦게 알 수 있으므로 감지만 30초 간격으로 분리한다. 외부 가용성 모니터는 접속 불가를 맡고, 이 경량 감시는 Nginx access log의 5xx를 맡아 책임을 분리한다. 5xx 한 건에도 알리면 누적 임계치를 기다릴 때보다 오류 인지가 빠르다. 장애 시작과 복구를 모두 알리면 운영자가 별도 대시보드를 확인하지 않아도 장애 종료를 알 수 있다.

## 9. 설계

### Architecture

`ops_collect.py --fast-alerts`가 마지막 검사 이후 추가된 Nginx access log에서 5xx를 찾는다. 새 5xx가 발견되면 장애 시작 알림을 보내고, 같은 장애가 지속되는 동안 중복 알림을 억제한다. 오류가 난 각 경로에서 해당 오류 이후 2xx 또는 3xx 응답이 관측되고 마지막 5xx 뒤 30초 동안 새 오류가 없으면 복구 알림을 보낸다. 트래픽 부재와 로그 조회 실패는 복구로 판단하지 않는다. systemd timer는 이 경로만 약 30초마다 실행하고, 기존 cron은 전체 수집과 기록을 5분마다 수행한다. API 접속 불가 감지는 외부 가용성 모니터가 담당한다.

### Components

#### Fast failure check

- 책임: 마지막 검사 이후의 Nginx access log에서 5xx를 조회하고, 장애 시작 및 복구 Slack 알림을 중복 없이 요청한다.
- 의존성: Nginx access log, 기존 Slack 설정, Unix 파일 잠금.
- 외부 인터페이스: `python3 "$OPS_COLLECT_SCRIPT" --fast-alerts` (`OPS_COLLECT_SCRIPT`는 비공개 실행 설정에서 지정).

#### systemd service and timer

- 책임: fast-check 명령을 겹쳐 실행하지 않고 약 30초 간격으로 재실행한다.
- 의존성: 운영 서버의 systemd.
- 외부 인터페이스: `ops-fast-check.service`, `ops-fast-check.timer`.

### Data Flow

1. systemd timer가 fast-check service를 시작한다.
2. fast-check가 마지막 검사 이후의 Nginx 5xx 로그를 읽고 장애 시작 또는 복구 알림을 기존 경로로 전달한다.
3. 장애 상태와 마지막 처리 로그 위치를 기록하며, 기존 전체 수집 cron은 5분마다 별도로 동작한다.

### Error Handling

- access log를 읽을 수 없음 → fast-check 실행 로그에 원인을 남기고 다음 주기에 다시 시도한다.
- Slack 설정이 없음 또는 전송 실패 → fast-check 실패 원인을 systemd journal에 남기며 5분 전체 수집을 중단하지 않는다.
- fast-check가 이전 실행 중임 → 중복 프로세스를 만들지 않고 다음 주기에 재시도한다.
- 첫 실행은 최근 30초부터 검사한다. 이후 파일 위치를 기록해 늦어진 검사 사이의 새 로그도 읽는다.
- 일반 로그 회전과 copytruncate는 `.1`을 함께 읽어 처리한다. 이전 파일이 `.1`에도 없으면 유실 가능성을 journal에 남기고 상태를 유지한다.
- Slack은 HTTP 응답과 API의 `ok`를 모두 확인한다. 미발송 알림은 상태에 보관하고 다음 실행에서 다시 보낸다. 수신 직후 응답이 끊기면 재시도 알림이 중복될 수 있다.
- 기존 5분 수집의 누적 5xx 알림은 빠른 감시로 대체해 중복 알림을 막는다.

## 10. 테스트 전략

- Unit: 새 5xx 판독, 장애 지속 중 중복 억제, 복구 알림 및 복구 후 재발 알림, 로그 및 Slack 설정 누락을 목으로 검증한다.
- Integration: 격리된 임시 로그와 테스트 Slack 전송기를 이용해 30초 검사 경로를 검증한다.
- Acceptance: 운영 적용 뒤 timer가 30초 간격으로 활성이고 전체 수집 이력은 5분 간격인지 확인한다. 실제 운영 API를 중단하지 않고 모의 입력을 사용한다.
- 기타: `systemd-analyze verify`로 unit 파일 문법을 확인한다.

## 11. 결정 사항과 근거

- 30초마다 Nginx access log의 새 5xx를 검사한다. 기존 전체 수집은 5분 간격이라 그 사이의 짧은 오류를 늦게 발견할 수 있어, 빠른 감지만 별도 주기로 실행한다.
- 감지한 5xx는 한 건만 있어도 Slack에 알린다. 5xx는 서버가 요청을 정상 처리하지 못했다는 신호이므로 누적 횟수를 기다리면 실제 장애 인지가 늦어질 수 있다.
- 같은 장애가 이어지는 동안 반복 알림은 억제하고, 복구가 확인되면 복구 알림을 보낸다. 이를 통해 Slack의 반복 소음을 줄이면서 장애 종료도 운영자가 알 수 있게 한다.
- 이 작업은 Nginx 5xx 감지에 한정한다. 접속 불가와 가용성 감지는 별도로 진행 중인 외부 가용성 모니터의 책임이므로 API 서비스 상태 검사와 중복 구현하지 않는다.

## Implementation Plan

### 변경 대상

#### Create

- `beggars-ops/deploy/ops-fast-check.service`: 30초 감시 명령을 실행하는 systemd oneshot unit
- `beggars-ops/deploy/ops-fast-check.timer`: 감시 명령의 반복 주기와 부팅 후 시작 설정
- `beggars-ops/tests/test_fast_check.py`: 5xx 판독, 시작·복구 알림, 중복 방지 및 오류 처리 테스트

#### Modify

- `beggars-ops/ops_collect.py`: 전체 수집과 분리된 `--fast-alerts` 실행 경로 및 장애 상태 처리를 추가
- `beggars-ops/deploy/push.sh`: unit 파일 설치, systemd 재적재 및 timer 활성화를 배포 절차에 포함
- `beggars-ops/README.md`: 전체 5분 수집과 30초 5xx 감시의 운영 및 점검 방법 기록

### Tasks

#### 1. 빠른 5xx 판독과 Slack 장애 상태 구현

- 변경: 마지막 검사 이후의 Nginx access log에서 5xx를 찾고, 장애 시작·지속·복구·재발 상태를 관리한다.
- 테스트: 새 5xx 한 건, 같은 장애 반복, 복구 알림, 복구 뒤 재발, 로그 누락, Slack 설정 누락을 검증한다.
- 완료 조건: 5xx 한 건에 장애 알림을 보내고 같은 장애의 중복 알림은 억제하며, 복구와 재발을 각각 알린다.

#### 2. 30초 systemd timer와 배포 연결

- 변경: 전용 service와 timer unit을 추가하고 배포 시 설치 및 활성화한다.
- 테스트: `systemd-analyze verify` 및 배포 스크립트의 대상 파일 점검을 실행한다.
- 완료 조건: 배포 뒤 timer가 활성 상태이며 같은 fast-check가 겹쳐 실행되지 않는다.

#### 3. 운영 문서와 수용 기준 갱신

- 변경: README에 수동 실행, timer 상태 조회, journal 확인, 비활성화 및 복구 절차를 기록한다.
- 테스트: 문서 명령과 배포 파일 경로를 대조한다.
- 완료 조건: 운영자가 감시 상태와 실패 원인을 확인하고 전체 5분 수집을 별도로 유지할 수 있다.

### Scope Check

- [x] 각 Task가 현재 이슈의 목표를 직접 달성하기 위해 필요하다.
- [x] 서로 독립적으로 완료 가능한 작업을 포함하지 않는다.
- [x] 하나의 PR에서 리뷰 가능한 범위다.
- [x] 하나의 명확한 완료 조건으로 설명할 수 있다.

분리가 필요한 Task만 서브 이슈로 처리한다.

### 검증

- `python3 -m unittest discover -s tests`
- `systemd-analyze verify deploy/ops-fast-check.service deploy/ops-fast-check.timer`
- 격리된 환경에서 `python3 ops_collect.py --fast-alerts` 동작 확인
- 5분 수집 cron과 history 파일의 기존 주기 유지 확인

### 구현 및 검증 결과

- 구현 저장소: 비공개 `beggars-ops` 작업 사본, 브랜치 `feat/65-fast-api-failure-detection`.
- 감시 구현, service와 timer, 배포 연결, 운영 문서와 관련 테스트 16개를 추가했다.
- `PYTHONPATH="$LOCAL_SITE_PACKAGES" "$PYTHON_BIN" -m unittest discover -s tests` (실행 환경에서 경로 지정): 248개 통과. 로컬에 설치된 PyYAML을 별도 라이브러리 설정으로 불러왔다.
- 기본 Python 3.9 실행은 기존 코드의 `Path.write_text(newline=...)` 지원 부족과 sandbox의 localhost 바인딩 제한으로 실패했다. Python 3.11과 localhost 테스트 실행 권한으로 재검증해 통과했다.
- `bash -n deploy/push.sh`, `git diff --check`: 통과.
- `systemd-analyze verify`는 macOS에 명령이 없어 실행하지 못했다. 배포 스크립트에서 서버의 unit 검증을 통과한 뒤 설치하도록 연결했다.
- 실제 서버 설치, timer 실행 주기와 Slack 전송 수용 검증은 배포 이후에 확인한다.

### 저장소별 반영

- 구현 PR: https://github.com/nn98/beggars-ops/pull/10
- 구현 반영 경로: `feat/65-fast-api-failure-detection → main`. `beggars-ops`만 dev를 거치지 않는 프로젝트 예외를 적용한다. 구현 커밋은 `033efac`이다.
- PR #10은 main 대상으로 수정했다. main에 반영한 뒤 CI와 Deploy 성공을 확인하고 실제 서버 및 Slack 인수테스트를 수행한다. 로컬에서 코드를 pull한 것만으로 서버 배포가 완료되지는 않는다.
- 모노레포의 문서 PR #66은 `docs/65-fast-api-failure-detection → dev` 경로를 유지한다.

### 서버 인수 검증 중 발견한 로그 파싱 실패

- 운영 로그에 요청 문자열이 빈 `"" 400` 기록이 있었다. 최초 파서는 요청에 항상 메서드, 경로와 HTTP 버전이 있다고 가정해 실패했고 로그 처리 위치를 저장하지 못해 같은 줄에서 반복 실패했다.
- 빠른 감시 파서를 시각과 상태 코드 우선으로 수정했다. 빈 요청과 비정상 HTTP 입력도 읽고, 경로를 알 수 없는 5xx도 감지하되 경로 없는 정상 응답을 복구 근거로 쓰지 않는다.
- 수정 PR: https://github.com/nn98/beggars-ops/pull/11 (`fix/65-nginx-empty-request → main`).
- 빠른 감시 테스트 20개와 전체 테스트 252개 통과. 서버 `/tmp`의 수정 후보로 실제 Nginx 현재 로그와 `.1`의 파싱도 통과했다. 운영 파일과 상태, Slack은 변경하거나 호출하지 않았다.
- 수정 PR #11은 main에 병합됐다. 병합 커밋은 `1203ca59510c63e3b3f293f4de0923b8748a49cc`이다.
- [CI](https://github.com/nn98/beggars-ops/actions/runs/38391696772)와 [Deploy](https://github.com/nn98/beggars-ops/actions/runs/38391737950)가 모두 성공했다.
- `systemctl is-active ops-fast-check.timer`: `active`. `systemctl show ops-fast-check.service -p Result -p ExecMainStatus`: `Result=success`, `ExecMainStatus=0`.
- `journalctl -u ops-fast-check.service`: 2026-10-13 KST 20:40:30, 20:41:00, 20:41:31, 20:42:01에 연속 성공했다. 배포 이후 해당 실행에는 로그 파싱 오류가 없었다.
- `crontab -l`: 전체 수집은 기존 `*/5 * * * *` 설정을 유지한다.
- 기본 호스트 없는 localhost API 점검은 Nginx의 기본 서버가 연결을 닫아 HTTP 000으로 실패했다. 감시 서비스 실패와는 별개다. `curl https://bebeggars.duckdns.org/api/brands`로 실제 서버 이름을 사용해 HTTP 200을 확인했다.
- 실제 Slack 장애 및 복구 알림 인수 검증은 아직 수행하지 않았다.

### 최종 인수 검증

- 사용자가 2026-10-13 KST 20:47 및 20:48에 실제 Slack의 collector-status 메시지를 공유했다. `[인수테스트]` 장애 감지, 복구, 재발 알림 총 3건의 수신을 확인했다.
- 별도 테스트 로그 및 상태 파일로 설치된 감시 코드와 Slack 전송을 검증했다. 실제 API 장애를 인위적으로 발생시키지 않았다.
- 이 테스트는 감시 함수를 직접 호출하므로 장애 발생부터 자동 감지 및 Slack 도착까지 30초 이내를 보장하는 근거는 아니다. 자동 실행은 서버 journal의 약 30초 간격 성공 기록으로 별도 확인했다.
- 운영 배포 및 실제 알림 수신 검증을 완료해 이슈 #65를 완료 처리한다.
