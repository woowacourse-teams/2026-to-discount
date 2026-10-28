# 개발 API 배포

## 구성

모노레포 dev push를 GitHub-hosted runner가 테스트하고 빌드한다.
같은 실행의 Artifact를 `todiscount-be-dev` 라벨 runner가 받아 배포한다.
PR 코드는 self-hosted runner에서 실행하지 않는다.

- 실행 계정: `todiscount-dev`
- runner 계정: `todiscount-runner`
- 서비스: `todiscount-be-dev.service`
- 런타임: Java 21, 빌드 toolchain: Java 17
- 외부 주소: `https://dev-api-todiscount.duckdns.org`
- 내부 API: `127.0.0.1:8080`
- 현재 버전: `GET /deployment.json`
- 실제 푸시 및 PostHog 전송: 비활성화

환경별 서버 절대경로는 비공개 설치 설정에서 관리한다. 이 문서의 변수명에 실제
서버 값을 넣어 커밋하지 않는다. 이번 정리는 기존 CI 검출 11개 파일에 한정한다.
대상 밖 배포 코드와 호출부의 경로 정리는 후속 작업이다.

## 설치 설정

관리자는 아래 키를 가진 JSON 파일을 비공개 위치에 준비한다.
모든 값은 필수 절대경로이며 서버 경로 기본값은 없다.
설정 파일과 상위 디렉터리는 root 소유이고 그룹 및 다른 사용자가 쓸 수 없어야 한다.
심볼릭 링크는 허용하지 않는다. runner가 변경할 수 있는 환경변수로 설치 경로를 받지 않는다.

| 키 | 용도 |
|---|---|
| `APP_DIR` | 배포 코드가 사용하는 애플리케이션 루트 |
| `DATA_DIR` | 서비스 작업 디렉터리와 쓰기 허용 데이터 디렉터리 |
| `RUNNER_DIR` | 기존 배포 코드가 허용하는 artifact 루트와 runner 홈 |
| `UNIT_FILE` | 렌더링한 개발 서비스 파일의 설치 위치 |
| `ENV_FILE` | 개발 서비스 환경 파일의 설치 위치 |
| `ENV_SOURCE` | 관리자가 준비한 실제 환경 파일의 원본 |
| `JAVA_BIN` | Java 실행 파일 |
| `DEPLOY_COMMAND` | root 소유 개발 배포 도구의 설치 위치 |
| `SYNC_COMMAND` | root 소유 데이터 동기화 도구의 설치 위치 |
| `SUDOERS_FILE` | runner의 두 명령만 허용하는 sudoers 설치 위치 |
| `USER_SHELL` | 서비스 및 runner 계정 생성에 사용할 셸 |

설정은 서로 다른 위치를 사용한다. 경로에는 영문, 숫자, 밑줄, 점, 하이픈, 슬래시,
공백을 사용할 수 있다. 상대경로 이동, 제어문자, systemd 및 sudoers 치환 문법은 허용하지 않는다.
`UNIT_FILE`의 파일명은 `todiscount-be-dev.service`여야 한다.
설치 대상의 상위 디렉터리도 root 소유이고 그룹 및 다른 사용자가 쓸 수 없어야 한다.

이 작업에서는 대상 밖 `deploy.py`, `sync_offers.py`, 기존 배포 워크플로 및 Nginx
설정의 경로 계약을 변경하지 않는다. 관리자는 위 값이 설치된 코드의 허용 경로와
기존 호출 위치에 일치하는지 먼저 확인한다. 실제 서버 디렉터리를 이전하지 않는다.

`ENV_SOURCE`에는 기존 서비스의 데이터 파일 설정과 `DISCOUNT_PUSH_ENABLED=false`를
포함한다. 저장소의 `development.env`를 새 설치의 실제 환경 파일로 사용하지 않는다.
이 파일의 경로 기본값 정리는 후속 작업이다.

## 설치

이 폴더와 샘플 `api/src/main/resources/data/export.json`을 서버에 전달한다.
샘플 `export.json`을 이 폴더에 두고 관리자가 비공개 설치 설정 위치를
`PROVISION_CONFIG`로 지정한다.

```bash
sudo bash provision.sh "$PROVISION_CONFIG"
```

`todiscount-be-dev.service`는 템플릿이므로 직접 설치하지 않는다.
provision은 필수 입력, 설정 소유권, 미치환 토큰을 확인한다. 렌더링된 서비스를
`systemd-analyze verify`로, sudoers를 `visudo -cf`로 검사한 뒤 설치한다.
기존 개발 데이터와 환경 파일은 덮어쓰지 않는다. root 배포 도구와 서비스 설정은 갱신된다.
도중에 실패하면 자동 복구하지 않으므로 변경 전 설치 파일을 비공개 위치에 백업한다.

