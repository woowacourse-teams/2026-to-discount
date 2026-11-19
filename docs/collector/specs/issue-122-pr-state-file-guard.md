<!-- 원본: tracker docs/specs/issue-122-pr-state-file-guard.md — 여기서 고치지 않는다 -->
# 이슈 #122 기능 PR이 수집 상태 파일을 섞어 넣는 것을 막는 검사

- 영역: `export` (폰 없이 끝남. 복원은 git 내용 복사, 검사는 git diff와 pytest)
- 출처: 커밋 `bd74ca3`(#49 구현), 이슈 #105

## 1. 문제

기능 PR(#51, 쿠팡이츠 매장 혜택 읽기)이 기능과 무관한 `data/resolved_links.json`을 112줄 지우고 1줄 넣어 `{}`로 만들었다. 11-02 15:55 수집의 4a(브랜드관 주소 해석 단계)가 채운 단축링크 캐시(약 110개)가 사라졌다. 값은 틀리지 않고 조용히 사라졌다. 다음 4a(주간)가 개당 최대 8초로 다시 채운다.

**원인(코드로 확인함): 수집이 아니라 테스트가 파일을 비운다.** 두 단계로 일어났다.

1. `tests/test_audit_budget.py`의 `test_collect_via_links_stops_starting_new_brands_after_the_deadline`(커밋 `6ff00f8`, 10-29 02:43)은 `bl._load_resolved`만 `lambda: {}`로 바꿔 끼운다. `_save_resolved`와 `RESOLVED_LINKS_PATH`는 그대로 둔다.
2. `collect_via_links`는 배민이면 `resolved = _load_resolved()`(가짜라 `{}`)로 시작하고 끝에서 `_save_resolved(resolved)`를 부른다. `_save_resolved`는 `{**_load_resolved(), **data}`를 만드는데, 여기서도 가짜가 `{}`를 돌려준다. 그래서 진짜 `data/resolved_links.json`에 `{}`를 쓴다.

`pytest`를 한 번 돌리면 저장소의 캐시가 `{}`가 된다. 같은 일이 한 번 더 있었다. #50 브랜치 커밋 `39dce27`(10-29)이 같은 파일을 112줄 지웠고, 바로 다음 커밋 `72893f1` "테스트 부작용으로 비워진 resolved_links.json을 되돌린다"가 되돌렸다. 그때는 원인 테스트를 고치지 않았다. #49 구현 세션도 pytest를 돌린 뒤 경로를 지정하지 않고 담았다(`git add -A` 계열). 그래서 bd74ca3에 같은 `{}`가 들어갔다.

원인 테스트를 고치지 않으면 복원(§3-1)도 다음 pytest에 다시 지워진다. 수집 PC의 본 체크아웃에서 pytest를 돌리면 운영 캐시도 지워진다. 그래서 테스트 부작용 제거(§3-0)를 먼저 한다. 그다음 검사(§3-2, §3-3)를 둔다. 검사는 원인과 상관없이 결과, 즉 PR이 바꾼 `data/` 파일만 본다. 원인이 수집 시험이어도 막는다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에는 `data/` 상태 파일이나 구현 커밋의 담는 범위에 해당하는 묶음이 없다(`data/`는 `push-state.json` 한 줄뿐이고 서버 쪽이다). 없다고 확인하고 시작한다.

| 자리 | 넣는가 | 이유 |
| --- | --- | --- |
| `tests/test_audit_budget.py` 부작용(실제 캐시에 `{}` 쓰기) | 넣음 | 사고의 직접 원인(§1). 안 고치면 복원이 다음 pytest에 다시 지워진다 |
| `tests/conftest.py` autouse 경로 격리와 세션 끝 `data/` 불변 검사 | 넣음 | 같은 모양의 다른 테스트를 구조로 막는다(§3-0) |
| `_load_resolved`만 바꿔 끼우는 다른 테스트(`test_audit_parallel.py`, `test_session_streak.py`) | 고치지 않음, 확인만 | 둘 다 `_save_resolved`도 `lambda d: None`으로 바꿔 끼운다. 지금은 안전하고 §3-0의 격리가 이중 방어가 된다 |
| `data/resolved_links.json` 복원 | 넣음 | 이슈 할 일 1 |
| CI 검사(PR이 `data/` 변경) | 넣음 | 이슈 할 일 2 |
| `scripts/local_implement.py` push 전 점검 | 넣음 | 이슈 할 일 3. 로컬 구현이 PR을 만드는 유일한 길 |
| `.claude/agents/export-implementer.md`, `collect-implementer.md` 문구 | 넣음 | 세션이 경로를 지정해 담도록 지시 |
| 다른 `data/*.json` 내용 점검 | 안 넣음 | bd74ca3이 건드린 데이터 파일은 이것 하나뿐(`git show --stat`). 같은 사고는 검사 도입 뒤 막힌다 |
| 수집이 바꾸는 상태 파일이 커밋에 안 담기는 문제 전반(#105) | 안 넣음 | 수집 PC의 작업 트리 문제이고 별도 이슈. 이번 검사는 PR 쪽 방어선 |
| `export.json`, `log.jsonl` | 검사 대상에 넣고 복원 대상에는 안 넣음 | 원장 append-only를 건드리지 않음(§6) |
| 설계 문서에 `## 허용하는 데이터 변경` 절이 없는 구현 중 이슈(#66, #89 계열) | 이행 방침을 §3-4에 적음 | 검사 도입 뒤 `data/` 변경이 있는 PR이 걸릴 수 있음 |

## 3. 결정

### 3-0. 테스트 부작용 제거 (원인, 복원보다 먼저)

1. **원인 테스트:** `test_collect_via_links_stops_starting_new_brands_after_the_deadline`에서 `bl.RESOLVED_LINKS_PATH`를 `tmp_path / "resolved_links.json"`으로 바꿔 끼운다. `_load_resolved` 가짜는 그대로 둬도 된다. 쓰기가 임시 경로로 간다.
2. **구조로 막기(`tests/conftest.py` autouse):** 모든 테스트에서 `capture.brand_links.RESOLVED_LINKS_PATH`를 테스트별 `tmp_path` 아래로 바꿔 끼운다. 기존 `_no_real_power_read`와 같은 방식이다. 실제 캐시를 읽어야 하는 테스트는 지금 없다(`RESOLVED_LINKS` 사용처 grep: `capture/brand_links.py`와 `scripts/baemin_links.py`, `scripts/baemin_lounge_sweep.py`의 호출뿐).
3. **세션 끝 불변 검사(`conftest.py`의 `pytest_sessionstart`와 `pytest_sessionfinish`):** 세션 시작 때 저장소 `data/` 아래 파일 전부(추적, 미추적 모두. `_retired/` 포함)의 경로와 내용 해시를 적는다. 끝날 때 다시 재서 다르면 바뀐 경로를 찍고 `session.exitstatus`를 실패로 바꾼다. `git status`와 비교하지 않는다. 수집 PC의 `data/`는 원래 더럽다(#105). 그래서 깨끗한지가 아니라 테스트 전후로 같은지를 본다.
   - 양성 신호: 같으면 `data/ 불변: 파일 N개 확인`을 찍는다. N이 0이면(`data/`를 못 찾음) 통과가 아니라 실패다.
   - 1번만 고치면 다음에 같은 모양의 테스트가 생길 때 또 샌다. 2번은 이 파일 하나를 막고, 3번은 다른 상태 파일(`last_checked.json`, `dead_links.json` 등)까지 막는다. 셋 다 넣는다.

구현자는 이 절을 먼저 끝낸다. 그다음 pytest를 돌린 뒤에 복원(§3-1)한다. 순서를 바꾸면 구현자 자신의 pytest가 복원본을 다시 지운다.

### 3-1. 복원 (할 일 1)

- **합치기 한 줄:** 결과 = `{**복원본, **현재}`. 복원본은 `git show bd74ca3^:data/resolved_links.json`, 현재는 작업 트리 파일이다. 같은 키는 현재 값이 이긴다(더 늦은 관측). 현재가 `{}`면 결과는 복원본과 같다.
- 쓰기는 키 정렬 없이 복원본 순서 뒤에 현재 키를 잇고, 들여쓰기 1칸·`ensure_ascii=False`로 기존 형식(`bd74ca3^` 파일)과 맞춘다. 데이터 커밋으로 올린다.
- 형식 검증(확인함): main에서 이 파일의 이력은 `5321067`(브랜드관 단축링크 GET 해석)과 `bd74ca3` 둘뿐이다(`git log origin/main -- data/resolved_links.json`). 다른 브랜치까지 보면 #50의 `39dce27`(비움)과 `72893f1`(되돌림)이 더 있다. 브랜치 안에서 서로 상쇄돼 main 이력에는 남지 않았다. 형식도 바꾸지 않았다. `bd74ca3^`는 `5321067` 이후라 키는 모두 `https://s.baemin.com/…`, 값은 `https://baemin.com/bridge/brand-lounge/detail?…`다. 이후 형식 변화는 없으므로 `s.baemin.com/` 키 검사가 맞다.
- 양성 신호: 복원 뒤 JSON으로 읽어 (a) 키 개수가 복원본 개수 이상, (b) 모든 복원본 키가 존재, (c) `s.baemin.com/` 키 존재를 확인한다. 약 110개라는 숫자는 이슈의 추정이므로 `bd74ca3^` 쪽에서 센 실제 개수를 PR 본문과 인계 댓글에 적는다. 파일 존재나 바이트 수로 판정하지 않는다.
- 이 복원은 이 이슈의 PR에 들어간다. §3-2 검사가 이 PR을 막지 않도록 허용 절에 명시한다.

### 3-2. CI 검사 (할 일 2)

새 스크립트 `scripts/check_pr_state_files.py`와 `tests.yml`의 pull_request 전용 단계.

**근거 정정:** 이전 설계의 "데이터 변경은 PR이 아니라 `data:` 커밋으로 들어간다"는 틀렸다. 정상 PR도 `data/`를 바꾼다(`7738b42`가 `data/targeted_skip.json` 신설, `df642e5`와 `915e149`가 `data/devices.json` 수정). 그래서 `data/` 변경 자체가 예외 상황이라는 근거는 쓰지 않는다.

**차단 대상 결정: 전체 차단을 유지하되 설정성 파일만 기본 허용으로 뺀다.** 파일을 둘로 가른다.

- 설정성 파일(사람이 고치고 수집이 쓰지 않음): `data/devices.json`, `data/targeted_skip.json`. 스크립트의 상수 `CONFIG_FILES`에 둔다. 기본 통과.
- 그 밖의 `data/` 파일 전부는 수집 상태 파일로 본다: `resolved_links.json`, `last_checked.json`, `log.jsonl`, `export.json`, `offer_seen.json`, `dead_links.json`, `sweeps.jsonl` 등.

선택 이유: 상태 파일 목록을 하드코딩하면 새 상태 파일이 생길 때 검사에서 빠진다(조용히 통과). 반대로 설정성 목록은 틀려도 실패(차단)로 드러나므로 안전한 쪽이 기본이 된다. 새 파일은 기본이 차단이고, 설정성이면 `CONFIG_FILES`에 사람이 더한다.

**규칙:** PR이 병합 기준점(`merge-base`)에서 바꾼 파일 중 아래를 제외한 `data/` 파일이 있으면 실패한다.

- 제외: `data/.gitkeep`, `data/_retired/`, `CONFIG_FILES`
- 허용: 그 PR의 설계 문서가 `## 허용하는 데이터 변경` 절에 경로를 적은 파일. 설계 문서는 브랜치 이름 `feat/<번호>-…`의 번호로 `docs/specs/issue-<번호>-*.md`를 찾는다.

**기준점과 인자 (확정):** `tests.yml`의 `pull_request`는 합성 병합 커밋(`refs/pull/N/merge`)을 체크아웃하므로 `HEAD`가 PR 헤드가 아니다. 그래서 브랜치 이름을 `HEAD`에서 읽지 않는다.

- 체크아웃(tracker 자신): `actions/checkout@v4`에 `fetch-depth: 0`. 첫 번째 checkout 단계(mono 아닌 쪽)만 바꾼다.
- 단계 호출: `python scripts/check_pr_state_files.py --base origin/main --head-ref ${{ github.head_ref }}`. `if: github.event_name == 'pull_request'`.
- `${{ github.head_ref }}`는 PR 작성자가 정하는 문자열이므로 셸 줄에 직접 끼워 넣지 않고 `env: HEAD_REF: ${{ github.head_ref }}`로 받아 `--head-ref "$HEAD_REF"`로 넘긴다(스크립트 주입 방지).
- 비교 식: `git diff --name-only $(git merge-base origin/main HEAD)..HEAD`와 같은 뜻의 세 점 diff, 즉 `git diff --name-only origin/main...HEAD`. 합성 병합 커밋에서 `HEAD`는 (main + PR) 병합 결과라 `origin/main...HEAD`는 PR이 더한 변경과 같다. 스크립트는 `--base` 기본값 없이 필수 인자로 받는다.
- 비교 대상 이름 `origin/main`은 `fetch-depth: 0`이 받은 원격 추적 브랜치다. 스크립트는 `git rev-parse --verify <base>`로 해석을 먼저 확인한다.

선택 이유:

- **경고가 아니라 실패.** 이 사고는 값이 조용히 사라진다. 경고는 읽히지 않는다(`AGENTS.md` "먼저 알 것").
- **허용 목록을 설계 문서에 둔다.** 이슈의 "허용 목록: 설계가 명시한 데이터 변경"을 따른다. 별도 설정 파일은 늘리지 않는다.
- **변경 크기(줄 수)로 판정하지 않는다.** 기능 PR이 건드린 존재 자체가 오류다.
- 허용 절 형식(스크립트가 읽음): 절 제목 아래 목록 항목마다 `` `data/파일` `` 하나와 이유 한 구절. 경로가 `data/`로 시작하지 않거나 절이 없으면 허용 0개다.

이 이슈의 허용 목록: `data/resolved_links.json`(문서 끝 절).

**양성 신호 (검사가 "통과"를 낼 때 제대로 봤다는 증명):**

- 기준(`--base`)이 해석되지 않거나 `merge-base`가 없으면(얕은 체크아웃) **통과가 아니라 실패**한다. 빈 diff를 "변경 없음"으로 읽지 않는다.
- 비교한 기준 커밋 해시와 변경 파일 수를 출력에 항상 찍는다(`비교: <해시>...HEAD, 변경 N개, data/ M개, 설정성 K개, 허용 J개`). N이 0이면 PR이 비었으므로 실패한다.
- `--head-ref`가 비었거나 `feat/<번호>-` 꼴이 아니면 허용 0개로 계산한다(통과시키지 않음). 사람이 쓰는 `data:` 직접 push는 이벤트가 달라 이 단계에 오지 않는다.
- 설계 문서가 여러 개 맞으면 모두 합친다. 하나도 없으면 허용 0개.

push 이벤트에는 돌리지 않는다.

### 3-3. 로컬 구현 점검 (할 일 3)

점검 결과: `scripts/local_implement.py`는 세션이 커밋하게 두고, 세션이 끝난 뒤 변경 파일을 보지 않고 바로 `sync_and_push`를 부른다. 커밋 경로를 지정하는지 강제하는 장치는 없고 에이전트 문서에도 지시가 없다.

1. **순수 함수는 `check_pr_state_files.py`에 둔다.** `local_implement.py`를 import하면 모듈 수준의 `gh`, `claude`, 윈도 경로 의존이 시험의 부작용이 된다. 점검 로직은 `check_files(changed, allowed, config_files) -> (blocked)`와 `changed_between(wt, start, head)`처럼 파일 목록과 허용 집합을 받는 순수 함수(git 호출은 얇은 함수로 분리)로 두고 `local_implement.py`는 import해 부르기만 한다. 시험은 `local_implement`를 import하지 않는다.
2. **호출 위치:** `run()`에서 `if head == start:` 분기 **뒤**, `sync_and_push(...)` 호출 **앞**. 문구로 찾는다(행 번호는 바뀐다).
3. **범위:** rebase 전 `start..HEAD`. `leftover_start`가 `merge-base`를 돌려주는 경우(앞선 로컬 커밋이 원격에 안 올라간 채 남음)에는 `start`가 `origin/<branch>`와의 merge-base라서 **이전 실행이 만든 로컬 커밋도 범위에 든다.** 이전 실행 커밋의 `data/` 변경까지 이번 점검이 걸러낸다는 뜻이며, 의도한 동작이다.
4. **허용 목록 입력:** 작업 폴더의 설계 문서(`docs/specs/issue-<n>-*.md`)의 허용 절을 같은 함수로 읽는다.
5. **차단 시:** push하지 않고 `인계: 로컬 구현 push 중단, 수집 상태 파일이 커밋에 섞임` 댓글에 파일 목록과 작업 폴더를 남긴 뒤 `sys.exit`. 로컬 커밋은 작업 폴더에 남는다.
6. **재실행 루프를 푸는 법:** 중단 뒤 그대로 재실행하면 `leftover_start`가 앞선 커밋을 범위에 넣어 같은 이유로 또 중단된다. 인계 댓글에 이렇게 적는다: "사람이 작업 폴더에서 해당 `data/` 변경을 되돌리는 새 커밋(또는 `git reset`으로 제거)을 만든 뒤 재실행한다. 되돌림 커밋은 범위의 순변경(`start..HEAD` diff)에서 `data/` 파일이 사라지게 하므로 점검을 통과한다." 점검이 커밋 단위가 아니라 `start..HEAD`의 최종 변경 파일을 보는 이유다.
7. **양성 신호:** `start`가 `HEAD`의 조상임을 `git merge-base --is-ancestor`로 확인하고, 변경 파일 수를 로그에 찍는다. 조상이 아니면 점검 불가로 중단한다(통과 아님).

**구현자 문구 (`export-implementer.md`, `collect-implementer.md`):** `export-implementer`의 tools에는 `git checkout`과 `git restore`가 없어 이전 설계의 `git checkout -- data/<파일>`은 돌릴 수 없다. 그래서 tools를 늘리지 않고 문구를 이렇게 정한다: "`data/` 파일은 add하지 않는다. 설계의 허용 절에 있는 파일만 예외. 바뀐 채 남은 `data/` 파일은 인계 댓글에 적는다." 추가로 "커밋은 `git add <파일>`로 경로를 지정한다. `git add -A`, `git add .`, `git commit -a`를 쓰지 않는다"를 넣는다. `collect-implementer`는 tools가 전체라 되돌림 허용 여부를 구현자가 정하되, 같은 문구를 쓴다.

문구 지시만으로는 막히지 않는다(`AGENTS.md`: 주석과 문서는 안 읽으면 그만). 1~7이 본체이고 문구는 보조다. 설계자 세션은 이 두 파일을 만지지 않으므로 구현자가 고친다.

### 3-4. 허용 절이 없는 기존 설계의 이행 방침

검사가 들어간 뒤, 설계에 `## 허용하는 데이터 변경` 절이 없고 `data/` 상태 파일을 바꾸는 PR은 걸린다. 설정성 파일 변경은 `CONFIG_FILES`로 통과하므로 대부분은 영향이 없다.

- 구현 중인 이슈(#66, #89 계열)에서 `data/` 상태 파일 변경이 정말 필요한 PR은 **그 이슈의 설계 문서에 허용 절을 먼저 더한다**(설계자 재실행 또는 설계 PR에 직접 커밋). 구현자가 허용 절을 쓰지 않는다. 구현자가 스스로 허용하면 검사가 무의미해진다.
- 필요 없는데 `data/`가 섞였다면 그 변경을 PR에서 뺀다.
- 구현자는 이 이슈 병합 시점에 열린 설계 PR 목록을 `gh pr list`로 보고 인계 댓글에 영향 여부를 적는다.

### 3-5. 한계 (표)

| 한계 | 설명 | 대응 |
| --- | --- | --- |
| 사고 커밋을 PR 검사가 못 막음 | `bd74ca3`은 PR #51의 봇 스쿼시 병합이라 PR 검사는 돌았다. 못 막은 이유는 필수 검사가 아니어서 빨간 CI에도 병합된 것이다(다음 행) | 다음 행의 필수 검사 설정. 로컬 push 전 점검(§3-3)이 두 번째 방어선 |
| 필수 검사(required check)가 아니면 빨개도 병합됨 | 이 검사는 CI를 빨갛게 할 뿐 병합을 막지 않는다 | **브랜치 보호 설정에서 `Tests`를 필수 검사로 거는 것이 선행 조건.** 코드로 못 한다. 열린 질문 1 |
| 허용 절은 사람이 쓴 설계 문서 | 설계가 잘못 허용하면 통과 | 설계 PR 리뷰 |
| `CONFIG_FILES`는 하드코딩 | 새 설정성 파일은 처음엔 차단됨 | 안전한 쪽으로 실패. 사람이 상수에 더함 |

## 4. "없다 / 0 / 통과" 자리와 양성 신호

| 출력 | 가를 신호 |
| --- | --- |
| 검사 "data/ 변경 0" | 기준 해시가 해석되고 전체 변경 파일 수 N ≥ 1임을 같이 찍음. 기준 불명이면 실패 |
| 검사 "허용됨" | 허용 목록을 읽은 설계 문서 경로를 같이 찍음. 문서가 없으면 허용 0 |
| 복원 "성공" | 키 개수(복원본 이상), 복원본 키 전부 존재, `s.baemin.com/` 키 존재. 파일 존재나 바이트 수로 판정하지 않음 |
| pytest 세션 "data/ 불변" | 확인한 파일 수 N을 찍음. N이 0이면 실패(`data/`를 못 찾았는데 불변이라 하지 않음) |
| 로컬 push 전 점검 "문제 없음" | `start`가 `HEAD`의 조상이고 변경 파일 수를 로그에 찍음. 수가 0이면 기존 "새 커밋 없음" 경로 |

## 5. 테스트 (결론을 박는 곳)

테스트 부작용(§3-0) 시험. `tests/test_no_repo_data_writes.py`:

- 격리 확인: 테스트 안에서 `capture.brand_links.RESOLVED_LINKS_PATH`가 저장소 `data/` 아래가 아님을 단언한다.
- 회귀 시험: 원인 테스트와 같은 모양으로 `_load_resolved`만 `{}`로 바꿔 끼우고 `collect_via_links`를 배민으로 부른다. 그 뒤 저장소 `data/resolved_links.json`의 해시가 호출 전과 같고, 임시 경로에 쓰였음을 단언한다.
- 세션 끝 검사 자체: 해시 비교 함수를 순수 함수(`snapshot(dir) -> dict`, `diff(before, after) -> list`)로 빼서 시험한다. 파일 하나를 바꾸면 그 경로가 나오고, 빈 디렉터리 스냅샷은 "확인 0개"로 실패 판정이 나와야 한다.

새 `tests/test_check_pr_state_files.py`. 임시 git 저장소(`tmp_path`에서 `git init`, 커밋 몇 개)로 돈다. 네트워크 없음. 입력은 CI와 같은 인자다: `--base origin/main`(임시 저장소에 `origin/main` 참조를 `git update-ref refs/remotes/origin/main`으로 만듦), `--head-ref feat/<번호>-…`.

- 상태 파일(`data/resolved_links.json`)을 바꾼 브랜치 → 실패, 파일 이름이 출력에 나옴.
- 같은 변경이지만 설계 문서 허용 절에 그 경로가 있음 → 통과, 사용한 설계 문서 경로가 출력에 나옴.
- 허용 절에 다른 파일만 있음 → 실패(허용은 파일 단위).
- `data/_retired/`, `data/.gitkeep`만 바꿈 → 통과.
- 설정성 파일(`data/devices.json`, `data/targeted_skip.json`)만 바꿈 → 통과, 출력에 설정성 개수.
- 설정성 파일과 상태 파일을 같이 바꿈 → 실패, 상태 파일만 이름이 나옴.
- 목록에 없는 새 `data/new_state.json` → 실패(기본 차단).
- 기능 파일만 바꿈(`capture/…`) → 통과, 변경 N과 `data/ 0개`가 찍힘.
- 변경이 아예 없는 브랜치 → 실패(빈 diff를 통과로 읽지 않음).
- `--base`가 해석되지 않는 이름 → 실패.
- `--head-ref`에서 번호를 못 뽑음 → 허용 0(허용 절이 있어도 통과시키지 않음).
- 대상 브랜치가 앞서 나간 경우: main에 `data/x.json` 변경이 새로 들어갔고 기능 브랜치는 건드리지 않음 → 통과(세 점 diff. 두 점 diff면 오탐).
- 합성 병합 커밋 모양: 기능 브랜치를 main에 병합한 커밋을 `HEAD`로 두고(브랜치 이름은 `--head-ref`로만 줌) 같은 판정이 나옴.
- 회귀 시험: `bd74ca3`과 같은 모양(기능 파일 + `data/resolved_links.json`을 `{}`로 바꾼 커밋)을 만들어 실패함을 확인.

순수 함수 시험(같은 파일): `check_files`에 `data/` 변경이 든 목록을 주면 차단 목록을 반환하고, 허용 집합에 있으면 반환하지 않음. `local_implement`를 import하지 않는다.

`local_implement.py` 연결 시험(import 없이): 소스 텍스트에서 `if head == start:` 분기 뒤, `sync_and_push(` 호출 앞에 점검 호출이 있는 순서를 문자열 위치로 박는다. 이 저장소의 기존 소스 문자열 시험 방식을 따른다(구현자가 `tests/`에서 비슷한 것을 찾아 맞춘다).

복원 시험: `tests/test_resolved_links_restored.py`를 따로 두지 않는다. 캐시는 수집이 바꾸는 가변 데이터라 개수를 테스트에 고정하면 다음 4a에서 깨진다. 복원은 PR 본문의 개수 확인(§3-1)으로 확인하고 지속 방어는 §3-2 검사가 맡는다.

CI 연결 시험: `tests.yml`에 단계가 있는지 문자열 포함 테스트로 박는다(`pull_request`일 때만, 첫 checkout의 `fetch-depth: 0`, `--base origin/main`, `--head-ref`가 `env`로 전달됨).

## 6. 원장 append-only

`data/log.jsonl`은 건드리지 않는다. 복원 대상은 `resolved_links.json`(원장이 아닌 캐시)뿐이고, 검사는 읽기 전용이다. 검사 대상에 `data/log.jsonl`이 들어가므로 기능 PR이 원장을 고치면 오히려 막힌다.

## 7. 구현 순서와 범위

한 PR로 리뷰 가능한 크기다.

0. 테스트 부작용 제거(§3-0)와 그 시험. pytest 전체를 돌려 `data/ 불변`이 찍히는지 본다
1. 현재 `data/resolved_links.json` 상태 확인과 복원(§3-1). 반드시 0번 뒤에 한다
2. `scripts/check_pr_state_files.py`(순수 함수 포함)와 테스트
3. `tests.yml` 단계(pull_request 전용, `fetch-depth: 0`, `env`로 `HEAD_REF`)
4. `scripts/local_implement.py` push 전 점검 호출(함수는 2에서 import)과 순서 시험
5. 두 구현자 에이전트 문서 문구(§3-3 끝)
6. 구현 뒤 `docs/HARNESS.md` §11 점검 명령에 이 검사를 적을지 구현자가 판단(안 적으면 이유를 인계 댓글에)
7. 열린 설계 PR 영향(§3-4)을 인계 댓글에 기록

수집 코드를 바꾸지 않으므로 폰 시험과 예약 끄기는 필요 없다. 단 `local_implement.py`는 수집 PC에서 도는 스크립트라 병합 뒤 수집 PC의 pull이 필요하다(인계 댓글에 적는다).

## 8. 열린 질문

1. **`Tests` 워크플로를 브랜치 보호의 필수 검사로 거는가.** 안 걸면 CI가 빨개도 병합된다(§3-5). 저장소 설정이라 사람이 한다.
2. **`## 허용하는 데이터 변경` 절 이름을 이 형식으로 해도 되는가.** 다른 specs는 이 절이 없다. 없으면 허용 0개라 호환된다.
3. **`CONFIG_FILES`를 `devices.json`, `targeted_skip.json` 둘로 시작해도 되는가.** 근거는 `7738b42`, `df642e5`, `915e149`. 더 있으면 알려 달라.
4. **반영 세션(`reflect-session.yml`)이나 followup이 앞으로 PR로 `data/`를 바꾸는가.** 지금 확인한 워크플로 중 `data/`를 PR로 올리는 것은 없다. 생기면 허용 절로 처리.
5. **수집 PC의 본 체크아웃에서 10-29 이후 pytest를 돌린 적이 있는가.** 있으면 운영 캐시도 `{}`가 됐다. 4a가 다시 채우므로 값이 틀리지는 않는다. 다만 다음 전수가 느려진다(개당 최대 8초). 병합 뒤 수집 PC가 pull하면 복원본을 받는다. 이때 수집 PC 쪽 파일이 더러우면 pull이 막힐 수 있으니 인계 댓글에 적는다.

## 허용하는 데이터 변경

- `data/resolved_links.json`: bd74ca3이 지운 단축링크 해석 캐시 복원(§3-1)

## 변경 이력

- 2026-11-03: 최초 작성
- 2026-11-03: 재설계. 이슈 결정 1~8 반영
  - 근거 정정: `data:` 직접 커밋만 정상이라는 문구 삭제. 정상 PR도 `data/`를 바꾼다(`7738b42`, `df642e5`, `915e149`). 허용 절이 없는 기존 설계의 이행 방침을 §3-4에 추가
  - 차단 대상: 전체 차단 유지, 설정성 파일(`devices.json`, `targeted_skip.json`)만 `CONFIG_FILES`로 기본 허용
  - 기준점: 합성 병합 커밋 때문에 `HEAD`를 믿지 않음. `--base origin/main --head-ref`(env 경유), `fetch-depth: 0`, 세 점 diff를 못 박고 시험 입력도 같은 인자로 변경
  - push 전 점검 위치: `head == start` 분기 뒤, `sync_and_push` 앞. `leftover_start`의 merge-base 경우와 중단 뒤 재실행 루프 해소 방법 명시
  - 구현자 문구: `git checkout`을 시키지 않고 "`data/`는 add하지 않고 남으면 인계 댓글에 적음"으로 변경
  - §3-1 복원: 합치기를 `{**복원본, **현재}` 한 줄로 확정. `5321067` 이후 형식 변화 없음을 확인해 `s.baemin.com/` 키 검사 유지
  - 한계 표(§3-5)와 열린 질문 1(브랜치 보호) 추가
  - 점검 로직을 `check_pr_state_files.py`의 순수 함수로 두고 `local_implement`는 호출만 함. 시험은 `local_implement`를 import하지 않음
- 2026-11-03: 재설계(재실행). 이슈 결정 1~8은 앞 재설계에 이미 반영돼 있어 유지했다. 코드 대조로 찾은 원인을 반영했다
  - §1 원인 확정: 수집이 아니라 `tests/test_audit_budget.py`(`6ff00f8`)가 `_load_resolved`만 바꿔 끼워 진짜 캐시에 `{}`를 쓴다. #50 브랜치의 `39dce27`/`72893f1`이 같은 사고와 되돌림이다
  - §3-0 신설: 원인 테스트 경로 격리, `conftest.py` autouse 격리, 세션 끝 `data/` 불변 검사. 구현 순서 0번으로 두고 복원보다 먼저 한다
  - §2 폭발 반경에 테스트 세 줄, §4 양성 신호에 세션 검사, §5에 `tests/test_no_repo_data_writes.py`, §8에 열린 질문 5(수집 PC 캐시) 추가
  - §3-1 형식 검증 문구 정정: "이력 둘뿐"은 main 기준이고 다른 브랜치에 두 커밋이 더 있음
- 2026-11-03: 구현 중 권한자 댓글(/approve-design) 반영. §3-5 1행을 고침: bd74ca3은 PR #51의 봇 스쿼시 병합이라 PR 검사는 돌았고, 못 막은 이유는 필수 검사가 아니어서 빨간 CI에도 병합된 것(2행)
