<!-- 원본: tracker docs/specs/issue-120-airplane-mode-off-verify.md — 여기서 고치지 않는다 -->
# 이슈 #120: 수집 마무리에서 비행기 모드가 안 꺼져도 아무도 모른다

영역: `collect` (원인 실측과 실기 시험에 A8 폰이 필요하다. 코드 자체는 폰 없이 시험된다).

## 1. 문제

- 2026-11-03 12:11 `<폰 일련번호> 마무리: {'airplane_off': False}`(`logs/trial-101-2026-11-03.log`), 12:41에 `airplane_mode_on`이 `1`. 시험은 `FAIL=0`이었다.
- `capture/phone_cycle.py finish`(207행)는 `set_airplane(serial, False)`의 결과를 `airplane_off`에 담아 돌려줄 뿐이다. 부르는 `scripts/run_routine.py finish_devices`(222행)는 그 딕셔너리를 `print`만 한다. 값을 보는 코드가 없다.
- 이 설계 문서를 쓴 세션은 클라우드 러너라 로그 파일과 A8 폰이 없다. 위 사실은 이슈 본문에서 가져왔고, 로그는 직접 못 읽었다.

### 코드를 읽다 찾은 두 번째 문제: "꺼짐"의 양성 신호가 없다

`airplane_is_on`(100행)은 `_sh(...) == "1"`이다. `_sh`는 adb가 실패하면 `"ERR ..."`를 돌려준다. 그러면 `airplane_is_on`은 **거짓**이고, `set_airplane(serial, False)`의 `airplane_is_on(serial) == on` 비교가 참이 되어 **꺼졌다고 판정한다**. 읽지 못한 것이 꺼짐으로 읽힌다. `AGENTS.md`가 말하는 "미관측을 관측으로 출력"하는 자리다. 이번 건의 `False`는 읽고 확인한 결과지만, 같은 함수의 `True`는 믿을 수 없다. 비행기 모드를 켜는 쪽(`on=True`)은 `"ERR"`이 거짓으로 읽히면 켜기를 시도하니 안전한 방향으로 틀린다. 끄는 쪽은 다르다. 첫 읽기가 일시적 `ERR`이면 `set_airplane(False)`가 끄기를 시도조차 않고(`airplane_is_on(serial) == on` 단축, 162행) `True`를 돌려준다. 폰은 켜진 채인데 끝났다고 한다. 시험 2가 이 경로를 박는다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에 비행기 모드나 폰 준비/마무리를 가진 묶음은 없다. 이 변경은 mono의 api, web, 배너 모양, 알림 묶음(5번)에 닿지 않는다. 수집기 안에서 직접 센 결과다.

| 자리 | 지금 | 이번에 |
|---|---|---|
| `capture/phone_cycle.py airplane_is_on`, `_wait_airplane`, `set_airplane` | `"1"` 여부만 보고 나머지는 모두 꺼짐 | 세 갈래 상태(켜짐/꺼짐/못 읽음)로 바꾼다 (§3-1) |
| `capture/phone_cycle.py finish` | 한 번 끄고 결과를 적음 | 화면 깨움, 재시도, 최종 상태를 담는다 (§3-2) |
| `capture/phone_cycle.py prepare` | `set_airplane(True)`, 와이파이 실패 시 `set_airplane(False)` | 코드 변경 없음. 세 갈래 상태 변경의 영향만 시험으로 확인 (§7 시험 6) |
| `scripts/run_routine.py finish_devices` | 딕셔너리를 `print` | 못 끈 폰을 슬랙 경고로 보낸다 (§3-3) |
| `scripts/run_routine.py` 호출 둘(테스트 중단 경로의 `finish_devices(attached)`, 수집 끝의 `finish_devices(attached)`) | `finish_devices(attached)` | 경고 함수와 폰 이름 함수를 넘긴다. 테스트 중단 경로도 같이 |
| `scripts/phone_cycle.py` (CLI) | `ok = all(v for k, v in rec.items() if k not in ("serial", "mem_kb"))`(29행) | **변경 필요.** 새 키 `airplane_retried=False`(정상, 무재시도)와 `airplane_state="off"` 같은 문자열이 `all(...)`에 걸려 정상 마무리가 늘 `실패`와 종료코드 1이 된다. 성공 판정은 `finish`일 때 `airplane_off`만 보고, `prepare`는 지금 그대로 둔다. 새 키 셋(`airplane_state`, `airplane_retried`, `woke`)은 판정에서 뺀다 (§3-2, 시험 10) |
| `scripts/check_routine.py`, `ROUTINE-SPEC.md`, `COLLECTION-INCIDENTS.md` | `마무리`, `airplane`을 읽지 않음(grep으로 확인) | 판정기는 건드리지 않는다. `COLLECTION-INCIDENTS.md`에 증상 한 줄 추가 (§6) |

