# ADR-012. 3레포 분리, 배포 토폴로지

- 날짜: 2026-07-28
- 상태: 확정
- 관련: [ADR-010](ADR-010-reject-internal-api.md)

## 맥락

MVP 교차 비교 화면(2026-07-27)은 처음에 `delivery-discount-api` 레포
하나에 Spring Boot 백엔드와 `web/` 아래 React 프론트를 같이 뒀다.
프론트를 독립적으로 배포(Vercel)하고 버전 관리하기 시작하면서, 한
레포에 서로 다른 배포 단위(백엔드 jar / 프론트 정적 빌드)가 섞여
있는 게 걸림돌이 됐다.

## 판단

레포를 셋으로 나눈다. 역할은 그대로다 — 파이썬이 원본을 판독해
`export.json`을 만들고, API가 그걸 읽어 가공하고, 웹이 그 결과를
보여준다.

| 레포 | 역할 | 배포 위치 |
|---|---|---|
| `delivery-discount-tracker` | 캡처 판독 → `data/export.json` | (배포 안 함, 로컬 실행) |
| `delivery-discount-api` | 별칭 정규화 · 확정/보류 판정 · 정렬 → `/api/brands` | OCI 인스턴스, `bebeggars.duckdns.org` (systemd + nginx) |
| `delivery-discount-web` | React 교차 비교 화면 | Vercel, `beggars-five.vercel.app` |

`delivery-discount-api`의 `web/`을 `git subtree split`으로 떼어
`delivery-discount-web`으로 옮겼다 — 커밋 이력 보존.

## 근거

- 프론트·백엔드는 배포 주기·플랫폼이 다르다(Vercel 정적 빌드 vs OCI
  상시 프로세스). 한 레포에 있으면 한쪽만 바뀌어도 같이 릴리스 단위가
  묶인다.
- `git subtree split`은 별도 툴 설치 없이 커밋 이력을 그대로 옮긴다 —
  `cp`로 새 레포를 만드는 것보다 손실이 없다.

## 배포 세부사항은 각 레포에

- API의 데이터 반영 방식(왜 classpath 리소스 대신 외부 파일 경로로
  바꿨는지, systemd 유닛 구조)은 `delivery-discount-api`의
  `docs/decisions/ADR-001-external-export-path.md`.
- 웹의 백엔드 주소 고정 방식은 `delivery-discount-web`의
  `docs/decisions/ADR-001-fixed-backend-origin.md`.

## 서버 보안 메모 (2026-07-28 점검)

OCI 인스턴스는 공개 IP라 취약점 스캐너 트래픽(예: Jira RCE 경로 프로브)이
상시 들어온다 — OCI 인스턴스 일반에 흔한 배경 노이즈이고, 이 스택엔
해당 경로가 없어 실질 위험은 아니다. 점검 결과:

- SSH: 비밀번호 인증 이미 꺼져 있음(`PasswordAuthentication no`), 키만 허용.
- 클라우드 방화벽(OCI 보안 목록)이 80/443/22 외 포트(8080, 8088 등)를
  외부에서 막고 있음을 직접 확인(포트 스캔 결과 연결 자체가 안 됨) —
  호스트가 0.0.0.0으로 바인딩돼 있어도 클라우드 단에서 이미 막혀 있다.
- nginx가 `Server: nginx/1.24.0 (Ubuntu)`로 버전을 노출하고 있던 것은
  `server_tokens off`로 수정(사소한 정보 노출, 위험도 낮지만 공짜로
  막을 수 있어 반영).
- fail2ban 미설치 — SSH가 이미 키 전용이라 brute-force 자체가 안 통하므로
  급하지 않다고 보고 보류. 필요해지면(다른 서비스 확장 등) 재검토.
