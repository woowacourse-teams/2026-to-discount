<!-- 원본: tracker docs/specs/2026-11-06-device-fleet-plan-2.md — 여기서 고치지 않는다 -->
# 기기 함대 계획 2: 전략, 조작 측정, 위임, 상태기계

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 깨우기, 비행기 모드, 와이파이를 측정값으로 고른 전략 하나로 돌리고, 조작 측정으로 그 측정값을 채우고, 옛 `phone_cycle` 함수가 전략에 위임하게 하고, 폰 한 대의 생애주기 상태기계를 만든다.

**Architecture:** `capture/fleet/`에 `adb`(공용 실행기), `events`(사건 기록), `strategy`(전략과 폰별 잠금), `tiles`(빠른 설정 타일), `lifecycle`(상태기계)을 더한다. 옛 `phone_cycle.wake`, `is_awake`, `is_asleep`, `set_airplane`, `set_wifi_on`은 이름과 반환값(bool)을 지킨 채 전략에 위임한다. 지금 깨우기를 부르는 곳(`common.ensure_awake`, `require_unlocked`, `landing_check`, `run_routine`, `wake_phones`, `probe_offer_links`, `brand_links`)은 모두 이 셋을 거치므로 호출부는 안 바뀐다. 상태기계는 이 계획에서 연결하지 않는다(계획 3이 `run_routine`에 연결한다).

**Tech Stack:** Python 3.12/3.14, pytest, 표준 라이브러리.

**Spec:** `docs/specs/2026-11-06-device-fleet-design.md`(판 5). 9절 순서 3, 5~8(A1-3, A2-1~A2-4). 계획 1(`docs/specs/2026-11-06-device-fleet-plan-1.md`)의 `registry`, `traits`, `power`, `probe`, `eligibility` 위에 선다.

## 리뷰 1 반영 (2026-11-06, 구현 전)

계획 콜드 리뷰(새 Opus 5.5 세션, 계획의 코드를 저장소 사본에서 돌림)의 지적에 대한 결정이다. 아래 Task 본문과 다르면 이 절이 이긴다. 최종 코드는 커밋이 정본이다.

실기 안전(높음):
- **조작 측정은 `collect_trial.ps1`로만 돈다.** `python -m capture.fleet.probe --act`는 직접 잠금을 만들지 않는다. 대신 `collect_trial.lock`이 있고 첫 줄 PID가 살아 있을 때만 돌고, 아니면 종료 코드 3. 실행은 `powershell -NoProfile -File scripts\collect_trial.ps1 -Command "python -m capture.fleet.probe --act"`. 하네스가 PID와 시리얼 줄을 쓰고, 예약 수집을 끄고, 도는 예약이 있으면 시작하지 않고, 끝에 지운다. 검증 봇은 그 잠금을 본다(`scripts/verify_bot.py:189`).
- **조작 측정은 USB로 붙은 폰만.** 무선 adb는 비행기 모드를 켜면 끊긴다. 대상은 `adb devices`에 시리얼 그대로 붙은 폰이다.
- **폰마다 try/finally로 되돌린다.** 측정이 어디서 끝나든 비행기 모드 끄기(측정한 `airplane_cmd` 전략)와 깨우기를 한다. 되돌리기 실패는 출력하고 종료 코드 1.
- **`wifi_svc`는 측정 중에 저장하지 않는다.** `strategy.wifi_on(..., use_svc=True)`처럼 인자로 넘기고, 측정이 끝난 뒤 판정만 저장한다. 비행기 모드인데도 처음부터 핑이 되면(`already`) 그 회는 무효이고, 두 번 다 무효면 `null`로 남기고 보고한다.
- **전략 입구에서 연결 이름을 시리얼로 바꾼다.** `fleet.find(conn)`이 있으면 측정 키와 잠금 파일 이름은 그 시리얼이다. adb 명령에는 받은 연결 이름을 그대로 쓴다. 잠금 파일 이름에 `:`가 들어가지 않는다(NTFS 대체 스트림). 레지스트리에 없는 연결이면 이름의 `:`를 `_`로 바꾼다.
- **`os`가 `android`가 아닌 기기는 `ProbeNeeded`**("이 OS 전략 없음", 설계 3절 `os`로 먼저 가르기).

시험 기반(높음, 중간):
- **기본 인자로 `time.sleep`이나 `time.monotonic`을 박지 않는다.** `sleep=None`, `clock=None`으로 받고 함수 안에서 `sleep or time.sleep`을 쓴다. 그래야 시험이 `time.sleep`을 바꿔 끼운 것과 #141 예산 가드가 닿는다.
- **`tests/test_wake_single_path.py`는 Task 3 커밋에서 `capture/fleet/`를 허용 경로에 더한다.** Task 9에서 넓힌 시험으로 바꾼다.
- **conftest의 전원 패치를 옮기면 깨지는 시험(리뷰가 사본에서 돌려 뽑은 목록):**
  - `test_fleet_power` 3건(Task 3의 `awake_unpatched` 픽스처를 단다)
  - `test_phone_cycle`의 `airplane_state_three_ways[1-True]`, `[0-False]`, `set_airplane_off_transient_err_still_tries`, `finish_retry_releases`, `finish_stays_on`(`_sh` 패치가 안 닿는다. 실행기와 traits로 다시 쓴다)
  - `test_screen_off::test_is_asleep_needs_a_reading`
  - `test_wake_single_path`
  - 다른 이유로 통과하는 셋: `test_set_airplane_off_unread_is_not_off`, `test_finish_unread`(`ProbeNeeded`로 끝남), 측정 시험(conftest의 Awake). Task 6 Step 4에서 이 목록을 하나씩 의도대로 고친다. fleet 시험 파일은 모두 `awake_unpatched`를 단다.
- **예외는 동작별로만 나간다.** 잠금을 140초 안에 못 잡으면 깨우기는 `WakeFailed`, 비행기 모드는 `AirplaneStuck`, 와이파이는 `WifiFailed`. `adb.shell`은 `OSError`(adb 실행 파일 없음 등)를 `(127, "", 이유)`로 돌려준다. 위임 함수는 동작별 예외, `ProbeNeeded`, `OSError`를 잡아 False로 준다.

Task 5 본문 보충:
- `--read`와 `--act`는 둘 중 하나(필수 아님, 상호 배타).
- `measure_dump(serial, *, run, dump, clock, n=10)`: `run`으로 홈 키를 보낸다.
- `measure_wifi_svc`, `main --act`에 시험을 단다: 잠금 없으면 3, 봇 잠금 폰 건너뜀, 측정 중 예외에도 되돌림, `already`는 무효.
- 실기 알림 문구에 "V50, V30처럼 adb로 안 깨는 폰은 scrcpy 창이 뜬다"를 넣는다.

Task 8 보충:
- `lease`가 실패하면(깨우기나 발열) 그 안에서 복구까지 돌고 결과 상태를 돌려준다.
- `thermal.wait_if_hot`은 bool을 돌려주게 한다(식었거나 안 뜨거움 True, 900초를 넘김 False). 지금 부르는 곳은 반환값을 안 쓴다.
- 준비 성공 조건 중 잠금 화면 없음, 배달앱 프로세스 없음은 `Ops.ready_problems() -> list[str]`로 보고 `warnings`에 남긴다(제외 이유 코드는 늘리지 않는다). 반납은 끝에 `online`을 보고 실패면 경고.
- 준비 동시 실행과 복구 60초 상한은 `run_routine`에 연결하는 계획 3에서 한다.

낮음: 덮개 걷기는 지금처럼 위임 `phone_cycle.wake`가 `swipe_keyguard`를 부른다(전략은 깨우기만). `strategy.wake`의 인자 이름은 `click=`. `power.py` 문서 문자열과 Task 2의 쓰지 않는 import는 정리한다.

