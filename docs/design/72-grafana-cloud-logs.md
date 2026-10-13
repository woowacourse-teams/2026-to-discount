# Design: Grafana Cloud 로그 저장 및 조회 구성

추적 이슈: [#72](https://github.com/woowacourse-teams/2026-to-discount/issues/72)

상태: 사용자 승인으로 운영 설치 및 전송 검증 완료. 설치 설정과 복구 절차 기록. /ops 상세 조회는 #71에서 후속 진행.

## 문제와 목표

로그가 운영 서버에만 있어 서버 장애 시 조회가 어렵다. API와 Nginx 로그를 외부에 저장하고 요청 ID 및 전체 예외를 조회한다. 원본은 별도 보관한다.

## 선택 및 근거

- Grafana Cloud: 운영 서버와 저장소 분리, 로그와 성능 지표를 한 플랫폼에서 관리, 무료 시작, 별도 저장 서버 운영 불필요.
- 현재 로그 월 50 GB 수집 및 14일 보관 무료 범위를 사용한다. 화면은 가입 초기 14일 Trial 상태였다. 유료 플랜 전환이나 결제는 수행하지 않았다.
- OCI 운영 서버는 ap-seoul-1, Ubuntu 24.04.4 LTS, arm64다. Grafana 로그 endpoint는 logs-prod-030.grafana.net이다.

## 범위

- API delivery-discount-api.service journal, Nginx 접근 로그 및 오류 로그 수집.
- Grafana Explore에서 환경, 서비스, 요청 ID로 조회.
- 지표 전송과 /ops 상세 조회는 이번 작업에 포함하지 않는다.

## 구조 및 운영 정책

- Alloy 1.20.1 공식 apt 패키지를 별도 서비스로 설치했다. service 사용자 alloy는 systemd-journal 및 adm 그룹으로 로그를 읽는다.
- 설정은 /etc/alloy/config.alloy, 토큰은 root:alloy 0640의 /etc/alloy/grafana-cloud-token이다. 토큰 값은 저장소에 넣지 않는다.
- API journal은 24시간부터 읽고 timestamp 시작 줄과 후속 프레임을 묶는다. 대기 3초, 블록 최대 4096줄이다.
- 라벨은 environment, service 및 log_type이다. 요청 ID는 본문에 유지한다.
- journal cursor와 파일 위치는 Alloy 영속 저장 경로에 유지된다. 전송은 재시도하며 디스크 WAL은 활성화하지 않았다. 강제 종료 시 전송 대기 데이터의 무손실을 보장하지 않는다.
- 기존 journal과 Nginx 원본은 유지한다. Nginx 기존 일별 회전 및 14개 보관 정책을 바꾸지 않았다.
- 사용자가 추가 API 압축 원본의 30일 보관을 명시적으로 승인했다. /var/log/todiscount/api-archive에 날짜별 journal JSONL gzip을 저장한다.
- todiscount-archive-api.timer가 매일 00:10 KST에 전날 원본을 저장한다. 기존 journal과 Nginx 로그는 삭제하지 않고 30일이 지난 추가 압축 파일만 정리한다.
- 원본 압축 보관도 운영 서버 내부다. 외부 장기 백업은 구성하지 않았다.

## Implementation Plan 및 실제 수행

1. 서버 아키텍처, OS, 디스크 및 로그 읽기 권한 확인.
2. 공식 apt 저장소에서 Alloy 설치, 로그 전용 설정 및 토큰 파일 구성.
3. 승인한 추가 원본 압축 보관 및 timer 설치.
4. Grafana에서 API 및 Nginx 검색.
5. 별도 테스트 파일을 동일 multiline pipeline에 연결해 예외 전체와 파일 회전 및 재시작 검증.
6. 검증용 수집 입력 제거, 최종 운영 설정 검증 및 문서화.

설정 정본 작업 공간: `/private/tmp/ops-72-worktree/deploy/alloy` (beggars-ops feat/72-grafana-cloud-logs). config.alloy, archive_api.py, unit 파일 및 README를 작성했다. 다른 checkout의 미커밋 변경은 보존했다.

## 검증 결과

- alloy validate 및 systemd-analyze verify 통과.
- Alloy 초기 전송 sent_entries 23,139건, retry 및 dropped counter 0 확인. 재시작으로 카운터는 초기화된다.
- 전체 예외 9줄의 fixture가 한 Loki 이벤트에 보존됨. Caused by, Suppressed, 프레임과 마지막 ALLOY_STACKTRACE_END까지 확인.
- ALLOY_ROTATION_BEFORE, ALLOY_ROTATION_AFTER, ALLOY_RESTART_AFTER가 모두 Grafana에서 조회됨. 테스트 파일로 검증했고 운영 Nginx는 강제로 회전하지 않았다.
- 실제 API 요청 ID de69243789ab481a9bd40e36a4bffa16의 API 및 Nginx 기록이 Grafana에 도착함을 확인했다.
- 최종 운영 설정 재시작 후 요청 ID 7d77e1088ad6418288c20da1e15a028a의 API 및 Nginx 로그가 Grafana에서 함께 조회됨을 확인했다.
- 압축 원본 2026-10-12.jsonl.gz와 2026-10-13.jsonl.gz를 해제 및 JSON 파싱해 각각 162개, 1296개 레코드의 MESSAGE 필드 확인.
- Alloy, API, 30초 감시 및 원본 보관 timer active. 전체 수집 5분 cron 유지.
- 기본 Python의 로컬 compile은 캐시 디렉터리 권한 제한으로 실패했다. 임시 캐시 경로와 Python 3.11로 재검증해 통과했다.
- 토큰이 포함된 전체 페이지 내보내기는 자동 승인 검토가 거절했다. 사용자가 토큰을 직접 보호된 서버 파일에 저장했다.
- 보관 정책 최초 자동 설치는 승인되지 않은 30일 정리 정책 때문에 거절됐다. 사용자의 명시적 승인 이후 적용했다.

## 남은 범위

- #71: Loki 조회 API를 통한 /ops 전체 오류 상세 연결.
- 성능 지표 태스크: 별도 지표 수집과 Grafana 그래프.
- 팀원 초대는 계정 목록이 없어 수행하지 않았다. 현재 로그인 계정으로 조회 검증했다.

- 초기 브라우저 도구의 자동 상태 출력에 토큰이 포함됐으므로 기존 토큰 교체를 권고한다. 토큰 값은 이 문서와 설치 정본에 저장하지 않았다.
