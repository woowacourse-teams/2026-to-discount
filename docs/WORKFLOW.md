<!-- 원본: tracker docs/public/WORKFLOW.md — 여기서 고치지 않는다 -->
# 작업 가이드: 저장소 구조와 일이 흐르는 길

팀원이 작업을 시작할 때, 또는 처음 온 사람이 이 프로젝트가 어떻게 굴러가는지 볼 때 읽는 문서다. 코드가 무엇을 하는지는 자동 생성 문서 [`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md)에 있고, 규칙의 근거는 [`decisions/`](decisions/)와 각 앱의 ADR에 있다. 이 문서는 어디서 무엇을 고치고 어떤 순서로 내보내는지만 적는다.

## 1. 저장소 다섯, 사람이 고치는 것은 셋

| 저장소 | 성격 | 무엇이 있나 | 누가 쓰나 |
|---|---|---|---|
| `delivery-discount-tracker` (비공개) | 작업 사본 | 수집 자동화, 예약 실행, 원장, 운영 문서, **모든 문서의 원본**(`docs/public/`이 mono로 나간다) | 개발자, 수집 PC |
| `woowacourse-teams/2026-to-discount` (공개, 이하 mono) | 제품 저장소 | `api/`, `web/`, 공개 문서 | 팀, 외부 |
| `nn98/beggars-ops` (비공개) | 운영 콘솔 | 수집 현황, 배너 제안 승인, 서버 상태 | 개발자 |
| `nn98/delivery-discount-web` | 배포 미러 | mono `web/`의 복사본. Vercel이 본다 | 사람이 push하지 않는다 |
| `nn98/delivery-discount-api` | 배포 미러 | mono `api/`의 복사본. 운영 서버 러너가 빌드하고 재시작한다 | 사람이 push하지 않는다 |

원칙은 [ADR-002](decisions/ADR-002-mono-is-the-public-source.md)와 tracker 저장소(비공개) ADR-018에 있다. 구조와 그렇게 정한 이유는 [`ARCHITECTURE.md`](ARCHITECTURE.md)에 모았다. 개발은 tracker 작업 사본 안에서 한다. mono는 그 안의 `mono/`에서 커밋하고 push한다. 미러 둘은 mono `main`에 push가 들어오면 워크플로 `mirror-deploy-repos.yml`이 채운다. 미러를 직접 고치면 다음 push에서 덮인다.

```
tracker(작업 사본) --커밋--> tracker origin
   └─ mono/ --커밋, push--> 2026-to-discount main
                              ├─ mirror --> delivery-discount-web --> Vercel (beggars-five.vercel.app)
                              ├─ mirror --> delivery-discount-api --> OCI runner --> API 재시작
                              └─ tracker 예약 실행 8단계 --scripts/deploy_export.py--> 서버 export.json 교체와 reload
```

## 2. 진실이 있는 자리: 같은 것을 두 군데서 고치지 않는다

| 것 | 진실 | 파생본 | 고치는 방법 |
|---|---|---|---|
| 관측(오퍼의 원천) | tracker `data/log.jsonl`. 덧붙이기만 한다 | 서버, `/api/brands` (mono에는 파생본을 두지 않는다, ADR-002) | 예약 실행 8단계 reflect_daily --apply가 원장에서 export를 만들고 deploy_export.py로 서버에 바로 올린다 |
| 브랜드 사전과 링크 | mono `api/src/main/resources/brands.yml` | 서버 classpath | 커밋하고 API를 배포한다. 배민 단축링크는 그대로 두고, 풀린 주소는 tracker `data/resolved_links.json`에 캐시한다(tracker ADR-031) |
| 당일 배너 | 서버 `data/banners.yml`만 | `/api/banners` | 예약 실행이 제안을 만들고 콘솔(beggars-ops) 배너 탭에서 사람이 승인하면 반영된다. 되풀이 배너(쿠팡이츠 선착순 오픈, 배민 오늘의 핫딜)는 서버가 자동 반영하고, 콘솔 스위치로 끈다. 파일을 손으로 고칠 때는 머리말을 먼저 읽는다 |
| 기프티콘 | 서버 `data/gifticons.yml`만 | `/api/gifticons` | 배너와 같다 |
| 행동 이벤트 | 서버 `events.jsonl`(PostHog에 같은 내용을 전달한다) | `docs/metrics/` 스냅샷 | 읽기만 한다. 설문 자유 응답은 PostHog로 보내지 않는다 |
| 판정 결과 | tracker `reports/audit-*.json`, `logs/` | `docs/setup/COLLECTION-INCIDENTS.md` | 예약 실행이 만든다. 사람은 읽고 문서에 옮긴다 |

## 3. 일의 종류별 길

### 3-1. 수집과 판독 (tracker)

1. `capture/`와 `scripts/`를 고친다. `python -m pytest -q`(700건 넘음)를 돌리고 커밋한다. 예약 실행 1단계는 `ci_only` 표식이 붙은 테스트를 빼고 돈다([`ARCHITECTURE.md`](ARCHITECTURE.md) 4절).
2. 검증은 다음 예약 실행이 한다. 00:01(전수조사 포함), 08:30, 15:55. 실행이 끝나면 `python scripts/check_routine.py <날짜>`로 단계별 PASS, SUSPECT, FAIL을 본다. 진행은 대시보드 `https://bebeggars.duckdns.org/ops/`에서 본다(설계 [`design/32-ops-monitoring.md`](design/32-ops-monitoring.md)).
3. 실기 확인이 필요하면 예약 시각을 피해 폰을 쓴다. 한 바퀴는 25분(낮)에서 130분(전수조사 포함)이다.
4. 실패, 원인, 조치는 tracker `docs/setup/COLLECTION-INCIDENTS.md`에 날짜별로 적는다. 규칙이 바뀌면 ADR을 쓴다. 실행 절차의 명세는 `docs/setup/ROUTINE-SPEC.md`, 소요 시간은 `ROUTINE-TIMING.md`에 있다.

### 3-2. API (mono/api)

1. `mono/api`를 고친다. `./gradlew test`를 돌리고 브랜치에 커밋해 PR로 올린다(경로는 [7절](#7-규칙과-가드-이-문서가-단일-진실)). 병합은 배포이므로 예약 실행이 도는 동안을 피한다.
2. 미러 저장소로 복사되면 OCI runner가 빌드하고 재시작한다. `GET /api/brands`와 `/api/banners`로 확인한다.
3. 필드를 늘릴 때는 API를 먼저 배포한다([ORCHESTRATION.md](ORCHESTRATION.md) 2절). export.json에 새 필드가 먼저 들어가면 배포 검증 `check_deploy.py`(tracker 저장소 전용 스크립트)가 막는다.

### 3-3. 웹 (mono/web): 프리뷰가 기본값

1. mono에서 브랜치(`feature/…`)를 만들고 `npm test`와 `npm run build`를 돌린다.
2. mono에 `preview/<이름>` 브랜치를 push한다. CI(`mirror-deploy-repos.yml`)가 `web/`만 미러 저장소의 같은 이름 브랜치로 옮긴다(미러에 직접 push하지 않는다). Vercel 프리뷰 주소는 `beggars-git-preview-<이름>-nn98s-projects.vercel.app`이다.
3. 360px 폭 스크린샷으로 확인한다(`web/scripts/dev/banner-shot.mjs`). 눈으로 보지 않은 변경은 올리지 않는다.
4. 요청한 사람이 프리뷰를 승인하면 main에 합치고 push한다. 미러를 거쳐 운영에 나간다.
5. 프리뷰 브랜치는 합친 뒤 지운다. 실험이 보류되면 브랜치 이름과 상태를 [`design/README.md`](design/README.md)에 적는다(예: `best-tag`).

CORS: 프리뷰 도메인 패턴은 `api/.../WebConfig.java`에 이미 열려 있다. 새 패턴이 필요하면 API부터 고친다.

### 3-4. 데이터 반영

자동이다. 예약 실행 8단계가 원장에서 export를 만들고 scripts/deploy_export.py가 서버 파일을 교체하고 reload한다. mono에는 export가 없다(2026-09-01부터 서버로 직접, ADR-002). 사람이 끼어드는 곳은 둘이다.

- 실행이 FAIL로 끝났을 때. 로그를 보고 실패한 단계만 단독으로 다시 돌린 뒤 `reflect_daily --apply --pass <단계>`로 반영한다.
- `check_deploy.py`(tracker 저장소 전용 스크립트)가 배포를 막았을 때. 무엇이 사라졌는지 읽고 예외를 코드에 적는다. 검증을 끄지 않는다.

### 3-5. 설계에서 계획, 결정으로

| 단계 | 문서 | 언제 |
|---|---|---|
| 설계 | mono `docs/design/N-*.md` | 문제, 대안, 선택, 근거를 적는다. 결정 전이다. 브레인스토밍의 산출물이다. 상태표는 [`design/README.md`](design/README.md) |
| 계획 | tracker `docs/superpowers/plans/YYYY-MM-DD-*.md` | 설계가 승인된 뒤. 체크박스 작업 목록, 파일, 테스트, 검증 방법 |
| 결정 | `docs/decisions/ADR-NNN-*.md` (앱별, tracker별) | 구현이 끝나 규칙이 된 뒤. 전제를 적는다. 낡으면 지우지 않고 `대체됨`으로 표시한다 |

브레인스토밍 승인과 구현 승인은 다른 승인이다. 설계가 좋다고 바로 짜지 않는다. 승인 뒤 계획을 쓰고, 계획대로 만들고, 만든 뒤 ADR을 쓴다. 즉시 도입하지 않는 설계도 문서로 남긴다.

### 3-6. 이슈에서 병합까지 자동 흐름 (mono, tracker 공통)

이슈에 `ready` 라벨을 달면 설계 세션이 설계 문서와 초안 PR을 만든다. 사람이 이슈에 `/approve-design`, PR에 `/approve`를 달면 구현과 병합이 이어지고, 병합 뒤 요약과 후속 이슈가 자동으로 붙는다. 리뷰 반영은 PR에 `/reflect`. 단계표, 사람 관문, 저장소별 설정은 [`design/119-dev-workflow-asbuilt.md`](design/119-dev-workflow-asbuilt.md) "지금 상태"가 정본이다. 워크플로 본문은 `.github/workflows/wf-*.yml`, PR 본문과 후속 이슈의 글쓰기 규칙은 `.claude/skills/pr-body-ko/SKILL.md`.

## 4. 하지 않는 것

- 원장 `log.jsonl`을 편집하거나 줄을 지우지 않는다. `export_data.py`를 손으로 다시 돌리지 않는다. 종료된 할인이 되살아난다.
- `banners.yml`과 `gifticons.yml`을 저장소에 넣지 않는다. 서버 파일이 유일본이다.
- 미러 저장소 `main`에 직접 push하지 않는다.
- 강제 push(`--force`, `--force-with-lease`, `-f`)를 하지 않는다. 자동화 세션은 승인을 받아도 하지 않는다(7절 규칙 표).
- 웹 변경을 프리뷰 없이 main에 올리지 않는다.
- 예약 실행 시각(하루 세 번, 각 25분에서 130분)에 폰을 만지지 않는다. 폰 잠금은 사람이 푼다. 자동화가 패턴을 넣지 않는다.
- 로그인이 필요한 화면과 자동 접근을 거부하는 곳은 수집하지 않는다(tracker 저장소(비공개) ADR-015-open-access-only-and-disclosure 참고).
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
# 계정은 운영자에게 받는다
```

## 6. 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 문서를 어디서 쓰나 | tracker docs/public/. mono에는 전파된다 |
| 저장소 구조, 도는 길, 2026-09-29 결정의 이유 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 어느 문서가 이기나 | 확정 규칙 → ADR → 설계 → 코드 옆 머리말 → 기록(tracker HARNESS §15) |
| 처음 환경 구성과 실행 | [`ONBOARDING.md`](../ONBOARDING.md) |
| 지금 서비스가 어떤 상태인가 | 대시보드 `/ops/`. 설계는 [`design/32-ops-monitoring.md`](design/32-ops-monitoring.md) |
| 코드 구조, 데이터 흐름, 배포 경계(자동 생성) | [`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md) |
| 층을 가로지를 때 지킬 계약과 사고 사례 | [`ORCHESTRATION.md`](ORCHESTRATION.md) |
| 커밋, 주석, 문서, 데이터 규칙 | [`CONVENTIONS.md`](CONVENTIONS.md) |
| 설계 문서와 상태 | [`design/README.md`](design/README.md) |
| 무엇을 모으고 어떻게 가르나(분석) | [`ANALYTICS.md`](ANALYTICS.md), [`metrics/`](metrics/) |
| 되돌리기 어려운 판단 | [`decisions/`](decisions/), `api/docs/decisions`, `web/docs/decisions`, tracker `docs/decisions` |
| 예약 실행 절차, 소요, 사고 | tracker `docs/setup/ROUTINE-SPEC.md`, `ROUTINE-TIMING.md`, `COLLECTION-INCIDENTS.md` |
| 수집 PC와 폰 인수인계 | tracker `docs/setup/MINIPC-HANDOVER.md` |
| 변경 경로, 직접 push 예외, 커밋과 push 규칙, 가드와 훅 | **이 문서 7절이 단일 진실**. 다른 곳은 한 줄 링크만 둔다 |
| 자동화 세션이 지킬 규칙의 이유와 사고 이력 | tracker `AGENTS.md`, `docs/HARNESS.md` |

## 7. 규칙과 가드: 이 문서가 단일 진실

변경 경로, 직접 push 예외, 커밋과 push 규칙, 가드(훅과 CI)는 **이 절에만 적는다.** `AGENTS.md`, `docs/HARNESS.md`, 하네스(비공개)의 규칙 파일, 저장소별 `AGENTS.md`는 이유와 사고 이력을 적고 절차는 이 절로 보낸다. 다른 곳의 문구가 이 절과 다르면 이 절이 이긴다. 낡은 쪽을 고친다.

### 7-1. 변경 경로

| 무엇을 바꾸나 | 길 | 승인 |
|---|---|---|
| mono 기능, 실험(api, web 공통) | 브랜치 → PR → 점검(테스트, 운영 데이터로 확인, 화면이면 360px) → 병합. PR의 단위는 기능 하나나 실험 하나 | 병합 전 사람 확인 |
| 웹 화면 | 브랜치 → mono `preview/<이름>` push → 360px로 직접 보기 → 프리뷰 주소를 주고 승인 → 병합. 올리기 전에 찍어 본다 | 사용자 승인 |
| 웹 회귀(내 변경으로 잘못된 정보가 운영에 나간 상태) | 수정 → 빌드 → main 병합 → 보고. 프리뷰 승인을 기다리지 않는다 | 사후 보고 |
| 문서만 | 직접 push. PR로 묶지 않는다 | 없음 |
| tracker 수집 코드 | 브랜치 → PR. 수집을 바꿨으면 예약을 끄고 실제 수집으로 시험한다(`scripts/collect_trial.ps1`) | 병합 전 사람 확인 |
| tracker 설정성 데이터(`data/devices.json`, `data/targeted_skip.json`) | 운영 main에 바로 넣는다. 개발 브랜치에만 넣지 않는다(ADR-035, ADR-037 6항). 새 설정성 파일은 `scripts/check_pr_state_files.py`의 목록에 사람이 더한다 | 없음 |
| 원장, export, 서버 파일 | 사람이 고치지 않는다. 예약 실행 8단계가 쓴다. 정정은 새 관측 행으로 덧붙인다 | 4절 |

### 7-2. 직접 push 예외

아래 다섯만 mono main에 PR 없이 push한다. 그 밖의 mono 변경은 PR이다.

| 예외 | 범위 | 덧붙일 것 |
|---|---|---|
| 문서만 | 문서 파일만 | |
| 브랜드 로고 추가, 교체 | 이미지, WebP, `web/src/logoManifest.js`만 | |
| `brands.yml` 브랜드 등록 | 새 브랜드, 별칭, 카테고리, 링크 추가. 기존 대표명 변경과 삭제는 화면 매칭이 바뀌므로 제외 | 수집 8단계의 `brands.yml에 없는 브랜드`를 닫는 등록이 주다 |
| 쿠팡이츠 주간 공유 링크 교체 | `web/src/offerLink.js`의 `COUPANGEATS_LINK`와 `web/src/offerChip.snapshot.json`의 같은 링크, 두 파일의 링크만 | 적용 전에 링크를 HTTP로 풀어 허브 키(`V5_DEAL_<월일>_HL`)가 이번 주 월요일인지 본다. 적용 뒤 수집 PC의 mono 사본을 pull한다. 새 링크는 사람이 준다 |
| 운영 장애 복구 | 복구에 필요한 최소 변경 | 하고 나서 말한다 |

### 7-3. 커밋과 push 규칙

| 규칙 | 이유 |
|---|---|
| 스테이징은 파일 이름으로만 한다. `git add -A`, `git add <폴더>`는 쓰지 않는다. 커밋 뒤 `git show --stat HEAD`로 담긴 것을 본다 | 다른 세션이 스테이징해 둔 파일까지 담긴 사고(2026-10-15) |
| 커밋은 `git commit -F <메시지 파일> -- <파일들>`로 담을 파일을 적는다 | 같은 이유. 훅이 막는다 |
| 병합 중인 커밋은 경로 지정이 안 되므로 `git merge --continue`로 마무리한다 | git이 병합 중 경로 지정 커밋을 거부한다 |
| push는 Bash 도구에서 `git push`로 시작하는 단독 명령으로 한다(`cd … &&`로 잇지 않는다). 이것이 "셸은 PowerShell" 지침의 유일한 예외다 | 허용 규칙(`git push:*`)이 그 모양에만 맞는다. adb와 한글 파일은 PowerShell로 한다(Git Bash의 경로 변환이 인자를 깬다) |
| 강제 push를 하지 않는다. PR 브랜치를 최신 main에 맞출 때는 rebase와 강제 push 대신 main을 브랜치에 병합한다. 강제 push가 정말 필요하면 사용자가 직접 실행한다 | 되돌릴 수 없는 공유 변경이고, 자동화 세션은 승인을 받아도 하지 않는다 |
| 작업 폴더(git worktree)는 저장소 밖에 둔다(사용자 홈의 `_dev` 아래 `wt-<이름>` 등) | tracker 안의 사본을 예약 수집 1단계 시험이 세다 멈춰 2026-10-15 15:55 수집을 통째로 건너뛰었다 |
| 커밋 작성자는 사용자다. 전역 설정이 비어 있는 저장소는 `GIT_AUTHOR_*`, `GIT_COMMITTER_*` 환경변수로 준다 | |
| mono PR에는 `@coderabbitai review`를 마지막 push 뒤 한 번만 단다. 문서, 설정, 워크플로 PR에는 달지 않는다 | 무료 한도가 바닥났다(2026-10-22) |
| PR 본문은 `pr-body-ko` 스킬의 틀을 따른다 | |
| 새로 만들자는 제안, 사용자에게 묻기, 원인 단정 전에 `find_prior.py <키워드>`로 있는 것을 찾는다 | 이미 있는 결정과 스크립트를 못 읽는 실패(HARNESS §16) |
| 띄운 개발 서버, 브라우저, 측정 도구는 그 일이 끝나면 끈다. 창이 뜨는 브라우저는 알리고 띄운다. headless로 되는 일은 headless로 한다. 확장이 만든 탭은 닫지 않는다 | 남은 프로세스가 메모리를 바닥냈다(2026-10-16) |
| 비밀은 값도 이름도 코드, 커밋, 출력, 공개 저장소에 싣지 않는다. 경로는 환경변수로 받는다 | |
| 텍스트 파일은 읽는 쪽이 요구하는 형식으로 쓴다. `.cmd`, `.bat`은 CRLF와 콘솔 코드페이지, 그 밖은 BOM 없는 UTF-8. 윈도 PowerShell 5.1로 한글 파일을 읽고 쓰지 않는다 | 예약 작업이 exit 9009로 죽었다. BOM과 cp949로 한글이 깨졌다 |
| 폰 설정(화면 꺼짐 시간, 충전 중 켜짐, 잠금 방식)을 바꾸지 않는다. 잠금 패턴은 사람이 푼다. 폰을 잡는 작업은 예약 시각을 피하고 수집 시험은 `collect_trial.ps1`로 한다 | 2026-10-06 서브에이전트가 꺼짐 시간을 바꾸고 못 되돌렸다 |

### 7-4. 가드: 무엇이 막고, 막히면 무엇을 하나

| 가드 | 막는 것 | 막히면 |
|---|---|---|
| `command-guard`(하네스 훅) | 강제 push. `--autostash`. 맨 `git stash`와 `stash pop`. `-- <파일>` 없는 `git commit`. Git Bash로 `adb`. PowerShell 5.1의 `Set-Content`, `Add-Content`, `Out-File`과 `-Encoding` 없는 `Get-Content` | 메시지가 말하는 대체 명령을 쓴다. `git stash push -u -m <표식>`, `git commit -F … -- <파일>`, PowerShell 도구, Write와 Edit 도구. 병합 마무리는 `git merge --continue` |
| `secret-scan`(하네스 훅) | 커밋 직전 스테이징된 추가 줄의 비밀 | 비밀이면 빼고, 오탐이면 사용자에게 알린다. 패턴을 피해 다시 쓰지 않는다 |
| `browser-tab-guard`(하네스 훅) | 브라우저 확장이 만든 탭 닫기 | 탭을 남겨 둔다 |
| 남은 프로세스 점검(Stop 훅) | 응답을 끝낼 때 남은 개발 서버, 브라우저 | 하네스의 `tools/leftover_procs.py --kill` |
| 메모리 목록 훅과 `check.py` | 메모리 목록이 파일과 다름. 같은 사실을 값으로 다시 적은 문서(정본 링크가 아닌 것) | 목록은 Write, Edit 도구로 메모리를 쓰면 다시 만들어진다. 중복은 정본을 링크한다 |
| tracker CI `pytest` | 전체 시험. 기능 PR이 수집 상태 파일(`data/`)을 바꿈(`scripts/check_pr_state_files.py`). mono 계약 파일과의 어긋남 | 상태 파일은 PR에서 빼거나, 사람이 설정성 파일 목록에 더한다. 계약을 같이 바꾸면 mono를 먼저 병합한다 |
| mono CI | Check API, Check Web, 구조 문서 최신 여부, gitleaks 비밀 검사, 미러 | 실패 로그를 보고 고친다. 검사를 끄지 않는다 |
| 자동 판정(Claude Code 권한 분류기) | 운영 배포, 서버 쓰기, 검토 없는 병합 같은 되돌리기 어려운 명령 | 우회하지 않는다. 명령을 붙여 사람에게 승인이나 직접 실행을 요청한다 |
| 예약 실행의 데이터 가드 | 소실 가드, 건너뛰기 목록, 계류, 허브 읽기 급감 | [`CROSS-CHECK-VERDICTS.md`](setup/CROSS-CHECK-VERDICTS.md)와 ADR-030, 034, 035. `--accept-loss` 전에 정보가 사라지는지 위치가 바뀐 것인지 본다 |
