<!-- 원본: tracker docs/superpowers/specs/2026-09-29-mono-unify-design.md — 여기서 고치지 않는다 -->
# mono를 공개 정본이자 단일 진입점으로 (설계)

- 작성: 2026-09-29. 이 세션에서 섹션별 설계를 승인받았다
- 대체: `docs/superpowers/plans/2026-09-29-mono-showcase.md`(운영 정본을 개인 저장소로 옮기는 안). 목적이 "독립"이 아니라 "정리"로 확정되어 방향을 뒤집었다
- 원칙: **실제로 도는 운영 경로는 바꾸지 않는다.** 거짓 경로를 걷어내고, 사본을 검사로 묶고, 입구를 하나로 한다

## 1. 왜

mono를 걷어내려고 조사하면서 찾은 이음매가 그대로 정리 목록이다(2026-09-28~29 실측).

| 찾은 것 | 뜻 |
|---|---|
| 코드는 mono → 미러 → 배포로만 흐른다 | mono가 이미 코드 정본이다. 공식화만 하면 된다 |
| mono `deploy-api.yml`(수동 실행만), `deploy-data.yml`(09-18 이후 안 돎), 낡은 `tracker/data/export.json`, mono에 붙은 운영 서버 러너 | 정본 안의 거짓 경로. 누가 버튼을 누르면 멈춘 코드가 운영을 덮는다 |
| 데이터는 `scripts/deploy_export.py`가 서버로 직접 올린다(09-01부터) | mono `WORKFLOW.md`가 설명하는 데이터 경로는 죽은 길이다 |
| `mono/tracker` 문서 44 같음·10 다름·36 누락, tracker의 콘솔 사본 셋, 이미 갈라진 `banner_ops.py` | 손 규율(ADR-018 "같은 작업 안에서 옮긴다")이 깨졌다 |
| mono `weekly-check`가 몇 주째 빨갛다. 원장 드리프트 검사는 pytest 수집 단계에서 먼저 죽어 한 번도 못 돌았다 | 검사가 진짜 원장이 없는 자리에 있다 |
| tracker CI는 슬랙 알림이 없다. 09-28 08:10부터 16시간 빨간 걸 아무도 못 봤고, 그 테스트가 다음 날 예약 수집을 통째로 멈췄다 | 경보가 채널마다 다르다 |

## 2. 저장소 역할

| 저장소 | 공개 | 담는 것 | 사람이 고치나 |
|---|---|---|---|
| mono `woowacourse-teams/2026-to-discount` | 공개 | `api/`, `web/`, 웹·API 공유 계약, 팀 입구 `docs/WORKFLOW.md`, 설계·ADR | 예. 코드와 공개 문서의 유일한 정본 |
| 미러 `nn98/delivery-discount-api`, `-web` | 공개 | mono에서 복사된 배포 입력 | 아니오 |
| tracker `nn98/delivery-discount-tracker` | 비공개 | 수집기, 원장, 운영 문서(HARNESS, 수집 사고, 인수인계, 이 명세) | 예 |
| beggars-ops `nn98/beggars-ops` | 비공개 | 운영 콘솔 | 예 |

tracker와 beggars-ops의 README 첫 줄은 mono `docs/WORKFLOW.md`를 가리킨다. 팀원 셋 모두 네 저장소 협업자다.

### 문서는 tracker에서 쓰고 mono로 전파한다(2026-09-29 사용자)

문서에는 서버 경로, 계정 파일, 러너 이름 같은 민감한 내용이 섞이기 쉽다. 그래서 **문서를 쓰는 자리는 tracker(비공개)**이고,
공개해도 되는 것만 mono로 내보낸다. 코드의 "mono → 미러"와 같은 모양으로, 문서는 "tracker → mono"다.

- tracker `docs/public/` 아래 문서만 mono `docs/`로 나간다. 그 밖의 tracker 문서는 나가지 않는다
- 이미 mono에 있는 문서(설계, ADR, 지표 등)는 옮기지 않는다. **새로 쓰거나 크게 고칠 때** `docs/public/`에서 쓰고 전파한다.
  첫 대상은 팀 입구 `WORKFLOW.md`다
- mono에서 전파된 문서를 직접 고치면 다음 전파에 덮인다. 머리에 "원본: tracker `docs/public/…`, 여기서 고치지 않는다"를 단다

## 3. 작업 단위

각 단위는 독립이다. 앞 단위가 끝나야 뒤 단위를 여는 의존만 7절에 적는다.

### U1. P0 되돌림

