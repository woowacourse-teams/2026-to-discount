<!-- 원본: tracker docs/specs/issue-105-push-sync-state-files.md — 여기서 고치지 않는다 -->
# 이슈 #105: 자동 반영 push가 원격과 갈라져도 올리고, 상태 파일이 커밋에 들어가게 하고, 실패는 슬랙에 띄우기 (설계)

영역: `export` (폰 불필요). 8단계(`reflect_daily.py`)와 4e(`publish_brand_links.py`)는 수집 PC에서 돌지만 폰을 잡지 않는다. 코드는 이 문서를 승인한 뒤 구현자가 고친다.

## 1. 요약

2026-11-03 01:57 8단계가 `git push -q origin HEAD`(`scripts/reflect_daily.py:490`)에서 non-fast-forward로 거절됐다. 보고서에 한 줄(`커밋했지만 **푸시 실패** — 사람이 git push할 것`)만 남았고 사람이 병합 커밋 `565600d`로 올렸다. 원인이 둘 겹쳤다.

- **원격은 수집 중에도 앞선다.** 워크플로 PR 병합과 다른 세션 push가 수집 시간(45~90분) 안에 일어난다. `commit_evidence`는 push 전에 fetch하지 않고, 거절되면 재시도하지 않는다.
- **작업 트리가 늘 더럽다.** 수집이 바꾸는 추적 파일 일곱 개(`coupangeats_monthly.json`, `coupangeats_claimed_fixed_events.json`, `offer_seen.json`, `resolved_links.json`, `targeted_skip.json`, `yogiyo_events.json`, `ddangyo_brandday.json`)가 `commit_evidence`의 경로 목록(`:473-:476`)에 없다. 더러운 트리에서는 `git pull --rebase`가 막히고, `--autostash`는 명령 차단 훅(`docs/HARNESS.md:750`)이 막는다. 합칠 길이 병합 커밋 하나뿐이었다.

조용히 잃는 자리: **푸시 실패가 사람이 보고서를 열어야만 보인다.** 보고서는 읽는 사람이 없으면 없는 것과 같다. 로컬 `main`에만 있는 자동 반영 커밋이 쌓이면 배포(`export.json`)가 멈춘 채로 수집은 "성공"을 찍는다(`AGENTS.md` "먼저 알 것": 미관측이 "통과"로 읽힌다).

이슈 요구 셋에 대한 결정:

1. **push 전에 fetch하고, 원격이 앞섰으면 저장소 밖 임시 작업 폴더(`git worktree add --detach`)에서 우리 커밋만 원격 위에 옮겨 올린다.** 더러운 주 작업 트리는 건드리지 않는다. 충돌이면 중단하고 올리지 않는다. 자동 해결과 `--force`는 쓰지 않는다. reflect(8)와 4e가 같은 함수를 쓴다(§4).
2. **일곱 상태 파일은 증거 커밋에 같이 넣는다. `.gitignore`로 빼지 않는다.** 단 JSON으로 읽히는 파일만 넣는다(§5). `data/daily/`와 `history.json`은 이번에 정하지 않고 사유와 함께 후속으로 둔다(§5-3).
3. **push가 끝내 실패하면 슬랙에 보낸다.** 설정이 없어서 못 보낸 것도 보고서에 적는다(§6).

## 2. 설계자의 비판: 이슈 안을 그대로 받지 않은 곳

- **`.gitignore`는 이미 추적 중인 파일에 듣지 않는다.** 일곱 파일은 추적 중이라 `.gitignore`에 적어도 `git status`는 계속 더럽다. 빼려면 `git rm --cached`로 추적을 끊어야 하는데, 그러면 다른 기계와 CI가 그 파일의 이력과 값을 잃는다. 테스트가 이 파일들을 읽는다(`tests/test_targeted_skip_cli.py`, `test_yogiyo_events.py`, `test_ddangyo_brandday.py`, `test_build_ce_couponbox_records.py`, `test_reflect_daily.py`). 특히 `targeted_skip.json`은 사람이 정하는 값(ADR-035)이라 git 밖에 두면 사용자가 해소했다고 말한 이력이 안 남는다. 그래서 커밋 쪽으로 간다.
- **"커밋에 넣는다 = 안전하다"가 아니다.** 8단계는 배너 단계(6, 7)를 기다리지 않고 돈다(`banner_wait`, `:501`). 배너 단계가 아직 쓰는 중인 파일을 커밋하면 반쯤 쓴 JSON이 원장 옆에 올라간다. 그래서 넣기 전에 각 파일이 JSON으로 읽히는지 본다(§5-2).
- **병합 커밋과 `pull --rebase`는 쓰지 않는다.** 병합 커밋은 이력을 갈라 `565600d`를 만들었다. `pull --rebase`는 더러운 트리에서 막힌다. 임시 작업 폴더에 `cherry-pick`하면 주 작업 트리가 더러워도 된다.
- **재시도를 stderr 글자로 정하지 않는다.** `fetch first`/`non-fast-forward` 문구는 git 버전마다 다르다. 거절된 뒤 다시 fetch해서 `merge-base --is-ancestor origin/main HEAD`가 거짓인지(= 뒤처졌는지) 구조로 정한다. 성공은 종료 코드로만 판정한다.

## 3. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`를 봤다. 표의 묶음(확실성, 배너 모양, 묶음 배너, 최소주문, 알림, 글자, 행동 이벤트, 저장소 경계, 새 파일)에 `reflect_daily`, `commit_evidence`, `publish_brand_links`, 원장 커밋 경로를 가리키는 줄이 없다. 없다고 말하고 시작한다.

대신 같은 종류로 직접 점검한 자리:

- **커밋 경로 묶음.** `commit_evidence`의 `paths`는 export 재현에 드는 파일 묶음이다. `tests/test_reflect_commit_paths.py`가 `sweeps.jsonl`, `dead_links.json`을 박았다(과거 사고 2건: 2026-09-29, 09-18). 일곱 파일을 더하면 이 테스트가 같은 방식으로 박는다. 여기에 더하는 것은 export 재현 경로가 아니라 "수집이 바꾸는 상태"이므로 이름 있는 별도 묶음(`STATE_FILES`)으로 둔다. 둘을 섞으면 다음 사람이 "export에 필요하다"로 읽는다.
- **`reflect_daily.py`를 부르는 곳.** `run_routine.py`(8단계), 테스트 세 곳이 `commit_evidence`를 목으로 바꾼다(`test_reflect_daily.py:206,249`, `test_reflect_ce_partial.py:64`). 반환 문자열(`commit_note`)이 보고서 `## 저장소` 절에 그대로 들어간다(`:411`). 문구를 바꾸면 안 된다: 첫 문구 `커밋·푸시했다(N개 파일).`와 `커밋할 변경이 없다.`는 그대로 두고, 새 경우만 새 문구를 더한다. **`check_routine`이 이 문구를 읽는다(확인됨).** 두 단계가 다른 정규식으로 읽는다. 읽는 대상은 보고서 파일이 아니라 실행 로그의 단계 구획이다(`commit_evidence`의 반환값은 `print(commit_note)`로 8단계 로그에도 찍힌다).
  - **4e 구획**(`publish_brand_links`의 표준 출력): 줄 머리 `^(커밋·푸시했다|brands\.yml에 바뀐 것이 없다)`가 있어야 PASS, `^\[skip\]|^\[fail\]|^Traceback`이 있으면 SUSPECT.
  - **8단계 구획**(`commit_note`): `푸시 실패|저장소 반영 실패`가 있으면 SUSPECT. `올리지 않는다`가 있으면 FAIL(서버 업로드 거부로 읽는다). 성공 문구는 따로 찾지 않는다.

  그래서 문구 불변 규칙은 다음과 같다(§8 시험 12).
  - 4e의 `pushed_after_sync` 출력은 줄 머리가 `커밋·푸시했다`여야 한다. 그래야 완료로 읽힌다. 4e의 `conflict`/`rejected`/`error`와 `foreign` 가드 출력은 지금처럼 `[fail]`로 시작한다.
  - 8단계 `commit_note`의 `pushed_after_sync` 문구도 `커밋·푸시했다`로 시작한다(이슈 결정 2). `conflict`/`rejected`/`error` 문구에는 `푸시 실패`가 들어가야 한다. 그래야 SUSPECT로 읽힌다.
  - **반대 방향도 막는다.** 8단계의 `pushed`/`pushed_after_sync` 문구와 §4-4 경고(`로컬 main이 갈라진 채 남음`)에는 `푸시 실패`, `저장소 반영 실패`가 들어가면 안 된다(성공을 SUSPECT로 읽는다). 어떤 `commit_note`에도 `올리지 않는다`가 들어가면 안 된다(푸시 실패를 서버 업로드 거부 FAIL로 오분류한다). 미푸시 커밋 가드(§4-3)의 사유는 `올리지 않았다`가 아니라 `푸시하지 않았다`로 쓴다.
- **4e.** `publish_brand_links.main`의 push 루프(`:81-:91`)가 `pull --rebase`를 쓴다. `docs/setup/ROUTINE-SPEC.md:302`가 "작업 트리에 남의 미커밋 변경이 있으면 받지 않는다"라고 적는다. 이 한 줄이 새 동작에 맞게 바뀐다(§4-5).
- **mono 저장소.** 4e의 저장소는 mono(`brands.yml`, 브랜치 `main`)이고 tracker와 별도다. 같은 함수가 `repo`, `branch`를 받아 둘 다 처리한다. `AGENTS.md`의 "tracker와 mono 둘 다 푸시한다"에 따라 4e 경로가 빠지면 mono 쪽은 그대로 막힌다. 이번에 4e를 넣는 이유다.
- **원장 `data/log.jsonl`.** 읽거나 고치지 않는다. 이미 만든 커밋을 옮길 뿐이다. append-only 위반 없음(§7).
- **`local_implement.py`.** 이슈 #74 설계(`docs/specs/issue-74-local-implement-push-sync.md`)가 같은 문제의 구현 세션 쪽 해법(`rebase --onto`)이다. 이번 함수와 코드를 공유하지 않는다: 저쪽은 브랜치 `feat/*`에 rebase하고 로컬 브랜치를 그대로 두며, 이쪽은 더러운 `main` 트리에서 임시 폴더를 쓴다. 두 번째 복제를 만들지 않으려면 "원격이 앞섰는지 보는 `is-ancestor` 판정"만 닮게 쓰고, 합치는 방식은 다르다는 점을 코드 머리말에 한 줄 적는다.
- **폰, 예약.** 건드리지 않는다. `collect_trial.ps1`은 수집 로직이 아니라서 쓰지 않는다. 단 `AGENTS.md` 규칙(사용자 2026-10-15)에 따라 예약 수집이 부르는 코드라서 병합 전에 해당 단계만 `--skip`으로 골라 돌린다(§8 시험 11).

## 4. 변경 1: `scripts/git_sync.py` 신설, 올리는 길

새 파일 하나에 둔다. 8단계와 4e가 같은 함수를 쓴다. `mono/docs/CHANGE-PROPAGATION.md` §9 "새 파일을 더할 때"의 구조 문서 갱신은 mono 기준이라 이 저장소에는 해당이 없지만, 이 저장소의 파일 목록 문서가 있으면 구현자가 `grep -r "reflect_daily.py" docs/`로 찾아 한 줄 더한다.

### 4-1. 함수

```
def sync_push(repo: Path, branch: str, ours: str) -> PushResult
```

- `repo`: 올릴 저장소 루트(tracker 또는 mono). `branch`: `main`. `ours`: 방금 만든 커밋의 해시(`git rev-parse HEAD`).
- `PushResult`: `status`(`pushed` | `pushed_after_sync` | `conflict` | `rejected` | `error`), `detail`(사람이 읽을 한두 줄), `remote_files`(합칠 때 원격에서 들어온 파일, 없으면 빈 목록).
- git 호출은 실패해도 예외를 올리지 않는 얇은 함수 `git_try(repo, *args)`로 한다: `(code, stdout, stderr)`. 인코딩은 `encoding="utf-8", errors="replace"`(기존 코드와 같다).
  - **타임아웃**: `subprocess.run(timeout=…)`을 준다(fetch, push 120초, 그 밖 30초. 상수로 둔다). `TimeoutExpired`는 `(124, "", "시간 초과: <명령>")`로 바꿔 돌려주고 호출한 쪽이 `error`로 끝낸다. 예약 실행에서 인증 프롬프트에 멈춰 8단계 전체가 멈추는 것을 막는다.
  - **환경**: `env`에 `GIT_TERMINAL_PROMPT=0`을 더해 프롬프트 대기를 없앤다. 나머지 환경은 상속한다.
  - **커밋 신원**: cherry-pick이 커밋을 새로 쓰므로 `user.name`/`user.email`이 필요하다. 전역 설정이 비어 있으면 실패한다. `git_try`가 항상 `-c user.name=… -c user.email=…`을 앞에 준다. 값은 환경변수(`GIT_AUTHOR_NAME` 등)가 있으면 상속하고 없으면 기본값(`tracker-auto`/`tracker-auto@localhost`)을 쓴다. cherry-pick은 원 커밋의 작성자를 보존하므로 이 값은 커미터 칸에만 남는다.
  - **비밀 가리기**: `redact(text)`를 함께 둔다. `scheme://<계정>@host`와 `scheme://token@host`의 자격 부분을 `***`로 바꾼다. `PushResult.detail`, 보고서, 슬랙에 들어가는 모든 git stderr는 이 함수를 거친다(`rules/secrets.md`).

### 4-2. 흐름