`nginx-locations.conf`는 기존 개발 HTTPS server 블록에서 include한다.
인증서와 운영 Nginx는 변경하지 않는다.
runner는 공식 Linux ARM64 패키지의 체크섬을 검증한 뒤 전용 계정으로 등록한다.
라벨은 `todiscount-be-dev`, 작업 디렉터리는 `_work`로 지정한다.
등록 토큰과 runner 인증 파일을 저장소에 넣지 않는다.

## 배포와 복구

runner의 sudo 목록에는 관리자가 설치한 두 root 소유 도구만 허용한다.
runner가 배포 도구 자체를 교체할 수 있도록 권한을 추가하지 않는다.
배포 도구 변경은 관리자가 별도로 설치한다.

배포 전에 최신 dev SHA를 확인하고 오래된 빌드는 건너뛴다.
실행 ID, 커밋, 저장소, 브랜치와 SHA-256을 검증한 뒤 JAR를 배치한다.
서비스 재시작 후 내부와 외부 brands API의 JSON 응답을 확인한다.
실패 시 이전 JAR를 복원한다. 첫 배포 실패는 서비스를 중단한다.
재적재 API `/api/reload`는 외부 Nginx에서 차단한다.

성공 버전은 애플리케이션 루트의 `deployment.json`과 `deployments.jsonl`에 기록한다.
버전 JAR는 `releases` 아래에 남는다. 설치 변경 복구 시에는 비공개 백업을 사용하고
실제 경로를 공개 저장소에 다시 넣지 않는다.

## 운영 오퍼 수동 가져오기

Actions의 **Sync development offers → Run workflow → dev**로 실행한다.
스케줄 실행은 없으며 배너나 사용자 기록을 복사하지 않는다.
버튼 등록에는 main의 워크플로가 필요하지만 실제 작업은 dev에서만 실행한다.

GitHub development 환경에 다음 Secrets를 준비한다. 경로와 SSH 계정도 CI 로그에서
노출되지 않도록 Secret으로 관리한다. 값이 없거나 형식이 잘못되면 전송 전에 종료한다.

| Secret | 용도 |
|---|---|
| `DEV_OFFERS_SOURCE_SSH_KEY` | 별도로 발급한 읽기 전용 SSH 개인키 |
| `DEV_OFFERS_SOURCE_KNOWN_HOSTS` | 사전 검증한 원본 호스트 키 |
| `DEV_OFFERS_SOURCE_SSH_TARGET` | 원본 서버의 SSH 계정과 호스트 |
| `DEV_OFFERS_SOURCE_EXPORT_PATH` | 원본 원장 파일 위치 |
| `DEV_OFFERS_SYNC_COMMAND` | 기존 root 소유 동기화 도구의 설치 위치 |
| `DEV_OFFERS_SYNC_TEMP_ROOT` | 기존 도구가 허용하는 runner 소유 임시 디렉터리 |

운영 서버에는 키의 강제 명령이 원장 한 파일만 읽도록 등록한다.
실제 명령과 경로는 관리자가 비공개 설치 절차에서 설정한다.
기존 운영 관리 키는 재사용하지 않는다. 실행 중 수집한 호스트 키를 바로 신뢰하지 않는다.
개발 서비스의 외부 데이터 설정과 푸시 비활성화를 확인한 뒤 수동 실행한다.

단일 도구만 갱신할 때 전체 provision을 다시 실행하지 않는다. 관리자가 기존
`SYNC_COMMAND`에 root 소유로 설치하고 제한된 sudoers를 검사한다.
전송 원장은 로그나 artifact에 남기지 않으며 결과에는 건수, SHA-256, 시각만 남긴다.
갱신 도구는 배포와 같은 잠금을 사용하고 실패하면 기존 개발 데이터를 복원한다.

## 부하 테스트 경로 설정

세 스크립트는 프로세스 환경변수를 우선 사용한다. 필요한 값이 없으면
`systemctl show todiscount-be-dev -p Environment --value`에서 관리자 설정을 읽는다.
SSH stdin 실행과 기존 워크플로 호출을 유지하기 위한 방식이며 설정 기본값은 없다.
설정은 root가 관리하는 서비스의 `Environment=` 항목으로 제공한다.
`EnvironmentFile=`의 내용은 이 조회에 나타나지 않으므로 별도 drop-in 또는
설치된 unit의 `Environment=`에 등록해야 한다. 실제 설정 파일은 비공개로 유지한다.
개발 서비스의 환경에는 경로만 등록하며 토큰이나 키를 추가하지 않는다.

