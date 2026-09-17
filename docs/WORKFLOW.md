# 작업 가이드: 저장소 구조와 일이 흐르는 길

팀원이 작업을 시작할 때, 또는 처음 온 사람이 이 프로젝트가 어떻게 굴러가는지 볼 때 읽는 문서다. 코드가 무엇을 하는지는 자동 생성 문서 [`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md)에 있고, 규칙의 근거는 [`decisions/`](decisions/)와 각 앱의 ADR에 있다. 이 문서는 어디서 무엇을 고치고 어떤 순서로 내보내는지만 적는다.

## 1. 저장소 넷 중 하나만 사람이 고친다

| 저장소 | 성격 | 무엇이 있나 | 누가 쓰나 |
|---|---|---|---|
| `delivery-discount-tracker` (비공개) | 작업 사본 | 폰 판독 자동화(`capture/`), 예약 실행(`scripts/`), 원장 `data/log.jsonl`, 운영 문서 `docs/setup/`, ADR 30여 건. 이 안에 `mono/`가 클론으로 들어 있다 | 개발자, 수집 PC |
| `woowacourse-teams/2026-to-discount` (공개, 이하 mono) | 제품 저장소 | `api/`(Spring), `web/`(React), `tracker/`(판독 계약과 `data/export.json`. 자동화 코드는 없다), 설계와 분석 문서 | 팀, 외부 |
| `nn98/delivery-discount-web` | 배포 미러 | mono `web/`의 복사본. Vercel이 이 저장소를 본다 | 사람이 push하지 않는다. 프리뷰 브랜치만 예외(3-3절) |
| `nn98/delivery-discount-api` | 배포 미러 | mono `api/`의 복사본. OCI 서버의 self-hosted runner가 빌드하고 재시작한다 | 사람이 push하지 않는다 |

원칙은 tracker 저장소 ADR-018(작업 사본 원칙)에 있다. 개발은 tracker 작업 사본 안에서 한다. mono는 그 안의 `mono/`에서 커밋하고 push한다. 미러 둘은 mono `main`에 push가 들어오면 워크플로 `mirror-deploy-repos.yml`이 채운다. 미러를 직접 고치면 다음 push에서 덮인다.

```
tracker(작업 사본) --커밋--> tracker origin
   └─ mono/ --커밋, push--> 2026-to-discount main
                              ├─ mirror --> delivery-discount-web --> Vercel (beggars-five.vercel.app)
                              ├─ mirror --> delivery-discount-api --> OCI runner --> API 재시작
                              └─ deploy-data.yml --> 서버 export.json 교체와 reload
```

## 2. 진실이 있는 자리: 같은 것을 두 군데서 고치지 않는다

| 것 | 진실 | 파생본 | 고치는 방법 |
|---|---|---|---|
| 관측(오퍼의 원천) | tracker `data/log.jsonl`. 덧붙이기만 한다 | mono `tracker/data/export.json`, 서버, `/api/brands` | 새 관측을 덧붙인다. 정정도 더 최신 시각의 새 관측이다. 예약 실행 8단계 `reflect_daily --apply`가 export를 만들고 mono에 push한다 |
| 브랜드 사전과 링크 | mono `api/src/main/resources/brands.yml` | 서버 classpath | 커밋하고 API를 배포한다. 배민 단축링크는 그대로 두고, 풀린 주소는 tracker `data/resolved_links.json`에 캐시한다(tracker ADR-031) |
| 당일 배너 | 서버 `data/banners.yml`만 | `/api/banners` | 서버 파일을 손으로 고치고 `POST /api/reload`를 부른다. 저장소에는 없다. 예약 실행 6단계가 사람이 쓴 배너와 오늘 수집을 대조해 로그로만 알린다. 자동으로 반영하지 않는다 |
| 기프티콘 | 서버 `data/gifticons.yml`만 | `/api/gifticons` | 배너와 같다 |
| 행동 이벤트 | 서버 `events.jsonl`(PostHog에 같은 내용을 전달한다) | `docs/metrics/` 스냅샷 | 읽기만 한다. 설문 자유 응답은 PostHog로 보내지 않는다 |
| 판정 결과 | tracker `reports/audit-*.json`, `logs/` | `docs/setup/COLLECTION-INCIDENTS.md` | 예약 실행이 만든다. 사람은 읽고 문서에 옮긴다 |

## 3. 일의 종류별 길

### 3-1. 수집과 판독 (tracker)

1. `capture/`와 `scripts/`를 고친다. `python -m pytest -q`(600건 넘음)를 돌리고 커밋한다.
2. 검증은 다음 예약 실행이 한다. 00:01(전수조사 포함), 10:55, 15:55. 실행이 끝나면 `python scripts/check_routine.py <날짜>`로 단계별 PASS, SUSPECT, FAIL을 본다. 진행은 대시보드 `https://bebeggars.duckdns.org/ops/`에서 본다(설계 [`design/26-ops-monitoring.md`](design/26-ops-monitoring.md)).
3. 실기 확인이 필요하면 예약 시각을 피해 폰을 쓴다. 한 바퀴는 25분(낮)에서 130분(전수조사 포함)이다.
4. 실패, 원인, 조치는 tracker `docs/setup/COLLECTION-INCIDENTS.md`에 날짜별로 적는다. 규칙이 바뀌면 ADR을 쓴다. 실행 절차의 명세는 `docs/setup/ROUTINE-SPEC.md`, 소요 시간은 `ROUTINE-TIMING.md`에 있다.

### 3-2. API (mono/api)

1. `mono/api`를 고친다. `./gradlew test`를 돌리고 커밋한 뒤 mono에서 `git push origin main`.
2. 미러 저장소로 복사되면 OCI runner가 빌드하고 재시작한다. `GET /api/brands`와 `/api/banners`로 확인한다.
3. 필드를 늘릴 때는 API를 먼저 배포한다([ORCHESTRATION.md](ORCHESTRATION.md) 2절). export.json에 새 필드가 먼저 들어가면 배포 검증 `check_deploy.py`가 막는다.

### 3-3. 웹 (mono/web): 프리뷰가 기본값

1. mono에서 브랜치(`feature/…`)를 만들고 `npm test`와 `npm run build`를 돌린다.
2. `web/`만 미러 저장소의 `preview/<이름>` 브랜치로 push한다. Vercel 프리뷰 주소는 `beggars-git-preview-<이름>-nn98s-projects.vercel.app`이다.
3. 360px 폭 스크린샷으로 확인한다(`web/scripts/dev/banner-shot.mjs`). 눈으로 보지 않은 변경은 올리지 않는다.
4. 요청한 사람이 프리뷰를 승인하면 main에 합치고 push한다. 미러를 거쳐 운영에 나간다.
5. 프리뷰 브랜치는 합친 뒤 지운다. 실험이 보류되면 브랜치 이름과 상태를 [`design/README.md`](design/README.md)에 적는다(예: `best-tag`).

CORS: 프리뷰 도메인 패턴은 `api/.../WebConfig.java`에 이미 열려 있다. 새 패턴이 필요하면 API부터 고친다.

### 3-4. 데이터 반영

자동이다. 예약 실행 8단계가 원장에서 export를 만들고, mono에 커밋과 push를 하고, 워크플로 `deploy-data.yml`이 서버 파일을 교체하고 reload한다. 사람이 끼어드는 곳은 둘이다.

- 실행이 FAIL로 끝났을 때. 로그를 보고 실패한 단계만 단독으로 다시 돌린 뒤 `reflect_daily --apply --pass <단계>`로 반영한다.
- `check_deploy.py`가 배포를 막았을 때. 무엇이 사라졌는지 읽고 예외를 코드에 적는다. 검증을 끄지 않는다.

### 3-5. 설계에서 계획, 결정으로

| 단계 | 문서 | 언제 |
|---|---|---|
| 설계 | mono `docs/design/N-*.md` | 문제, 대안, 선택, 근거를 적는다. 결정 전이다. 브레인스토밍의 산출물이다. 상태표는 [`design/README.md`](design/README.md) |
| 계획 | tracker `docs/superpowers/plans/YYYY-MM-DD-*.md` | 설계가 승인된 뒤. 체크박스 작업 목록, 파일, 테스트, 검증 방법 |
| 결정 | `docs/decisions/ADR-NNN-*.md` (앱별, tracker별) | 구현이 끝나 규칙이 된 뒤. 전제를 적는다. 낡으면 지우지 않고 `대체됨`으로 표시한다 |

브레인스토밍 승인과 구현 승인은 다른 승인이다. 설계가 좋다고 바로 짜지 않는다. 승인 뒤 계획을 쓰고, 계획대로 만들고, 만든 뒤 ADR을 쓴다. 즉시 도입하지 않는 설계도 문서로 남긴다.

## 4. 하지 않는 것

- 원장 `log.jsonl`을 편집하거나 줄을 지우지 않는다. `export_data.py`를 손으로 다시 돌리지 않는다. 종료된 할인이 되살아난다.
- `banners.yml`과 `gifticons.yml`을 저장소에 넣지 않는다. 서버 파일이 유일본이다.
- 미러 저장소 `main`에 직접 push하지 않는다.
- 웹 변경을 프리뷰 없이 main에 올리지 않는다.
- 예약 실행 시각(00:01, 10:55, 15:55, 각 25분에서 130분)에 폰을 만지지 않는다. 폰 잠금은 사람이 푼다. 자동화가 패턴을 넣지 않는다.
- 로그인이 필요한 화면과 자동 접근을 거부하는 곳은 수집하지 않는다([ADR-015](../tracker/docs/decisions/ADR-015-open-access-only-and-disclosure.md)).
- 비밀(서버 키, 분석 토큰, 슬랙 토큰)은 저장소 밖에 둔다. 설문 자유 응답과 User-Agent 원문은 저장하지 않는다.

## 5. 확인 명령

```bash
# tracker
python -m pytest -q
python scripts/check_routine.py 2026-09-17
python scripts/run_routine.py --dry-run          # 예약 실행 배정과 순서. 폰을 건드리지 않는다
python scripts/status.py [--remote] [--history]  # 마지막 실행 현황, 지난 실행 목록

# mono
cd api && ./gradlew test
cd web && npm test && npm run build
node web/scripts/dev/banner-shot.mjs 0 out.png   # 360px 스크린샷. 프리뷰 서버가 필요하다
python3 scripts/generate_project_structure.py --check   # 구조 문서가 최신인지
git config core.hooksPath scripts/githooks               # 위 검사를 push 전에 자동으로 (한 번만)

# 운영
curl -s https://bebeggars.duckdns.org/api/banners | head -c 300
# 운영 현황 대시보드(수집, API, 데이터, 웹, 서버, 배포 탭): https://bebeggars.duckdns.org/ops/
# 계정과 비밀번호는 수집 PC의 ~/.ops_auth에 있다
```

## 6. 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 처음 환경 구성과 실행 | [`ONBOARDING.md`](../ONBOARDING.md) |
| 지금 서비스가 어떤 상태인가 | 대시보드 `/ops/`. 설계는 [`design/26-ops-monitoring.md`](design/26-ops-monitoring.md) |
| 코드 구조, 데이터 흐름, 배포 경계(자동 생성) | [`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md) |
| 층을 가로지를 때 지킬 계약과 사고 사례 | [`ORCHESTRATION.md`](ORCHESTRATION.md) |
| 커밋, 주석, 문서, 데이터 규칙 | [`CONVENTIONS.md`](CONVENTIONS.md) |
| 설계 문서와 상태 | [`design/README.md`](design/README.md) |
| 무엇을 모으고 어떻게 가르나(분석) | [`ANALYTICS.md`](ANALYTICS.md), [`metrics/`](metrics/) |
| 되돌리기 어려운 판단 | [`decisions/`](decisions/), `api/docs/decisions`, `web/docs/decisions`, tracker `docs/decisions` |
| 예약 실행 절차, 소요, 사고 | tracker `docs/setup/ROUTINE-SPEC.md`, `ROUTINE-TIMING.md`, `COLLECTION-INCIDENTS.md` |
| 수집 PC와 폰 인수인계 | tracker `docs/setup/MINIPC-HANDOVER.md`, `docs/HANDOFF-*.md` |
| 자동화 세션이 지킬 규칙 | tracker `AGENTS.md`, `docs/HARNESS.md` |
