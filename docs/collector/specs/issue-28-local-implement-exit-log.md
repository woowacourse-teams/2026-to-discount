<!-- 원본: tracker docs/specs/issue-28-local-implement-exit-log.md — 여기서 고치지 않는다 -->
# 이슈 #28: 로컬 구현자의 종료 이유와 오류 위치를 로그에 남기기 (설계)

영역: `export` (폰 불필요). 코드는 이 문서를 승인한 뒤 구현자가 고친다. 고치는 파일은 `scripts/local_implement.py`와 `tests/test_local_implement.py`, 문서 한 줄(`docs/workflow/HANDOFF.md`)이다.

## 1. 요약

`logs/local_implement.log`에는 "맡음"과 "push" 두 성공 줄만 있다. 실패는 두 길로 조용히 사라진다.

- `run`이 `sys.exit("문자열")`로 끝나면 종료 코드 1이지만 `SystemExit`는 `Exception`이 아니라서 최상위 `except Exception`(`local_implement.py:134`)을 지나친다. 로그에 아무것도 남지 않는다. `run`이 `return`으로 끝나는 "새 커밋 없음"(`:121`)도 로그 없이 화면에만 찍힌다.
- `poll`이 예외로 죽으면 `오류: {e}` 한 줄만 남아 어느 줄에서 났는지 모른다.

이슈 요구 넷을 모두 받되, 아래 세 가지를 보탠다.

1. 오류 줄에 이슈 이름(`{key} #{n}`)을 붙이고, `poll`은 이슈 하나가 죽어도 같은 사이클의 다른 이슈를 계속 본다(이슈 배경 2의 "그 사이클의 맡기가 건너뛰어짐").
2. `run`이 정상으로 끝나는 길도 한 줄 남긴다. 종료 줄이 없으면 "정상 종료"와 "로그를 못 남기고 죽음"이 구분되지 않는다(`AGENTS.md` "먼저 알 것").
3. `run`이 쓰는 이슈 입력 파일 만들기에도 같은 null 방어가 필요하다(`:101`의 `c['body']`는 `None`이면 글자 `None`이 입력에 박힌다. 죽지는 않고 조용히 틀린다).

## 2. 전제: #24

#24(`fix/local-impl-finish`)는 병합되어 있다(`3fcfe6b`). `sh()`는 이미 `encoding="utf-8", errors="replace"`로 읽는다. 따라서 이슈 배경 2의 `'NoneType' ... 'strip'` 원인으로 이슈 본문이 든 후보 둘이 남는다.

- (가) push 훅 출력 해독 실패로 `stdout`이 `None`. #24가 막았다고 보는 쪽(작성자 추정).
- (나) 댓글 `body`가 `null`일 때 `claimable()`의 `c["body"].strip()`(`:59`).

둘 중 무엇이 실제 원인이었는지는 **확인하지 않았다.** 로그 두 건(16:18, 17:30)은 traceback이 없고, #24 병합 시각과의 선후도 이 세션에서 보지 못했다. 그래서 (나)를 방어적으로 고치되 "원인을 고쳤다"고 주장하지 않는다. traceback 로깅이 들어간 뒤 같은 오류가 다시 나는지가 확정 신호다(§6).

## 3. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 `local_implement`, `구현자`, 로컬 구현 로그를 가리키는 묶음을 찾았으나 없다. 없다고 말하고 시작한다.

같은 종류로 점검한 자리:

- 로그를 읽는 코드. `logs/local_implement.log`를 파싱하는 스크립트는 없다(검색 결과 `local_implement.py` 자신과 `HANDOFF.md:16` 문구뿐). 줄 형식을 바꿔도 읽는 쪽이 깨지지 않는다. 사람이 읽는 로그다.
- 기존 줄 형식. `{key} #{n} 맡음, 터미널 띄움`, `{key} #{n} push {sha7}, PR {n}`은 바꾸지 않는다. 새 줄은 같은 접두 `{key} #{n}`을 쓴다.
- 클라우드 `implement-session.yml`. 이 스크립트와 `local` 라벨로만 만난다. 라벨 흐름은 바꾸지 않는다.
- 예약 작업 `beggars-local-implement`는 `pythonw ... poll`을 부르는 명령줄이 그대로다. 진입점 이름과 인자(`poll`, `run <key> <n>`)를 바꾸지 않는다.
- 원장(`data/log.jsonl`). 건드리지 않는다. append-only 문제 없음.
- 수집 예약과 폰. 건드리지 않는다. `collect_trial.ps1` 불필요.