```
for attempt in (1, 2):
    git fetch -q origin <branch>                      # 실패하면 status=error. 못 본 것을 "앞서지 않음"으로 읽지 않는다
    if git merge-base --is-ancestor origin/<branch> <ours>:    # 원격이 우리 조상 = 앞서지 않음
        push = git push -q origin <ours>:refs/heads/<branch>   # 로컬 HEAD 그대로
        code 0이면 pushed
    else:
        임시 작업 폴더에서 옮겨 올린다(4-3) -> code 0이면 pushed_after_sync
    push가 비0이고 attempt == 1이면 다시 돈다           # fetch와 push 사이에 또 올라간 경우
끝나도 비0이면 rejected
```

- 첫 `push`는 `HEAD`가 아니라 `<ours>:refs/heads/<branch>`로 명시한다. 도는 사이 사람이 주 작업 트리에서 다른 브랜치로 옮겨도 엉뚱한 곳에 안 올라간다.
- 반복은 두 번까지. 둘째 시도의 결과가 최종이다.

### 4-3. 임시 작업 폴더에서 옮기기

```
tmp = tempfile.mkdtemp(prefix="sync-push-")           # 저장소 밖
git worktree add --detach <tmp>/wt origin/<branch>
git -C <tmp>/wt cherry-pick <ours>^..<ours>           # 우리가 방금 만든 커밋 하나만
git -C <tmp>/wt push -q origin HEAD:refs/heads/<branch>
(finally) git worktree remove --force <tmp>/wt ; tmp 폴더 삭제
```

- **옮기는 범위는 `<ours>^..<ours>`, 곧 `ours` 커밋 하나다.** `<base>..<ours>`로 쓰지 않는다. 그 범위는 로컬 `main`에만 있는 커밋 전부라서, 다른 세션이 로컬에 둔 미푸시 커밋이 딸려 올라간다. 4e가 막으려던 2026-09-30 사고와 같다(`publish_brand_links.py`의 `foreign` 가드).
- **미푸시 커밋 가드를 `sync_push` 안에 둔다.** 옮기기 전에 `git log --format=%H origin/<branch>..<ours>^`를 읽는다. 결과가 비어 있지 않으면 `ours` 앞에 남의 미푸시 커밋이 있다는 뜻이다. 옮기지도 올리지도 않고 `status=error`, `detail`에 `남의 미푸시 커밋 N개(해시 앞 7자리 목록)`을 적는다. 이 가드는 §4-2 첫 `push`(원격이 앞서지 않는 길)에도 같이 건다. `<ours>:refs/heads/<branch>` push는 `ours`의 조상 커밋을 모두 올리기 때문이다. `commit_evidence`와 4e가 같은 함수를 쓰므로 한 곳에서 막힌다. 4e의 기존 `foreign` 가드는 그대로 두고(사유 문구가 다르다), 이 가드는 `commit_evidence` 쪽의 구멍을 막는다.
- 옮긴 뒤 `git diff --name-only <base>..origin/<branch>`(`base` = `merge-base origin/<branch> <ours>`)로 `remote_files`를 얻는다. 합침이 일어났다는 양성 신호이자 보고서 입력이다.
- **충돌과 설정 오류를 가르는 법**: stderr 글자로 가르지 않는다. `cherry-pick`이 비0이면 `git ls-files -u`(unmerged 항목)를 **중단 전에** 읽는다.
  - 항목이 있으면 `conflict`. `git diff --name-only --diff-filter=U`로 충돌 파일을 `detail`에 적는다.
  - 항목이 없으면 `error`. 신원 설정 오류, 훅 실패, 빈 커밋이 여기로 온다. `detail`에 `redact`한 stderr 끝 400자를 적는다. 설정 오류를 `conflict`로 오분류하지 않는다.
  - 어느 쪽이든 `git cherry-pick --abort`(실패해도 무시)로 임시 폴더를 비운다. 주 작업 트리와 로컬 `main`은 건드린 적이 없으므로 원상 복구할 것이 없다.
- 임시 폴더 정리는 `finally`에서. 정리가 실패하면 `detail`에 `임시 폴더 {경로} 남음`을 붙이되 결과는 바꾸지 않는다. 다음 실행 시작 때 `git worktree prune`을 한 번 부른다(지워진 폴더의 등록 흔적).

### 4-4. 올린 뒤 로컬 `main` 맞추기

`pushed_after_sync`이면 로컬 `main`은 우리 커밋 `ours`를 가리키고, 원격은 `ours'`(해시가 다른 같은 변경)를 가진다. 둘이 갈라져 있어 그대로 두면 다음 날 같은 문제가 반복되고 로컬이 원격과 영영 안 맞는다.

```
if git diff --quiet <ours> origin/<branch> -- <우리가 커밋한 경로>:   # 양성 신호: 원격이 우리 변경을 그대로 담았다
    git reset --keep origin/<branch>
```

- `reset --keep`은 HEAD와 대상 사이에서 다른 파일에 로컬 변경이 있으면 **스스로 중단**한다. 더러운 상태 파일을 덮어쓰지 않는다. 우리가 커밋한 경로는 커밋 직후라 깨끗하므로 원격 쪽으로 갱신되고, 그 밖의 더러운 파일은 원격이 건드리지 않은 한 그대로 남는다.
- 위 `diff --quiet`가 거짓이면(원격이 우리 경로를 다르게 바꿨는데 cherry-pick이 합쳐서 통과한 경우) reset하지 않는다. `detail`에 `로컬 main이 원격과 갈라진 채 남음`을 적는다. 로컬 커밋 `ours`는 지워지지 않는다.
- `reset --keep`이 비0이면 같은 문구를 적는다. 올리는 일 자체는 이미 성공했으므로 `status`는 `pushed_after_sync`로 두고 `detail`만 경고로 쓴다.
- **미확인이며 구현 첫 단계다**: 명령 차단 훅(`command-guard.py`, claude-harness 소속)이 `reset --keep`을 막는지 이 설계 세션은 확인하지 못했다(`docs/HARNESS.md`의 훅 설명에는 강제 push, `--autostash`, 맨 `git stash`, 윈도 `adb`만 나온다). 훅은 대화형 에이전트의 Bash 호출을 막는 것이고 `subprocess`로 도는 예약 스크립트에는 안 걸릴 가능성이 높다(추정).
  - **구현자의 첫 단계**는 `command-guard.py`를 읽어 `reset --keep`(과 `worktree remove --force`, `cherry-pick`)이 막히는지 보는 것이다. 코드는 그 뒤에 쓴다.
  - **막는 쪽이면** 4-4를 구현하지 않고 멈춘다. 질문 1(§9)로 돌려보내 사용자가 (가)/(나)를 정한다. 이 판정을 PR 본문 확인 절에 적는다.
  - **승인 조건**: 이 설계의 승인은 "훅이 `reset --keep`을 막지 않는다"를 구현 첫 단계에서 확인하는 것을 전제로 한다. 막으면 4-4는 이 승인에 포함되지 않는다.

### 4-5. 호출하는 쪽

