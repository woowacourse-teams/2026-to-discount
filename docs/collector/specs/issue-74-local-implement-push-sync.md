<!-- 원본: tracker docs/specs/issue-74-local-implement-push-sync.md — 여기서 고치지 않는다 -->
# 이슈 #74: 로컬 구현 push 전에 원격 변경을 합치고 실패를 로그에 드러내기 (설계)

영역: `export` (폰 불필요). 코드는 이 문서를 승인한 뒤 구현자가 고친다. 고치는 파일은 `scripts/local_implement.py`와 `tests/test_local_implement.py`, 문서 한 줄(`docs/workflow/HANDOFF.md`)이다.

## 1. 요약

`run`은 시작할 때 한 번만 fetch한다(`local_implement.py:144`). 세션이 도는 동안 설계 세션이 같은 브랜치에 커밋을 push하면 `git push`가 `fetch first`로 거절되고, `sh()`가 `RuntimeError`를 올려 PR ready 전환(`:188`)과 본문 갱신(`:189`)이 통째로 건너뛰어진다. 구현 커밋은 로컬에만 남는다(2026-10-29 tracker #53).

조용히 잃는 자리가 둘이다.

- push 거절 뒤 `main`의 `except Exception`이 `오류:` 줄과 traceback을 남기지만, `run` 종료 줄(`종료: 코드 N`)은 남지 않는다. 이슈 #28이 정한 "run은 종료 줄이 항상 있다"가 이 길에서는 깨져 있다. ready와 본문 갱신을 건너뛴 사실도 어디에도 없다.
- 거절 뒤 이어서 끝내는 길이 없다. 사람이 손으로 합치고 push하고 `update_pr_text`를 직접 불러야 했다.

이슈 요구 셋에 대한 결정:

1. **push 전에 fetch하고 뒤처졌으면 로컬 커밋을 원격 위로 옮긴다.** `git rebase --onto origin/<브랜치> <start>`. 충돌이면 rebase를 중단(abort)하고 push하지 않으며 충돌 파일과 복구 방법을 로그와 이슈 댓글에 남긴다. 자동 해결은 하지 않는다.
2. **push가 실패하면 ready 전환과 본문 갱신을 건너뛴 사실을 로그에 남기고 종료 줄은 코드 1로 찍는다.**
3. **설계 재실행과 구현의 겹침 방지: 이번에는 막지 않는다. 합치기로 감당하고 막기는 후속(§8 질문 1).** 이유는 §6.

## 2. 설계자의 비판: 이슈 안을 그대로 받지 않은 곳

- **"합쳤다 = 안전하다"가 아니다.** 설계 문서가 구현 중에 바뀌었다면 rebase가 충돌 없이 끝나도 구현은 낡은 설계를 보고 만든 것이다. 충돌 없음은 텍스트 겹침이 없다는 뜻일 뿐이다(`AGENTS.md` "먼저 알 것" 1번: 통과가 곧 관측이 아니다). 그래서 합친 경우 원격에서 들어온 파일 목록을 로그에 남기고, 그 안에 `docs/specs/`가 있으면 PR 본문 갱신 전에 **경고를 이슈 댓글로 남긴다**(양성 신호, §5). 자동으로 막지는 않는다. 사람이 PR을 ready로 보기 전에 알 수 있게 한다.
- **cherry-pick보다 rebase.** 로컬 커밋 수가 여럿일 수 있고, `--onto origin/<브랜치> <start>`는 `start..HEAD`를 순서대로 옮긴다. cherry-pick은 커밋 목록을 직접 만들어야 하고 실패 중간 상태가 더 어지럽다. 둘 다 충돌이면 `abort`로 원상 복구할 수 있어야 하는데 rebase는 `git rebase --abort` 한 줄이다.
- **merge는 쓰지 않는다.** 설계 PR 브랜치에 병합 커밋이 끼면 이력이 갈라진 사실이 남지만, 이 브랜치는 `feat/<이슈>-*` 한 줄짜리라 선형이 낫다. 단 push는 로컬 커밋 해시가 바뀌므로 인계 댓글의 커밋 해시가 달라질 수 있다(§8 위험 1).
- **`push --force`는 쓰지 않는다.** 원격 커밋을 지우는 길이다.

## 3. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 `local_implement`, 로컬 구현, push 단계를 가리키는 묶음을 찾았으나 없다(`local_implement` 검색 결과 없음). 없다고 말하고 시작한다.

같은 종류로 점검한 자리:

- 로그 형식. `logs/local_implement.log`를 파싱하는 코드는 없다(#28 설계 §3). 기존 줄(`맡음, 터미널 띄움`, `push {sha7}, PR {n}`)은 바꾸지 않는다. 새 줄은 같은 접두 `{key} #{n}`을 쓴다.
- 진입점 `poll`, `run <key> <n>`과 예약 작업 `beggars-local-implement` 명령줄. 바꾸지 않는다.
- 클라우드 `design-session.yml`(정본 mono `wf-design.yml`). `labeled` 이벤트로 도는 재설계가 겹침의 원인이다. 이 저장소에서 고칠 수 없는 정본이라 이번 변경에 넣지 않는다(§6).
- `implement-session.yml`과 `local` 라벨 흐름. 바꾸지 않는다. `/approve-design` 흐름과 사람 관문도 그대로.
- mono 쪽 `run`(`key == "mono"`). 같은 함수를 쓰므로 같이 고쳐진다. mono 저장소의 브랜치는 `origin`이 mono 클론이라 `cwd=wt` 기준 동작이 같다. 시험은 임시 git 저장소로 하므로 키와 무관하다.
- 원장(`data/log.jsonl`). 건드리지 않는다. append-only 문제 없음. 수집 예약과 폰도 건드리지 않는다(`collect_trial.ps1` 불필요).

## 4. 변경

모두 `scripts/local_implement.py`. `run` 안의 push 부분(`:178-:192`)을 함수로 빼서 테스트가 부를 수 있게 한다.

### 4-1. 실패해도 예외를 올리지 않는 git 호출

`sh()`는 비0이면 `RuntimeError`다. rebase 충돌과 push 거절은 정상 분기여야 하므로 종료 코드를 돌려주는 얇은 함수를 둔다.

```
def git_try(*args, cwd):
    """(종료 코드, stdout, stderr). 실패해도 올리지 않는다. sh()와 같은 인코딩 설정."""
```

`sh()`와 같은 `subprocess.run` 인자(`encoding="utf-8", errors="replace"`, `NO_WINDOW`)를 쓴다. `sh`를 이 함수 위에 얹어 중복을 없애도 되지만, `sh`의 `gh` 타임아웃 분기를 건드리지 않는다.

### 4-2. `sync_and_push(wt, branch, start, key, n)`

```
for attempt in (1, 2):
    sh("git", "fetch", "-q", "origin", branch, cwd=wt)
    remote = sh("git", "rev-parse", f"origin/{branch}", cwd=wt)
    if 로컬 HEAD가 remote의 후손이다(git merge-base --is-ancestor remote HEAD):
        pass                                   # 앞서 있음. 합칠 것 없음
    else:
        합친다(4-3)
    code, _, err = git_try("push", "origin", f"HEAD:refs/heads/{branch}", cwd=wt)
    if code == 0: 성공 -> (head, 합친 파일 목록)
    if "fetch first" 또는 "non-fast-forward" 가 err에 있고 attempt == 1: 다시 돈다   # fetch와 push 사이에 또 push됨
    else: 4-5(push 실패)
```

- 반복은 두 번까지. fetch와 push 사이 틈에 또 push되는 경쟁을 한 번 더 받는다. 두 번째도 거절이면 실패로 끝낸다.
- 판정을 `err` 글자에 의존하는 곳은 "재시도할지"뿐이다. 글자가 달라져도(git 버전) 재시도를 못 할 뿐 **push 실패를 성공으로 보는 일은 없다**(종료 코드로만 성공을 판정). 글자 대신 구조로: 거절이면 재시도 전에 `merge-base --is-ancestor`가 다시 거짓인지 보는 쪽이 낫다. 구현자는 `err` 문자열 검사를 쓰지 않고 "다시 fetch해 보니 뒤처졌는가"로 재시도를 정한다(`AGENTS.md` "먼저 알 것" 2번).

### 4-3. 합치기

```
git rebase --onto origin/<branch> <start> 
```

- `start`는 시작 시점 HEAD(`:150`)다. 로컬 커밋은 `start..HEAD`. 세션이 `start`보다 뒤의 원격 커밋을 이미 가진 상태가 아니므로(작업 폴더는 시작 때 `origin/<branch>`에서 만든다) 옮길 범위가 정확하다.
- 단, 작업 폴더가 **이미 있어 재사용된** 경우(`if not wt.exists()` 가 거짓, 이전 실행에서 남은 폴더) `start`가 `origin/<branch>`와 다를 수 있다. 이 경우도 `--onto`는 `start..HEAD`만 옮기므로 맞다. 시험으로 박는다(§7 시험 7).
- 합친 뒤 `git diff --name-only <start>..origin/<branch>`로 원격에서 들어온 파일 목록(`merged_files`)을 얻는다. 합침이 일어났다는 양성 신호이자 4-6의 입력이다.

### 4-4. 충돌

`rebase`가 비0이면:

1. `git diff --name-only --diff-filter=U`로 충돌 파일 목록을 **abort 전에** 읽는다. abort하면 사라진다.
2. `git rebase --abort`. 로컬 커밋은 원래 해시 그대로 남는다. abort도 실패하면(비0) 그 사실을 로그와 댓글에 같이 적는다. 이때는 작업 폴더가 rebase 중간 상태라는 뜻이므로 복구 안내가 달라진다(`git rebase --abort`를 사람이 직접).
3. 로그 한 줄: `{key} #{n} 합치기 충돌, push하지 않음: 파일 a, b. 로컬 커밋 {sha7}은 {wt}에 남음`.
4. 이슈 댓글(§4-7)에 복구 방법.
5. `sys.exit(f"합치기 충돌: {파일들}")`. `main`의 `except SystemExit`가 `종료: 코드 1, 합치기 충돌: …`을 남긴다.

push도, ready도, 본문 갱신도 하지 않는다.

### 4-5. push 실패 (거절 반복, 권한, 네트워크, 훅)

`git push`가 비0이고 재시도로도 못 끝나면:

- 로그 한 줄: `{key} #{n} push 실패, PR ready 전환과 본문 갱신을 건너뜀: {stderr 첫 줄}. 로컬 커밋 {sha7}은 {wt}에 남음`.
- 이슈 댓글(§4-7).
- `sys.exit(f"push 실패: {stderr 첫 줄}")` → `종료: 코드 1, push 실패: …`.

지금은 `RuntimeError`로 `오류:` + traceback만 나가고 종료 줄이 없다. `sys.exit`로 바꾸면 `종료: 코드 N` 줄이 항상 남는다(#28의 불변식 유지). traceback은 사라지지만 push 실패의 원인은 stderr 첫 줄이 담는다.

`run` 안의 다른 `sh()` 실패(`gh pr list`, `gh pr ready`, `gh pr edit`)는 이번에 고치지 않는다. 대신 4-6.

### 4-6. push는 됐는데 ready나 본문 갱신이 실패

push 이후 `gh pr ready`, `update_pr_text`가 `RuntimeError`를 올리면 지금은 `오류:`만 남고 "push는 됐다"는 사실이 로그 어디에도 없다(`push {sha7}` 줄은 이 뒤에 있다). 순서를 바꿔 **push 직후 즉시 `push {sha7}, PR …` 줄을 남기지 않고**, 대신 두 단계를 각각 `try/except Exception`으로 감싸 실패하면 다음 줄을 남기고 계속한다.

- `{key} #{n} PR ready 전환 실패(push는 됨 {sha7}): {오류 첫 줄}`
- `{key} #{n} PR 본문 갱신 실패(push는 됨 {sha7}): {오류 첫 줄}`

끝에 하나라도 실패했으면 `sys.exit("push는 됐으나 PR ready 또는 본문 갱신 실패")`로 코드 1. 둘 다 성공했을 때만 코드 0, 사유 `push 완료 {sha7}, PR {n}`. 기존 성공 줄 형식은 바꾸지 않는다.

PR이 없을 때(`pr` 빈 문자열)는 기존대로 건너뛰되 사유에 `PR 없음`이 남는다(기존 동작).

### 4-7. 이슈 댓글

`gh issue comment {n} -R {repo} --body-file {파일}`. 파일은 `WT_BASE / f"wt-impl-{key}-{n}.comment.md"`에 BOM 없는 UTF-8, `newline="\n"`으로 쓴다(`inp`와 같은 위치와 방식). 첫 줄은 `인계:`로 시작한다. 구현자 세션의 인계 댓글과 같은 계열이라 사람이 같은 자리에서 읽는다.

종류별 본문:

- **충돌:** 첫 줄 `인계: 로컬 구현 합치기 충돌, push하지 않음`. 충돌 파일, 로컬 작업 폴더 경로, 로컬 커밋 해시, 복구 방법.
  ```
  cd <wt>
  git fetch origin <branch>
  git rebase --onto origin/<branch> <start>   # 충돌 파일을 고치고 git add, git rebase --continue
  git push origin HEAD:refs/heads/<branch>
  gh pr ready <PR>   # 그리고 PR 본문 갱신: 세션이 쓴 <upd>/<ttl> 가 폴더 옆에 남아 있다
  ```
  `<upd>`와 `<ttl>` 경로를 댓글에 적는다. 파일이 아직 있는지 로그가 확인해 주지는 않는다(세션이 안 썼을 수 있음). 없으면 없다고 쓴다.
- **push 실패:** 첫 줄 `인계: 로컬 구현 push 실패`. stderr 첫 세 줄, 같은 복구 방법에서 합치기 줄을 뺀 것.
- **설계 문서도 바뀜(§2):** 합쳐서 push까지 성공했을 때, `merged_files`에 `docs/specs/`가 있으면 첫 줄 `인계: 구현 중 설계 문서가 바뀌어 합침. 구현이 바뀐 설계를 반영했는지 확인 필요`. 파일 목록. PR 본문 갱신은 그대로 진행한다.

댓글 게시가 실패하면(`gh` 오류) 로그에 `이슈 댓글 실패: …`를 남기고 **원래 종료 흐름을 덮지 않는다.** 댓글이 안 가도 로그에는 충돌 사실이 이미 있다. 댓글 실패로 충돌 종료가 `RuntimeError` 종료로 바뀌면 코드 1의 이유가 흐려진다. #28 설계가 `log()` 실패는 시끄럽게 죽게 둔 것과 다른 선택이다. 이유: 로그는 정본이고 댓글은 알림이다.

### 4-8. `run`의 흐름

```
...  (세션 종료, 브랜치 확인, head == start 면 "새 커밋 없음")
head, merged = sync_and_push(...)          # 충돌, push 실패는 여기서 sys.exit
pr = ...
ready, 본문 갱신 (4-6)
log(f"{label} push {head[:7]}, PR {pr or '없음'}" + (f", 원격 {len(merged)}개 파일 합침" if merged else ""))
```

기존 줄 앞부분 `push {sha7}, PR {n}`은 그대로 두고 합침이 있었을 때만 꼬리를 붙인다. 합친 경우 `head`는 rebase 뒤 해시라 세션이 인계 댓글에 적은 해시와 다르다. 꼬리에 `(세션 마지막 커밋 {옛 sha7})`를 같이 적어 두 해시를 이어 준다.

## 5. "없다 / 0 / 통과"의 양성 신호

| 자리 | 조용히 틀리는 경우 | 양성 신호 |
| --- | --- | --- |
| 종료 코드 0 | push가 됐는지, 합치기가 건너뛰어졌는지, ready가 됐는지 | 종료 줄 사유가 `push 완료 {sha7}, PR {n}`일 때만 0. push 실패, 충돌, ready·본문 실패는 모두 코드 1과 사유. 시험이 "코드 0이면 원격 `refs/heads/<branch>`가 로컬 HEAD와 같다"를 실제 git으로 확인 |
| 합침이 없었다 | 원격에 새 커밋이 없어서인지, fetch가 실패해서 못 본 것인지 | fetch는 `sh()`라 실패하면 예외(코드 1)로 끝난다. 합침 없음의 근거는 fetch 성공 **뒤** `merge-base --is-ancestor`가 참인 것. 시험이 fetch를 실패시켜 종료 줄이 코드 1임을 박는다 |
| 충돌 없음 | 설계 문서가 바뀌었는데 텍스트가 안 겹쳤을 뿐 | `merged_files` 목록을 로그에 남기고 `docs/specs/` 포함 시 §4-7 경고 댓글 |
| 충돌 파일 목록이 빈 줄 | `--diff-filter=U`가 비었는데 rebase가 실패(예: 빈 커밋, 훅, 작업 트리 더러움) | 파일 목록이 비어도 `합치기 실패`로 같은 길을 타고 사유에 rebase stderr 첫 줄을 붙인다. "충돌 파일 0개"를 "충돌 없음"으로 읽지 않는다 |
| rebase abort 뒤 | abort가 됐는지 | abort의 종료 코드를 확인하고, 뒤에 `git status --porcelain`이 아니라 `.git/rebase-merge`·`rebase-apply` 존재 여부는 보지 않는다(워크트리의 git 디렉터리가 `.git` 파일이라 경로가 다름). 대신 `git rev-parse HEAD`가 합치기 전 해시와 같은지 비교해 로그에 적는다. 같으면 원상 복구 |
| 이슈 댓글 | 댓글이 갔는지 | 성공은 `gh` 종료 코드, 실패는 로그에 `이슈 댓글 실패` 줄 |

## 6. 겹침 방지: 이번에는 막지 않는다

이슈가 든 예: (가) 구현이 도는 동안 `ready` 재부착 무시, (나) 구현 시작 때 설계 브랜치 고정.

- (가)는 `design-session.yml`이 부르는 mono 정본 `wf-design.yml`에 `local` 라벨 검사를 넣어야 한다. 이 저장소 파일(`design-session.yml`)은 호출만 하는 얇은 파일이라 조건을 달 수 있지만(`if: !contains(github.event.issue.labels.*.name, 'local')`), 이 트리거는 `labeled`이고 **재설계 트리거인 `ready`를 떼었다 다시 다는 흐름은 이슈 라벨이 아니라 PR 상태**다. 어떤 이벤트가 재설계를 부르는지 이 세션이 확인하지 못했다(**미확인**, §8 질문 1). 확인 없이 `if:`를 넣으면 정상 설계까지 막을 수 있다.
- (나)는 구현 시작 때 브랜치를 고정(보호)하는 것인데, 설계 세션은 같은 `feat/<이슈>-*`에 push하는 구조다. 고정하면 재설계가 push에서 거절되어 설계가 **조용히 사라진다**. 이 프로젝트의 실패 방식과 같은 방향이다. 하지 않는다.
- 합치기가 있으면 겹쳐도 둘 다 보존된다. 막는 쪽은 한쪽을 버리거나 보류하는 쪽이라 위험이 더 크다.

결정: 이번 PR은 합치기와 가시화만 한다. 겹침 방지는 `local` 라벨을 보고 재설계를 보류하는 방식을 후속으로 검토한다(PR 본문 후속 조치, 원인 이벤트 확인이 먼저).

## 7. 테스트 (결론은 테스트로 박는다)

`tests/test_local_implement.py`에 추가한다. 기존 `logfile` 픽스처를 쓴다. 가능한 곳은 **실제 git**을 임시 폴더에서 쓴다. 목으로 막으면 "rebase가 실제로 이력을 옮겼다"를 못 박는다.

공통 도우미 `make_repo(tmp_path)`: 베어 `origin.git`, 작업 클론 `wt`(브랜치 `feat/74-x`, 커밋 `base`), 다른 클론 `other`(원격에 먼저 push하는 쪽). git 사용자 설정은 임시 저장소 `-c user.name=t -c user.email=t@t`로 준다. `li.sh`와 `li.git_try`는 실제를 쓴다(`gh` 호출만 목).

이슈 완료 조건 대응:

1. `test_sync_rebases_local_commits_onto_remote`: `wt`가 `start`에서 커밋 A를 만들고, `other`가 파일 `docs/specs/x.md`에 커밋 B를 push. `sync_and_push` 뒤 원격 브랜치 로그가 `base, B, A'`(A는 해시가 바뀐 A')이고, 원격 HEAD == 로컬 HEAD이다. 반환된 `merged_files`에 `docs/specs/x.md`.
2. `test_sync_conflict_stops_without_push`: 같은 파일 같은 줄을 `other`와 `wt`가 다르게 고친다. `SystemExit`가 오르고(`str`에 `합치기 충돌`과 파일 이름), **원격 브랜치 해시가 호출 전과 같고**, `wt`의 HEAD가 합치기 전 해시와 같다(abort로 원상 복구), `git status --porcelain`이 비었다. 로그에 충돌 줄과 파일 이름. 댓글 호출 목에 `인계:`로 시작하는 본문과 충돌 파일, 복구 명령(`rebase --onto`)이 있다.
3. `test_run_conflict_skips_ready_and_logs_exit_1`: `main(["x","run",...])`로 위 충돌을 `run` 전체에서 재현하기엔 준비가 과하다. 대신 `sync_and_push`를 충돌로 바꿔 `main`이 `종료: 코드 1, 합치기 충돌: …` 한 줄을 남기고 `gh pr ready`가 불리지 않았음을 확인한다. `run`의 순서(합치기가 ready보다 앞)를 `inspect`로 박지 않고, `gh` 호출 기록 리스트의 순서로 박는다(시험 4와 같은 기록 사용).
4. `test_run_success_after_remote_advance_readies_and_updates_pr`: 원격이 앞선 상황에서 `run`의 push 이후 부분을 부르면 `gh` 호출 기록에 `pr ready`가 있고, 그 뒤 `pr edit --body-file`, `pr edit --title`이 이 순서로 있다. 종료 줄 `코드 0, push 완료 {sha7}`. `sha7`은 rebase 뒤 해시.
5. `test_push_rejected_twice_logs_skip_and_exit_1`: `git_try`가 push에 대해 항상 `(1, "", "! [rejected] (fetch first)")`를 돌려주게 한다. 로그에 `PR ready 전환과 본문 갱신을 건너뜀`이 있고, `종료: 코드 1, push 실패`가 한 줄, `gh pr ready` 호출은 없다. 종료 줄에 `코드 0`이 **없다**.
6. `test_push_race_retries_once`: 첫 push만 거절하고 그 사이에 `other`가 또 push한 상황. 두 번째에 성공하고 원격에 B1, B2, A'가 모두 있다.
7. `test_reused_worktree_start_differs`: `wt`가 재사용되어 `start`가 원격 HEAD와 다를 때도 `start..HEAD`의 커밋만 옮겨진다(원격에 이미 있는 커밋을 중복해 옮기지 않음).
8. `test_remote_not_advanced_pushes_without_rebase`: 원격이 그대로면 `rebase`를 부르지 않는다(`git_try` 호출 기록에 `rebase` 없음). 기존 동작과 같다.
9. `test_ready_failure_after_push_is_logged_and_exit_1`: push 성공, `gh pr ready`가 `RuntimeError`. 로그에 `PR ready 전환 실패(push는 됨` 줄, 종료 줄 `코드 1`. 이전에는 이 사실이 로그에 없었다.
10. `test_conflict_comment_failure_keeps_exit_reason`: 댓글 `gh`가 `RuntimeError`여도 종료 줄은 `합치기 충돌` 사유의 코드 1이고 로그에 `이슈 댓글 실패`가 있다.
11. `test_spec_changed_warning_comment`: 합침 성공이고 `merged_files`에 `docs/specs/`가 있으면 경고 댓글(`인계:`로 시작)이 한 번, 없으면 0번.
12. 기존 테스트 전부 통과. 특히 `test_run_returns_reason_and_logs_zero_exit`, `test_run_logs_exit_line_on_sys_exit_string`.

시험 명령: `python -m pytest tests/test_local_implement.py -q`. 이 파일은 `non_gate` 묶음이므로 `python -m pytest tests -q -m "non_gate and not ci_only"`도 한 번 돌린다. 나머지 점검 명령은 `docs/HARNESS.md` §11. 이 러너에서 `git`은 쓸 수 있으나 `wt`와 `mklink`는 못 쓴다(윈도 전용). `run` 전체 실행은 못 한다.

## 8. 미확인, 위험, 열린 질문

- **질문 1: 재설계를 부르는 이벤트.** 이슈 본문은 `ready`를 떼었다 다시 달아 재설계했다고 한다. `design-session.yml`의 트리거는 이슈 `labeled`뿐이므로 `ready`는 **이슈 라벨**일 가능성이 높다(PR 상태가 아니라). 그렇다면 `if:` 조건으로 `local` 라벨이 있을 때 재설계를 보류하는 길이 열린다. 사용자 판단이 필요하다. 보류하면 설계 변경이 PR에 반영되지 않는 것을 감수하는 것이므로 §6의 "조용히 사라진다"와 같은 위험이 있어, 보류 시에는 이슈에 보류했다는 댓글이 같이 남아야 한다. 이번 PR에서 답하지 않는다.
- **미확인 1: 실제 윈도 push.** push 훅이 cp949로 출력할 수 있다(#24). `git_try`도 `encoding="utf-8", errors="replace"`를 쓰지만 실제 훅과의 조합은 클라우드에서 못 시험한다. 병합 뒤 다음 로컬 구현에서 사람이 로그를 확인한다.
- **미확인 2: 세션이 쓴 PR 본문 파일.** 충돌 후 복구 때 `<upd>`/`<ttl>`이 남아 있다는 가정은 확인하지 못했다(세션이 쓰지 않았을 수 있음). 댓글에 파일 존재 여부를 적는다.
- **위험 1: 해시 변경.** rebase로 로컬 커밋 해시가 바뀐다. 구현 세션이 인계 댓글에 적은 해시는 원격에 없다. 4-8의 로그 꼬리가 두 해시를 잇는다. 댓글을 고치지는 않는다.
- **위험 2: 두 번째 rebase 충돌.** 재시도 루프에서 두 번째 fetch 뒤 rebase가 충돌하면 §4-4로 간다. 첫 번째 rebase 결과가 이미 로컬 HEAD라 abort 후 복원 지점은 첫 rebase 뒤 상태다. 시험 6에서 확인한다.
- **위험 3: 작업 폴더에 남은 로컬 커밋.** 실패해도 `wt-impl-<키>-<이슈>`가 남는다. 다음 `run`은 `if not wt.exists()` 때문에 폴더를 재사용하며 `start`가 달라진다(시험 7). 재사용된 폴더의 로컬 커밋이 다음 실행의 `start` 전에 있어 **옮겨지지 않는다.** 이 경우 `head == start`면 "새 커밋 없음"으로 끝나므로, 실패한 실행의 커밋이 조용히 남을 수 있다. 이번에 고치지 않고 실패 로그 줄이 `{wt}에 남음`이라고 알리는 데서 멈춘다. 이후 `run`이 시작할 때 `origin/<branch>`보다 앞선 로컬 커밋이 있는 폴더를 만나면 경고하는 것은 후속으로 둔다(PR 본문 후속 조치).
- 범위 밖: 구현 세션 도중 원격 변경을 알려 주는 것(폴링), `poll`의 `local` 라벨 부작용 순서(#28 설계 §4-3).

## 9. 끝 조건

- `python -m pytest tests/test_local_implement.py -q` 통과, `python -m pytest tests -q -m "non_gate and not ci_only"` 통과.
- 변경 파일은 `scripts/local_implement.py`, `tests/test_local_implement.py`, `docs/workflow/HANDOFF.md`뿐. `HANDOFF.md:16` 끝에 "push 전에 원격을 합치고(충돌이면 중단하고 이슈 댓글), 실패는 `종료: 코드 1, <사유>`로 남는다" 한 구절만 더한다.
- 기존 로그 줄(`맡음, 터미널 띄움`, `push {sha7}, PR {n}`의 앞부분)과 `poll`/`run` 명령줄 인자는 그대로.
- 병합 뒤 사람이 확인할 것(PR 본문 **미확인**): 다음 구현 창이 끝난 뒤 `logs/local_implement.log`에 `종료:` 줄이 있고, 원격이 앞선 경우 합침 꼬리가 있는지.