넣지 않는 것:

- 수집 결과(`FAIL=`)를 바꾸는 일. 이슈가 정했다. 다음 수집의 `prepare`가 비행기 모드를 다시 켜므로 수집 자체는 안 막힌다.
- 폰 설정을 바꾸는 일(`settings put global airplane_mode_on 0` 포함). `AGENTS.md`가 폰 설정을 건드리지 말라고 했다. 이 값을 직접 쓰면 상태 값만 바뀌고 라디오는 안 켜진다(방송 없이는 반영되지 않는다. 확인하지 않은 일반 지식이다). 쓰지 않는다.
- 셸에서 방송 보내기(`am broadcast`). A8에서 Permission Denial이 난다고 `phone_cycle.py` 머리말에 기록돼 있다.

## 3. 설계

### 3-1. 세 갈래 상태 (할 일 1의 바탕)

- `airplane_state(serial) -> bool | None`을 새로 둔다. `_sh` 결과가 정확히 `"1"`이면 `True`, `"0"`이면 `False`, 그 밖(`ERR ...`, 빈 문자열, `null`)은 `None`이다. `None`은 읽지 못한 것이다.
- `airplane_is_on`은 지우지 않고 `airplane_state(serial) is True`로 얇게 남긴다. 다른 호출자가 있는지는 grep으로 `phone_cycle.py` 안에서만 쓰임을 확인했다. 이름을 그대로 두는 이유는 호출 자리를 줄이려는 것이다.
- `_wait_airplane(serial, on, tries)`는 `airplane_state(serial) is on`일 때만 성공이다. `None`은 성공이 아니다.
- `set_airplane`의 첫 줄 단축(`airplane_is_on(serial) == on`이면 바로 `True`)도 같은 기준으로 바꾼다. `on=False`일 때 `None`이면 단축하지 않고 끄기를 시도한다.

### 3-2. `finish`: 끄고, 다시 읽고, 한 번 더 (할 일 1)

순서:

1. `wake(serial)`를 `try`로 감싼다. 예외가 나도 "못 깨움"(`False`)으로 처리하고 2번으로 간다. `wake`가 던진 예외가 `set_airplane`까지 막으면 안 된다(`capture/phone_cycle.py`의 `wake` 안 `is_awake`, `scrcpy_wake` 경로). 화면이 꺼져 있으면 빠른 설정 패널(`cmd statusbar expand-settings`)과 타일 탭이 듣지 않을 것이다. 이는 **가설**이다(§4에서 실측). 이미 `Awake`면 `wake`가 곧바로 끝난다(`is_awake` 한 번). 이슈 #101과 같은 실패 방식이고(Dozing) 수집 마무리는 긴 수집 뒤라 입력 없는 구간이 2분을 넘었을 수 있다.
2. `set_airplane(serial, False)`. 기존 그대로(`cmd` 먼저, 안 되면 타일).
3. `airplane_state(serial)`로 **다시 읽는다**. `False`여야 성공이다. `True`나 `None`이면 실패다.
4. 실패면 한 번만 재시도한다: `wake` 다시(1번과 같이 `try`로 감싼다), 잠깐(2초) 쉬고 `set_airplane(serial, False)`, 다시 읽기. 이슈의 "한 번 재시도"를 따른다.
5. 반환 딕셔너리:
   - `airplane_off`: 위 마지막 읽기가 `False`일 때만 참 (기존 키 이름 유지)
   - `airplane_state`: `"off"` / `"on"` / `"unread"` — 거짓의 이유를 로그에서 가르는 용도
   - `airplane_retried`: 재시도 여부
   - `woke`: 마지막 `wake`의 결과(예외면 `False`). 경고 문구에 "화면을 못 깨웠다"를 붙이는 근거다(§5 넷째 줄). CLI 판정에서는 뺀다(§2 CLI 행)
6. `clean_apps`는 비행기 모드 성패와 무관하게 항상 돈다. 비행기 모드 끄기가 안 된다고 앱 정리를 건너뛰지 않는다.