## 4. 변경

모두 `scripts/local_implement.py`.

### 4-1. 이름 대응

창 제목과 로그 접두가 같은 이름에서 나오게 한다.

- `label(key, n)` → `f"{key} #{n}"`. 모든 로그 줄의 접두.
- `window_title(key, n)` → `f"구현 {label(key, n)}"`. `poll`의 `wt --title`(`:76`)이 이것을 쓴다.

창 제목이 `구현 tracker #25`이면 로그에서 `tracker #25`를 찾으면 된다.

### 4-2. 진입점 `main(argv)`

`if __name__ == "__main__":` 안의 `try`를 함수로 뺀다. 그래야 테스트가 부를 수 있다.

```
def main(argv):
    tag = label(argv[2], argv[3]) if argv[1] == "run" else "poll"   # int 변환 전에 쓰는 이름
    try:
        reason = poll() if argv[1] == "poll" else run(argv[2], int(argv[3]))
    except SystemExit as e:
        code, why = exit_parts(e.code)
        log(f"{tag} 종료: 코드 {code}, {why}")
        raise
    except Exception:
        log(f"{tag} 오류:\n{traceback.format_exc()}")
        raise
    if argv[1] == "run":
        log(f"{tag} 종료: 코드 0, {reason or '끝'}")
```

- `exit_parts(code)`: `None`→`(0, "")`, 정수→`(code, "")`, 문자열→`(1, 문자열)`. 파이썬 규약(`sys.exit("msg")`은 코드 1, 메시지는 stderr)과 같게 한다. 이슈 예시 `종료: 코드 1, 설계 브랜치 없음`이 이 형태다. 빈 `why`면 `, ` 꼬리를 붙이지 않는다.
- `except SystemExit`가 `Exception`보다 위에 있어야 하는 이유는 `SystemExit`가 `BaseException` 계열이라 아래 `except Exception`에 걸리지 않기 때문이다. `KeyboardInterrupt`(창을 `Ctrl+C`로 닫음)는 일부러 잡지 않는다. 사람이 끈 것이다.
- `run`의 반환값을 문자열로 바꾼다: "새 커밋 없음"과 `push 완료 {sha7}, PR {pr}`. 기존 `print`는 그대로 둔다. `poll`은 반환값이 필요 없다(`None`).
- `poll`은 정상 종료 줄을 남기지 않는다. 1분마다 도는 예약이라 로그가 하루 1,440줄씩 불어난다. 맡은 때와 오류만 남는다(기존과 같음).
- `raise`는 유지한다. 종료 코드와 터미널 표시가 지금과 같아야 사람이 창에서 보던 것이 바뀌지 않는다.
- `log()` 자체가 실패하면(디스크, 권한) 원래 예외를 덮는다. 구현자는 `log` 호출을 `try/except OSError: pass`로 감싸지 않는다. 로그를 못 남기면 시끄럽게 죽는 쪽이 낫다(조용히 잃기가 이 프로젝트의 실패 방식이다).

### 4-3. `poll`: 이슈 단위 격리

`for issue in ...` 본문(`claimable` 호출부터 `Popen`까지)을 이슈별 `try/except Exception`으로 감싼다.

```
except Exception:
    log(f"{label(key, n)} 오류:\n{traceback.format_exc()}")
```

- `gh_json(...issues?...)` 목록 호출 자체가 실패하면 사이클 전체가 죽고 4-2의 바깥 `except`가 `poll 오류:`로 남긴다. 이슈 단위 격리는 그 안쪽만이다.
- 격리해도 `raise`하지 않으면 예약 작업의 종료 코드는 0이 된다. 오류는 로그로만 알린다. 대신 사이클이 끝나면 오류가 하나라도 있었는지 모아 두었다가 마지막에 `sys.exit(1)`하지는 않는다. 작업 스케줄러 "마지막 실행 결과"를 쓰는 사람이 없다는 가정이다(**미확인**, §7 질문 1).
- 부작용 순서에 주의한다. 라벨 달기(`:74`) 직후 `Popen`이 실패하면 `local` 라벨만 남고 구현이 시작되지 않는다. 지금도 같은 위험이다. 이번에 고치지 않고, 이 경우 오류 줄이 `{key} #{n} 오류`로 남아 사람이 라벨을 알아볼 수 있게 되는 것으로 끝낸다.