**`commit_evidence`** (`reflect_daily.py:454`)
- 커밋까지는 그대로. `git push -q origin HEAD`(`:490`)를 `sync_push(ROOT, "main", ours)`로 바꾼다. 현재 브랜치가 `main`이 아니면 `branch`는 `git rev-parse --abbrev-ref HEAD`로 읽는다(하드코딩 금지). `HEAD`가 분리돼 있으면(`HEAD` 문자열) 올리지 않고 `error`와 사유.
- **`ROOT`는 호출 시점에 읽는다.** `commit_evidence`는 함수 안에서 모듈 전역 `ROOT`를 그때그때 읽는다(기본 인자로 굳히지 않는다). `skip_path`가 이미 그렇게 한다(`reflect_daily.py`의 `skip_path`). 시험 9가 `monkeypatch.setattr(reflect_daily, "ROOT", tmp_repo)`로 임시 저장소를 가리키려면 필요하다.
- 반환 문구: `pushed` → `커밋·푸시했다(N개 파일).`(기존 그대로). `pushed_after_sync` → `커밋·푸시했다(N개 파일). 원격이 앞서 있어 {k}개 파일을 받아 옮겨 올렸다: …`와 4-4의 경고가 있으면 줄 하나. `conflict`/`rejected`/`error` → 기존 `푸시 실패` 문구 앞머리를 유지하고 사유를 붙인다. 이 문구들은 슬랙으로도 간다(§6).

**4e `publish_brand_links.main`** (`:81-:91`)
- `pull --rebase` 루프를 `sync_push(repo, "main", ours)`로 바꾼다. 남의 커밋 가드(`foreign`, `:73`)는 그대로 둔다. 가드가 걸리면 지금처럼 우리 커밋을 로컬에 남기고 푸시하지 않는다. 이 길도 슬랙에 보낸다(§6).
- 출력: `pushed` → `커밋·푸시했다`(기존 그대로), `pushed_after_sync` → `커밋·푸시했다(원격이 앞서 있어 옮겨 올렸다)`처럼 줄 머리를 지킨다. `conflict`/`rejected`/`error` → `[fail] 푸시 실패 — …`로 시작하고 종료 코드 1. `check_routine`의 4e 판정이 이 줄 머리를 읽는다(§3).
- `ROUTINE-SPEC.md:302` 한 줄을 "원격이 앞서면 임시 작업 폴더에서 우리 커밋만 옮겨 올린다. 작업 트리가 더러워도 된다"로 바꾼다.

## 5. 변경 2: 상태 파일을 증거 커밋에 같이 넣는다

### 5-1. 결정과 이유

일곱 파일을 `STATE_FILES`(상수, `reflect_daily.py`)로 두고 `commit_evidence`가 `paths`에 합쳐 같은 커밋에 넣는다. 이유는 §2. 증거 커밋에 같이 넣으면 한 날의 수집 상태(원장, export, 상태)가 한 커밋에 모여 이력에서 함께 되돌릴 수 있다.

`data/` 아래 다른 추적 파일(`baemin_lounge_brands.json`, `yogiyo_addresses.json`, `devices.json`)은 이 이슈가 지목하지 않았고 수집이 매번 바꾸는지 확인하지 못했다. **넣지 않는다.** 구현자는 정기 수집 직후 `git status --porcelain`을 한 번 보고, 위 일곱 밖에 바뀌는 추적 파일이 있으면 이 이슈에서 더하지 말고 PR 본문 후속 조치에 올린다.

### 5-2. 반쯤 쓴 파일을 올리지 않는 신호

8단계는 6, 7(배너)을 기다리지 않는다. 그래서 `STATE_FILES` 각 파일을 `git add` 전에 `json.loads`로 읽는다.

- 읽히면 넣는다.
- 읽히지 않으면(`JSONDecodeError`, 빈 파일) **그 파일만 빼고** 나머지를 커밋한다. 보고서 `## 저장소`에 `상태 파일 제외(JSON 아님): <이름>`을 적는다. 조용히 빠지지 않게 하는 양성 신호다.
- 파일이 아예 없으면 건너뛴다(처음부터 없을 수 있다). 단 `git ls-files`에 있는데 작업 트리에 없으면 삭제 변경이므로 넣지 않고 같은 줄로 알린다(수집기가 지운 것인지 모른다).

`-f`로 `git add`하는 기존 방식은 유지한다. 커밋은 지금처럼 경로를 `--`로 못박는다(8cf9cf0: 남의 스테이징을 쓸어 담지 않는다).

### 5-2b. 원격에서 같은 상태 파일이 바뀐 경우(병합 한계)

일곱 파일은 JSON이라 git의 줄 단위 병합이 안 된다. 원격에서 같은 파일이 바뀌어 있으면 `cherry-pick`이 거의 항상 `conflict`로 멈춘다. 장부 파일(`data/log.jsonl`)처럼 줄 추가로 자동 병합되는 파일과 다르다.

- **원격에서 이 일곱 파일을 바꾸는 주체(WSL 수집 세션, 다른 PC)가 있는지는 확인된 바 없다(추정).** §9 위험 3으로 올린다.
- **방침: 자동 해결하지 않는다. 멈춘다.** JSON 키 단위 병합은 이번 범위 밖이다. 값이 틀리게 합쳐지면 조용히 잃는 것이므로 멈춤이 낫다.
- **사유를 구분한다.** `conflict`의 충돌 파일이 전부 `STATE_FILES` 안이면 `detail` 앞에 `상태 파일만 충돌: …`을 붙이고, 하나라도 밖이면 `충돌: …`로 쓴다. 슬랙 복구 안내도 갈린다. 상태 파일만이면 "원격 쪽 값을 받을지 로컬 쪽을 올릴지 정해 직접 반영할 것", 아니면 기존 안내다. 매일 같은 사유로 울리면 그때 이 파일들만 원격에서 빼는 후속을 연다(§9 질문 4).
- 이 구분은 시험 5b가 박는다.

### 5-3. `data/daily/`와 `history.json`: 이번에 결정하지 않는다

이슈가 같이 보라고 한 두 곳이다. 둘의 크기, 읽는 쪽, 추적 여부를 이 세션이 확인하지 못했다(**미확인**). 증거 화면을 수집 PC에만 두기로 한 2026-09-15 결정(`.gitignore:21-24`)과 같은 결을 가질 가능성이 높지만 추측이다. 구현자는 `git ls-files data/daily history.json`과 `grep -rn "data/daily\|history.json" scripts tests docs`로 확인만 하고 결과를 PR 본문에 적는다. 결정은 PR 본문 후속 조치 이슈로 넘긴다. 끝조건 둘째 줄("추적 파일 변경이 안 남는다")에는 영향이 없다: 둘 다 `.gitignore`가 이미 제외했거나 추적 밖이면 `git status`를 더럽히지 않고, 추적 중이고 바뀌면 후속에서 잡힌다. **이 가정을 시험 9가 막는다**(실제 정기 수집 뒤 `git status`).