## Global Constraints

- 계획 1의 Global Constraints를 그대로 따른다(UTF-8 LF, PowerShell 도구로 adb, `git commit -F <메시지> -- <파일들>`, 메시지 파일은 Write 도구, push는 Bash 단독 명령, 브랜치 `feat/pool-units`, PR 하나로 나중에).
- 시험에서 진짜 adb, scrcpy, PowerShell 창을 부르지 않는다. 실행기, 잠자기, 시계, scrcpy 누르기를 주입한다.
- 옛 함수의 이름, 인자, 반환값은 지킨다. 호출부 네 곳(`capture/common.py:120`, `:191`, `:198`, `:1047`)이 `wake`의 bool을 쓴다.
- 전략끼리 이어 붙이지 않는다(설계 3절). 측정값이 `null`이면 `ProbeNeeded`.
- 실기 조작(Task 5 Step 5, V-1)은 수집이 없는 시간에 사용자에게 한 줄 알리고 한다. `collect_trial.lock`을 잡고, `verify_bot.lock`이 있으면 그 폰을 건너뛴다.

## Review Focus

1. 이미 켜진 화면에 scrcpy 우클릭을 보내면 뒤로가기라 작업 중 화면이 넘어간다. `adb_wake` 거짓 폰도 `Awake`면 아무것도 안 해야 한다. Task 3이 시험한다.
2. 같은 폰을 두 프로세스가 동시에 깨우면 하나만 돈다. 잠금은 재진입이 안 되므로 비행기 모드 타일 전략이 깨우기를 부를 때 잠금을 겹쳐 잡지 않아야 한다. Task 3, Task 4가 시험한다.
3. 측정값이 없는 폰(`adb_wake: null`)은 옛 함수(`phone_cycle.wake`)가 False를 주고 이유를 찍는다. 예외가 단계 스크립트까지 올라가 죽지 않는다. Task 6이 시험한다.
4. 와이파이 실패 때 비행기 모드를 끄고 핑이 되면 계속 간다(지금 `phone_cycle.prepare`와 같다). 핑도 안 되면 `offline`. Task 8이 시험한다.
5. 발열 존을 못 읽는 폰 하나가 다른 폰의 판정을 바꾸지 않는다. Task 7이 시험한다.

---

### Task 1: 공용 실행기, 전원 읽기와 측정기가 같은 꼴을 쓴다

**Files:**
- Create: `capture/fleet/adb.py`
- Modify: `capture/fleet/power.py`, `capture/fleet/probe.py`(실행기를 `adb.shell`로)
- Modify: `tests/test_fleet_power.py`
- Test: `tests/test_fleet_adb.py`

**Interfaces:**
- Produces: `adb.Shell = Callable[[str, list[str]], tuple[int, str, str]]`, `adb.shell(serial, args, timeout=30) -> (rc, out, err)`(시간 초과는 `(124, "", "timeout")`), `adb.out(run, serial, *args) -> str`(stdout, 실패면 `""`). `power.wakefulness(serial, run=adb.shell)`, `power.is_awake(serial, run=adb.shell)`, `probe.read_traits(serial, run=adb.shell)`.

- [ ] **Step 1: 실패하는 시험**

`tests/test_fleet_adb.py`:

```python
"""공용 실행기(계획 2 Task 1). 실제 adb는 안 부른다."""
from capture.fleet import adb


def test_out_returns_stdout_or_empty():
    assert adb.out(lambda s, a: (0, " x \n", ""), "S", "getprop") == "x"
    assert adb.out(lambda s, a: (1, "", "error"), "S", "getprop") == ""

    def boom(s, a):
        raise OSError("adb 없음")
    assert adb.out(boom, "S", "getprop") == ""


def test_shell_timeout_is_a_result(monkeypatch):
    import subprocess

    def slow(*a, **kw):
        raise subprocess.TimeoutExpired(cmd="adb", timeout=1)
    monkeypatch.setattr(adb.subprocess, "run", slow)
    assert adb.shell("S", ["getprop"], timeout=1) == (124, "", "timeout")
```

`tests/test_fleet_power.py`의 `_run`을 새 꼴로 바꾼다:

```python
def _run(out=None, exc=None):
    def run(serial, args):
        assert args == ["dumpsys", "power"]
        if exc:
            raise exc
        return (0, out, "")
    return run
```

- [ ] **Step 2: 실패를 본다**

Run: `python -m pytest -q -p no:cacheprovider tests/test_fleet_adb.py tests/test_fleet_power.py`
Expected: FAIL(`adb` 모듈 없음, power 시험이 옛 꼴)

- [ ] **Step 3: 구현**

`capture/fleet/adb.py`:

```python
"""공용 adb 실행기(계획 2). stdout과 stderr를 따로 받는다(run_adb는 stdout만 주고 실패면 예외다).
전략, 전원 읽기, 측정기가 모두 이 꼴 run(serial, args) -> (rc, out, err)을 쓴다. 시험은 이것을 주입한다."""
from __future__ import annotations

import subprocess
from typing import Callable

Shell = Callable[[str, list], tuple]


def shell(serial: str, args: list, timeout: float = 30) -> tuple[int, str, str]:
    try:
        p = subprocess.run(["adb", "-s", serial, "shell", *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    return p.returncode, p.stdout, p.stderr


def out(run: Shell, serial: str, *args: str) -> str:
    try:
        rc, o, _ = run(serial, list(args))
    except (OSError, subprocess.SubprocessError):
        return ""
    return (o or "").strip() if rc == 0 else ""
```

`capture/fleet/power.py`의 `_adb_shell`을 지우고:

```python
from capture.fleet import adb


def wakefulness(serial: str, run=None) -> str | None:
    run = run or adb.shell
    try:
        _, out, _ = run(serial, ["dumpsys", "power"])
    except Exception:                                   # noqa: BLE001  못 읽으면 모른다
        return None
    m = _WAKE.search(out or "")
    return m.group(1) if m else None
```

`capture/fleet/probe.py`: `def adb(...)`를 지우고 `from capture.fleet import adb as _adb`, 기본값 `run=_adb.shell`. 시험의 `probe.adb` 참조는 없다(주입만 한다).

- [ ] **Step 4: 통과를 본다**

Run: `python -m pytest -q -p no:cacheprovider tests/test_fleet_adb.py tests/test_fleet_power.py tests/test_fleet_probe.py`
Expected: PASS

- [ ] **Step 5: 커밋** `refactor(fleet): 공용 실행기 하나로, 전원 읽기와 측정기가 같은 꼴 (#179)`

### Task 2: 사건 기록

**Files:**
- Create: `capture/fleet/events.py`
- Modify: `tests/conftest.py`(`FLEET_EVENTS`를 시험별 임시 경로로)
- Test: `tests/test_fleet_events.py`

**Interfaces:**
- Produces: `events.log_path() -> Path`(환경변수 `FLEET_EVENTS`, 없으면 측정 저장소 폴더의 `events/<YYYY-MM-DD>.jsonl`), `events.emit(kind: str, serial: str, **fields) -> None`(한 줄 JSON: `ts`, `pid`, `step`(환경변수 `ROUTINE_STEP`, 없으면 null), `kind`, `serial`, 나머지. 쓰기 실패는 삼키고 `[suspect]` 한 줄), `events.read(path=None) -> list[dict]`. 계획 3의 `run_routine`이 회차마다 `FLEET_EVENTS`를 회차 폴더로 주고 끝에 `state.json`으로 합친다.

- [ ] **Step 1: 시험**