| 환경변수 | 사용하는 스크립트 |
|---|---|
| `LOAD_TEST_UNIT_PATH` | 압축 실험, runner 사전 검사 |
| `LOAD_TEST_COMPRESSION_OVERRIDE_PATH` | 압축 실험, 서버 스냅샷 |
| `LOAD_TEST_PYTHON_PATH` | runner의 기존 정확한 Python sudo 권한 검사 |
| `LOAD_TEST_DEPLOYMENT_PATH` | 압축 상태를 지정한 runner 사전 검사 |
| `LOAD_TEST_JAR_PATH` | 서버 스냅샷 |
| `LOAD_TEST_EXPORT_PATH` | 비공개 데이터 모드의 서버 스냅샷 |
| `LOAD_TEST_BANNERS_PATH` | 비공개 데이터 모드의 서버 스냅샷 |
| `LOAD_TEST_CPU_STAT_PATH` | 서버 스냅샷의 CPU 카운터 파일 |
| `LOAD_TEST_MEMINFO_PATH` | 서버 스냅샷의 메모리 카운터 파일 |

관리자는 기존 설치 위치를 그대로 지정한다. 압축 override는 지정된 개발 unit의
drop-in 디렉터리에 있는 `load-test-compression.conf`만 허용한다.
누락 입력은 네트워크 요청이나 파일 변경 전에 실패한다. 스냅샷은 파일의 실제 경로
대신 `jar`, `export`, `banners` 식별자를 출력하고 override 내용도 해시만 출력한다.
기존 결과와 새 결과의 해시 키가 다르므로 배포 전후를 섞지 말고 기준 스냅샷을 새로 만든다.

## 요청 ID 연결

Nginx가 생성한 요청 ID가 응답의 `X-Request-ID`, 접근 로그의 `request_id=...`,
API journal의 `[request_id=...]`에서 일치해야 한다. 외부에서 보낸 ID는 덮어쓴다.

Nginx 설정은 JAR 배포와 별도로 반영한다. 관리자가 정한 설치 위치를
`NGINX_REQUEST_ID_CONFIG`, 실제 접근 로그 위치를 `NGINX_ACCESS_LOG`로 지정한다.
기존 server 블록의 include를 중복하지 않고 로그 형식은 http 문맥에 설치한다.

```bash
sudo install -m 644 nginx-request-id.conf "$NGINX_REQUEST_ID_CONFIG"
sudo nginx -t
sudo systemctl reload nginx
curl -sS -D - -o /dev/null https://dev-api-todiscount.duckdns.org/api/brands
REQUEST_ID=응답의_32자리_ID
sudo grep -F "request_id=$REQUEST_ID" "$NGINX_ACCESS_LOG"
sudo journalctl -u todiscount-be-dev.service --since '10 minutes ago' --no-pager -o cat |
  grep -F "[request_id=$REQUEST_ID]"
```

설정 검사 실패 시 reload하지 않고 백업을 복원한다. 접근 로그가 기존 비공개
logrotate 정책에 포함되는지 확인한다. 일반 응답과 차단된 `/api/reload`의 403에도
ID가 있어야 한다. 502와 504는 Nginx 로그만 남을 수 있다.

## 검증과 적용 순서

```bash
python3 -m unittest discover -s api/deploy/dev -p 'test_*.py'
bash -n api/deploy/dev/provision.sh
python3 -m unittest discover -s api/load-tests -p 'test_*.py'
```

1. 비공개 설정과 development Secrets를 준비한다. 실행 중인 작업이 없는지 확인한다.
2. 로컬 격리 검증 후 렌더링된 systemd, sudoers, Nginx 문법을 서버에서 검사한다.
3. 개발 서비스에 부하 테스트 경로 설정을 등록하고 daemon-reload 후 사전 검사를 실행한다.
4. 개발 환경의 데이터 동기화와 API 응답, 요청 ID 연결을 확인한다.
5. tracker에서 mono 기준 SHA를 기록하고 민감정보 검사와 전체 pytest를 실행한다.

실제 부하나 운영 서비스 재시작은 이 절차에 포함하지 않는다. 개발 부하 실험 중에는
배포를 중단한다. 대상 밖 파일로 민감정보 검사가 실패하면 이번 변경의 누락과 구분해 보고한다.