`wake` 밖의 예외(`set_airplane` 등)는 `finish`가 받지 않고, 호출한 쪽 `_finish_one`의 `try/except`가 받는다. 그 경로의 경고는 §3-3.

**최악 소요 시간.** 한 번의 시도는 `wake`(`is_awake` 3번과 대기 6초, `scrcpy_wake` 최대 60초, `wake_and_swipe`) + `set_airplane`(`cmd` 최대 30초, 대기 2번, 타일 최대 3회 × (`expand-settings` 30초 + 1.5초 + 덤프 + 2초), 대기 8번 16초)이다. 재시도는 같은 일을 한 번 더 하고 2초를 쉰다. 그래서 폰 한 대의 합은 수 분까지 갈 수 있고, `finish_devices`는 폰을 순차로 돌려 전체 상한이 없다. 상한을 코드로 걸지 않는다. 실측으로 확인한다(§4 4·5번에서 `finish` 전체 소요를 잰다, §9).

### 3-3. 슬랙 경고 (할 일 2)

- `finish_devices(serials, alert=None, name=str)`로 바꾼다. `alert`는 `str`을 받는 함수, `name`은 시리얼을 폰 이름으로 바꾸는 함수다. `device_name`은 `cfg`가 있어야 하는데 `finish_devices`는 지금 `cfg`를 받지 않으므로 함수로 넘긴다. 호출 둘 다 `alert=r.alert, name=lambda s: device_name(r.cfg, s)`를 넘긴다(`Runner.alert`는 `ops`가 없으면 아무것도 안 한다. 두 호출 자리 모두 `r`이 이미 만들어져 있다).
- 폰 한 대의 일은 `_finish_one(serial, alert, name)`이 한다: `finish` 호출, 로그 한 줄(`마무리: {...}`, 기존 그대로), 경고 판단과 호출. 이 함수는 **예외를 밖으로 내지 않는다**(`finish` 예외, `alert` 예외 모두 안에서 받고 `마무리 실패:` 줄로 남긴다). `finish_devices`는 가드 뒤에 `_finish_one`을 순회만 한다.
- 경고를 내는 조건 (둘 중 하나):
  - `rec["airplane_off"]`가 참이 아님 (재시도 뒤에도 켜짐이거나 못 읽음)
  - `finish`가 예외를 던짐 (마무리 자체가 안 돌아 비행기 모드 상태를 모름)
- 문구: `{폰 이름}: 수집을 마쳤는데 비행기 모드를 못 껐습니다(상태: {켜짐|못 읽음}). 직접 풀어 주세요. 다음 수집은 이 폰의 비행기 모드를 다시 켜므로 수집에는 영향이 없습니다.` `woke`가 거짓이면 끝에 ` 화면을 못 깨웠습니다.`를 붙인다. 예외 경로: `{폰 이름}: 수집을 마친 뒤 마무리가 중간에 멈춰 비행기 모드 상태를 모릅니다({예외 종류}: {예외 메시지 앞 80자}). 직접 확인해 주세요.` 시험 7은 이 문구에서 **폰 이름과 `켜짐`/`못 읽음`(예외 경로는 `모릅니다`)만** 검사한다. 괄호 안은 검사하지 않는다. 폰 이름은 `run_routine`의 `device_name(cfg, serial)`을 쓴다. 사용자 화면에 나가는 글이 아니라 운영 슬랙이다. `docs/COPY-STYLE.md` 대상이 아니다.
- 슬랙 경로는 이미 있다: `Runner.alert` → `ops.alert` → `SlackSink._alert`의 `alert` 이벤트(`capture/slack_notify.py` 157행). 새 이벤트 종류나 싱크 변경은 없다.
- 경고 호출이 예외를 던져도 다음 폰의 마무리를 막지 않는다(`_finish_one` 안에서 받는다).
- 수집 결과는 바꾸지 않는다. 수집 끝의 `fail = int(any(...))` 계산은 그대로다.
- 경고 시점은 `run_end` 전이다. `run_end`의 요약 문구는 바꾸지 않는다. 경고가 슬랙에 한 줄 더 올 뿐이다.

### 3-4. 대안과 기각

