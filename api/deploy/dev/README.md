# 개발 API 배포

## 구성

모노레포 dev push를 GitHub-hosted runner가 테스트하고 빌드한다.
같은 실행의 Artifact를 AWS의 `todiscount-be-dev` 라벨 runner가 받아 배포한다.
PR 코드는 self-hosted runner에서 실행하지 않는다.

- 실행 계정: `todiscount-dev`
- runner 계정: `todiscount-runner`
- 서비스: `todiscount-be-dev.service`
- 런타임: Java 21, 빌드 toolchain: Java 17
- 외부 주소: `https://dev-api-todiscount.duckdns.org`
- 내부 API: `127.0.0.1:8080`
- 현재 버전: `GET /deployment.json`
- 최초 데이터: 저장소의 샘플 export와 빈 배너 목록
- 실제 푸시 및 PostHog 전송: 비활성화

## 설치

이 폴더와 샘플 `api/src/main/resources/data/export.json`을 서버에 전달한다.
`export.json`을 이 폴더에 둔 뒤 `sudo bash provision.sh`를 실행한다.
기존 개발 데이터는 덮어쓰지 않는다. 환경 설정과 배포 스크립트는 갱신된다.
`nginx-locations.conf`는 기존 개발 HTTPS server 블록에서 include한다.
인증서와 운영 Nginx는 변경하지 않는다.

runner는 GitHub 공식 Linux ARM64 패키지를 내려받아 체크섬을 검증하고,
전용 계정에서 일회성 등록 토큰으로 모노레포에 등록한다.
라벨은 `todiscount-be-dev`, 작업 디렉터리는 `_work`로 지정한다.
`svc.sh install todiscount-runner`로 systemd 서비스에 등록한다.
등록 토큰과 runner 인증 파일을 저장소에 넣지 않는다.

## 배포와 복구

root 소유 `/usr/local/sbin/todiscount-deploy-dev`만 runner의 sudo 목록에 허용한다.
코드 변경을 runner가 배포 스크립트 자체에 설치하는 기능은 없다.
배포 스크립트 변경은 관리자가 별도로 설치해야 한다.

배포 전에 최신 dev SHA를 확인하고 오래된 빌드는 건너뛴다.
실행 ID, 커밋, 저장소, 브랜치와 SHA-256을 검증한 뒤 JAR를 배치한다.
서비스를 재시작하고 내부와 외부 brands API의 정상 JSON 응답을 확인한다.
실패 시 이전 JAR를 복원한다. 첫 배포 실패는 서비스를 중단한다.
재적재 API `/api/reload`는 외부 Nginx에서 차단한다.

성공 버전은 `/opt/todiscount-be-dev/deployment.json`과 `deployments.jsonl`에 기록한다.
버전 JAR는 releases 아래에 남는다. 용량을 관측하고 현재 및 직전 정상 버전을
제외한 오래된 파일의 정리는 후속으로 정한다.

## 검증

```bash
python3 -m unittest discover -s api/deploy/dev -p 'test_*.py'
bash -n api/deploy/dev/provision.sh
```

systemd 설정은 서버에서 `systemd-analyze verify`로 검사한다.
부하 테스트 중에는 배포 워크플로를 중단하고 runner 활동도 관측한다.