```python
"""사건 기록(설계 4절, 7절)."""
import json

from capture.fleet import events


def test_emit_appends_json_lines_with_context(tmp_path, monkeypatch):
    p = tmp_path / "ev.jsonl"
    monkeypatch.setenv("FLEET_EVENTS", str(p))
    monkeypatch.setenv("ROUTINE_STEP", "4a")
    events.emit("wake", "S1", strategy="adb_key", ok=True, secs=1.5)
    events.emit("transition", "S1", frm="ready", to="leased")
    rows = events.read()
    assert [r["kind"] for r in rows] == ["wake", "transition"]
    assert rows[0]["step"] == "4a" and rows[0]["serial"] == "S1" and rows[0]["ok"] is True
    assert all("ts" in r and "pid" in r for r in rows)
    assert p.read_bytes().count(b"\n") == 2 and b"\r\n" not in p.read_bytes()


def test_emit_never_raises(tmp_path, monkeypatch, capsys):
    d = tmp_path / "dir"
    d.mkdir()
    monkeypatch.setenv("FLEET_EVENTS", str(d))            # 폴더라 쓸 수 없다
    events.emit("wake", "S1")
    assert "[suspect]" in capsys.readouterr().out


def test_read_skips_broken_lines(tmp_path, monkeypatch):
    p = tmp_path / "ev.jsonl"
    p.write_text('{"kind": "a"}\n깨진\n{"kind": "b"}\n', encoding="utf-8")
    monkeypatch.setenv("FLEET_EVENTS", str(p))
    assert [r["kind"] for r in events.read()] == ["a", "b"]
```

conftest에 더한다(`_isolated_fleet_traits` 안):

```python
    monkeypatch.setenv("FLEET_EVENTS", str(tmp_path / "fleet_events.jsonl"))
```

- [ ] **Step 2: 실패를 본다** → `ImportError`

- [ ] **Step 3: 구현**

```python
"""기기 사건 기록(설계 4절, 7절): 깨우기 시도, 상태 전이. 여러 프로세스가 한 파일에 한 줄씩 덧붙인다.
기록은 수집을 막지 않는다. 쓰기 실패는 [suspect] 한 줄로 끝난다."""
from __future__ import annotations

import json
import os
import time
from datetime import date, datetime
from pathlib import Path

from capture.fleet import traits


def log_path() -> Path:
    env = os.environ.get("FLEET_EVENTS")
    if env:
        return Path(env)
    return traits.store_path().parent / "events" / f"{date.today().isoformat()}.jsonl"


def emit(kind: str, serial: str, **fields) -> None:
    row = {"ts": datetime.now().astimezone().isoformat(timespec="seconds"), "pid": os.getpid(),
           "step": os.environ.get("ROUTINE_STEP"), "kind": kind, "serial": serial, **fields}
    p = log_path()
    try:
        with traits.file_lock(p.with_name(p.name + ".lock"), wait_s=5):
            with open(p, "a", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except (OSError, TimeoutError) as exc:
        print(f"  [suspect] 기기 사건을 못 남겼다({kind} {serial}): {exc}", flush=True)


def read(path: Path | None = None) -> list[dict]:
    p = Path(path) if path else log_path()
    rows = []
    try:
        lines = p.read_text(encoding="utf-8").splitlines()
    except OSError:
        return rows
    for line in lines:
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows
```

`time` import는 쓰지 않으면 뺀다.

- [ ] **Step 4: 통과** `python -m pytest -q -p no:cacheprovider tests/test_fleet_events.py`
- [ ] **Step 5: 커밋** `feat(fleet): 기기 사건 기록 (#179)`

### Task 3: 깨우기 전략과 폰별 잠금

**Files:**
- Create: `capture/fleet/strategy.py`
- Test: `tests/test_fleet_strategy_wake.py`

**Interfaces:**
- Consumes: `adb.shell`, `adb.out`, `power.is_awake`, `traits.get`, `traits.file_lock`, `traits.store_path`, `events.emit`, `capture.common.DeviceAsleep`
- Produces:
  - 예외 `ProbeNeeded(RuntimeError)`, `WakeFailed(DeviceAsleep)`, `AirplaneStuck(RuntimeError)`, `WifiFailed(RuntimeError)`
  - `strategy.DEVICE_LOCK_WAIT_S = 140`, `strategy.device_lock(serial)`(컨텍스트 관리자, `traits.store_path().parent / "<시리얼>.lock"`)
  - `strategy.wake(serial, *, run=adb.shell, sleep=time.sleep, scrcpy_click=None) -> str`(쓴 전략 이름 `already`, `adb_key`, `scrcpy`. 실패면 `WakeFailed`, 측정 없음이면 `ProbeNeeded`)
  - `strategy.keep_awake(serial, run=adb.shell) -> None`(`KEYCODE_UNKNOWN`)
  - `strategy.scrcpy_click(serial) -> None`(지금 `phone_cycle.scrcpy_wake`의 창 하나 누르기. `PYTEST_CURRENT_TEST`면 아무것도 안 한다)

- [ ] **Step 1: 시험**

```python
"""깨우기 전략(설계 3절). 측정값으로 한 길만 쓰고 끝에 Awake를 확인한다."""
from __future__ import annotations

import threading

import pytest

from capture.fleet import strategy, traits


class Phone:
    """가짜 폰: 전원 상태와 받은 명령. adb 키가 듣는지 정한다."""
    def __init__(self, state="Asleep", adb_works=True):
        self.state, self.adb_works, self.cmds = state, adb_works, []

    def run(self, serial, args):
        self.cmds.append(args)
        if args == ["dumpsys", "power"]:
            return 0, f"mWakefulness={self.state}", ""
        if args[:3] == ["input", "keyevent", "KEYCODE_WAKEUP"] and self.adb_works:
            self.state = "Awake"
        return 0, "", ""

    def click(self, serial):
        self.cmds.append(["scrcpy-click"])
        self.state = "Awake"


@pytest.fixture(autouse=True)
def awake_unpatched(monkeypatch):
    """conftest가 시험 전체에서 전원을 Awake로 두지만(계획 2 Task 6), 이 파일은 가짜 폰으로 본다."""
    from capture.fleet import power
    monkeypatch.setattr(power, "wakefulness", power._wakefulness_raw, raising=False)


def _wake(phone, **kw):
    return strategy.wake("S1", run=phone.run, sleep=lambda s: None, scrcpy_click=phone.click, **kw)


def test_already_awake_does_nothing_even_for_scrcpy_phone():
    traits.update("S1", adb_wake=False)
    p = Phone(state="Awake")
    assert _wake(p) == "already"
    assert ["scrcpy-click"] not in p.cmds                  # 켜진 화면에 우클릭은 뒤로가기다


def test_adb_key_phone_uses_only_adb_key():
    traits.update("S1", adb_wake=True)
    p = Phone(state="Dozing")
    assert _wake(p) == "adb_key"
    assert ["scrcpy-click"] not in p.cmds


def test_scrcpy_phone_uses_only_scrcpy():
    traits.update("S1", adb_wake=False)
    p = Phone(state="Asleep", adb_works=False)
    assert _wake(p) == "scrcpy"
    assert not any(c[:2] == ["input", "keyevent"] for c in p.cmds)


def test_wrong_measurement_fails_loud_without_falling_back():
    traits.update("S1", adb_wake=True)
    p = Phone(state="Asleep", adb_works=False)             # 측정은 참인데 실제로는 안 듣는다
    with pytest.raises(strategy.WakeFailed, match="재측정"):
        _wake(p)
    assert ["scrcpy-click"] not in p.cmds


def test_no_measurement_is_probe_needed():
    with pytest.raises(strategy.ProbeNeeded, match="probe --act"):
        _wake(Phone(state="Asleep"))


def test_wake_failed_is_a_device_asleep():
    from capture.common import DeviceAsleep
    assert issubclass(strategy.WakeFailed, DeviceAsleep)


def test_wake_records_event():
    from capture.fleet import events
    traits.update("S1", adb_wake=True)
    _wake(Phone(state="Asleep"))
    ev = [r for r in events.read() if r["kind"] == "wake"]
    assert ev and ev[-1]["strategy"] == "adb_key" and ev[-1]["ok"] is True


@pytest.mark.real_wait
def test_two_wakers_take_turns_on_one_phone():
    traits.update("S1", adb_wake=False)
    p = Phone(state="Asleep", adb_works=False)
    inside, peak = [0], [0]

    def slow_click(serial):
        inside[0] += 1
        peak[0] = max(peak[0], inside[0])
        threading.Event().wait(0.2)
        p.click(serial)
        inside[0] -= 1
    ts = [threading.Thread(target=lambda: strategy.wake("S1", run=p.run, sleep=lambda s: None, scrcpy_click=slow_click))
          for _ in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert peak[0] == 1 and p.cmds.count(["scrcpy-click"]) == 1   # 둘째는 잠금 뒤 Awake를 보고 안 누른다
```

