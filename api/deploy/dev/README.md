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

## 운영 오퍼 수동 가져오기

Actions의 **Sync development offers → Run workflow → dev**로 실행한다.
개발 웹은 계속 개발 API를 호출한다. 스케줄 실행은 없으며 배너나 사용자 기록을 복사하지 않는다.
수동 실행 버튼을 등록하려면 `sync-dev-offers.yml`이 기본 브랜치 main에도 있어야 한다.
main 또는 다른 브랜치로 실행하면 dev 가드에 의해 작업을 건너뛴다.

최초 설정:

1. 개발 서버에 `sync_offers.py`를 root 소유 실행 파일로 설치한다.
   기존 환경 파일을 보존하기 위해 전체 provision을 다시 실행하지 않는다.

   ```bash
   sudo install -o root -g root -m 755 sync_offers.py /usr/local/sbin/todiscount-sync-offers-dev
   printf 'todiscount-runner ALL=(root) NOPASSWD: /usr/local/sbin/todiscount-sync-offers-dev\n' | sudo tee /etc/sudoers.d/todiscount-offer-sync >/dev/null
   sudo chmod 440 /etc/sudoers.d/todiscount-offer-sync
   sudo visudo -cf /etc/sudoers.d/todiscount-offer-sync
   ```

2. 오퍼 읽기 전용 SSH 키를 새로 발급하고 운영 ubuntu 계정의 authorized_keys에 다음 제한으로 등록한다.
   기존 운영 관리 키를 Actions에 재사용하지 않는다.

   ```text
   restrict,command="cat /home/ubuntu/delivery-discount-api/data/export.json" ssh-ed25519 <공개키> dev-offer-read-only
   ```

3. GitHub development 환경에 `DEV_OFFERS_SOURCE_SSH_KEY`로 개인키를 등록한다.
   `DEV_OFFERS_SOURCE_KNOWN_HOSTS`에는 이미 검증한 `bebeggars.duckdns.org` 호스트 키를 등록한다.
   실행 중 ssh-keyscan 결과를 그대로 신뢰하는 방식은 사용하지 않는다.

4. 개발 서비스의 실제 환경에 `DISCOUNT_EXPORT_PATH=file:/var/lib/todiscount-be-dev/export.json`과
   `DISCOUNT_PUSH_ENABLED=false`가 적용됐는지 확인하고 수동 실행한다.

실행은 개발 전용 러너에서 원장을 임시 파일로 받아 root 소유 도구를 호출한다.
도구는 개발 배포와 같은 잠금으로 직렬 실행하고 유효한 운영 원장만 원자적으로 교체한다.
`export.before-sync.json`에 이전 개발 파일을 보관한다. 내부 `/api/reload` 후 건수와 brands 응답을 확인한다.
실패하면 원본 파일을 복원하고 개발 API를 다시 재로드한다. 복구 재로드까지 실패하면 그 사실을 별도로 보고한다.
운영 원장 내용은 Actions 로그나 artifact로 남기지 않으며 성공 결과에는 건수, SHA-256, 시각만 기록한다.

개발 API가 외부 파일을 사용하므로 오퍼 변경은 SSR의 다음 요청부터 보이고 브라우저는 새로고침하면 된다.
웹 빌드에 포함된 fallback 사본도 갱신하려면 별도로 개발 웹 배포를 실행한다.

## 요청 ID 연결

Nginx가 생성한 32자리 요청 ID를 API에 전달한다. 응답의 `X-Request-ID`,
Nginx 접근 로그의 `request_id=...`, API journal의 `[request_id=...]`가 일치해야 한다.
외부에서 보낸 ID는 Nginx가 덮어쓴다. 내부 API 직접 호출은 유효한 ID를 수용하거나 새로 생성한다.

Nginx 설정은 JAR 자동 배포와 별도로 반영한다. 기존 개발 HTTPS server 블록에
`nginx-locations.conf` include가 이미 있는지 확인하고 중복 include하지 않는다.
로그 형식은 server 블록 바깥 http 문맥에 설치한다.

```bash
sudo install -m 644 nginx-request-id.conf /etc/nginx/conf.d/todiscount-dev-request-id.conf
# nginx-locations.conf는 기존 include 대상 파일에 반영한다.
sudo nginx -t
sudo systemctl reload nginx
curl -sS -D - -o /dev/null https://dev-api-todiscount.duckdns.org/api/brands
```

검사 실패 시 reload하지 않고 변경 전 파일을 복원한다. 로그 파일 이름을 새로 지정하므로
기존 `/etc/logrotate.d/nginx`의 `/var/log/nginx/*.log` 대상에 포함되는지 확인한다.

응답에서 확인한 ID를 아래 값으로 넣어 같은 요청을 찾는다.

```bash
REQUEST_ID=응답의_32자리_ID
sudo grep -F "request_id=$REQUEST_ID" /var/log/nginx/todiscount-dev.access.log
sudo journalctl -u todiscount-be-dev.service --since '10 minutes ago' --no-pager -o cat |
  grep -F "[request_id=$REQUEST_ID]"
```

일반 API 응답과 차단된 `/api/reload`의 403 응답 모두 ID가 있어야 한다.
502와 504는 API에 도달하지 못할 수 있어 Nginx 로그만 남을 수 있다.
API 요청이 없는 시작 로그와 예약 작업은 `[request_id=-]`로 표시한다.