| 안 | 기각 이유 |
|---|---|
| `finish`가 실패하면 수집을 FAIL로 | 이슈가 막았다. 값은 이미 원장에 들어갔고 비행기 모드는 수집 품질이 아니다 |
| `prepare` 쪽에서 "지난번에 못 끈 폰" 알림 | 알림이 다음 수집 시작까지 늦는다. 사용자가 A8을 쓰고 싶은 때는 그 사이다 |
| 비행기 모드를 안 켜고 수집 | 사용자가 정한 순서(2026-10-21)를 건드린다. 이 이슈 범위가 아니다 |

## 4. 원인 실측 (할 일 3, A8 필요)

클라우드 러너에서는 못 했다. 구현자가 A8로 아래를 순서대로 하고 결과를 §8에 채운다. 모르면 "모른다"와 확인한 방법을 그대로 적는다(끝 조건). 가설은 확인 전까지 가설이다.

폰을 잡는 일이라 `docs/workflow/LOCAL-RULES.md`의 `폰 시험:` 표시를 따르고, 예약 수집 시각(`ROUTINE-SPEC.md`)을 피한다. 손 실행은 `ADB_SERIAL`을 비운 채 한다(`AGENTS.md`: `env -u ADB_SERIAL`은 Git Bash 문법이다. PowerShell이면 `Remove-Item Env:ADB_SERIAL` 뒤에 실행한다). 폰 설정은 바꾸지 않는다. 4번의 `KEYCODE_SLEEP`는 화면 상태만 바꾸고 화면 꺼짐 시간, 충전 중 켜짐, 잠금 방식 같은 설정은 안 바꾸므로 `AGENTS.md`의 폰 설정 금지에 걸리지 않는다. 시험 중 화면이 의도치 않게 꺼지면 `python scripts/wake_phones.py --serial <기기>`로 깨운다. 비행기 모드 값 자체를 되돌리는 것은 시험의 일부로 허용되는 동작이다(수집이 매번 하는 일).

| # | 확인 | 명령 | 알아내는 것 |
|---|---|---|---|
| 1 | Android 버전, 빌드 | `adb -s <A8> shell getprop ro.build.version.release` | 8.x 확인 |
| 2 | `cmd connectivity airplane-mode` 지원 | `adb -s <A8> shell cmd connectivity airplane-mode disable` 뒤 stdout, stderr, 종료 코드, 그리고 `settings get global airplane_mode_on` | 머리말의 "지원 안 함" 기록이 지금도 맞는지. 상태가 바뀌었는지가 판단 기준이다(출력이 비어 있어도 성공일 수 있다) |
| 3 | 셸 방송 | `adb -s <A8> shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false` | Permission Denial 재현. 쓰지 않을 길이므로 재현만 확인하고 상태가 안 바뀌었는지 본다 |
| 4 | 화면 꺼짐이 원인인가 | `KEYCODE_SLEEP`로 재운 뒤 `finish`를 부르기(`ADB_SERIAL`을 비우고 `python scripts/phone_cycle.py finish --serial <A8>`, 코드 변경 전과 후 둘 다. 소요 시간도 잰다) | §3-2 1번 가설. 깨운 뒤 성공하면 원인 확정 |
| 5 | 타일 탭 실패 형태 | 화면을 켠 채 `_toggle_tile`이 어디서 끝나는지 로그: 타일을 찾았나(`tile_state`), 탭했나, 탭 뒤 몇 초에 상태가 바뀌었나 | 타일 못 찾음(덤프 비어 있음)과 탭했는데 안 바뀜을 가른다 |
| 6 | 12:11 시점 | `logs/trial-101-2026-11-03.log`에서 `마무리` 줄 앞뒤, 같은 폰의 직전 단계 끝 시각, 직전 `is_awake` 흔적 | 그 시점 화면 상태. 로그에 없으면 "모른다" |
| 7 | 반복 여부 | 브리핑 §4 "반복 실패"와 `logs/`의 `airplane_off': False` 개수 (`Grep`으로 날짜별) | 늘 나는지 가끔 나는지. 가끔이면 화면 상태 가설, 늘이면 타일 쪽 |

판단: 4에서 화면 꺼짐이 원인으로 나오면 §3-2 1번이 고침이다. 아니고 5에서 탭 후 상태가 안 바뀌면(권한 방식) 고칠 방법이 없을 수 있다. 그 경우 이 설계의 경고(§3-3)가 해법의 전부이고, 문서에 "모른다/고칠 수 없다"를 적는다.