`power._wakefulness_raw`는 Task 6에서 conftest가 `wakefulness`를 바꿔 끼울 때 원본을 남겨 두는 이름이다. 이 Task에서는 `power.py`에 `_wakefulness_raw = wakefulness`를 더해 둔다.

- [ ] **Step 2: 실패를 본다** → `ImportError`

- [ ] **Step 3: 구현** `capture/fleet/strategy.py`:

```python
"""기기 전략(설계 3절): 기기마다 한 길만 쓰고 끝 상태를 다시 읽어 확인한다. 전략끼리 이어 붙이지 않는다.

깨우기: 측정값 adb_wake 참이면 adb 깨우기 키, 거짓이면 scrcpy 우클릭. 이미 Awake면 아무것도 안 한다
(우클릭은 켜진 화면에서 뒤로가기다). 측정값이 없으면 ProbeNeeded, 끝에 Awake가 아니면 WakeFailed.
같은 폰을 두 프로세스가 동시에 건드리지 않게 폰별 잠금을 잡는다. 잠금은 재진입이 안 된다: 잠금 안에서
다른 전략 함수를 부르지 않는다.
"""
from __future__ import annotations

import contextlib
import os
import subprocess
import time
from pathlib import Path

from capture.common import DeviceAsleep
from capture.fleet import adb, events, power, traits

DEVICE_LOCK_WAIT_S = 140          # scrcpy 깨우기(60초 x 2번)보다 길게


class ProbeNeeded(RuntimeError):
    """전략을 고를 측정값이 없다. python -m capture.fleet.probe --act --serial <시리얼>."""


class WakeFailed(DeviceAsleep):
    """고른 전략으로 깨웠는데 Awake가 아니다. 측정값이 틀렸을 수 있다."""


class AirplaneStuck(RuntimeError):
    pass


class WifiFailed(RuntimeError):
    pass


@contextlib.contextmanager
def device_lock(serial: str):
    with traits.file_lock(traits.store_path().parent / f"{serial}.lock", wait_s=DEVICE_LOCK_WAIT_S):
        yield


def _measured(serial: str, key: str):
    v = traits.get(serial).get(key)
    if v is None:
        raise ProbeNeeded(f"{serial}: {key} 측정 없음 - python -m capture.fleet.probe --act --serial {serial}")
    return v


def scrcpy_click(serial: str) -> None:
    """scrcpy 창 우클릭 한 번(창이 있으면 그 창, 없으면 띄워서). 결과는 부르는 쪽이 전원 상태로 본다."""
    if os.environ.get("PYTEST_CURRENT_TEST"):       # 시험이 진짜 scrcpy 창을 띄우지 않는다(2026-10-28)
        return
    from scripts.clipboard_bridge import scrcpy_executable, scrcpy_running
    root = Path(__file__).resolve().parents[2] / "scripts"
    if scrcpy_running(serial):
        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
               str(root / "scrcpy_wake_existing.ps1"), serial]
        timeout = 30
    else:
        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
               str(root / "scrcpy_wake.ps1"), scrcpy_executable(), serial]
        timeout = 60
    try:
        subprocess.run(cmd, capture_output=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        pass


def wake(serial: str, *, run=None, sleep=time.sleep, scrcpy_click=None) -> str:
    run = run or adb.shell
    click = scrcpy_click or globals()["scrcpy_click"]
    if power.is_awake(serial, run):
        return "already"
    use_adb = _measured(serial, "adb_wake")
    name = "adb_key" if use_adb else "scrcpy"
    t0 = time.monotonic()
    tries = 0
    with device_lock(serial):
        for _ in range(3 if use_adb else 2):
            if power.is_awake(serial, run):              # 기다리는 동안 다른 프로세스가 깨웠다
                break
            tries += 1
            if use_adb:
                run(serial, ["input", "keyevent", "KEYCODE_WAKEUP"])
                sleep(2)
            else:
                click(serial)
    ok = power.is_awake(serial, run)
    events.emit("wake", serial, strategy=name, tries=tries, ok=ok, secs=round(time.monotonic() - t0, 1))
    if not ok:
        raise WakeFailed(f"{serial}: {name} 깨우기 뒤에도 Awake가 아니다. 측정값이 틀렸을 수 있다(재측정)")
    return name


def keep_awake(serial: str, run=None) -> None:
    """꺼짐 타이머를 늦춘다. 깨우기 키는 안 늦춘다(DEVICE-MATRIX 10-07)."""
    (run or adb.shell)(serial, ["input", "keyevent", "KEYCODE_UNKNOWN"])
```

`power.py` 끝에 `_wakefulness_raw = wakefulness`.

- [ ] **Step 4: 통과** `python -m pytest -q -p no:cacheprovider tests/test_fleet_strategy_wake.py`
- [ ] **Step 5: 커밋** `feat(fleet): 깨우기 전략과 폰별 잠금 (#179)`

### Task 4: 빠른 설정 타일, 비행기 모드와 와이파이 전략

**Files:**
- Create: `capture/fleet/tiles.py`(지금 `phone_cycle.tile_state`, `_toggle_tile`을 옮긴다)
- Modify: `capture/fleet/strategy.py`(`airplane_state`, `online`, `set_airplane`, `wifi_on`)
- Modify: `capture/phone_cycle.py`(`tile_state`, `_toggle_tile`은 `from capture.fleet.tiles import tile_state, toggle_tile as _toggle_tile`로 남긴다. 지금 시험이 `phone_cycle.tile_state`를 부른다)
- Test: `tests/test_fleet_strategy_net.py`

**Interfaces:**
- Produces:
  - `tiles.tile_state(xml, label) -> tuple[bool, tuple[int, int]] | None`, `tiles.toggle_tile(serial, label, want_on, *, run=adb.shell, dump=None, sleep=time.sleep) -> bool`
  - `strategy.airplane_state(serial, run) -> bool | None`, `strategy.online(serial, run) -> bool`
  - `strategy.set_airplane(serial, on, *, run=adb.shell, sleep=time.sleep, toggle=tiles.toggle_tile, waker=wake) -> str`(`already`, `cmd`, `tile`. 실패 `AirplaneStuck`, 측정 없음 `ProbeNeeded`)
  - `strategy.wifi_on(serial, *, run=adb.shell, sleep=time.sleep, clock=time.monotonic, toggle=tiles.toggle_tile, waker=wake, timeout_s=45) -> str`(`already`, `svc`, `tile`. 실패 `WifiFailed`)