### 4-4. 댓글 `body`의 null

- `claimable`: `(c["body"] or "").strip().splitlines()`. 승인 판정은 null 본문을 승인 아님으로 본다.
- `run`의 입력 파일 만들기를 순수 함수 `render_issue_input(n, issue, comments)`로 뺀다. 본문은 `(c["body"] or "")`, 이슈 본문은 기존대로 `or ''`. 함수로 빼는 이유는 `run` 전체를 목으로 막지 않고 테스트하기 위함이다. 출력 문자열은 `body`가 문자열일 때 지금과 한 글자도 다르지 않아야 한다.
- 이슈 `title`이 null인 경우는 GitHub API가 허용하지 않는다. 방어하지 않는다.

## 5. "없다 / 0 / 통과"의 양성 신호

이 변경에서 "없다"를 내는 자리와 구분 방법:

| 자리 | 조용히 틀리는 경우 | 양성 신호 |
| --- | --- | --- |
| 로그에 오류 줄이 없음 | 오류가 없었던 것인지, 로그를 못 남긴 것인지 | `run`은 정상이든 아니든 종료 줄이 **항상** 있다. 맡음 줄은 있는데 종료 줄이 없는 `{key} #{n}`은 로그도 못 남기고 죽은 것(창을 강제로 닫음, 프로세스 종료)이다. 테스트가 "종료 줄 개수 = 1"을 박는다 |
| `claimable`이 False | 승인이 없어서인지, 본문이 null이어서 댓글을 못 읽은 것인지 | null 본문 댓글과 정상 승인 댓글이 섞여 있으면 정상 승인 댓글로 True가 나와야 한다(null이 목록 전체를 무효로 만들지 않음) |
| 종료 코드 0 | 푸시가 됐는지, 커밋이 없어서 건너뛴 것인지 | 종료 줄 사유에 `push 완료 {sha7}` 또는 `새 커밋 없음`이 들어간다. 빈 사유를 허용하지 않는다(`reason or '끝'`은 방어일 뿐 `run`은 항상 사유를 돌려준다. 테스트가 박는다) |
| 이슈 단위 격리 후 "오류 0" | 격리가 오류를 삼킨 것 | 격리된 오류는 반드시 traceback 줄을 남긴다. 테스트가 `Traceback`과 예외 종류를 로그에서 찾는다 |

## 6. 테스트 (결론은 테스트로 박는다)

`tests/test_local_implement.py`에 추가한다. 파일은 `pytestmark = non_gate`를 이미 쓴다. 로그는 `monkeypatch.setattr(li, "LOG", tmp_path / "logs" / "x.log")`로 돌려 실제 `logs/`를 건드리지 않는다(`log()`가 `mkdir`을 하므로 하위 폴더가 없어도 된다). `import scripts.local_implement as li`를 추가한다.

이슈 완료 조건 대응:

1. `test_claimable_survives_null_comment_body`: `comment(body=None)`만 있으면 `False`, `[comment(body=None), comment()]`면 `True`. 예외 없음.
2. `test_run_logs_exit_line_on_sys_exit_string`: `li.sh`를 `lambda *a, **k: ""`로 바꾸면 `run`이 `sys.exit("설계 브랜치(feat/28-*) 없음")`에 닿는다. `main(["x", "run", "tracker", "28"])`이 `SystemExit`를 올리고, 로그에 `tracker #28 종료: 코드 1, 설계 브랜치(feat/28-*) 없음`이 정확히 한 줄 있다.
3. `test_top_level_error_logs_traceback`: `li.poll`을 `ValueError("boom")`을 던지는 함수로 바꾸고 `main(["x", "poll"])`을 부른다. `ValueError`가 그대로 올라오고, 로그에 `Traceback`, `ValueError: boom`, 던진 함수 이름이 있다.
4. 기존 네 테스트 통과.

설계가 더한 것:

5. `test_exit_parts`: `None`→`(0, "")`, `2`→`(2, "")`, `"msg"`→`(1, "msg")`.
6. `test_run_returns_reason_and_logs_zero_exit`: `li.sh` 목으로 "새 커밋 없음" 경로(`head == start`)까지 가게 하고 `li.subprocess.run`을 무동작으로 바꾼다. 종료 줄 `코드 0, 새 커밋 없음`이 한 줄. 목 준비가 `run`의 앞부분(worktree, 이슈 조회)을 다 지나야 하므로 `gh_json`도 바꾼다. 준비가 과하면 구현자는 이 테스트 대신 `main`에 `li.run`을 바꿔 넣어 문자열 반환 → 종료 줄 `코드 0, <사유>`만 박아도 된다.
7. `test_poll_isolates_failing_issue`: `gh_json`이 이슈 둘(첫째는 `labels`가 없어 `KeyError`)을 돌려주게 하고, 둘째에 대해서는 맡기 경로(`sh`, `subprocess.Popen` 목)가 실제로 한 번 불리는지 확인한다. 로그에 첫째의 `오류` 줄과 traceback이 있다.
8. `test_window_title_and_log_label_correspond`: `window_title("tracker", 25) == "구현 tracker #25"`이고 `window_title(k, n).endswith(label(k, n))`.
9. `test_render_issue_input_null_comment_body`: `body=None`인 믿는 사람의 댓글이 있어도 출력에 글자 `None`이 없다. 문자열 본문일 때는 `### login 시각\n본문\n\n` 형식이 기존과 같다.

시험 명령: `python -m pytest tests/test_local_implement.py -q`. 이 파일은 `-m "non_gate and not ci_only"` 묶음에 들어 있으므로(`docs/setup/ROUTINE-SPEC.md:177`) 그 명령도 한 번 돌린다. 나머지 점검 명령은 `docs/HARNESS.md` §11.

실제 윈도에서 `wt`를 띄우는 시험은 이 클라우드 러너에서 못 한다(§7).

## 7. 미확인, 위험, 열린 질문

- **미확인 1: 종료 코드 의미.** 4-3에서 `poll`이 이슈 오류를 삼키고 종료 코드 0으로 끝난다. 작업 스케줄러의 "마지막 실행 결과"를 보고 판단하는 사람이나 도구가 있으면 바꿔야 한다. 이 저장소에서 읽는 코드는 찾지 못했다.
- **미확인 2: 사용자가 본 창.** 이슈는 코드 1 창이 `구현 tracker #N` 중 어느 것인지 가릴 수 없다고 했다. 이 설계는 앞으로의 창에만 답한다. 이미 지난 세 건(16:05, 16:48, 17:21)은 로그가 없어 복원되지 않는다.
- **미확인 3: 원인 (가)/(나).** §2. 구현 뒤에도 `'NoneType'` 오류가 로그에 남으면 traceback으로 위치를 보고 새 이슈로 올린다.
- **미확인 4: `wt` 실행 확인.** `window_title` 인자 전달은 윈도 터미널에서 사람이 한 번 띄워 제목이 맞는지 본다. 코드 변경은 문자열 조립 위치만 바뀌므로 위험이 낮다.
- 위험: `except SystemExit`에서 `log()`를 부른 뒤 `raise`한다. `log()`가 실패하면 `SystemExit`가 `OSError`로 덮인다. 4-2에서 일부러 막지 않았다.
- 범위 밖: `run`이 코드 1로 끝날 때 창이 즉시 닫히는 문제(창에 남은 문구가 "[프로세스가 코드 1로 종료되었습니다]"뿐). 종료 이유를 창에 붙들어 두려면 `wt` 인자나 `pause`가 필요한데, 사람이 `/exit`로 닫는 정상 흐름과 부딪히므로 이번에는 로그만 한다.

## 8. 끝 조건

- `python -m pytest tests/test_local_implement.py -q` 통과, `python -m pytest tests -q -m "non_gate and not ci_only"` 통과.
- `scripts/local_implement.py`, `tests/test_local_implement.py`, `docs/workflow/HANDOFF.md` 외 변경 없음. `HANDOFF.md:16`의 "기록은 `logs/local_implement.log`" 뒤에 "(`{key} #{n}` 접두. 창 제목은 `구현 {key} #{n}`. 종료 줄 `종료: 코드 N`)" 한 구절만 더한다.
- 기존 로그 줄(`맡음, 터미널 띄움`, `push`)과 `poll`/`run` 명령줄 인자는 그대로.
- 병합 뒤 사람이 확인할 것(PR 본문 **미확인**에 남긴다): 다음 구현 창이 끝난 뒤 `logs/local_implement.log`에 해당 `{key} #{n} 종료:` 줄이 있는지.