## 6. 변경 3: 푸시 실패를 슬랙에 띄운다

### 6-1. 보내는 길

`scripts/git_sync.py`에 `alert_push_failure(title: str, detail: str) -> str`.

- 기존 패턴을 따른다(`scripts/device_watch.py:139`, `scripts/verify_bot.py:242`): `capture.slack_notify`의 `Slack`, `load_config`. 환경변수 `OPS_SINKS=off`면 보내지 않는다(시험과 손 점검).
- **`detail`과 보고서에 `push.stderr` 끝 400자를 넣되 반드시 `redact`(§4-1)를 거친다.** 기존 `reflect_daily.py`가 이미 stderr 끝 400자를 보고서에 넣는다. https 원격 URL에 토큰이 박혀 있으면 슬랙으로 샌다. `scheme://<계정>@host`를 가리는 필터를 슬랙과 보고서 둘 다에 건다. `alert_push_failure`도 입력을 한 번 더 `redact`한다(호출한 쪽이 빠뜨려도 막는 이중 방어).
- 문구: `[자동 반영 푸시 실패] {title}` + `detail`(최대 400자) + 복구 안내 한 줄. 복구 안내는 상태별로: `conflict`면 "충돌 파일을 고쳐 직접 올릴 것", `rejected`면 "원격을 확인하고 `git push`", `error`면 detail 그대로.
- 반환값은 보고서에 붙일 한 줄: `슬랙 전송함`, `슬랙 설정 없음 — 전송 못 함`, `슬랙 전송 실패: {오류 첫 줄}`, `슬랙 끔(OPS_SINKS=off)`. 보낸 것과 못 보낸 것이 보고서에서 구분된다.
- **슬랙 실패가 반환 문구를 덮지 않는다.** 전송에서 예외가 나도 `commit_evidence`의 `커밋했지만 푸시 실패` 본문은 그대로 반환한다. 알림이 정본(보고서)을 대신하지 않는다.

### 6-2. 어떤 상태에서 보내나

| status | 슬랙 |
|---|---|
| `pushed`, `pushed_after_sync` | 안 보낸다. 단 `pushed_after_sync`의 4-4 경고(로컬 main이 갈라진 채 남음)는 보낸다. 다음 날 같은 일이 반복되기 때문이다 |
| `conflict`, `rejected`, `error` | 보낸다 |
| 4e의 `foreign` 가드(남의 커밋 때문에 푸시 안 함) | 보낸다. 지금은 `[fail]` 한 줄이 로그에만 있다 |
| `커밋할 변경이 없다.` | 안 보낸다. 실패가 아니다 |

같은 실패의 반복(매일 수집 PC가 막혀 있는 경우)은 이번에 합치지 않는다. 하루에 한 번씩 오는 것이 "안 보임"보다 낫다고 본다(§9 질문 2).

## 7. "없다 / 0 / 통과"의 양성 신호

| 자리 | 조용히 틀리는 경우 | 양성 신호 |
|---|---|---|
| 푸시 성공 문구 | 거절됐는데 성공으로 찍힘 | 종료 코드 0일 때만 `커밋·푸시했다`. 시험이 실제 git으로 "성공이면 원격 `main`의 경로 내용 == 로컬 커밋의 경로 내용"을 확인 |
| "원격이 앞서지 않음" | fetch가 실패해서 못 본 것 | fetch 종료 코드 0 **뒤** `is-ancestor` 참일 때만 앞서지 않음. fetch 실패는 `error`로 끝내고 시험이 박는다 |
| 충돌 없음 | 충돌 파일 목록이 비었을 뿐 실제로는 cherry-pick 실패 | 종료 코드로 판정. 목록이 비어도 `conflict` |
| 상태 파일 커밋 | 반쯤 쓴 파일이 올라감, 또는 조용히 빠짐 | `json.loads` 통과한 파일만 넣고, 빠진 파일은 보고서에 이름으로 적는다 |
| "상태 파일 다 들어갔다" | 일곱 중 하나가 목록에서 빠짐 | 시험이 `STATE_FILES` 일곱 이름을 박고, 실제 임시 저장소에서 수정한 일곱 파일이 커밋에 다 있다 |
| 로컬 main 맞춤 | reset이 안 됐는데 됐다고 적음 | `reset --keep` 종료 코드 + 뒤에 `rev-parse HEAD == rev-parse origin/main`을 비교해 `detail`에 적는다 |
| 슬랙 | 보냈다고 믿는데 설정이 없음 | 반환 한 줄이 네 가지로 갈린다(6-1). 시험이 설정 없음 경로를 박는다 |
| 정기 수집 직후 `git status` | 깨끗해 보이는데 아직 도는 단계가 쓰는 중 | 판정은 8단계 직후가 아니라 `ROUTINE-SPEC.md`가 정한 큐 종료 뒤. 시험 9의 확인 시점으로 적는다 |

## 8. 테스트 (결론은 테스트로 박는다)

새 `tests/test_git_sync.py`. 가능한 곳은 **실제 git**을 임시 폴더에서 쓴다. 목은 슬랙 전송에만 쓴다. 공통 도우미 `make_repos(tmp_path)`: 베어 `origin.git`, 작업 클론 `work`(브랜치 `main`, 커밋 `base`), 원격에 먼저 올리는 클론 `other`. git 사용자는 `-c user.name=t -c user.email=t@t`로 준다. 기존 `test_reflect_commit_paths.py`는 `subprocess.run`을 통째로 목으로 바꾸므로, 새 파일 쪽 시험은 그 목을 쓰지 않는다.