설계 3절 표의 순서. `set_airplane`: 이미 목표면 `already`. `airplane_cmd` 참이면 잠금 안에서 `cmd connectivity airplane-mode enable/disable` 뒤 2초 간격 8번(15초 상한) 다시 읽기. 거짓이면 잠금 밖에서 `waker(serial)`로 깨운 뒤 잠금 안에서 타일, 2초 간격 10번(20초). `wifi_on`: 이미 핑이 되면 `already`. `wifi_svc` 참이면 8초마다 `svc wifi enable`, 26초에 `svc wifi disable` 3초 `enable`(지금 `set_wifi_on`의 껐다 켜기, V30과 A8). 거짓이면 먼저 깨우고 타일 켜기, 26초에 타일 끄고 켜기. 두 갈래 다 2초마다 핑. 상한 안에 안 되면 `WifiFailed`. 두 갈래를 섞지 않는다(지금 `set_wifi_on`은 `svc`와 타일을 한 함수에 잇는다).

- [ ] **Step 1: 시험**

```python
"""비행기 모드, 와이파이 전략(설계 3절). 가짜 폰과 가짜 시계로 본다."""
from __future__ import annotations

import pytest

from capture.fleet import strategy, traits


class Net:
    def __init__(self, airplane=False, cmd_works=True, svc_works=True):
        self.airplane, self.cmd_works, self.svc_works = airplane, cmd_works, svc_works
        self.wifi, self.cmds, self.toggles = False, [], []

    def run(self, serial, args):
        self.cmds.append(args)
        if args == ["settings", "get", "global", "airplane_mode_on"]:
            return 0, "1" if self.airplane else "0", ""
        if args[:3] == ["cmd", "connectivity", "airplane-mode"]:
            if not self.cmd_works:
                return 255, "", "No shell command implementation."
            self.airplane = args[3] == "enable"
        if args[:2] == ["svc", "wifi"] and self.svc_works:
            self.wifi = args[2] == "enable"
        if args[:1] == ["ping"]:
            return 0, "64 bytes from 8.8.8.8" if self.wifi else "", ""
        if args == ["dumpsys", "power"]:
            return 0, "mWakefulness=Awake", ""
        return 0, "", ""

    def toggle(self, serial, label, want_on, **kw):
        self.toggles.append((label, want_on))
        if label == "비행기":
            self.airplane = want_on
        else:
            self.wifi = want_on
        return True


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


def test_airplane_cmd_phone_never_touches_tiles():
    traits.update("S1", airplane_cmd=True)
    n = Net()
    assert strategy.set_airplane("S1", True, run=n.run, sleep=lambda s: None, toggle=n.toggle, waker=lambda s: "already") == "cmd"
    assert n.airplane is True and n.toggles == []


def test_airplane_tile_phone_wakes_first_then_tiles():
    traits.update("S1", airplane_cmd=False)
    n, woke = Net(cmd_works=False), []
    assert strategy.set_airplane("S1", True, run=n.run, sleep=lambda s: None, toggle=n.toggle,
                                 waker=lambda s: woke.append(s) or "adb_key") == "tile"
    assert woke == ["S1"] and n.toggles == [("비행기", True)]
    assert not any(c[:2] == ["cmd", "connectivity"] for c in n.cmds)


def test_airplane_already_and_stuck():
    traits.update("S1", airplane_cmd=True)
    assert strategy.set_airplane("S1", False, run=Net().run, sleep=lambda s: None) == "already"
    stuck = Net()
    stuck.run = lambda s, a: (0, "0", "") if a[:2] == ["settings", "get"] else (0, "", "")
    with pytest.raises(strategy.AirplaneStuck):
        strategy.set_airplane("S1", True, run=stuck.run, sleep=lambda s: None)


def test_airplane_unmeasured_is_probe_needed():
    with pytest.raises(strategy.ProbeNeeded):
        strategy.set_airplane("S1", True, run=Net().run, sleep=lambda s: None)


def test_wifi_svc_phone_uses_svc_only():
    traits.update("S1", wifi_svc=True)
    n, c = Net(), Clock()
    assert strategy.wifi_on("S1", run=n.run, sleep=c.sleep, clock=c, toggle=n.toggle, waker=lambda s: "already") == "svc"
    assert n.toggles == []


def test_wifi_tile_phone_uses_tile_only():
    traits.update("S1", wifi_svc=False)
    n, c = Net(svc_works=False), Clock()
    assert strategy.wifi_on("S1", run=n.run, sleep=c.sleep, clock=c, toggle=n.toggle, waker=lambda s: "adb_key") == "tile"
    assert not any(x[:2] == ["svc", "wifi"] for x in n.cmds)


def test_wifi_failure_after_timeout():
    traits.update("S1", wifi_svc=True)
    n, c = Net(svc_works=False), Clock()
    with pytest.raises(strategy.WifiFailed):
        strategy.wifi_on("S1", run=n.run, sleep=c.sleep, clock=c, toggle=n.toggle, waker=lambda s: "already")
    assert c.t >= 45
    assert ["svc", "wifi", "disable"] in n.cmds            # 26초 껐다 켜기
```

- [ ] **Step 2: 실패를 본다**

- [ ] **Step 3: 구현.** `tiles.py`는 `phone_cycle.tile_state`, `_toggle_tile` 본문을 그대로 옮기되 `_sh` 대신 `adb.out(run, serial, ...)`, `dump_ui` 대신 주입한 `dump`(기본 `capture.common.dump_ui`)를 쓴다. `strategy.py`에 더한다:

```python
from capture.fleet import tiles

PING_HOST = "8.8.8.8"


def airplane_state(serial: str, run=None) -> bool | None:
    return {"1": True, "0": False}.get(adb.out(run or adb.shell, serial, "settings", "get", "global", "airplane_mode_on"))


def online(serial: str, run=None) -> bool:
    return "bytes from" in adb.out(run or adb.shell, serial, "ping", "-c1", "-W2", PING_HOST)


def _wait(pred, tries: int, sleep) -> bool:
    for _ in range(tries):
        if pred():
            return True
        sleep(2)
    return pred()


def set_airplane(serial: str, on: bool, *, run=None, sleep=time.sleep, toggle=None, waker=None) -> str:
    run, toggle, waker = run or adb.shell, toggle or tiles.toggle_tile, waker or wake
    if airplane_state(serial, run) is on:
        return "already"
    use_cmd = _measured(serial, "airplane_cmd")
    if not use_cmd:
        waker(serial)                                    # 잠금 밖에서: 잠금은 재진입이 안 된다
    with device_lock(serial):
        if use_cmd:
            run(serial, ["cmd", "connectivity", "airplane-mode", "enable" if on else "disable"])
            ok = _wait(lambda: airplane_state(serial, run) is on, 7, sleep)
        else:
            toggle(serial, "비행기", on, run=run, sleep=sleep)
            ok = _wait(lambda: airplane_state(serial, run) is on, 10, sleep)
    name = "cmd" if use_cmd else "tile"
    events.emit("airplane", serial, strategy=name, on=on, ok=ok)
    if not ok:
        raise AirplaneStuck(f"{serial}: {name}로 비행기 모드를 {'켜지' if on else '끄지'} 못했다")
    return name


def wifi_on(serial: str, *, run=None, sleep=time.sleep, clock=time.monotonic, toggle=None, waker=None,
            timeout_s: float = 45.0) -> str:
    run, toggle, waker = run or adb.shell, toggle or tiles.toggle_tile, waker or wake
    if online(serial, run):
        return "already"
    use_svc = _measured(serial, "wifi_svc")
    if not use_svc:
        waker(serial)
    name = "svc" if use_svc else "tile"
    start, last, cycled = clock(), -99.0, False
    with device_lock(serial):
        if not use_svc:
            toggle(serial, "Wi-Fi", True, run=run, sleep=sleep)
        while (t := clock() - start) < timeout_s:
            if online(serial, run):
                break
            if use_svc and t - last >= 8:               # 비행기 모드 직후 켜기가 씹힌다(V30, 10-21)
                run(serial, ["svc", "wifi", "enable"])
                last = t
            if not cycled and t >= 26:                  # 켜져 있는데 안 붙는다(A8): 껐다 켠다
                cycled = True
                if use_svc:
                    run(serial, ["svc", "wifi", "disable"])
                    sleep(3)
                    run(serial, ["svc", "wifi", "enable"])
                else:
                    toggle(serial, "Wi-Fi", False, run=run, sleep=sleep)
                    toggle(serial, "Wi-Fi", True, run=run, sleep=sleep)
            sleep(2)
    ok = online(serial, run)
    events.emit("wifi", serial, strategy=name, ok=ok, secs=round(clock() - start, 1))
    if not ok:
        raise WifiFailed(f"{serial}: {name}로 {timeout_s:g}초 안에 와이파이와 인터넷을 못 붙였다")
    return name
```

