<!-- 원본: tracker docs/specs/issue-146-guard-skip-asleep-keyguard.md — 여기서 고치지 않는다 -->
# 이슈 #146: 가드가 잠든 폰의 잠금 화면에 BACK을 4초마다 누른다

영역: `collect`. 고칠 자리(`capture/guards.py`)는 예약 수집이 기기마다 띄우는 가드다. 시험 자료(실제 `dumpsys` 출력)를 V30에서 떠야 하고, `AGENTS.md`의 "수집 코드를 바꿨으면 실제 수집으로 시험한다"에 걸린다.

## 1. 문제

- 11-04 00:01 회차 끝 줄: `가드: 남의 창 닫음 <폰 일련번호>=306회`. 다른 폰은 0회. 지난 회차도 1911, 1632, 922, 887회(이슈 본문).
- 11-03~04 로그의 닫은 창 4314건이 모두 `com.android.systemui`(액티비티 없음)다. 그때 V30은 `mWakefulness=Asleep`, 포커스 창은 `com.android.systemui`, 창 종류는 `ty=KEYGUARD_DIALOG`(잠금 화면)였다(이슈 본문, 11-04 02시 확인). 이 세션은 클라우드 러너라 로그와 폰을 직접 못 봤다.
- 코드에서 확인한 경로:
  - `Guard.run`(`capture/guards.py` `class Guard`)이 4초마다 `focused_window` → `classify`를 부른다.
  - `focused_window`는 `mCurrentFocus=Window{… 이름}`의 이름만 돌려준다. 잠든 V30에서는 `com.android.systemui`다.
  - `classify`는 `WINDOW_GUARDS`를 위에서부터 글자로 맞춘다. `ignore` 줄의 `keyguard`는 이름에 그 글자가 없어 안 걸리고, 다음 `systemui` 줄(`dismiss`)이 걸린다.
  - 그래서 `dismissed += 1`, `check_once`가 `KEYCODE_BACK`을 보낸다. 잠금 화면은 닫히지 않으니 4초 뒤 같은 일이 되풀이된다.
