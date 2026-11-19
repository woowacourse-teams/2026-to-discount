<!-- 원본: tracker docs/specs/issue-158-adb-timeout-retry-once.md — 여기서 고치지 않는다 -->
# 이슈 #158: adb 명령 한 번 시간 초과로 3단계 전체를 처음부터 다시 돈다

영역: `collect`. 고칠 자리(`capture/common.py` `run_adb`)는 모든 수집이 지나는 adb 호출 한 곳이다. 폰 없는 테스트로 대부분을 박지만, `AGENTS.md`의 "수집 코드를 바꿨으면 실제 수집으로 시험한다"에 걸려 실기 시험(V50, 3단계)이 필요하다.

## 1. 문제

- 2026-11-04 15:55 회차 3단계(쿠팡이츠 허브, V50). 16:35 `adb -s <폰 일련번호> shell input keyevent KEYCODE_BACK`이 60초 시간 초과(이슈 본문).
  - 경로: `capture/coupangeats_hub.py` `_open_visible_cards`의 `drv.back()` → `capture/driver/android.py` `AndroidDriver.back` → `capture/common.py` `run_adb`.
- `run_adb`는 `subprocess.TimeoutExpired`를 그대로 올린다(`tests/capture/test_common_adb_timeout.py::test_timeout_is_not_swallowed`가 그 계약을 박는다). 명령 하나가 멈추면 스캔이 죽고, 단계 재시도는 처음부터 돈다. 첫 시도 18분을 버리고 재시도 81분, 합계 100분으로 SUSPECT가 됐다.
- V50 adb가 왜 멈췄는지는 미확인이다(이슈 본문). 이 세션은 클라우드 러너라 로그와 폰을 직접 못 봤다.

### 1-1. 이슈의 안(모든 명령 한 번 더)을 그대로 쓰지 않는 이유

시간 초과는 "명령이 기기에 닿지 않았다"가 아니라 "adb가 답을 못 돌려줬다"다. 입력 명령은 닿았는지 알 수 없다.

- `KEYCODE_BACK`을 다시 보내면 뒤로가기가 두 번이 될 수 있다. `capture/guards.py:327` 주석에 "한 번만 — 두 번이면 앱이 내려간다"가 이미 적혀 있다.
- `input tap`을 다시 보내면 화면이 넘어간 뒤 같은 좌표를 한 번 더 누를 수 있다. 허브 카드는 누르면 쿠폰이 발급되고 화면이 매장 목록으로 넘어간다(`_open_visible_cards` 머리말). 둘째 탭은 매장 목록의 무언가를 누른다.
- 화면이 바뀌는 명령을 몰래 두 번 하면 "무엇을 눌렀는지 알 수 없게 된다"(같은 머리말). 이 프로젝트가 깨지는 방식(값을 조용히 잃음)으로 바로 이어진다.

그래서 명령을 둘로 가른다. 읽기는 다시 해도 결과가 같으니 `run_adb`에서 한 번 더 한다. 입력은 다시 보내지 않고, 닿았는지를 화면으로 다시 보는 호출자가 판정한다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md` 1~8번 묶음에 adb, `capture/common.py`, 수집 드라이버를 가진 자리는 없다. 이 변경은 mono의 api, web, 배포에 닿지 않는다. 9번(새 파일)은 tracker의 새 테스트 파일 하나라 해당 없다(mono 구조 문서, web 테스트 사슬, beggars-ops 배포 목록 모두 무관).

tracker 안의 반경은 `run_adb`를 부르는 모든 자리다(`Grep run_adb`, `capture/` 25개 파일 136곳). 그중 입력 명령(`input`, `am`, `monkey`)이 32곳(9개 파일)이다. 이번 변경은 이 자리들을 고치지 않는다.

- 읽기 호출자: 시간 초과 한 번은 이제 흡수된다. 두 번이면 지금처럼 `TimeoutExpired`가 올라간다. 동작이 바뀌는 쪽은 "죽던 것이 산다" 하나다.
- 입력 호출자: 지금처럼 예외가 올라간다. 예외 종류만 `TimeoutExpired`의 하위 클래스(`AdbInputUnconfirmed`)로 바뀌어 `except subprocess.TimeoutExpired`로 잡던 자리(`capture/guards.py`의 직접 `subprocess.run` 자리 등)는 그대로 돈다. 이번에 그 예외를 잡아 화면 확인으로 넘기는 호출자는 `_open_visible_cards`의 `drv.back()` 하나다. 나머지 31곳은 후속으로 둔다(§8).
- 자체 재시도가 있는 자리: `_cat_ui`(`capture/common.py`, 2026-10-16 사고)와 `_rm_ui`가 `run_adb` 위에 재시도를 얹었다. `run_adb`가 안에서 또 재시도하면 `_cat_ui`의 시도 횟수가 곱으로 늘어(4회 → 최대 8회) `tests/test_cat_ui_retry.py`가 깨지고 최악 대기가 늘어난다. `_cat_ui`는 `retry=False`로 부른다. `_rm_ui`는 255(연결 끊김) 재시도라 시간 초과와 겹치지 않으니 그대로 둔다.
- `phone_cycle._sh`는 `timeout=30`과 `except Exception`으로 한 줄 실패를 삼킨다. 읽기 재시도가 붙으면 최악 대기가 30초 → 30+10+30초가 된다. 기기 상태 기록용이라 받아들인다.

## 3. 설계

### 3-1. 명령 분류는 순수 함수 하나

```python
_INPUT_HEADS = ("input", "am", "monkey")          # 기기 화면을 바꾸는 명령