- [ ] **Step 4: 통과** `python -m pytest -q -p no:cacheprovider tests/test_fleet_strategy_net.py tests/test_phone_cycle.py`
- [ ] **Step 5: 커밋** `feat(fleet): 비행기 모드와 와이파이 전략, 타일을 fleet로 (#179)`

### Task 5: 조작 측정(`probe --act`)과 실기 측정(V-1)

**Files:**
- Modify: `capture/fleet/probe.py`(`--act`)
- Test: `tests/test_fleet_probe_act.py`

**Interfaces:**
- Produces: `probe.measure_adb_wake(serial, *, run, sleep, deep_wait_s=150) -> bool`, `probe.measure_wifi_svc(serial, *, run, sleep, clock) -> bool`, `probe.measure_dump(serial, *, dump, clock, n=10) -> float`, `probe.main([... "--act"])`. `--act`는 `collect_trial.lock`(`%LOCALAPPDATA%\delivery-discount-tracker\collect_trial.lock`)을 `traits.file_lock`으로 잡는다(못 잡으면 종료 코드 3). `verify_bot.lock`이 있으면 그 폰은 건너뛴다(`scripts/verify_bot.py:63`과 같은 경로).

측정 규칙(설계 2.4):
- `adb_wake`: `KEYCODE_SLEEP` → `Awake` 아님 확인 → 깨우기 키 최대 3번(2초) → `Awake`인가. 끄자마자 2번, 150초 기다린 뒤 1번. 3번 다 깨면 참, 아니면 거짓. 끝나면 `strategy.wake`로 깨운다(이때는 방금 잰 값을 먼저 저장한 뒤라 그 전략이 쓰인다).
- `wifi_svc`: `airplane_cmd`로 고른 전략으로 비행기 모드를 켠 뒤, `traits.update(wifi_svc=True)`로 잠시 두고 `strategy.wifi_on`을 2번(사이에 `svc wifi disable`). 2번 다 되면 참, 아니면 거짓. 끝나면 비행기 모드를 끈다.
- `dump_p50_s`: 홈 키 뒤 `capture.common.dump_ui` 10번, 중앙값.
- 순서: 읽기 측정 → `adb_wake` → `wifi_svc` → `dump_p50_s`. 폰마다 스레드로 동시에.

- [ ] **Step 1: 시험**(가짜 폰으로 규칙만)

```python
"""조작 측정(설계 2.4). 가짜 폰으로 판정 규칙을 본다."""
from __future__ import annotations

from capture.fleet import probe


class Sleeper:
    """KEYCODE_SLEEP으로 끄고, 깨우기 키가 듣는지는 deep(150초 뒤) 여부로 다르게."""
    def __init__(self, works_shallow=True, works_deep=True, doze="Asleep"):
        self.state, self.ws, self.wd, self.doze, self.slept = "Awake", works_shallow, works_deep, doze, 0.0

    def run(self, serial, args):
        if args == ["dumpsys", "power"]:
            return 0, f"mWakefulness={self.state}", ""
        if args == ["input", "keyevent", "KEYCODE_SLEEP"]:
            self.state, self.slept = self.doze, 0.0
        if args == ["input", "keyevent", "KEYCODE_WAKEUP"]:
            if (self.ws if self.slept < 150 else self.wd):
                self.state = "Awake"
        return 0, "", ""

    def sleep(self, s):
        self.slept += s


def test_adb_wake_true_only_if_all_three_wake():
    assert probe.measure_adb_wake("S", run=Sleeper().run, sleep=Sleeper().sleep) is True


def test_adb_wake_false_when_deep_sleep_ignores_key():
    p = Sleeper(works_deep=False)
    assert probe.measure_adb_wake("S", run=p.run, sleep=p.sleep) is False


def test_dozing_counts_as_off():
    p = Sleeper(doze="Dozing")
    assert probe.measure_adb_wake("S", run=p.run, sleep=p.sleep) is True


def test_dump_median():
    times = iter([0, 3, 3, 9, 9, 13, 13, 16, 16, 20, 20, 23, 23, 27, 27, 30, 30, 34, 34, 37])
    assert probe.measure_dump("S", dump=lambda s: "<x/>", clock=lambda: next(times), n=10) == 3.5
```

`test_adb_wake_true...`는 같은 `Sleeper` 객체를 써야 한다. 구현 때 `p = Sleeper()`로 고쳐 쓴다.

- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현** `measure_adb_wake`(위 규칙, `power.wakefulness(serial, run)`이 `Awake`가 아님을 확인하지 못하면 그 회는 실패로 센다), `measure_wifi_svc`, `measure_dump`, `main --act`(잠금, 스레드, 결과 `traits.update`, 바뀐 값 출력).
- [ ] **Step 4: 통과**
- [ ] **Step 5: 실기 조작 측정(V-1).** 수집이 없는 시간(08:30 회차가 끝난 뒤 15:55 전 등)에 사용자에게 "네 폰 화면 끄기와 비행기 모드를 약 10분 바꾼다"고 한 줄 알린 뒤:

```powershell
cd <사용자 폴더>\_dev\wt-pool-units; python -m capture.fleet.probe --act
```

Expected: 네 폰의 `adb_wake`, `wifi_svc`, `dump_p50_s`가 채워지고 종료 코드 0. 끝난 뒤 모든 폰 `Awake`, 비행기 모드 꺼짐. 결과를 설계 1절 표에 열로 더하고, 부록 B "adb 깨우기 무시 폰" 줄을 닫는다.
- [ ] **Step 6: 커밋** `feat(fleet): 조작 측정 adb_wake, wifi_svc, dump (#179)`. 본문에 실기 결과.

### Task 6: 옛 함수가 전략에 위임

**Files:**
- Modify: `capture/phone_cycle.py`(`is_awake`, `is_asleep`, `scrcpy_wake`, `wake`, `airplane_state`, `online`, `set_airplane`, `set_wifi_on`, `_safe_wake`)
- Modify: `tests/conftest.py`(전원 패치를 `capture.fleet.power.wakefulness`로)
- Modify: `tests/test_wake_single_path.py`(`KEYCODE_WAKEUP`은 `capture/fleet/` 안만)
- Modify: 깨지는 기존 시험(`tests/test_phone_cycle.py`, `tests/capture/test_common_device_lock.py` 등. Step 4에서 목록을 낸다)