- 표 머리 주석은 "잠금화면은 건드리지 않는다"(`WINDOW_GUARDS` 위)인데 코드가 그 뜻을 못 지킨다. 원인은 **글자로 짚었다**는 데 있다. 잠금 화면 창 이름에 `keyguard`가 들어가는 기기(`com.android.systemui/…keyguard.Bouncer`, 기존 시험)만 걸러졌다. AGENTS.md "먼저 알 것" 2번(글자가 아니라 구조로)의 실패다.
- 수집 결과에는 영향이 없다(그 폰의 일은 끝났다). 대신 회차 끝 줄의 "닫음 N회"가 쓸모없는 숫자가 됐다. 진짜 재난문자나 ANR 창을 닫은 횟수가 잠금 화면 BACK 수천 번에 묻힌다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md` 1~9번 묶음에 가드, 포커스 창, `run_routine` 끝 줄을 가진 자리는 없다. 이 변경은 mono의 api, web, 배포에 닿지 않는다. tracker 안에서 직접 센 결과다(`Grep`으로 `Guard(`, `dismissed`, `focused_window`, `check_once`, `남의 창`).

| 자리 | 지금 | 이번에 |
|---|---|---|
| `capture/guards.py` `focused_window` | `dumpsys window`를 불러 포커스 이름만 꺼냄 | 덤프를 읽는 `window_dump(serial)`와 이름을 꺼내는 순수 함수로 나눈다. 반환값과 이름은 그대로(§3-2) |
| `capture/guards.py` `check_once` | `dismiss`면 BACK | 잠듦과 잠금이 확인되면 BACK 대신 `"held"`를 돌려준다(§3-3) |
| `capture/guards.py` `Guard` | `dismissed`만 셈 | `held`를 따로 세고, 보류 로그는 상태가 바뀔 때만 한 줄(§3-4) |
| `capture/guards.py` `clear_before_entry` | `check_once` 호출, 반환값 안 봄 | 코드 변경 없음. 진입 직전은 `require_unlocked` 뒤라 깨어 있다. 잠들어 있으면 BACK을 안 보내는 쪽이 맞다 |
| `capture/common.py` `_focused_in`, `close_blind_dialog`, `AndroidDriver.focused` 쪽 호출 | `focused_window(serial)` | 코드 변경 없음. 시그니처와 반환값을 지킨다 |
| `capture/common.py` `keyguard_showing`, `_screen_off_or_locked` | `dumpsys window`, `dumpsys power`를 따로 읽음 | 코드 변경 없음. 같은 글자 판정(`isKeyguardShowing=true`, `mShowingLockscreen=true`, `mWakefulness=`)을 새 순수 함수가 **덤프 문자열로** 다시 쓴다. 두 곳을 하나로 합치는 것은 넣지 않는다(이유는 아래) |
| `scripts/run_routine.py` 가드 끝 줄 | `dismissed`가 있으면 `가드: 남의 창 닫음 …` | 보류 줄 하나를 더한다(§3-5) |
| `tests/test_run_routine.py` `NoGuard` | `dismissed = 0`만 | `held = 0`을 더한다. 안 더하면 `run_routine`이 `g.held`에서 `AttributeError`로 죽어 시험 전체가 빨개진다 |
| `docs/setup/ROUTINE-SPEC.md` §1.1-b | "잠금, 런처는 안 건드린다" | 판정 근거(창 종류, 전원 상태)와 보류 줄 한 문단으로 바꾼다. 그 절의 `overlay_guard.Guard`도 지금 이름 `capture/guards.Guard`로 바로잡는다 |
| `scripts/check_routine.py`, `scripts/status.py`, `capture/ops.py` | `가드` 끝 줄을 판정에 안 씀(`Grep` 확인). `ops.guard`는 메시지를 그대로 쌓음 | 변경 없음. 보류 로그도 같은 `guard_log`로 나가므로 콘솔에는 상태가 바뀔 때만 한 줄 늘어난다 |

넣지 않는 것:

- **`common.keyguard_showing`과 합치기.** 그 함수는 adb를 직접 부르고 시험 여럿이 그 이름을 바꿔 끼운다. 이번에 합치면 수집 진입 경로까지 번진다. 새 순수 함수를 `common`이 나중에 쓰게 하는 일은 후속이다.
- **알림창(`NotificationShade`) 닫기 추가.** 이슈 "바라는 것" 1의 "알림창만 닫는다"는 남길 동작의 범위를 말한 것으로 읽었다. 지금 코드는 펼친 알림창 포커스 이름(최근 Android의 `NotificationShade`)이 `com.android.systemui`를 안 담아 `unknown`(로그만)이 된다. **이 이름은 확인하지 않은 일반 지식이다.** 새로 닫게 만드는 것은 동작 추가라 이번에 넣지 않는다. `wake_and_swipe`가 이미 `cmd statusbar collapse`를 부른다.

## 3. 설계

### 3-1. 바라는 것 2(폰 큐가 끝나면 가드를 멈춘다)를 고르지 않는 이유

- 가드는 큐가 있는 폰에만 붙는 게 아니다. `run_routine`이 `devices.json`에 있고 붙어 있는 폰 전부에 띄운다(넘겨받을 수 있는 폰, `known & set(attached)`). 큐 끝을 기준으로 멈추면 그 줄의 뜻과 어긋난다.
- 잠든 화면에 BACK을 보내는 일은 큐 **중간**에도 난다. 단계 사이 대기나 긴 단계 안에서 2분 절전에 걸린다(#101 `Dozing`, #120 마무리 `Asleep`). 큐 끝에서 멈춰도 이 경우는 남는다.
- 바라는 것 1은 원인(글자로 잠금 화면을 못 가림)을 고친다. 그래서 1만 한다.

### 3-2. 판정은 순수 함수 하나 (구조로 짚는다)

```
window_dump(serial) -> str | None          # `dumpsys window` 원문. 못 읽으면 None
focus_of(dump) -> str | None               # 지금 focused_window의 정규식 부분
focus_type(dump) -> str | None             # 포커스 창의 ty= 값
hold_reason(window_dump, power_dump) -> str | None   # "asleep" | "keyguard" | None
```

- `focused_window(serial)`은 `focus_of(window_dump(serial))`로 얇게 남긴다. 반환값은 그대로다.
- `focus_type`: `mCurrentFocus=Window{<해시> u<n> <이름>}`에서 해시와 이름을 꺼낸다. 같은 덤프의 창 목록에서 **같은 해시**의 `Window{<해시> u<n> <이름>}` 블록을 찾아 그 안의 `ty=(\w+)`를 돌려준다. 이름이 아니라 해시로 짚는다. `com.android.systemui` 창은 여럿(상태 표시줄, 잠금 화면, 대화상자)이라 이름으로는 못 가린다. 못 찾으면 `None`이다.
- `hold_reason`은 아래 중 하나라도 **읽혔을 때만** 보류다.
  - `"asleep"`: 전원 덤프에 `mWakefulness=`가 있고 값이 `Awake`가 아니다(`Asleep`, `Dozing`, `Dreaming`). `common._screen_off_or_locked`, `phone_cycle.is_asleep`와 같은 기준이다.
  - `"keyguard"`: `focus_type`이 `KEYGUARD`로 시작하거나, 창 덤프에 `isKeyguardShowing=true` 또는 `mShowingLockscreen=true`가 있다(`common.keyguard_showing`과 같은 글자).
  - 둘 다 아니면 `None`이다. 전원 덤프를 못 읽은 경우(`None`, 빈 값, `ERR`, `mWakefulness=` 없음)도 `None`이다. **못 읽은 것은 보류의 근거가 아니다.** 이때는 지금처럼 닫는다. 수집 중 진짜 ANR 창을 놓치는 것이 헛 BACK 한 번보다 비싸다.
- 잠금 화면 위에 ANR이나 재난문자 창이 떠 있어도(깨어 있고 잠김) 보류한다. 잠긴 폰에서는 어차피 수집이 못 간다. 다음 단계의 `require_unlocked`가 깨우고 밀면 그 창이 앞에 남고, 다음 4초 검사가 닫는다.
- `hold_reason`의 우선순위는 `"asleep"`이 먼저다(둘 다면 `asleep`). 로그 문구만 가른다.

### 3-3. `check_once`

```
win, dump = 포커스 이름, 창 덤프 (window_dump 한 번)
kind = classify(win)
if kind == "dismiss":
    reason = hold_reason(dump, power_dump(serial))    # 전원은 dismiss 후보일 때만 읽는다
    if reason: return "held"                          # BACK 없음
    BACK, 로그(지금 문구 그대로)
```

- `power_dump(serial)`은 `dumpsys power` 원문, 실패면 `None`이다. adb 호출은 `dismiss` 후보일 때만 하나 는다. 깨어 있는 평소 4초 검사(`ours`, `ignore`)는 지금과 같은 한 번이다.
- 반환 판정에 `"held"`가 는다. `clear_before_entry`는 반환값을 안 보고, `main(--once)`은 출력만 한다.
- `check_once`가 덤프를 한 번만 읽게 고치면 `Guard.run`의 이중 읽기(지금은 `focused_window`를 하고 `check_once`가 또 한다)도 사라진다.

### 3-4. `Guard`

- 한 번의 검사를 `tick()` 메서드로 뽑는다. `run`은 `while not stop.wait(interval): tick()`만 한다. 시험이 스레드 없이 `tick()`을 부른다.
- 판정은 `check_once`와 `tick()`이 함께 쓰는 내부 함수 `_inspect(serial) -> (창, 판정, 보류 이유, ty)` 하나에 둔다. `tick()`이 `check_once`를 그대로 부르면 안 된다. `check_once`는 `unknown`을 부를 때마다 적어서, 지금 `Guard.run`이 `last_unknown`으로 막는 4초마다 같은 줄이 다시 생긴다.
- `tick()`은 `_inspect`의 판정을 쓴다. `"dismiss"`면 BACK을 보내고(로그는 `check_once`와 같은 문구) `dismissed += 1`(BACK을 **실제로 보낸** 수만 센다). `"held"`면 `held += 1`.
- 보류 로그는 상태가 바뀔 때만 한 줄이다. `(이유, 창)`이 직전 보류와 같으면 안 적는다. 보류가 아닌 판정이 한 번 나오면 기억을 지운다. 문구: `가드[HH:MM:SS]: 화면이 잠들어(asleep) 남의 창을 닫지 않는다 - com.android.systemui (ty=KEYGUARD_DIALOG)`. `keyguard`면 `잠금 화면이라`. 지금 `last_unknown`과 같은 방식이다.
- `check_once`의 BACK 로그 문구(`남의 창을 닫는다 - …`)는 그대로다. `tests/test_ops.py`, `tests/test_status.py`가 그 글자를 쓴다.

### 3-5. `run_routine` 끝 줄

- `dismissed`가 하나라도 있으면 지금 줄 그대로.
- `held`가 하나라도 있으면 한 줄 더: `가드: 잠든 화면이라 안 닫음 <폰 일련번호>=306회`. 폰마다 `{serial}={held}회`.
- 이 줄이 "닫음 0회"의 양성 신호다. 고친 뒤 V30 줄이 `남의 창 닫음`에서 사라지고 이 줄에 나타나면 "가드가 그 폰을 봤고 일부러 안 눌렀다"가 된다. 두 줄이 다 없으면 "그 회차에 닫을 후보가 없었다"다.

## 4. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 위험 | 양성 신호 |
|---|---|---|
| `hold_reason`이 보류를 냄(BACK 안 보냄) | 못 읽은 상태를 잠듦으로 보고 진짜 남의 창을 안 닫음 | `mWakefulness=<Awake 아닌 값>`이 **읽힌** 것, 또는 포커스 창(해시로 짚은)의 `ty=KEYGUARD…`가 **읽힌** 것, 또는 키가드 표시 글자. 못 읽음은 보류가 아니다 |
| `hold_reason`이 `None`(닫음) | 잠금 화면 창 종류를 못 찾아 또 BACK | 시험 자료가 V30 **실제** 덤프다(§6). 해시가 덤프 목록에 없으면 `focus_type`이 `None`이고, 그때는 전원 신호가 남는다(이번 사례는 `Asleep`이라 둘 다 걸린다) |
| 끝 줄 `남의 창 닫음`이 없음 | 가드가 안 돈 것과 닫을 것이 없던 것을 혼동 | 보류 줄(§3-5). 가드가 돈 폰은 `held` 또는 `dismissed`로 흔적이 남는다. 둘 다 0인 폰은 지금처럼 줄이 없다. **"가드가 돌았다"의 별도 신호는 이번에 안 만든다**(§8) |
| `dismissed` | 보낸 BACK과 판정 횟수가 섞임 | BACK을 보낸 뒤에만 센다(§3-4). 시험 5가 박는다 |

## 5. 원장 (append-only)

`data/log.jsonl`과 `data/` 아래 파일을 건드리지 않는다. 가드는 화면만 본다.

## 6. 시험 (결론은 테스트로 박는다)

### 시험 자료 (구현자가 V30에서 뜬다)

`tests/fixtures/guards/`에 실제 출력을 줄여서 둔다. 포커스 줄, 해당 창 블록(`ty=` 포함), 키가드 글자 줄, `mWakefulness=` 줄은 그대로 남기고 나머지는 잘라도 된다. 잘랐으면 파일 머리에 "어디를 잘랐다"를 한 줄 적는다.

| 파일 | 기기 상태 | 뜨는 법 |
|---|---|---|
| `v30-asleep-window.txt`, `v30-asleep-power.txt` | V30 `KEYCODE_SLEEP` 뒤 10초 | `adb -s <V30> shell dumpsys window`, `… dumpsys power` |
| `v30-awake-launcher-window.txt` | V30 깨우고 잠금 풀린 런처 | 같은 명령 |
| `a8-asleep-window.txt`(가능하면) | 메인 폰 잠듦 | 같은 명령. 다른 폰이 0회였던 이유(포커스 이름)를 적는 근거 |

`KEYCODE_SLEEP`는 화면 상태만 바꾸고 폰 설정(꺼짐 시간, 충전 중 켜짐, 잠금 방식)은 안 바꾼다(#120 §4와 같다). 잠금 패턴은 사람이 푼다. 잠금이 풀리지 않았으면 3번째 자료는 사람에게 부탁하고 못 떴으면 **못 떴다**고 적는다.

시스템 대화상자(`com.android.systemui`, 깨어 있음, 키가드 아님) 덤프는 일부러 띄우기 어렵다. 시험 2는 V30 깨어 있는 덤프를 바탕으로 포커스 창 블록의 `ty=`만 대화상자 값으로 바꾼 자료를 쓰고, 파일 머리에 "손으로 바꿈"을 적는다.

### 폰 없이 (`tests/capture/test_guards.py`)

1. `hold_reason(V30 잠듦 창, V30 잠듦 전원)` → `"asleep"`. 전원을 `None`으로 주면 → `"keyguard"`(창 종류만으로도 걸림).
2. 깨어 있음, 포커스 `com.android.systemui`, `ty`가 대화상자 값, 키가드 글자 없음 → `None`. 같은 자료의 `classify`는 여전히 `"dismiss"`.
3. 전원 덤프가 `None`, `""`, `"ERR timeout"`이고 창에 키가드 신호가 없으면 → `None`(못 읽음은 보류가 아니다).
4. 해시로 짚기: `com.android.systemui` 창 둘(하나는 `KEYGUARD_DIALOG`, 하나는 대화상자). 포커스 해시가 대화상자 쪽이면 `focus_type`이 대화상자 값이고 전원이 `Awake`면 `None`. 해시를 바꾸면 `"keyguard"`.
5. `check_once`: `window_dump`, `power_dump`, `subprocess.run`을 가짜로. 잠듦 자료면 반환 `"held"`, `KEYCODE_BACK` 호출 **0번**. 깨어 있는 대화상자 자료면 `"dismiss"`, BACK 1번.
6. `Guard.tick()` 열 번, 잠듦 자료: `dismissed == 0`, `held == 10`, BACK 0번, 보류 로그 **한 줄**. 이어서 깨어 있는 대화상자 자료로 한 번: `dismissed == 1`, BACK 1번. 다시 잠듦 한 번: 보류 로그가 한 줄 더(기억이 지워졌으므로).
7. `focused_window`가 지금과 같은 값을 돌려준다(기존 `test_common.py`의 `focused_window` 바꿔 끼우기 시험이 그대로 초록).
8. 기존 `test_window_guards`, `test_no_device_branch_in_guards`는 그대로 둔다. 시험 자료 파일의 해상도 숫자는 `guards` 소스가 아니라 상관없다.

### `tests/test_run_routine.py`

9. `NoGuard`에 `held = 0`을 더한다. 가드 하나가 `held = 3`, `dismissed = 0`인 가짜로 한 회차를 돌리면 로그에 `가드: 잠든 화면이라 안 닫음 <serial>=3회`가 있고 `남의 창 닫음` 줄은 없다.

### 실기 (V30, `scripts/collect_trial.ps1`)

예약 시각을 피해 `collect_trial.ps1`로 예약을 끄고 한다. `ADB_SERIAL`을 비운다.

- (a) V30을 `KEYCODE_SLEEP`로 재우고 `python -m capture.guards --serial <V30>`을 1분 돌린다. 로그에 보류 한 줄, `남의 창을 닫는다` 0줄. `--once`는 `held`를 출력.
- (b) 깨운 V30(런처)에서 `--once` → `ignore`. 지금과 같다.
- (c) 다음 정기 회차(사람이 본다) 끝 줄에서 V30이 `남의 창 닫음`이 아니라 `잠든 화면이라 안 닫음`에 있는지. PR 안에서 못 보면 **미확인**으로 남기고 후속으로 둔다.

## 7. 구현 순서

1. V30 시험 자료 뜨기(§6). 실제 덤프에서 `ty=` 모양과 키가드 글자가 이 문서의 가정(`ty=KEYGUARD_DIALOG`, 해시가 포커스 줄과 창 목록에 같이 나옴)과 맞는지 먼저 본다. 다르면 구현 전에 이 문서 §3-2를 고친다.
2. 순수 함수와 시험 1~4.
3. `check_once`, `Guard.tick`, 시험 5~7.
4. `run_routine` 끝 줄, `NoGuard`, 시험 9.
5. `ROUTINE-SPEC.md` §1.1-b, `capture/guards.py` 시스템 창 절 주석("잠금화면은 건드리지 않는다"를 실제 판정 근거로).
6. 실기 (a)(b).

## 8. 열린 질문

- **다른 폰이 0회인 이유는 확인하지 않았다.** 잠든 메인 폰의 포커스 이름이 `com.android.systemui`가 아니어서(`NotificationShade`나 `StatusBar` 등) `unknown`이나 `ignore`로 빠졌다고 추정한다. A8 자료(§6)를 뜨면 확인된다.
- **`ty=` 표기가 기기마다 같은지 모른다.** Android 버전에 따라 이름 대신 숫자(`ty=2009` 같은)로 찍힐 수 있다는 것은 확인하지 않은 일반 지식이다. 숫자로 나오면 `KEYGUARD` 비교가 안 걸리고 전원 신호만 남는다. 깨어 있는 잠금 화면(전원 `Awake`, 키가드 표시)에서는 키가드 글자가 받친다.
- 가드가 돌았는지 자체의 양성 신호(검사 횟수)를 끝 줄에 넣을지. 이번에는 `held`와 `dismissed`만 둔다. 검사 실패(`가드: 검사 실패`)가 4초마다 찍히는 경우가 있는지는 로그로 따로 볼 일이다.