- 미러 두 곳의 `.github/workflows/check.yml` 삭제. 미러는 PR을 안 받아 mono 검사의 중복이다
- 미러 두 곳의 머지 방식 설정을 GitHub 기본값으로(merge commit·squash·rebase 모두 허용, 머지 뒤 브랜치 삭제 끔). P0에서 바꾸기 전 값을 따로 적어 두지 않았고, 두 저장소 모두 설정을 손댄 이력이 없어 기본값으로 본다
- **유지**: 판정표를 `api/src/test/resources/contracts/`로 옮기고 건너뛰기를 없앤 것(mono `f9b49f7`). mono 안의 일이다
- 웹 `scripts/api-repo.mjs`는 mono 배치(`web/` 옆 `api/`)를 찾으므로 그대로 둔다

### U2. 거짓 경로 걷어내기

- mono `.github/workflows/deploy-api.yml`, `deploy-data.yml` 삭제
- mono `tracker/`를 비우고 README 한 줄만 둔다: "수집기는 비공개 저장소에 있다. 운영 데이터는 서버로 직접 배포된다"
- mono `weekly-check.yml` 삭제. 원장 드리프트 검사(`weekly_check.py`)는 tracker CI의 주간 작업으로 옮긴다. 진짜 원장(`data/log.jsonl`)과 진짜 export가 있는 자리다
- tracker `scripts/ops_collect.py`, `ops_apply.py`, `ops_dashboard.html` 삭제(정본 beggars-ops). 그 사본을 검사하던 tracker `tests/test_ops_apply.py`, `test_ops_collect.py`는 beggars-ops 테스트에 없는 사례만 옮기고 삭제
- mono 운영 서버 러너(`<러너>`) 등록 해제와 서버의 러너 서비스 정리. API 저장소 러너(`<러너>`)는 별개 서비스라 건드리지 않는다

### U3. 사본을 검사로 묶기

- `banner_ops.py`: 정본 beggars-ops. tracker 사본은 루틴이 import하므로 남기고, 옆 체크아웃(`../beggars-ops/banner_ops.py`)과 바이트 비교하는 테스트를 둔다. 옆 체크아웃이 없으면 건너뛰지 않고 실패한다
  - 강제하는 자리는 둘이다. 수집 PC의 예약 실행 1단계 pytest(옆에 beggars-ops가 있다)와 tracker CI
  - **tracker CI가 beggars-ops를 읽으려면 토큰이 필요하다.** beggars-ops가 비공개라 기본 토큰으로는 체크아웃이 안 된다. `nn98/beggars-ops`에 Contents 읽기만 준 fine-grained 토큰을 tracker 비밀값 `BEGGARS_OPS_READ_TOKEN`으로 둔다. **토큰은 사람이 만든다** — 이 명세에서 유일하게 손으로 하는 단계다
- tracker `tests/test_mono_contract_copies.py`를 뒤집는다: mono `tracker/`에 `README.md` 말고 파일이 있으면 실패. 사본이 다시 생기는 것을 막는다
- beggars-ops `ops_collect.py` 머리말의 경로 안내를 고친다(`design/26` → `32`, "tracker 저장소에 두고" → 이 저장소가 정본)

### U4a. 문서 전파 장치

- tracker `scripts/publish_docs.py`: `docs/public/**`를 mono `docs/`의 같은 상대 경로로 복사한다. 옆 체크아웃 `mono/`에 쓰고,
  커밋과 푸시는 사람이 한다(`--check`는 쓰지 않고 차이만 보여 준다)
- **내보내기 전 민감 정보 검사**: 아래가 들어 있으면 그 파일을 내보내지 않고 실패한다
  - 토큰 모양(`phc_`, `phx_`, `ghp_`, `<GitHub 토큰>`, `xox[bp]-`), 개인 키 머리(`BEGIN … PRIVATE KEY`)
  - 서버 안쪽 경로(`<서버>`, `<서버 설정>`, `<콘솔 폴더>`), 계정·키 파일 이름(`<콘솔 인증 파일>`, `<슬랙 키 파일>`, `<PostHog 키 파일>`, `<SSH 키 파일>`)
  - 러너 이름(`<러너>`)
  - 운영 도메인과 공개 URL은 막지 않는다. 이미 공개된 서비스 주소다
- tracker 테스트: `docs/public/`의 각 파일이 mono 사본과 바이트 같고, 민감 정보 검사를 통과한다. 갈라지면 실패한다
  (수집 PC 예약 실행 1단계 pytest와 tracker CI가 강제한다. CI는 공개 저장소인 mono를 체크아웃하므로 토큰이 필요 없다)

### U4. 문서

- `WORKFLOW.md`를 tracker `docs/public/WORKFLOW.md`로 옮겨 재작성하고 U4a로 mono에 전파한다
  - 저장소 표에 beggars-ops를 넣는다
  - 데이터 경로를 실제대로 적는다: 원장 → `deploy_export.py` → 서버
  - 배너는 콘솔(beggars-ops) 제안·승인 흐름
  - 문서 읽는 순서(HARNESS §15)