## 5. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 위험 | 양성 신호 |
|---|---|---|
| `set_airplane(False)`의 `True` | 못 읽은 것을 꺼짐으로 판정(§1) | `settings get global airplane_mode_on`이 정확히 `0`으로 **읽힌** 것. `ERR`, 빈 값, `null`은 성공이 아니다 |
| `finish`의 `airplane_off: True` | 호출 안의 `set_airplane`을 믿음 | `finish`가 마지막에 따로 한 번 더 읽은 값이 `0` |
| 슬랙에 경고가 없음 | 경고가 안 나간 것과 문제가 없는 것 혼동 | 경고 조건이 `airplane_off`가 **참이 아님**이다(참일 때만 조용). 예외 경로도 경고. 로그 한 줄(`마무리: {...}`)은 계속 남기고 새 키 `airplane_state`가 이유를 보인다 |
| 화면이 깼다는 판정 | `finish`가 깼다고 믿고 탭 | `wake`의 반환값이 참이고 `is_awake`(`mWakefulness=Awake`가 읽힘). 거짓이어도 비행기 끄기는 시도한다(안 깬 채 포기하면 `cmd` 길이 막힌다). 거짓이면 `rec["woke"]`가 거짓이 되고, 경고가 나갈 때(`airplane_state`가 `on`/`unread`) 문구에 "화면을 못 깨웠습니다"를 덧붙인다(§3-3) |

## 6. 원장 (append-only)

`data/log.jsonl`을 건드리지 않는다. 쓰지 않는 경로(폰 상태)다. `data/` 아래에 새 파일을 만들지 않는다. 문서 변경은 `docs/setup/COLLECTION-INCIDENTS.md`에 증상 한 줄(슬랙에 "비행기 모드를 못 껐습니다"가 뜸 → `adb -s <기기> shell settings get global airplane_mode_on`로 확인 → 사람이 풀기)을 더하는 것이다. 문서로 끝내지 않는다. 결론은 아래 시험이 박는다.

## 7. 시험 (결론은 테스트로 박는다)

`tests/test_phone_cycle.py`에 더하고(`time.sleep`은 항상 `monkeypatch`로 없앤다), `finish_devices` 쪽은 `tests/test_run_routine.py`에 더한다. `finish_devices`는 `PYTEST_CURRENT_TEST`면 일찍 `None`을 돌려주는 가드(225행)가 있어 시험이 본문을 거치지 못한다. 그래서 실제 일을 `_finish_one(serial, alert, name)`로 뽑아 시험이 그 함수를 부른다. 가드는 `finish_devices`에 그대로 둔다.

**모킹 방식 (두 층을 섞지 않는다).**

- `_sh` 가짜는 순서 있는 값 목록으로 쓰지 않는다. `set_airplane` 안의 `_wait_airplane`이 읽기를 여러 번 소비하고 횟수가 구현에 따라 바뀌기 때문이다. 대신 **가짜 상태 함수**를 쓴다: 호출 기록을 남기고, `("cmd", "connectivity", "airplane-mode", "disable")` 호출이 N번 쌓인 뒤에야 `settings get ...`이 `"0"`을 돌려주게 하는 작은 클래스(`FakePhone`)다. 켜짐 유지/읽기 실패/N번째에 풀림을 인자로 고른다.
- 층 A (`_sh`를 가짜로, `set_airplane`은 진짜): 시험 1, 2, 3, 4a, 5. 호출 횟수는 `set_airplane` 호출 수가 아니라 `FakePhone`이 기록한 `disable` 명령 횟수로 센다. `finish`를 부르는 층 A 시험(3, 4a, 5)은 `wake`와 `clean_apps`를 가짜로 바꾼다. `wake`가 부르는 `wake_and_swipe`는 `capture.common`에서 `_sh`를 거치지 않고 adb를 부르므로 `_sh` 가짜로는 막히지 않는다. `_toggle_tile`이 부르는 `dump_ui`도 같은 이유로 가짜로 바꾼다(빈 문자열을 돌려주면 타일을 못 찾고 끝난다).
- 층 B (`set_airplane`, `wake`, `clean_apps`, `airplane_state`를 가짜로): 시험 4b, 6. `finish`의 순서와 분기만 본다.
- `_finish_one`, `finish_devices` 시험(7, 8, 9)은 `capture.phone_cycle.finish`를 통째로 가짜로 바꾼다.

폰 없이:

1. `airplane_state`: `"1"`→`True`, `"0"`→`False`, `"ERR x"`/`""`/`"null"`→`None`. (층 A)
2. `set_airplane(False)`: `FakePhone`이 계속 `"ERR"`이면 **거짓**(예전 코드는 참이었다). 첫 읽기만 일시적 `ERR`이고 이후 `"1"`이면 `disable`이 **한 번 이상 호출**되었는지 단언한다(§1의 "끄기를 시도조차 않고 True" 경로를 박는다). (층 A)
3. `finish`, 재시도로 풀림: 첫 `disable` 묶음까지는 `"1"`, 재시도의 `disable` 뒤 `"0"` → `airplane_off` 참, `airplane_retried` 참. (층 A. 첫 시도가 `set_airplane`을 몇 번 불렀는지는 단언하지 않는다.)
4a. `finish`, 끝까지 켜짐 (층 A): `FakePhone`이 계속 `"1"` → `airplane_off` 거짓, `airplane_state == "on"`, `airplane_retried` 참, `clean_apps` 호출됨.
4b. 재시도는 정확히 한 번 (층 B): `set_airplane`이 늘 거짓, `airplane_state`가 늘 `True` → `finish` 안 `set_airplane` 호출이 정확히 두 번이고 `clean_apps`가 한 번 불린다.
5. `finish`, 끝까지 `"ERR"` → `airplane_state == "unread"`, `airplane_off` 거짓. (층 A)
6. 순서와 예외: (층 B) `wake`가 `set_airplane`보다 먼저 불린다. `wake`가 **예외를 던져도** `set_airplane`이 불리고 `finish`가 예외를 밖으로 안 낸다(결정 2). `prepare`의 와이파이 실패 경로(`rec["airplane"] = not set_airplane(False)`)가 읽기 실패에서도 `airplane`을 참으로 남기는지(꺼졌다고 믿지 않음).
7. `_finish_one`: `airplane_off` 거짓이면 `alert`가 한 번 불리고 문구에 `name(serial)`의 값과 `켜짐`/`못 읽음`이 들어간다(괄호 안은 검사하지 않음, §3-3). `woke` 거짓이면 `화면을 못 깨웠습니다`가 더 들어간다. `finish`가 예외를 던지면 `alert`가 한 번 불리고 문구에 폰 이름과 `모릅니다`가 들어간다. `airplane_off` 참이면 `alert` 호출 0번.
8. `alert` 함수가 예외를 던져도 다음 폰의 마무리가 돈다(폰 둘, 첫째만 실패, 둘째의 `finish`가 불림). `finish_devices`를 부르기 전에 `monkeypatch.delenv("PYTEST_CURRENT_TEST")`로 가드를 넘는다(monkeypatch가 시험 끝에 되돌린다).
9. 이전 시험 9("`finish_devices`가 `None`")는 가드가 `None`을 일찍 돌려주므로 아무것도 증명하지 않아 **삭제한다.** 대신 `_finish_one`이 어떤 경우에도(finish 예외, alert 예외, 둘 다) **예외를 밖으로 내보내지 않는다**를 박는다. 수집 결과(`fail` 계산)가 마무리 경고와 무관하다는 보장은 이 불변식과 코드 리뷰로 갖고, `fail` 값 자체의 시험은 만들지 않는다.
10. CLI(`scripts/phone_cycle.py`): `capture.phone_cycle.finish`를 가짜로 바꿔 `{"serial", "airplane_off": True, "airplane_state": "off", "airplane_retried": False, "woke": False, "mem_kb": (1, 2)}`일 때 `main(["finish", "--serial", "X"])`가 **0**을 돌려준다(결정 1). `airplane_off` 거짓이면 1. `prepare`의 기존 판정은 그대로다(`awake` 거짓이면 1).

실기 시험 (끝 조건, A8): `scripts/collect_trial.ps1`로 예약을 끄고 한다. 수집 마무리(`finish`)를 두 경우로 돌린다. (a) 화면이 켜진 A8, (b) `KEYCODE_SLEEP`로 재운 A8. 각각 `settings get global airplane_mode_on`이 `0`이고 슬랙에 경고가 없는지 본다. 경고 경로는 일부러 만든다: 드라이버에서 `set_airplane`을 항상 거짓으로 돌려 `finish_devices`를 부르고 슬랙 채널에 실제로 한 줄이 오는지 본다(수집 PC의 `<슬랙 키 파일>`가 있어야 한다. 없으면 이 확인은 **미확인**으로 남긴다).