1. `test_not_ahead_pushes_head_directly`: 원격이 그대로면 `pushed`. 임시 작업 폴더를 만들지 않는다. 목 없이 관측할 수 없으므로 두 방법 중 하나로 박는다: (가) `git_sync.git_try`를 감싸 호출 목록을 남기는 래퍼를 `monkeypatch`로 끼우고 `worktree add` 인자가 한 번도 없음을 확인, 또는 (나) 호출 중 `git worktree list` 결과가 한 줄이고 호출 뒤 `tempfile.gettempdir()` 아래 `sync-push-*`가 새로 생기지 않음을 확인. 구현자는 (가)를 기본으로 하고, 래퍼는 실제 git을 그대로 부르며 기록만 남긴다.
1b. `test_foreign_unpushed_commit_is_not_carried`: `work`에 다른 세션의 미푸시 커밋 `F`를 먼저 만들고 그 위에 증거 커밋 `A`를 만든다. 원격이 그대로인 경우와 앞선 경우 둘 다 `sync_push`가 `error`, 원격 `main`이 호출 전과 같고(`F`도 `A`도 안 올라감), `detail`에 `F`의 앞 7자리가 있다. 2026-09-30 사고를 박는다.
2. `test_remote_ahead_with_dirty_tree_still_pushes`: `other`가 다른 파일을 먼저 올렸고 `work`의 추적 파일에 미커밋 변경이 있다. `sync_push` 뒤 `pushed_after_sync`, 원격 로그가 `base, B, A'`(선형, 병합 커밋 없음), 그리고 **`work`의 미커밋 변경이 그대로 남아 있다**. 이슈 끝조건 1을 직접 박는다.
3. `test_local_main_aligned_after_sync`: 2번 뒤 `rev-parse HEAD == origin/main`, 더러운 파일 내용 불변. 원격이 우리 경로를 바꾼 경우(`diff --quiet` 거짓)는 reset하지 않고 `detail`에 `갈라진 채 남음`.
4. `test_reset_keep_refuses_when_remote_touches_dirty_file`: `other`가 `work`에서 미커밋으로 바꾼 상태 파일을 같이 바꿨다. `reset --keep`이 중단되고 파일 내용은 보존되며 `pushed_after_sync` + 경고. 로컬 커밋이 `git cat-file -e`로 아직 있다.
5. `test_conflict_pushes_nothing_and_leaves_main_tree_untouched`: `other`와 `work`가 같은 파일 같은 줄을 다르게 고쳤다. `conflict`, `detail`에 충돌 파일 이름, 원격 `main` 해시가 호출 전과 같다, `work`의 HEAD와 `git status --porcelain`이 호출 전과 같다, 임시 폴더가 남지 않고 `git worktree list`가 한 줄이다.
5b. `test_conflict_only_in_state_files_is_labeled`: 충돌 파일이 `targeted_skip.json` 하나뿐이면 `detail`이 `상태 파일만 충돌`로 시작한다. 상태 파일 밖 파일이 섞이면 `충돌:`로 시작한다. 둘 다 원격은 불변.
5c. `test_missing_git_identity_is_error_not_conflict`: `HOME`을 빈 폴더로 돌리고 `GIT_CONFIG_GLOBAL`/`GIT_AUTHOR_*`를 비워도 `git_try`의 `-c user.name/email` 덕에 cherry-pick이 성공한다(`pushed_after_sync`). 별도로 cherry-pick을 일부러 충돌 없이 실패시키는 경우(예: 사전 훅 `pre-commit`이 비0)는 `ls-files -u`가 비어 있어 `error`이지 `conflict`가 아니다.
5d. `test_git_timeout_is_error`: `git_try`에 아주 짧은 타임아웃을 주고 `sleep`하는 가짜 `git`(PATH 앞에 둔 스크립트, 또는 `subprocess.run`을 감싼 `TimeoutExpired` 발생)으로 `fetch`가 시간 초과하면 `sync_push`가 `error`, `detail`에 `시간 초과`. `GIT_TERMINAL_PROMPT=0`이 자식 프로세스 환경에 들어갔음을 환경을 기록하는 래퍼로 확인.
6. `test_race_retries_once`: 첫 push 직전에 `other`가 또 올린다(fetch 뒤 훅으로 재현하거나 `git_try`를 감싸 첫 push를 거절). 두 번째에 성공하고 원격에 B1, B2, A'가 다 있다. 재시도 판정이 stderr 글자를 안 읽음을 확인하려고 거절 메시지를 `"rejected"` 같은 임의 문구로 바꿔도 같은 결과.
7. `test_rejected_twice_is_rejected_not_pushed`: push가 항상 비0이면 `rejected`, 성공 문구 없음.
8. `test_fetch_failure_is_error_not_up_to_date`: 존재하지 않는 원격이면 `error`이고 `pushed`가 아니다.
9. `tests/test_reflect_commit_paths.py`에 추가:
   - `test_auto_commit_stages_state_files`: 임시 git 저장소에서 일곱 파일을 바꾸고 `commit_evidence` 호출 → 커밋에 일곱이 다 있고 `git status --porcelain -- data/`에 추적 파일 변경이 없다(이슈 끝조건 2).
   - `test_state_file_not_json_is_left_out_and_reported`: 한 파일을 `{"a":`로 잘라 둔다 → 그 파일은 커밋에 없고 나머지는 있다, 반환 문구에 파일 이름.
   - 기존 `_calls` 시험은 `subprocess.run` 목이 새 호출(`fetch`, `merge-base`)에 `returncode 0, stdout ""`을 돌려주게 되므로 깨질 수 있다. `merge-base --is-ancestor`는 0이면 "앞서지 않음"이라 `push` 경로로 간다. 구현자가 목을 새 호출에 맞게 고치고, 기존 단언(`data/sweeps.jsonl`, `data/dead_links.json`이 add에 있다, 커밋이 `--` 뒤 경로만 싣는다)은 그대로 둔다.
   - `commit_evidence` 시험은 `monkeypatch.setattr(reflect_daily, "ROOT", tmp_repo)`로 임시 저장소를 가리킨다(§4-5: `ROOT`는 호출 시점에 읽는다).
10. `test_slack_alert_paths`: 목 `Slack`으로 (가) 전송됨, (나) 설정 없음(`load_config` None), (다) 전송 예외, (라) `OPS_SINKS=off`. 반환 한 줄이 서로 다르다. 추가로 (마) `test_secret_in_stderr_is_redacted`: push stderr가 `fatal: unable to access 'https://user:<GitHub 토큰>@github.com/x/y.git/'`일 때 `PushResult.detail`, `commit_evidence` 반환 문구, 목 `Slack`이 받은 본문 어디에도 `<GitHub 토큰>`과 `user:`가 없고 `https://***@github.com`이 있다. `redact` 단위 시험은 `https://tok@host`, `http://u:p@host`, 자격 없는 URL(불변)을 박는다. (다)에서도 `commit_evidence`의 본문 `푸시 실패`가 반환에 남는다. `conflict`/`rejected`/`error`만 전송을 부르고 `pushed`는 안 부른다.
11. `tests/test_publish_brand_links.py`(있으면 거기에, 없으면 새로): 원격이 앞섰고 mono 작업 트리가 더러울 때 4e가 `pull --rebase`를 부르지 않고 `sync_push`로 올린다. `foreign` 가드가 걸리면 푸시하지 않고 슬랙 경고를 부른다.
12. `tests/test_check_routine.py`에 `pushed_after_sync` 문구 케이스를 더한다(기존 `:208`, `:248` 부근 케이스 옆. 번호 대신 `커밋·푸시했다`/`푸시 실패`를 쓰는 기존 케이스를 문구로 찾는다).
    - `test_pushed_after_sync_phrase_is_read_as_done`: `commit_evidence`가 `pushed_after_sync`로 돌려준 실제 문구를 보고서에 넣어 `check_routine`이 완료로 읽는다(`^커밋·푸시했다` 정규식에 걸림).
    - `test_push_failure_phrases_are_suspect`: `conflict`/`rejected`/`error`(미푸시 커밋 가드 포함) 문구 각각이 `푸시 실패`를 포함하고 8단계 구획에서 `check_routine`이 FAIL이 아니라 SUSPECT와 `저장소 커밋·푸시 실패`를 낸다.
    - `test_sync_success_phrases_are_not_suspect`: 8단계 구획에 `pushed_after_sync` 문구와 §4-4 경고를 넣으면 PASS다. 어느 `commit_note`에도 `올리지 않는다`가 없다.
    - `test_4e_sync_phrases`: 4e 구획에 `pushed_after_sync` 출력이면 PASS, 각 실패 출력이면 SUSPECT(`^\[fail\]`).
    - 문구 불변 목록에 세 정규식(`^(커밋·푸시했다|brands\.yml에 바뀐 것이 없다)`, `푸시 실패|저장소 반영 실패`, `올리지 않는다`)을 주석이 아니라 이 시험의 상수로 박는다. 문구는 `git_sync`/`reflect_daily`/`publish_brand_links`가 실제로 만드는 값을 써서 넣는다(손으로 베낀 문자열이 아니다). 문구를 바꾸는 사람은 시험이 먼저 막는다.