- tracker `README.md`, `AGENTS.md`, beggars-ops `README.md` 첫 줄이 mono `WORKFLOW.md`를 가리킨다
- 기록 문서를 `docs/archive/`로 `git mv`하고 색인 한 장을 둔다
  - tracker: `HANDOFF-*` 9, `CASE-STUDY-*` 2, 날짜 붙은 setup 보고 6, `experiments/`, `research/`, `specs/`(옛 명세 2), `plans/`, 완료된 `superpowers/` 계획·명세
  - mono: `PR-REVIEW-LOG`, `WORK-HISTORY`, `PRODUCT-HISTORY`, `AB-SUMMARY-2026-09`, 완료된 `superpowers/` 계획·보고·명세. **배너 확정 규칙은 제자리**(코드 주석과 `banners.yml` 머리말이 가리킨다)
  - 진행 중인 계획·명세(이 명세 포함)는 옮기지 않는다
- 삭제: tracker `docs/wiki-backup-20260917/` 6개, mono `api/HELP.md`
- 끊긴 링크는 `scripts/doc_claims.py`로 잡아 고친다
- `docs/superpowers/plans/2026-09-29-mono-showcase.md` 머리에 "폐기. 이 명세로 대체" 표시(지우지 않는다)

### U5. 경보 한 채널

- tracker 저장소에 슬랙 비밀값(`SLACK_OPS_TOKEN`, `SLACK_OPS_CHANNEL`)을 넣는다. 값은 수집 PC `<슬랙 키 파일>`에서 읽어 출력하지 않고 `gh secret set`으로 넣는다(2026-09-28 사용자 승인)
- tracker `tests.yml`과 U2에서 옮긴 주간 작업에 `if: failure()` 슬랙 스텝(mono, 미러와 같은 문구)

### U6. 결정 기록

- mono `docs/decisions/ADR-002`(tracker `docs/public/decisions/`에서 쓰고 U4a로 전파): mono는 공개 정본이자 단일 진입점. `tracker/`는 싣지 않는다. mono ADR-001의 "트래커는 일부만 싣는다" 절을 대체한다
- tracker ADR-018 머리에 "옮기는 범위는 mono ADR-002로 대체" 한 줄

## 4. 하지 않는 것

- mono의 기존 커밋 이력을 다시 쓰지 않는다. 과거 PR의 merged commit 링크가 깨진다
- 개인 저장소로 정본을 옮기지 않는다(대체된 계획)
- 공개 동기화 워크플로를 새로 만들지 않는다. 미러가 이미 그 일을 한다
- 백로그의 다른 항목(스케줄 겹침 방지, 큰 파일 분리 등)은 이 명세 밖이다

## 5. 확인 방법

| 단위 | 확인 |
|---|---|
| 모든 단위 | 네 저장소 CI 초록. 운영 `GET /api/brands` 200 |
| U1 | 미러 푸시(mono 커밋 한 건)에 미러 쪽 검사 워크플로가 안 뜬다. API 배포와 Vercel은 초록 |
| U2 | mono 워크플로 목록에 `deploy-*`, `weekly-check`가 없다. mono 러너 목록이 비었다. API 저장소 러너는 online. 다음 예약 수집이 끝까지 돈다 |
| U3 | `banner_ops.py` 한 줄을 바꾸면 tracker 테스트가 실패한다. mono `tracker/`에 파일 하나를 두면 실패한다 |
| U4a | 민감 정보가 든 시험 파일을 `docs/public/`에 두면 내보내기가 실패한다. mono 사본 한 줄을 고치면 tracker 테스트가 실패한다 |
| U4 | `doc_claims.py` 현행 문서 사라진 참조가 늘지 않는다. mono `generate_project_structure.py --check` 통과 |
| U5 | 실패하는 테스트를 넣은 **임시 브랜치**에서 `workflow_dispatch`로 tracker CI를 돌려 슬랙이 오는지 본다. 끝나면 브랜치를 지운다. **main에는 넣지 않는다** — 예약 수집이 main 작업 사본의 pytest를 1단계로 돌리므로, 실패하는 커밋이 main에 잠깐이라도 있으면 2026-09-29 00:01 사고가 그대로 되풀이된다 |

## 6. 되돌림

| 단위 | 되돌림 |
|---|---|
| U1 | 삭제한 `check.yml`을 되살리고 설정을 다시 바꾼다 |
| U2 | 워크플로 파일은 git으로 되살린다. 러너는 새 등록 토큰으로 다시 등록해야 한다 — 그래서 마지막에 한다 |
| U3~U6 | 커밋 되돌림 |

## 7. 순서

운영에 닿지 않는 것부터, 운영 서버를 건드리는 것은 마지막.

1. U1(되돌림) → U4a(전파 장치) → U4(문서) → U3(사본 검사) → U5(경보) → U6(결정 기록)
2. U2 중 파일 삭제와 tracker 사본 정리
3. U2 중 mono 러너 해제 — 예약 수집 시각(00:01, 10:55, 15:55, 08:30 예약 작업)을 피한다