def _is_input(args: tuple[str, ...]) -> bool:
    """shell/exec-out 뒤 첫 낱말이 화면을 바꾸는 명령인가. 다시 보내면 안 되는 쪽."""
```

- 글자 목록이지만 앱 문구가 아니라 adb 명령 이름이라 바뀌지 않는다.
- 모르는 명령은 읽기로 본다. 이유: 지금 `run_adb`를 지나는 쓰기 명령(`rm -f`, `settings put`, `svc`, `wm`)은 두 번 해도 결과가 같다. 새로 화면을 바꾸는 명령을 더하면 이 목록에 넣는다(시험 5가 지금 쓰이는 머리 낱말을 박는다).

### 3-2. `run_adb`

```python
ADB_STATE_TIMEOUT_S = 10.0

class AdbInputUnconfirmed(subprocess.TimeoutExpired):
    """입력 명령이 시간 초과됐고 기기는 살아 있다. 닿았는지 모른다 — 다시 보내지 않았다."""

def run_adb(serial, *args, timeout=None, retry=True) -> bytes:
```

시간 초과가 나면 순서대로:

1. `adb -s <serial> get-state`를 `subprocess.run`으로 직접 부른다(`run_adb` 재귀 없음, `ADB_STATE_TIMEOUT_S`). 출력이 정확히 `device`가 아니면(다른 글자, 빈 값, 시간 초과, 0 아닌 종료) 원래 `TimeoutExpired`를 그대로 올린다. 기기가 정말 죽었을 때 60초를 한 번 더 쓰지 않는다.
2. 입력 명령이면 다시 보내지 않고 `AdbInputUnconfirmed`를 올린다.
3. `retry=False`면 원래 예외를 올린다.
4. 읽기면 같은 명령, 같은 `timeout`으로 한 번 더. 둘째도 시간 초과면 그 예외를 올린다. 셋째는 없다.

로그는 `_cat_ui`와 같은 머리 `[adb-retry]`로 한 줄씩 남긴다.

- `[adb-retry] <serial> <명령 앞 세 낱말> 시간 초과(<초>초) - get-state=<값>`
- 읽기 재시도: `… - 한 번 더`, 입력: `… - 입력이라 다시 안 보냄`, 결과: `[adb-retry] <serial> 재시도 성공` 또는 `재시도도 시간 초과`.

`CalledProcessError`(0 아닌 종료)는 이번 범위가 아니다. 지금처럼 그대로 올린다.

### 3-3. `_open_visible_cards`의 뒤로가기

```python
try:
    drv.back()
except AdbInputUnconfirmed as exc:
    print(f"  뒤로가기가 닿았는지 모른다({exc}) — 화면으로 확인한다", flush=True)