## 8. 원인 실측 결과 (구현자가 채운다)

2026-11-03 23:09~23:13, A8(`<폰 일련번호>`), `ADB_SERIAL`을 비우고 PowerShell로, 4·실기 시험은 `scripts/collect_trial.ps1` 안에서 했다(예약을 껐다 다시 켬, 끝에 `Ready, 다음 실행 00:01` 확인). 시작 때 A8은 12:11 이후 **여전히** `airplane_mode_on=1`, `mWakefulness=Asleep`이었다.

| # | 결과 |
|---|---|
| 1 | `8.0.0` |
| 2 | `cmd connectivity airplane-mode disable` → stdout `No shell command implementation.`, 셸 종료 코드 0, 상태 `1` 그대로. 머리말의 "지원 안 함"이 지금도 맞다. 종료 코드로는 못 가린다 |
| 3 | `am broadcast ... AIRPLANE_MODE` → 예외 스택(`ActivityManagerService.onTransact`), 상태 `1` 그대로. Permission Denial 재현 |
| 4 | **원인 확정.** 화면 Asleep 그대로 옛 경로(`set_airplane(False)`, 깨우기 없음): `False`, 상태 `1`, 31초. 이어 새 `finish`(같은 Asleep 상태): `woke True, airplane_off True, airplane_state off, airplane_retried False`, 25초. 화면을 켜고 한 (a)도 `airplane_off True`, 재시도 없음, 23초 |
| 5 | 따로 로그를 잡지 않았다. 4에서 Asleep이면 실패, 깨우면 첫 시도에 성공했으므로 "탭했는데 안 바뀜(권한 방식)"은 이번에 안 나왔다. 타일 못 찾음과 탭 무시 중 어느 쪽인지는 **모른다**(덤프를 안 남겼다) |
| 6 | `logs/trial-101-2026-11-03.log`(메인 작업 폴더): 같은 회차 다른 폰 넷은 `True`, A8만 `False`. 그 시점 `is_awake` 흔적은 로그에 없어 화면 상태는 **모른다**. 다만 4의 재현과 같은 모양이다 |
| 7 | 메인 작업 폴더 `logs/`의 텍스트 로그에서 A8 마무리 줄은 `False` 4건, `True` 0건(11-03 파일 다섯 곳). 늘 실패했다. 수집이 길어 마무리 때는 늘 2분 절전에 걸려 있었다는 설명과 맞는다 |

`finish` 소요(§9): A8 한 대 23~25초(재시도 없음). 재시도 경로와 LG 폰(scrcpy)의 소요는 재지 않았다.

실기 경고 경로: 드라이버에서 `set_airplane`을 늘 거짓, 읽기를 늘 켜짐으로 바꿔 `finish_devices([A8], alert=슬랙 싱크만 붙인 Ops.alert)`를 불렀다(문구 앞에 `[#120 시험, 무시]`). 로그 `마무리: {... 'airplane_retried': True, 'airplane_off': False, 'airplane_state': 'on'}`가 찍혔고, 폰 실제 상태는 `0`으로 남았다. 슬랙 채널 도착은 이 세션이 화면으로 보지 못했다(**미확인**, 사람 확인 필요).

## 9. 열린 질문