위임 규칙:
- `is_awake(serial)` → `power.is_awake(serial)`. `is_asleep(serial)` → `w = power.wakefulness(serial); w is not None and w != "Awake"`.
- `wake(serial) -> bool`: `strategy.wake(serial)`을 부르고 `WakeFailed`, `ProbeNeeded`는 잡아 이유를 한 줄 찍고 False. 깨면 `swipe_keyguard(serial) and is_awake(serial)`.
- `scrcpy_wake(serial, attempts=2) -> bool`: `strategy.scrcpy_click`을 `attempts`번(Awake면 멈춤), `is_awake` 반환. 부르는 곳이 없으면 지운다(`Grep scrcpy_wake`).
- `set_airplane(serial, on) -> bool`: `strategy.set_airplane`, `AirplaneStuck`, `ProbeNeeded`면 False.
- `set_wifi_on(serial, timeout_s=45) -> bool`: `strategy.wifi_on`, `WifiFailed`, `ProbeNeeded`면 False.
- `airplane_state`, `online`은 `strategy`의 같은 이름으로.
- conftest: `monkeypatch.setattr("capture.fleet.power.wakefulness", lambda serial, run=None: "Awake")`. `phone_cycle.is_awake`, `is_asleep` 패치 두 줄은 지운다(위임하므로 같은 결과). 꺼짐을 시험하는 시험은 `power.wakefulness`를 다시 바꿔 끼운다.

- [ ] **Step 1: 위임 시험** `tests/test_fleet_delegation.py`:

```python
"""옛 phone_cycle 함수는 이름과 bool을 지킨 채 전략에 위임한다(계획 2 Task 6)."""
from capture import phone_cycle
from capture.fleet import strategy


def test_wake_returns_false_and_says_why_on_probe_needed(monkeypatch, capsys):
    def need(serial, **kw):
        raise strategy.ProbeNeeded("S1: adb_wake 측정 없음")
    monkeypatch.setattr(strategy, "wake", need)
    assert phone_cycle.wake("S1") is False
    assert "측정 없음" in capsys.readouterr().out


def test_wake_false_on_wake_failed(monkeypatch):
    def fail(serial, **kw):
        raise strategy.WakeFailed("안 깸")
    monkeypatch.setattr(strategy, "wake", fail)
    assert phone_cycle.wake("S1") is False


def test_wake_true_then_swipes(monkeypatch):
    seen = []
    monkeypatch.setattr(strategy, "wake", lambda serial, **kw: "adb_key")
    monkeypatch.setattr(phone_cycle, "swipe_keyguard", lambda s: seen.append(s) or True)
    assert phone_cycle.wake("S1") is True and seen == ["S1"]


def test_net_delegates_return_bool(monkeypatch):
    def stuck(*a, **kw):
        raise strategy.AirplaneStuck("x")
    monkeypatch.setattr(strategy, "set_airplane", stuck)
    monkeypatch.setattr(strategy, "wifi_on", lambda *a, **kw: "svc")
    assert phone_cycle.set_airplane("S1", True) is False
    assert phone_cycle.set_wifi_on("S1") is True
```

- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 위임 구현과 conftest, `test_wake_single_path` 고치기**
- [ ] **Step 4: 전체 시험.** `python -m pytest -q -m "not ci_only" -p no:cacheprovider`. 기존 실패 6건 말고 실패하는 시험을 하나씩 본다. 옛 경로를 가정한 시험(예: `phone_cycle.is_awake`를 False로 바꿔 끼우고 깨우기 키를 기대)은 `power.wakefulness`와 `traits.update(adb_wake=...)`로 다시 쓴다. 시험이 지키던 의도(무엇이 일어나야 하는가)는 바꾸지 않는다. 의도가 새 설계와 부딪히면 멈추고 사용자에게 보인다.
- [ ] **Step 5: 커밋** `refactor(capture): phone_cycle 깨우기, 비행기 모드, 와이파이를 fleet 전략에 위임 (#179)`

### Task 7: 발열 존 판독을 폰별로

**Files:**
- Modify: `capture/thermal.py:31`(`_zones_readable` 전역 → `_unreadable: set[str]`)
- Test: `tests/test_thermal_per_phone.py`

- [ ] **Step 1: 시험**

```python
"""존을 못 읽는 폰 하나가 다른 폰의 판정을 바꾸지 않는다(설계 4.2)."""
from capture import thermal


def test_unreadable_zones_are_per_phone(monkeypatch):
    def fake_run(cmd, **kw):
        class R:
            stdout = "" if cmd[2] == "BAD" else "45000 battery\n50000 pmic\n"
        return R()
    monkeypatch.setattr(thermal.subprocess, "run", fake_run)
    monkeypatch.setattr(thermal, "_battery_temp", lambda s: 40.0)
    thermal._unreadable.clear()
    assert thermal.read_temps("BAD") == (40.0, 40.0)
    assert thermal.read_temps("GOOD") == (45.0, 50.0)
    assert thermal.zones_readable("GOOD") and not thermal.zones_readable("BAD")
```

- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현.** `_unreadable: set[str] = set()`, `zones_readable(serial) -> bool`, `read_temps`에서 `global` 대신 `serial in _unreadable`과 `_unreadable.add(serial)`, `wait_if_hot`에서 `if not zones_readable(serial)`. 다른 파일이 `_zones_readable`을 읽는지 `Grep`로 보고 같이 고친다.
- [ ] **Step 4: 통과** `python -m pytest -q -p no:cacheprovider tests/test_thermal_per_phone.py tests/ -k thermal`
- [ ] **Step 5: 커밋** `fix(thermal): 존 판독 여부를 폰별로 (#179)`

### Task 8: 생애주기 상태기계

**Files:**
- Create: `capture/fleet/lifecycle.py`
- Test: `tests/test_fleet_lifecycle.py`

**Interfaces:**
- Produces: `lifecycle.State`(enum: `DETACHED`, `PREPARING`, `READY`, `LEASED`, `RECOVERING`, `RELEASING`, `CLEANUP`, `RETIRED`, `DONE`), `lifecycle.Ops`(주입할 동작: `wake`, `set_airplane`, `wifi_on`, `online`, `clean_apps`, `screen_off_ms`, `hot_wait`, `alert`), `lifecycle.Session(serial, ops, max_recover=2)`, 메서드 `prepare() -> State`, `lease(step) -> None`, `end_lease(ok: bool, unresponsive: bool = False) -> State`, `release() -> State`, `retire(reason) -> State`, 속성 `state`, `reason`, `warnings: list[str]`. 허용되지 않는 전이는 `lifecycle.BadTransition`. 전이마다 `events.emit("transition", serial, frm=, to=, reason=)`.

전이(설계 4절):
- `prepare`: DETACHED → PREPARING. `wake`(실패 `wake_failed`, 측정 없음 `probe_needed`) → `set_airplane(True)`(실패 `airplane_stuck`) → `wifi_on`. 와이파이 실패면 `set_airplane(False)` 뒤 `online`이면 경고를 남기고 계속, 아니면 `offline`. → `clean_apps`, `screen_off_ms(120000)` → `hot_wait()`(900초 상한, 넘으면 `hot`) → READY. 실패 이유가 있으면 CLEANUP → RETIRED.
- `lease(step)`: READY → LEASED. 그 전에 `wake`와 `hot_wait`. 실패면 RECOVERING으로.
- `end_lease(ok, unresponsive)`: LEASED → READY(ok), 실패나 무응답이면 RECOVERING. RECOVERING: `clean_apps`, `wake`, `online` 성공이면 READY, 실패나 `max_recover` 초과면 CLEANUP → RETIRED(`recover_exhausted`).
- `release`: READY → RELEASING: `wake`(실패해도 계속), `set_airplane(False)`(1번 재시도), `clean_apps`. 실패면 `alert`. → DONE.
- `retire(reason)`: 어느 상태에서든(DONE, RETIRED 빼고) CLEANUP: 반납 동작 한 번 → RETIRED.