13. 기존 테스트 전부 통과. 점검 명령은 `docs/HARNESS.md` §11(CI가 로컬보다 넓다: 별칭표 없이 도는 마지막 줄까지).

**병합 전 실제 시험(사람, 미확인으로 PR에 적는다)**: `AGENTS.md` 규칙(사용자 2026-10-15)에 따라 예약 시각을 피해 8단계와 4e만 `--skip`으로 골라 돌린다. 원격에 다른 세션이 커밋을 올린 상태와 더러운 상태 파일이 있는 상태를 일부러 만든다. 확인할 것: 보고서 `## 저장소`에 `원격이 앞서 있어 … 옮겨 올렸다`, 슬랙이 안 뜸, `git status`가 깨끗, 로컬 `main`과 `origin/main` 해시가 같다. 슬랙은 일부러 push를 막은 상태(예: 읽기 전용 원격)로 한 번 띄워 본다.

## 9. 미확인, 위험, 열린 질문

- **질문 1: 명령 차단 훅과 `reset --keep`.** §4-4의 미확인. 훅이 막으면 로컬 `main`을 원격에 맞추는 대안은 둘이다. (가) 사람이 하루 한 번 `git reset --keep origin/main`(수동). (나) 증거 커밋을 로컬 `main`에 안 만들고 임시 작업 폴더에서만 만들고, 로컬은 `git fetch` 뒤 `merge --ff-only`. (나)는 상태 파일이 더러운 트리와 충돌할 수 있어 구조가 더 달라진다. 사용자 판단이 필요하면 구현자가 질문으로 올린다.
- **질문 2: 같은 실패의 반복 슬랙.** 막힌 날마다 한 통이 온다. 하루 한 번으로 충분한지, 같은 사유는 한 번만 보낼지 사용자가 정한다. 이번에는 매번 보낸다.
- **질문 3: `targeted_skip.json`에 사람의 미커밋 편집이 있을 때.** 증거 커밋에 같이 올리면 사람이 편집 중이던 값이 올라간다. `scripts/targeted_skip.py remove`는 파일만 고치고 커밋은 안 한다. 올라가도 되는지(기록에는 도움이 된다) 사용자가 확인한다. 이번 설계는 올리는 쪽이다.
- **미확인 1: 윈도 `git worktree`와 임시 폴더.** 수집 PC는 윈도다. `tempfile.mkdtemp` 경로 길이와 `worktree remove --force`의 잠긴 파일 처리는 이 러너(리눅스)에서 시험하지 못한다. 병합 뒤 첫 수집에서 `git worktree list`가 한 줄인지 사람이 본다.
- **확인됨 2: 문구를 읽는 코드.** `check_routine.py`가 4e 구획의 줄 머리 `커밋·푸시했다`를 완료로, `[fail]`을 SUSPECT로, 8단계 구획의 `푸시 실패|저장소 반영 실패`를 SUSPECT로, `올리지 않는다`를 FAIL로 읽는다(§3). 문구 규칙과 시험은 §3, §8 시험 12.
- **위험 3: 상태 파일 병합 충돌.** 일곱 JSON은 줄 단위로 안 합쳐진다. 원격에서 같은 파일을 바꾸는 주체가 있으면(**추정, 확인 안 됨**) 거의 매번 `conflict`로 멈추고 매일 슬랙이 운다. 방침은 멈춤 유지와 사유 구분(§5-2b).
- **질문 4: 상태 파일만 충돌이 반복되면.** 반복되면 일곱 파일을 증거 커밋에서 빼거나 원격 수정 주체를 끊는 후속이 필요하다. 이번에는 멈추고 알린다.
- **구현 첫 단계(승인 조건):** `command-guard.py`를 읽어 `reset --keep`이 막히는지 본다. 막으면 4-4를 멈추고 질문 1로 돌려보낸다(§4-4).
- **줄 번호는 이 브랜치 기준(`fe0b893` 위)으로 확인했다.** `ROUTINE-SPEC.md:302`(4e "작업 트리에 남의 미커밋 변경이 있으면 받지 않는다"), `:519`(8단계 "저장소 반영"), `HARNESS.md:750`(명령 차단 훅 목록), `reflect_daily.py:473-476,490,519`, `check_routine.py:226,227,349,352,356`, `publish_brand_links.py:72-91`이 문서가 말한 줄과 맞는다. 구현 시점에 main이 움직였을 수 있으니 구현자는 번호 대신 괄호 안 문구로 찾는다.
- **미확인 3: 일곱 밖에 바뀌는 추적 파일**과 `data/daily/`, `history.json`의 추적 여부(§5).
- **위험 1: 해시 변경.** `pushed_after_sync`이면 원격 커밋 해시가 로컬에서 만든 것과 다르다. 보고서의 해시 언급(있다면)이 어긋난다. 보고서에는 원격 해시를 적는다.
- **위험 2: 커밋 순서.** 임시 폴더에 `cherry-pick`한 커밋은 원격의 다른 커밋 뒤에 선다. 원장 행의 시각은 변하지 않으므로 append-only 의미는 유지된다(`data/log.jsonl`은 줄 단위 추가라 자동 병합이 되고, 같은 줄을 겹쳐 고치면 충돌로 멈춘다. 멈추지 합치지 않는다).
- **범위 밖**: 원격 변경의 실시간 알림, 병합 커밋 `565600d`의 이력 정리, `data/` 밖의 추적 파일, 수집 단계의 쓰기 방식 변경(반쯤 쓴 파일 방지를 원자적 쓰기로 바꾸는 것은 후속).

## 10. 끝 조건