time.sleep(3.5)
```

- 바로 아래 줄들이 이미 판정한다. `drv.tree()`로 화면을 다시 뜨고 `on_hub`가 아니면 `_reenter_hub`로 딥링크를 다시 연다. 뒤로가기가 안 닿았으면 매장 목록 화면이라 다시 열고, 닿았으면 허브라 그대로 간다. 양성 신호는 `on_hub`다.
- `done.add`는 그대로 한다. 카드는 탭에서 이미 눌렸다(`drv.tap` 성공 뒤라야 이 줄에 온다). 쿠폰 발급은 탭 순간에 끝난다(머리말).
- `drv.tap` 쪽 `AdbInputUnconfirmed`는 이번에 잡지 않는다. 탭이 닿았는지 모르는 채 `done`에 넣으면 그 카드의 최소주문을 조용히 잃는다. 지금처럼 예외로 죽는 편이 낫다(§8).
- 스캔 도중 `AdbInputUnconfirmed`를 `AndroidDriver` 같은 공통 층에서 삼키지 않는다. 화면을 다시 보는 호출자만 잡는다.

## 4. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 미관측과 헷갈리는 것 | 양성 신호 |
|---|---|---|
| `get-state` 판정 | 빈 출력, 시간 초과, 다른 글자를 "살아 있다"로 읽으면 죽은 기기에 60초를 더 쓴다 | 출력을 `strip()`한 값이 정확히 `device`일 때만 산 것으로 본다. 나머지는 모두 죽은 것 |
| 읽기 재시도 성공 | 둘째 호출이 빈 바이트를 돌려주면 "화면이 비었다"로 읽힌다 | 재시도 결과도 첫 호출과 같은 `check=True` 경로라 종료 코드 0과 실제 출력이다. 빈 값으로 바꿔 돌려주지 않는다(시험 3) |
| 입력 시간 초과 | 예외를 삼키고 넘어가면 "눌렀다"로 읽힌다 | 공통 층에서 안 삼킨다. 잡는 호출자는 다음 줄에서 `on_hub`로 화면을 다시 본다(시험 6) |
| 3단계 시간 | "재시도 0회"가 안 일어난 것인지 로그를 못 본 것인지 | `[adb-retry]` 줄. 실기 시험에서 이 줄이 찍힌 회차가 단계 재시도(`3-retry.log`) 없이 끝났는지를 본다 |

## 5. 원장 (append-only)

원장(`data/log.jsonl`)을 건드리지 않는다. 수집 결과를 만드는 경로는 그대로이고, 바뀌는 것은 adb 예외를 언제 올리느냐뿐이다.

## 6. 시험 (결론은 테스트로 박는다)

### 폰 없이 (`tests/capture/test_run_adb_retry.py`, 새 파일)

`capture.common.subprocess.run`을 가짜로 바꿔 부른 명령을 모두 적는다. `get-state` 호출은 `cmd[3:] == ["get-state"]`로 가른다.

1. `test_read_timeout_then_success`: 첫 `dumpsys` 시간 초과, `get-state`=`device`, 둘째 성공 → 둘째의 출력을 돌려준다. 같은 명령이 정확히 두 번 불렸다.
2. `test_read_timeout_twice_raises`: 두 번 다 시간 초과 → `TimeoutExpired`. 명령은 두 번(셋째 없음).
3. `test_retry_returns_real_output`: 둘째가 돌려준 바이트가 그대로 나온다(빈 값으로 바꾸지 않음).
4. `test_dead_device_no_retry`: `get-state`가 `offline`, 빈 값, 시간 초과, 종료 코드 1인 네 경우(매개변수화) 모두 → 원래 `TimeoutExpired`, 명령은 한 번만.
5. `test_input_is_not_resent`: `input keyevent KEYCODE_BACK`, `input tap 1 2`, `am start …`, `monkey -p …` 각각 시간 초과, `get-state`=`device` → `AdbInputUnconfirmed`, 그 명령은 한 번만 불렸다. `isinstance(exc, subprocess.TimeoutExpired)`도 참.
6. `test_input_heads_cover_callers`: `capture/` 소스에서 `run_adb(…, "shell", "<낱말>"` 패턴의 첫 낱말을 모두 뽑아, `input`, `am`, `monkey`가 `_INPUT_HEADS`에 있고 나머지 낱말이 "두 번 해도 같은" 허용 목록(시험 안의 목록)에 있음을 확인한다. 새 화면 변경 명령이 분류 없이 들어오면 여기서 깨진다.
7. `test_retry_false_raises_first`: `retry=False`면 `get-state` 뒤 재시도 없이 원래 예외.
8. `test_retry_uses_same_timeout`: 둘째 호출의 `timeout`이 첫 호출과 같다(느린 명령 120초 포함).

### 기존 시험

- `tests/capture/test_common_adb_timeout.py::test_timeout_is_not_swallowed`: 가짜가 `get-state`까지 시간 초과시키므로 그대로 통과해야 한다. 고치지 않는다. 머리말에 "한 번 재시도는 `test_run_adb_retry.py`" 한 줄만 단다.
- `tests/test_cat_ui_retry.py`: `cat` 호출 수 2, 4, 4가 그대로여야 한다(`_cat_ui`가 `retry=False`). 고치지 않는다.

### `_open_visible_cards` (`tests/` 의 쿠팡이츠 허브 시험 옆, 기존 가짜 드라이버를 쓴다)

9. `test_back_unconfirmed_falls_to_hub_check`: 가짜 드라이버의 `back()`이 `AdbInputUnconfirmed`를 올리고, 다음 `tree()`가 허브가 아닌 화면 → `_reenter_hub`가 한 번 불리고 스캔이 이어진다. 그 카드는 `done`에 있다.
10. `test_back_unconfirmed_but_on_hub`: 같은데 다음 `tree()`가 허브 → 다시 열지 않고 다음 카드로 간다.
11. `test_tap_unconfirmed_still_raises`: `tap()`이 `AdbInputUnconfirmed` → 예외가 올라가고 그 카드는 `done`에 없다.

### 실기 (V50, `scripts/collect_trial.ps1`)

- 예약을 끄고 3단계 쿠팡이츠 허브 수집만 돌린다(`scripts/collect_trial.ps1 -Command "<3단계 명령>"`, 명령은 `docs/setup/ROUTINE-SPEC.md` 3단계 줄). 끝나면 스크립트가 예약을 켠다.
- 시간 초과는 일부러 만들지 않는다(폰 설정을 바꾸지 않는다, `AGENTS.md`). 보는 것은 되돌림이 없다는 것: 허브 카드 수와 `done` 수가 직전 정상 회차와 같은 자릿수인지, 로그에 `[adb-retry]`가 없거나 있으면 `재시도 성공`으로 끝났는지.
- 배포 뒤 첫 일주일 `logs/steps/<날짜>/*.log`에서 `[adb-retry]` 줄을 모은다. 찍혔는데 그 단계에 `-retry.log`가 없으면 이번 변경이 단계 재시도를 막은 것이다.

## 7. 구현 순서

1. `_is_input`, `AdbInputUnconfirmed`, `ADB_STATE_TIMEOUT_S`, `run_adb(retry=…)` 추가. 시험 1~8.
2. `_cat_ui`의 `run_adb` 호출 넷에 `retry=False`. 기존 `test_cat_ui_retry.py` 통과 확인.
3. `_open_visible_cards`의 `drv.back()`을 §3-3대로 감싼다. 시험 9~11.
4. `python -m pytest` 전체. `docs/HARNESS.md` §11 점검(마지막 줄까지).
5. 실기 시험(§6).
6. `docs/setup/COLLECTION-INCIDENTS.md`에 "adb 한 명령 시간 초과로 단계 전체 재시도" 항목(증상 `[adb-retry]` 줄, 확인 명령, 조치)을 더한다.

## 8. 열린 질문과 후속

- **V50 adb가 왜 60초 멈췄는지.** 이번 변경은 원인을 고치지 않고 한 번의 멈춤을 흡수한다. 같은 기기에서 `[adb-retry]`가 자주 찍히면 원인 조사를 따로 연다.
- **입력 명령 나머지 31곳.** 대부분 다음 줄에서 화면을 다시 뜨지만 하나씩 확인하지 않았다. 호출자마다 "다음에 화면을 보는가"를 확인하고 `AdbInputUnconfirmed`를 잡을지 정하는 일은 후속이다. 그전까지는 지금처럼 예외로 죽는다(되돌림 없음).
- **탭 시간 초과.** 탭이 닿았는지 화면으로 가릴 방법(허브 화면이 매장 목록으로 넘어갔는가)이 있으면 `drv.tap`도 흡수할 수 있다. 쿠폰 발급과 얽혀 이번에는 안 한다.
- **재시도 대기.** 읽기 재시도를 첫 호출과 같은 시간으로 둔다(`_cat_ui`는 20초로 짧게 둔다). 짧게 할지는 실기 기록을 보고 정한다.
- 8단계가 SUSPECT 때 허브 고정 쿠폰을 건너뛴 일은 이슈 본문대로 별도 이슈다.

## 변경 이력

- 2026-11-13 구현: `retry=False`이고 입력이 아닌 명령은 `get-state`를 부르지 않고 바로 원래 예외를 올린다. §3-2 순서대로면 `_cat_ui`의 `cat` 호출 수에 `get-state`가 끼어 기존 `test_cat_ui_retry.py`(2, 4, 4)가 깨진다. 입력 명령은 `retry`와 무관하게 `get-state`를 먼저 본다.
- 2026-11-13 구현: §6 실기 시험(V50, 3단계)은 이 세션에서 하지 않았다. PR `### 후속 조치`로 뗀다.

