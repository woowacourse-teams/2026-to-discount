# 개발 조회 API 부하 실험

승인 설계: `docs/design/api-load-test.md`. k6와 Python 3.11을 사용한다.
운영 URL은 허용하지 않는다. 각 iteration은 조회 한 건이며 brands와 banners를 교대로 요청한다.
요청별 전체 지연은 별도 Trend, HTTP 실패와 응답 구조 오류는 request_failed로 기록한다.

```bash
export DEV_SSH_KEY=/path/to/development-key.pem
python3.11 -m unittest discover -s api/load-tests -p 'test_*.py'
python3.11 api/load-tests/run.py /tmp/load-smoke --mode smoke
python3.11 api/load-tests/run.py /tmp/load-before-explore --mode explore
python3.11 api/load-tests/run.py /tmp/load-before-compare --mode compare
```

smoke는 2 RPS 30초, explore는 워밍업 후 2/10/30/60/100 RPS를 각 3분,
compare는 워밍업 후 30 RPS를 5분씩 3회 실행한다. 단계 사이 회복은 2분이다.
request_failed와 client_elapsed의 최근 30초를 감시하며 자원과 서비스 상태는 15초 간격 SSH 조회다.
JAR, export와 banners 해시 또는 프로세스 상태가 달라지면 중단한다.
SSH 실패 등 감시 실패도 부하를 중단한다. k6 exit 99는 제안 목표 미달로 기록하고
포화 탐색을 이어가지만 중단 조건 또는 생성기 실패는 다음 단계로 넘어가지 않는다.

현재 실행기는 이 프로젝트 개발 호스트로 고정돼 있다. SSH 키 경로는 DEV_SSH_KEY로 지정한다.
키 자체와 서버 응답 원문은 결과 파일에 저장하지 않는다.
자원 수치, k6 NDJSON, 단계별 summary와 run 기록은 지정한 결과 디렉터리에 남는다.
NDJSON은 요청 수에 비례해 커지므로 보관과 보고 시 요약 및 원본 경로를 함께 기록한다.

CPU와 메모리 감시는 서버 전체 기준이며 프로세스 CPU, JVM heap, GC와 Tomcat은
Actuator 값도 함께 저장한다. 서버 원문 로그나 계정 인증 정보는 수집하지 않는다.
분석 시 dropped_iterations, 데이터 변경 또는 재시작이 있는 실행을 정상 비교에 넣지 않는다.
실제 CI 회귀 테스트는 API의 기존 Gradle test와 감시 조건 테스트에서 실행한다.

## SSH 없는 개선 후 측정

압축 개선을 정상 dev 배포로 적용한 뒤 Deploy API development를 dev에서 수동 실행한다.
`load_test_after=true`, `load_test_preflight=false`를 선택한다.
dev 환경 보호와 배포 동시 실행 방지는 유지한다. 사전 점검은 배포 SHA와 gzip 및 데이터 읽기 권한을 확인한다.
개발 서버 러너의 server-monitor.py는 읽기 전용으로 서버를 15초마다 감시한다.
개발 데이터 디렉터리는 러너에게 비공개이므로 데이터 파일 대신 실제 조회 응답 본문의 해시를 감시한다.
JAR 해시 및 PID는 별도로 비교하며 감시 조회는 두 경로에 합계 약 0.13 RPS를 추가한다.
GitHub-hosted Ubuntu 러너의 cloud-run.py는 워밍업과 30 RPS 5분 3회를 실행한다.
생성기는 Accept-Encoding gzip을 명시하고 brands의 압축 협상 및 JSON 구조를 확인한다.
두 작업은 현재 실행의 GitHub API 작업 상태로 서로 감시하며 서버 입력 변경 또는 감시 실패 시 중단한다.
서버 감시 실패는 해당 작업을 실패로 종료한다. 생성기는 다음 15초 점검에서 감지해 부하를 종료한다.
서버 메모리는 서버 감시가, 요청 실패 및 p99와 미발행은 생성기가 판단한다.
자료는 load-server-baseline, load-server-observations, load-client-results 아티팩트로 14일 보존한다.
기존 맥북 생성기 결과와 네트워크가 다르므로 전후 차이를 압축만의 인과 효과로 해석하지 않는다.
이 경로는 systemd 임시 설정이나 sudo 권한을 사용하지 않으며 배포된 압축 설정은 개발 환경에 유지한다.

## 러너의 개선 전 기준 측정

dev에서 `load_test_before=true`만 선택한다. 같은 SHA의 정상 push 배포 아티팩트가 없으면 시작하지 않는다.
API 테스트 후 빌드 단계에서만 compression.enabled를 false로 바꾼 측정용 JAR를 만든다.
아티팩트 manifest에 compression_baseline=true를 남기며 저장소 기본 설정은 true로 유지한다.
기존 제한된 개발 배포 명령으로 적용하고 gzip 요청에도 압축되지 않은 응답인지 확인한다.
워밍업과 30 RPS 5분 3회 및 서버 감시 후 성공/실패와 무관하게 정상 push 아티팩트로 복원한다.
복원 이후 gzip 및 배포 SHA를 검증한다. 실행을 강제 취소하면 복원 작업까지 취소될 수 있으므로
restore-compression 작업의 성공 여부를 반드시 확인하고 실패 시 정상 dev 배포를 별도로 실행한다.
이전 개선 후 실행과 모두 GitHub-hosted 방식이지만 서로 다른 머신과 경로의 변동이 남는다.
