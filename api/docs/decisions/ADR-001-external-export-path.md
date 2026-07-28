# ADR-001. export.json을 classpath 리소스가 아니라 외부 파일로

- 날짜: 2026-07-28
- 상태: 확정

## 맥락

`ExportDataLoader`는 `discount.export-path`(기본값
`classpath:data/export.json`)로 지정한 Spring `Resource`를 읽는다.
`POST /api/reload`는 이 Resource를 다시 읽을 뿐이다.

로컬 개발에서는 문제가 없었다 — `export.json`을 `src/main/resources/data/`에
복사해두고 `gradlew bootRun`을 돌리면 Gradle이 리소스를 새로 컴파일해
넣는다.

배포(OCI, systemd)에서는 문제가 됐다. `export.json`은 `.gitignore`돼
있어서 서버가 git으로 받은 소스에는 애초에 없다. jar는 이미 빌드돼
있고, classpath 리소스는 빌드 시점에 jar 안에 박힌 것 — 서버 디스크에
파일을 나중에 놓아도 이미 실행 중인 JVM의 classpath에는 안 잡힌다.
`/api/reload`를 눌러도 빈 배열만 나왔다(`exportResource.exists()`가
false라 조용히 빈 캐시로 넘어가는 경로라 에러도 안 났다 — 원인 특정이
늦어진 이유).

## 판단

`discount.export-path`를 서버에서는 `file:` 절대경로로 오버라이드한다.
코드 변경 없음 — Spring의 relaxed binding으로 환경변수
`DISCOUNT_EXPORT_PATH`가 `discount.export-path`에 그대로 매핑된다.

systemd 유닛(`/etc/systemd/system/delivery-discount-api.service`)에 추가:

```
Environment="DISCOUNT_EXPORT_PATH=file:/home/ubuntu/delivery-discount-api/data/export.json"
```

데이터는 jar/git 트리 밖의 `/home/ubuntu/delivery-discount-api/data/`에
둔다.

## 데이터 갱신 절차 (서버)

재빌드·재배포 없이:

```bash
scp export.json ubuntu@bebeggars.duckdns.org:/home/ubuntu/delivery-discount-api/data/export.json
curl -X POST https://bebeggars.duckdns.org/api/reload
```

## 근거

- `/api/reload`가 원래 의도한 대로(재배포 없이 데이터만 갱신) 동작하려면
  Resource가 실행 중에도 바뀔 수 있는 것이어야 한다. classpath 리소스는
  그 전제를 못 채운다.
- 로컬 기본값(`classpath:...`)은 그대로 둔다 — 로컬 워크플로는 이미 잘
  동작하고, 바꾸면 README의 기존 절차와 어긋난다. 서버만 환경변수로
  오버라이드하면 코드 한 줄도 안 건드리고 해결된다.

## 대가

- 서버의 `data/export.json`은 git으로 안 남는다 — 갱신 이력을 보려면
  서버에 직접 들어가거나 갱신할 때마다 커밋해둘 별도 습관이 필요하다.
  (tracker 레포의 `data/log.jsonl`이 원장이므로 치명적이진 않다.)