- `python -m pytest tests/test_git_sync.py tests/test_reflect_commit_paths.py -q` 통과, 이어 `docs/HARNESS.md` §11의 점검 명령 전부 통과.
- 원격이 앞서 있고 상태 파일이 더러운 임시 저장소에서 `commit_evidence`가 선형 이력으로 올리고 더러운 파일을 보존한다(시험 2).
- 푸시 실패(`conflict`/`rejected`/`error`)와 4e의 남의 커밋 가드가 슬랙을 부르고, 슬랙을 못 보낸 경우도 보고서 한 줄로 드러난다(시험 10, 11).
- 일곱 상태 파일이 증거 커밋에 들어가고 직후 `git status`에 그 파일들의 변경이 없다(시험 9).
- 변경 파일: `scripts/git_sync.py`(신설), `scripts/reflect_daily.py`, `scripts/publish_brand_links.py`, `docs/setup/ROUTINE-SPEC.md`(8단계 저장소 반영 줄과 4e "작업 트리에 남의 미커밋 변경이 있으면 받지 않는다" 줄. 문구로 찾는다), `tests/test_check_routine.py`, 테스트들. 원장 `data/log.jsonl`과 `.gitignore`는 건드리지 않는다. 기존 보고서 문구 `커밋·푸시했다(N개 파일).`, `커밋할 변경이 없다.`는 그대로.

## 변경 이력

- **2026-11-03 재설계**: 이슈 "결정" 열 항목을 반영했다. 부딪히면 이슈가 이긴다.
  1. §4-3 `cherry-pick <base>..<ours>`를 `<ours>^..<ours>`(커밋 하나)로 바꾸고, `sync_push`에 남의 미푸시 커밋 가드를 더했다(걸리면 `error`). 시험 1b.
  2. §3, §9: `check_routine`이 `커밋·푸시했다`(줄 머리)와 `푸시 실패`를 읽음을 확인으로 올렸다. 문구 불변 규칙과 시험 12(`pushed_after_sync` 문구 케이스).
  3. §4-1, §6: `redact`로 `scheme://<계정>@`를 가리고 슬랙과 보고서 `detail`(stderr 끝 400자)에 건다. 시험 10(마).
  4. §4-1: `git_try`에 타임아웃, `GIT_TERMINAL_PROMPT=0`, 시간 초과는 `error`. 시험 5d.
  5. §5-2b 신설: 상태 파일 병합 충돌은 멈춤 유지, 사유 문구 구분. §9 위험 3, 질문 4. 시험 5b.
  6. §4-1, §4-3: `-c user.name/-c user.email` 지정, 충돌과 설정 오류는 `ls-files -u` 유무로 구분. 시험 5c.
  7. §4-4, §9: `reset --keep` 차단 훅 확인을 구현 첫 단계와 승인 조건으로 못박음.
  8. §8 시험 1: 호출 기록 래퍼 또는 `git worktree list` 한 줄 확인으로 바꿈.
  9. §4-5, §8 시험 9: `commit_evidence`가 `ROOT`를 호출 시점에 읽는 규칙 추가.
  10. §3, §9, §10: 확인되지 않은 줄 번호를 문구로 찾도록 바꿈.
- **2026-11-03 재설계 2차**: 같은 결정을 코드와 다시 대조했다. 이슈에 새 권한자 댓글은 없다.
  - §3: `check_routine`이 읽는 자리를 단계별로 갈랐다. 4e 구획은 줄 머리 `커밋·푸시했다`와 `[fail]`, 8단계 구획은 `푸시 실패|저장소 반영 실패`(SUSPECT)와 `올리지 않는다`(FAIL)를 읽는다. 성공 문구와 §4-4 경고에 `푸시 실패`가 섞이면 안 되고, 어느 `commit_note`에도 `올리지 않는다`가 섞이면 안 된다(미푸시 커밋 가드 사유가 FAIL로 오분류될 자리).
  - §4-5: 4e 출력 줄 머리 규칙을 적었다.
  - §8 시험 12: 성공 문구가 SUSPECT가 아님, 4e 구획 판정, `올리지 않는다` 금지를 더했다. 문구는 실제 함수가 만든 값으로 넣는다.
  - §9: 이슈 결정 10이 추정이라 한 줄 번호(`ROUTINE-SPEC.md:302,:519`, `HARNESS.md:750` 등)를 이 브랜치에서 확인했다. 번호 대신 문구로 찾으라는 규칙은 유지한다.
- **2026-11-03 구현**:
  - `/approve-design` 댓글(nn98 2026-11-03)을 반영했다. 시험 12의 `test_pushed_after_sync_phrase_is_read_as_done`은 따로 두지 않고 `test_sync_success_phrases_are_not_suspect`(8단계 구획)와 `test_4e_sync_phrases`(4e 구획, `^커밋·푸시했다`)에 합쳤다. check_routine은 보고서가 아니라 실행 로그 구획을 읽는다.
  - §4-4 승인 조건 확인: claude-harness `hooks/command-guard.py`는 강제 push, `--autostash`, 맨 `git stash`/`stash pop`만 막는다. `reset --keep`, `worktree remove --force`, `cherry-pick`은 막지 않는다. 4-4를 구현했다.
  - `STATE_FILES`는 `scripts/git_sync.py`에 두고 `reflect_daily`가 가져다 쓴다(충돌 사유 구분에 `git_sync`도 쓰므로 순환 import를 피했다). `reflect_daily.STATE_FILES`로도 읽힌다.
  - `alert_push_failure`에 `status` 인자를 더했다(복구 안내를 상태별로 가르는 데 쓴다). §4-4 경고는 `status="warn"`으로 보낸다.
  - 시험 5c의 "충돌 없는 cherry-pick 실패"는 사전 훅 대신 빈 커밋(원격에 같은 변경이 이미 있음)으로 재현했다. cherry-pick은 `pre-commit` 훅을 돌리지 않는다.
  - §5-3 확인: `git ls-files data/daily history.json`은 빈 결과(추적 밖). `.gitignore`에 두 경로 줄은 없다. 수집 PC에서 `??`로 보이는지는 확인하지 못했다(이 작업 폴더에는 없다).
- **2026-11-03 PR #126 리뷰 반영**(nn98 `/reflect`):
  1. 미푸시 커밋 가드: 제목이 `data: 자동 반영`(`AUTO_PREFIX`)으로 시작하는 미푸시 커밋은 지난 실행이 못 올린 우리 커밋으로 보고 같이 옮긴다(`cherry-pick <가장 옛것>^..<ours>`). 남의 커밋이 하나라도 섞이면 전처럼 `error`이고 사유에는 남의 것만 적는다. 같이 올린 커밋은 `PushResult.carried`로 돌려주고 8단계 보고서가 `지난 자동 반영 커밋 N개도 같이 올렸다`로 적는다. §4-3의 "커밋 하나" 결정을 이 경우만 넓혔다. 4e 커밋 제목(`data: 브랜드 링크`)은 해당하지 않는다.
  2. `worktree`, `cherry-pick`도 `NET_TIMEOUT`(120초)을 쓴다.
  3. `status="warn"`은 제목 `[자동 반영 푸시 경고]`, 안내 `git reset --keep origin/main`.
  4. `redact`는 `scheme://` 뒤 `[^@\s]+@`를 가린다(비밀번호에 `/`가 있어도).