- **화면 꺼짐이 원인이라는 것은 가설이다.** 이슈 본문은 12:11 마무리가 실패했다고만 적었고, 그 시점 화면 상태는 이 세션이 확인하지 못했다.
- 재시도 사이에 `wake`를 부르면 LG 폰은 scrcpy 경로로 60초까지 걸릴 수 있다(#101 열린 질문과 같음). A8은 adb로 충분한지 §4 4번에서 본다.
- **`finish` 소요 시간 상한 없음.** 최악 합은 §3-2에 적었고 코드로 상한을 걸지 않는다. 실측(§4 4·5번)으로 A8과 다른 폰의 실제 소요를 확인해 §8에 적고, 수 분을 넘으면 후속으로 상한을 논의한다.
- 경고가 같은 폰에서 매번 올라오면 소음이다. 먼저 실측 7번으로 빈도를 보고, 필요하면 하루 한 번으로 줄이는 일은 후속으로 둔다. 이번에 넣지 않는다.

## 변경 이력

- 2026-11-03: 이슈 본문 "결정 (설계 검토 뒤 재설계)" 8건 반영. 이 실행에서 읽은 입력에 권한자 댓글은 없었고, `인계:` 댓글도 없었다.
  1. §2 CLI 행: "코드 변경 없음"을 고쳐 `scripts/phone_cycle.py` 29행 `all(...)` 판정 수정을 넣고 §7 시험 10을 더함.
  2. §3-2 1번: `wake`를 `try`로 감싸 예외도 "못 깨움"으로 보고 끄기를 계속함. 시험 6에 반영.
  3. §7 시험 9: 아무것도 증명하지 않던 `None` 단언을 삭제하고 "`_finish_one`이 예외를 밖으로 안 내보낸다"로 대체.
  4. §7 모킹: 순서 있는 `_sh` 값 목록을 버리고 `disable` 호출 뒤 값이 바뀌는 `FakePhone`과 `time.sleep` 모킹으로 바꿈. `_sh`를 가짜로 하는 층 A와 `set_airplane`을 가짜로 하는 층 B를 가름.
  5. §3-2에 `finish` 최악 소요 시간을 적고, 상한 없음과 실측 확인을 §9에 넣음.
  6. §1: 끄는 쪽 첫 읽기가 일시적 `ERR`이면 끄기를 시도 않고 `True`를 돌려주는 경로를 적고 시험 2가 박게 함.
  7. §4: `env -u ADB_SERIAL`이 Git Bash 문법임을 밝히고 PowerShell 대안을 적음. `KEYCODE_SLEEP`가 폰 설정 금지에 걸리지 않는 이유를 한 줄 더함.
  8. §3-3: 예외 경로 문구 괄호 안을 `{예외 종류}: {메시지 앞 80자}`로 확정하고 시험 7은 폰 이름과 `켜짐`/`못 읽음`/`모릅니다`만 검사하도록 좁힘.
- 2026-11-03 (두 번째 재설계 실행): 입력에 권한자 댓글과 `인계:` 댓글은 여전히 없었다. 이슈 본문 결정 8건이 위 반영대로 문서에 있는지 코드와 다시 대조했고, 반영 과정에서 생긴 어긋남을 고쳤다. 결정 자체는 바꾸지 않았다.
  1. §3-3: `device_name(cfg, serial)`은 `cfg`가 필요한데 `finish_devices`는 `cfg`를 안 받는다. `finish_devices(serials, alert=None, name=str)`로 이름 함수를 넘기고, 호출 둘은 `name=lambda s: device_name(r.cfg, s)`를 넘긴다. 시험 7이 `name(serial)` 값을 본다.
  2. §3-3: 경고 예외를 받는 자리를 "`finish_devices` 루프"에서 `_finish_one`으로 옮겨 시험 9(결정 3)와 맞췄다. `_finish_one`의 할 일을 한 줄로 적었다.
  3. §3-2, §5: §5의 "화면을 못 깨웠다"를 붙일 근거가 반환값에 없었다. `woke` 키를 더하고 경고 문구 꼬리를 확정했다. CLI 판정에서 뺄 키를 셋으로 고치고 시험 10에 `woke: False`를 넣었다.
  4. §7: 시험 4가 층 A와 층 B를 한 시험에 섞고 있어 4a(층 A)와 4b(층 B)로 갈랐다(결정 4). 층 B 목록의 "시험 9"는 `_finish_one` 시험이라 층 목록에서 빼고 따로 적었다.
  5. §7: `finish`를 부르는 층 A 시험에서 `wake_and_swipe`와 `dump_ui`는 `_sh`를 거치지 않고 adb를 직접 부르므로 `FakePhone`으로 안 막힌다. `wake`, `clean_apps`, `dump_ui`를 가짜로 바꾸라고 적었다.
  6. §7 시험 8: 가드를 넘는 방법을 `monkeypatch.delenv("PYTEST_CURRENT_TEST")` 하나로 정했다.
  7. §2: "§5 시험 6"을 "§7 시험 6"으로 바로잡고, 호출 자리를 행 번호 대신 문구로 적었다(결정 머리말: 구현자는 번호 대신 문구로 찾는다).
- 2026-11-03 (구현): `/approve-design` 댓글(13:24)의 "`_finish_one` 인자를 `(serial, alert, name)` 3개로 맞춘다"를 반영해 §7 머리말을 고쳤다. §8에 A8 실측 결과를 채웠다(원인: 화면 Asleep에서 타일을 못 누름, 깨우면 풀림).