- [ ] **Step 1: 시험**(가짜 `Ops`로 전이 표의 줄마다 하나)

```python
"""생애주기 상태기계(설계 4절). 가짜 Ops로 전이만 본다. 실제 연결은 계획 3."""
from __future__ import annotations

import pytest

from capture.fleet import strategy
from capture.fleet.lifecycle import BadTransition, Ops, Session, State


def ops(**over):
    calls = []

    def rec(name, result=None):
        def f(*a, **kw):
            calls.append(name)
            r = over.get(name, result)
            if isinstance(r, Exception):
                raise r
            return r
        return f
    o = Ops(wake=rec("wake", "adb_key"), set_airplane=rec("set_airplane", "cmd"), wifi_on=rec("wifi_on", "svc"),
            online=rec("online", True), clean_apps=rec("clean_apps", (1, 2)), screen_off_ms=rec("screen_off_ms"),
            hot_wait=rec("hot_wait", True), alert=rec("alert"))
    return o, calls


def test_happy_path_prepare_lease_release():
    o, calls = ops()
    s = Session("S1", o)
    assert s.prepare() is State.READY
    s.lease("4a")
    assert s.state is State.LEASED
    assert s.end_lease(ok=True) is State.READY
    assert s.release() is State.DONE
    assert calls[:3] == ["wake", "set_airplane", "wifi_on"]


def test_wifi_failure_turns_airplane_off_and_continues_with_warning():
    o, calls = ops(wifi_on=strategy.WifiFailed("x"))
    s = Session("S1", o)
    assert s.prepare() is State.READY and s.warnings
    assert calls.count("set_airplane") == 2               # 켰다가 끈다


def test_wifi_failure_and_offline_retires_after_cleanup():
    o, calls = ops(wifi_on=strategy.WifiFailed("x"), online=False)
    s = Session("S1", o)
    assert s.prepare() is State.RETIRED and s.reason == "offline"
    assert calls[-1] == "clean_apps"                     # 정리(반납 동작)를 거쳤다


@pytest.mark.parametrize("name,exc,reason", [
    ("wake", strategy.ProbeNeeded("x"), "probe_needed"),
    ("wake", strategy.WakeFailed("x"), "wake_failed"),
    ("set_airplane", strategy.AirplaneStuck("x"), "airplane_stuck"),
])
def test_prepare_failures_retire_with_reason(name, exc, reason):
    o, _ = ops(**{name: exc})
    s = Session("S1", o)
    assert s.prepare() is State.RETIRED and s.reason == reason


def test_hot_too_long_retires():
    o, _ = ops(hot_wait=False)
    assert Session("S1", o).prepare() is State.RETIRED


def test_failed_lease_recovers_then_gives_up():
    o, _ = ops()
    s = Session("S1", o, max_recover=2)
    s.prepare()
    for _ in range(2):
        s.lease("7")
        assert s.end_lease(ok=False) is State.READY
    s.lease("7")
    assert s.end_lease(ok=False) is State.RETIRED and s.reason == "recover_exhausted"


def test_bad_transitions_raise():
    o, _ = ops()
    s = Session("S1", o)
    with pytest.raises(BadTransition):
        s.lease("4a")                                    # 준비 전
    s.retire("offline")
    with pytest.raises(BadTransition):
        s.prepare()


def test_release_alerts_when_airplane_stays_on():
    o, calls = ops()
    s = Session("S1", o)
    s.prepare()
    o.set_airplane = lambda *a, **kw: (_ for _ in ()).throw(strategy.AirplaneStuck("x"))
    assert s.release() is State.DONE and "alert" in calls
```

- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현.** `State`는 `enum.Enum`, `Ops`는 `dataclass`(필드 8개, 기본값 없음), `Session`은 전이 표 `_ALLOWED: dict[State, set[State]]`와 `_go(to, reason=None)`(허용 검사, `events.emit`)를 둔다. 예외 → 이유 코드 표: `ProbeNeeded` → `probe_needed`, `WakeFailed` → `wake_failed`, `AirplaneStuck` → `airplane_stuck`.
- [ ] **Step 4: 통과**
- [ ] **Step 5: 커밋** `feat(fleet): 폰 한 대의 생애주기 상태기계 (#179)`

### Task 9: 강제 시험(설계 6절)

**Files:**
- Modify: `tests/test_wake_single_path.py` → `tests/test_fleet_enforce.py`로 이름 바꾸고 넓힌다

- [ ] **Step 1: 시험**

```python
"""기기 동작 명령은 capture/fleet/ 안에서만, 코드에 기기 시리얼과 모델명을 적지 않는다(설계 6절)."""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANNED = ("KEYCODE_WAKEUP", "KEYCODE_SLEEP", "airplane-mode", "scrcpy_wake.ps1", "scrcpy_wake_existing.ps1")
BANNED_CALLS = {"toggle_tile", "_toggle_tile"}


def _code_strings(path: Path) -> list[str]:
    """주석과 문서 문자열을 뺀 문자열 상수."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docs = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(getattr(first, "value", None), ast.Constant):
                docs.add(id(first.value))
    return [n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docs]


def _files():
    for base in ("capture", "scripts"):
        for p in (ROOT / base).rglob("*.py"):
            yield p, p.relative_to(ROOT).as_posix()


def test_device_commands_only_in_fleet():
    bad = []
    for p, rel in _files():
        if rel.startswith("capture/fleet/"):
            continue
        strings = _code_strings(p)
        bad += [f"{rel}: {b}" for b in BANNED if any(b in s for s in strings)]
        if any(s == "svc" for s in strings) and any(s == "wifi" for s in strings):
            bad.append(f"{rel}: svc wifi")
        tree = ast.parse(p.read_text(encoding="utf-8"))
        bad += [f"{rel}: {n.func.attr if isinstance(n.func, ast.Attribute) else n.func.id}()"
                for n in ast.walk(tree) if isinstance(n, ast.Call)
                and ((isinstance(n.func, ast.Name) and n.func.id in BANNED_CALLS)
                     or (isinstance(n.func, ast.Attribute) and n.func.attr in BANNED_CALLS))]
    assert not bad, bad


def test_no_device_serial_or_model_in_code():
    data = json.loads((ROOT / "data" / "devices.json").read_text(encoding="utf-8"))
    devs = data["devices"] + [data.get("_excluded", {}).get("device", {})]
    names = {d.get("serial") for d in devs} | {d.get("wireless") for d in devs}
    names = {n for n in names if n}
    bad = [f"{rel}: {s}" for p, rel in _files() for s in _code_strings(p) if s in names]
    assert not bad, bad
```

모델명 검사는 측정 저장소의 `model` 값이 시험 환경에 없어서 뺀다(코드에 모델명 문자열이 있으면 리뷰로 잡는다).

- [ ] **Step 2: 돌린다.** 걸리는 곳이 나오면 그 코드가 전략을 거치게 고친다. 걸린 것을 패턴을 피해 다시 쓰지 않는다. 걸린 목록이 계획 밖 큰 변경이면 멈추고 보인다.
- [ ] **Step 3: 커밋** `test(fleet): 기기 동작 명령과 시리얼 강제 시험 (#179)`

### 끝

- 전체 `pytest -m "not ci_only"`: 기존 실패 6건 말고 없음.
- 설계 9절 A1-3, A2-1~A2-4 상태 고치기, 이슈 #179 댓글, push.
