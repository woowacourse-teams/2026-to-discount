<!-- 원본: tracker docs/specs/2026-11-06-device-fleet-plan-1.md — 여기서 고치지 않는다 -->
# 기기 함대 계획 1: 레지스트리, 측정 저장소, 읽기 측정, 자격 계산

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `devices.json`을 판 2로 바꾸고, 그것을 읽는 레지스트리, PC 측정 저장소, 읽기 측정기, 단계 자격 계산을 만든다. 수집 동작은 바뀌지 않는다(새 코드는 아직 아무 데서도 안 부른다).

**Architecture:** `capture/fleet/` 패키지에 순수 모듈 다섯(`registry`, `traits`, `power`, `probe`, `eligibility`)을 둔다. `devices.json`은 그 자리에서 판 2 칸을 더하고 옛 키는 남긴다. 단계 요구 `NEEDS`는 `scripts/run_routine.py`의 작업표 옆에 두고, 계산 결과를 지금 `pool` 표와 같은 모양(`phones`, `share`, `same_phone_as`, `helpers`)으로 낸다. 계획 3이 그 결과를 `Pool`에 꽂는다.

**Tech Stack:** Python 3.12(CI `ubuntu-latest`) / 3.14(수집 PC Windows), pytest, 표준 라이브러리만(`msvcrt`/`fcntl` 잠금, `subprocess`).

**Spec:** `docs/specs/2026-11-06-device-fleet-design.md`(판 5). 이 계획은 9절 순서 1, 2, 4(A1-1, A1-2, A3-1)를 구현한다. 계획 2는 A1-3과 A2(조작 측정, 전략, 상태기계), 계획 3은 A3-2, 실측, A1-4다. 계획 2는 이 계획의 측정기 위에 서고, 계획 3은 계획 2의 전략 위에 선다.

## 리뷰 1 반영과 구현 결과 (2026-11-06)

계획 콜드 리뷰(새 Opus 5.5 세션, 계획의 코드를 scratchpad에서 돌려 50개 통과)의 지적을 구현에 반영했다. 아래 Task 본문의 코드 블록과 다른 곳은 커밋된 코드가 정본이다.

- Task 2: `tests/test_run_routine_pool.py:41`이 `accounts`를 문자열로 이어 붙여 dict에서 `TypeError`. 같은 커밋에서 고쳤다.
- Task 3: `tests/conftest.py`에 `FLEET_TRAITS`를 시험별 임시 경로로 돌리는 자동 픽스처. 시험 하나 더(8개).
- Task 5: 시리얼로 못 재면 선언한 무선 주소로 다시 잰다(저장 키는 시리얼). 시험 수는 9가 아니라 8에 이 시험 하나 더해 9.
- Task 6: 꺼진 폰이나 제외된 폰이 `step_order`에 남은 것은 `problems`로 안 친다. `undeclared(fleet, needs)`를 더했다(선언만 없어서 빠진 켜진 폰, 설계 2.3 규칙 2).
- Task 7: 대조와 재검토 날짜 시험은 둘 다 `non_gate`(1b). 재검토 날짜 시험은 `CI` 환경변수가 있으면 건너뛴다(CI는 마커를 거르지 않는다). `undeclared` 기대값 시험 하나 더.
- 계획 2로 넘김: `power`의 실행기 꼴(`run(serial, *args) -> str`)과 `probe`의 꼴(`run(serial, args) -> (rc, out, err)`)을 하나로 맞춘다.

| Task | 커밋 | 시험 |
|---|---|---|
| 1 레지스트리 | 8657a75 | 13 |
| 2 `devices.json` 판 2 칸 | de184a2 | 6, 관련 시험 139 통과 |
| 3 측정 저장소 | c544ac0 | 8 |
| 4 전원 읽기 | dea139e | 3 |
| 5 읽기 측정기 | 10fcd90 | 9, 실기 04:16 네 폰 종료 코드 0 |
| 6 자격 계산 | 95abd58 | 11 |
| 7 대조, 재검토 날짜 | aae5fa6 | 5 |

전체 `pytest -m "not ci_only"`: 기존 실패 6건(작업 폴더에 `mono/` 없음 등, 계획 전과 같음), 2134 통과.

## 리뷰 2 반영: 구현 코드 콜드 리뷰 (2026-11-06)

새 Opus 5.5 세션이 `b640d26..aae5fa6`를 리뷰하고 실험 스크립트로 재현했다. 반영:
- 높음: `test_fleet_devices_real`의 값 박은 시험 셋을 `non_gate`로. 게이트에는 형식 검사, 원장 안전 규칙(계산한 표에 거는 새 시험), 옛 키 유지만.
- `traits.update`가 일시적인 읽기 실패(OSError)를 빈 저장소로 알고 다른 폰 값을 지우던 것: 올린다. 깨진 JSON만 빈 것으로 친다.
- `probe --serial <무선 주소>`가 무선 주소를 저장 키로 쓰던 것: 시리얼로.
- 단계에서 제외한 폰이 `helpers`와 `undeclared`에 들어가던 것: 뺀다.
- `os.replace` PermissionError 재시도 10번, 잠금 파일을 못 열면 `read_all`은 빈 측정.
- 형식 검사: 타입이 틀린 id, order, device에서 죽지 않고 보고, 시리얼과 무선 주소 한 이름공간 중복, `quirks`와 `taps` dict.
- 능력 값은 타입까지 같아야 같다(JSON 1이 `True`로 통과하지 않게).
- 재리뷰(새 Opus 5.5 세션, `582952c`)가 찾은 넷도 고쳤다:
  - 회귀: 잠금 실패를 빈 측정으로 넘기자 측정기가 잰 `spots`를 처음 값으로 되덮었다. 처음 값은 `update(seed_spots=)`로 잠금 안에서만 넣는다.
  - `tier`가 list면 형식 검사가 죽었다.
  - 게이트 시험이 3w 후보가 비지 않음을 박았다(없으면 건너뛰는 것이 지금 동작이다).
  - 측정기는 한 폰 저장 실패를 세고 다음 폰으로 간다.
- 알고 넘어감: `save_spot`의 다시 쓰기 diff(계획 2에서 `spots`를 측정 저장소로), `run_routine` 모듈 수준 import(`capture.fleet`가 깨지면 1단계 pytest가 먼저 실패한다).

## Global Constraints

- 텍스트 파일은 UTF-8, BOM 없음, LF. 파이썬에서 쓸 때 `newline="\n"`(claude-harness `rules/text-files.md`).
- PowerShell 5.1의 `Get-Content`, `Set-Content`, `Out-File`로 한글 파일을 읽고 쓰지 않는다. 쓰기는 Write/Edit 도구.
- 셸은 PowerShell 도구. adb는 PowerShell 도구로만(Git Bash 경로 변환이 adb 인자를 깬다).
- 커밋: `git add <파일들>` 후 `git commit -F <메시지 파일> -- <파일들>`, 커밋 뒤 `git show --stat HEAD`. 메시지 파일은 Write 도구로(PowerShell 파이프는 BOM을 붙인다). 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`와 `Claude-Session:` 줄.
- push는 Bash 도구에서 `git push`로 시작하는 단독 명령(`git -C /c/Users/Jaewun/_dev/wt-pool-units push`).
- 작업 폴더 `<사용자 폴더>\_dev\wt-pool-units`, 브랜치 `feat/pool-units`. 구현은 나중에 PR 하나로 올린다(사용자 2026-11-06). PR 전에는 main에 아무것도 넣지 않는다.
- 코드에 기기 시리얼, 모델명 문자열을 쓰지 않는다(설계 6절). 시험 자료(`tests/`)에는 써도 된다.
- 시험에서 진짜 adb를 부르지 않는다. `tests/_guards.py`의 `_no_external_device_exec`가 막는다. 실행기를 주입한다.
- `tests/` 아래 시험 파일 이름은 `test_fleet_*.py`(같은 이름 충돌을 피한다, `tests/`는 패키지가 아니다).
- 시험이 `time.sleep`을 합 2초 넘게 요청하면 `_sleep_budget`이 실패시킨다. 실제 기다림이 필요한 시험만 `@pytest.mark.real_wait`.
- 수집 PC 예약 수집(00:01, 08:30, 15:55)과 겹치는 시간에 실기 명령을 돌리지 않는다. 실기는 `scripts/collect_trial.ps1`로.

## Review Focus

1. 무선 연결 이름(`<내부 IP>:5555`)으로 기기를 찾으면 선언한 `wireless`가 같은 기기를 돌려준다. 선언 안 한 주소는 `None`(adb로 묻는 것은 계획 3). Task 1이 시험한다.
2. 측정 저장소가 깨진 JSON이거나 비어 있으면 죽지 않고 빈 측정으로 치고 `[suspect]`를 찍는다. Task 3이 시험한다.
3. 두 프로세스(스레드)가 같은 폰이나 다른 폰을 동시에 `update`해도 값이 사라지지 않는다. Task 3이 시험한다.
4. 꺼진 기기(`enabled: false`)나 모르는 tier 값은 자격 계산에 들어가지 않고 형식 검사가 이름을 대 보고한다. Task 1, Task 6이 시험한다.
5. `step_order`에 자격 없는 폰을 적어도 자격이 넓어지지 않고 보고된다. Task 6이 시험한다.

---

### Task 1: 레지스트리 읽기 모델과 형식 검사

**Files:**
- Create: `capture/fleet/__init__.py`
- Create: `capture/fleet/registry.py`
- Test: `tests/test_fleet_registry.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `registry.DEVICES_PATH: Path`
  - `registry.TIERS: dict[str, frozenset[str]]`
  - `registry.Account(account: str, tier: str, since: str)`
  - `registry.Device(id, name, serial, wireless: str | None, os, enabled: bool, priority: int, accounts: dict[str, Account], abilities: dict[str, object], quirks: dict, taps: dict)`, 메서드 `tier(app) -> str | None`, `account(app) -> str | None`, `ability(name) -> object | None`
  - `registry.Order(step, order: tuple[str, ...], why, since, review_after)`, `registry.Exclusion(step, device, why, since, review_after)`
  - `registry.Fleet(devices: tuple[Device, ...], step_order: dict[str, Order], exclusions: tuple[Exclusion, ...])`, 메서드 `by_id(id) -> Device`(없으면 `KeyError`), `find(conn) -> Device | None`, `enabled() -> list[Device]`(priority 오름차순)
  - `registry.validate(data: dict) -> list[str]`, `registry.from_dict(data) -> Fleet`(오류면 `ValueError`), `registry.load(path: Path | None = None) -> Fleet`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/test_fleet_registry.py`:

```python
"""기기 레지스트리(설계 docs/specs/2026-11-06-device-fleet-design.md 2절)."""
from __future__ import annotations

import copy

import pytest

from capture.fleet import registry as reg


def _dev(**kw):
    d = {"id": "p1", "name": "폰1", "serial": "S1", "os": "android", "enabled": True, "priority": 1,
         "accounts": {"baemin": {"account": "주계정", "tier": "membership", "since": "2026-11-06"}},
         "abilities": {"share_link_copy": {"value": True, "checked": "2026-11-05"}}}
    d.update(kw)
    return d


def _data(*devices, **top):
    data = {"schema": 2, "devices": list(devices) or [_dev()]}
    data.update(top)
    return data


def test_valid_minimal_has_no_errors():
    assert reg.validate(_data()) == []


def test_schema_must_be_2():
    assert any("schema" in e for e in reg.validate(_data(schema=1)))


def test_unknown_tier_is_reported_with_device_and_app():
    bad = _dev(accounts={"coupangeats": {"account": "주계정", "tier": "gold", "since": "2026-11-06"}})
    errs = reg.validate(_data(bad))
    assert any("p1" in e and "coupangeats" in e and "gold" in e for e in errs)


def test_unknown_app_is_reported():
    bad = _dev(accounts={"baemin2": {"account": "주계정", "tier": "basic", "since": "2026-11-06"}})
    assert any("baemin2" in e for e in reg.validate(_data(bad)))


def test_free_text_accounts_is_rejected():
    """판 1의 자유 문장 accounts는 판 2가 아니다(설계 2.1)."""
    assert any("accounts" in e for e in reg.validate(_data(_dev(accounts="배민 멤버십, 쿠팡 기본값"))))


def test_duplicate_serial_and_priority_among_enabled():
    errs = reg.validate(_data(_dev(), _dev(id="p2", serial="S1")))
    assert any("serial" in e for e in errs) and any("priority" in e for e in errs)


def test_disabled_device_may_share_priority():
    assert reg.validate(_data(_dev(), _dev(id="p2", serial="S2", enabled=False))) == []


def test_rule_needs_why_since_review_after_and_known_device():
    data = _data(step_order={"4a": {"order": ["p1", "ghost"], "since": "2026-11-05"}},
                 exclusions=[{"step": "4b", "device": "nobody", "why": "x", "since": "2026-09-30",
                              "review_after": "2026-13-01"}])
    errs = reg.validate(data)
    assert any("step_order.4a.why" in e for e in errs)
    assert any("step_order.4a.review_after" in e for e in errs)
    assert any("ghost" in e for e in errs)
    assert any("exclusions[0].device" in e for e in errs)
    assert any("exclusions[0].review_after" in e for e in errs)   # 13월은 날짜가 아니다


def test_from_dict_builds_devices_and_rules():
    data = _data(_dev(wireless="<내부 IP>:5555"),
                 _dev(id="p2", serial="S2", priority=2, accounts={}, abilities={}),
                 step_order={"4a": {"order": ["p2", "p1"], "why": "덤프 느림", "since": "2026-11-05",
                                    "review_after": "2026-12-06"}},
                 exclusions=[{"step": "4b", "device": "p2", "why": "부하", "since": "2026-09-30",
                              "review_after": "2026-12-06"}])
    fleet = reg.from_dict(data)
    p1 = fleet.by_id("p1")
    assert p1.tier("baemin") == "membership" and p1.account("baemin") == "주계정"
    assert p1.tier("yogiyo") is None and p1.ability("share_link_copy") is True
    assert fleet.step_order["4a"].order == ("p2", "p1")
    assert fleet.exclusions[0].device == "p2"
    assert [d.id for d in fleet.enabled()] == ["p1", "p2"]


def test_find_by_serial_or_declared_wireless_only():
    fleet = reg.from_dict(_data(_dev(wireless="<내부 IP>:5555")))
    assert fleet.find("S1").id == "p1"
    assert fleet.find("<내부 IP>:5555").id == "p1"
    assert fleet.find("<내부 IP>:5555") is None     # 선언 안 한 주소(adb로 묻는 것은 계획 3)
    assert fleet.find("") is None


def test_enabled_skips_disabled_and_sorts_by_priority():
    fleet = reg.from_dict(_data(_dev(id="a", serial="A", priority=2), _dev(id="b", serial="B", priority=1),
                                _dev(id="c", serial="C", priority=0, enabled=False)))
    assert [d.id for d in fleet.enabled()] == ["b", "a"]


def test_from_dict_raises_with_all_errors():
    with pytest.raises(ValueError, match="schema"):
        reg.from_dict(_data(schema=1))


def test_old_keys_are_ignored_not_rejected():
    """옮기는 동안 옛 키(apps, takeover, pool 등)가 같이 있다(설계 2.1)."""
    d = _dev(apps=["baemin"], takeover=["2"], spots={"x": [0.1, 0.2]}, note="메모")
    data = _data(d, pool={"2": {"phones": ["p1"]}}, couponbox_device="p1")
    assert reg.validate(copy.deepcopy(data)) == []
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `python -m pytest -q tests/test_fleet_registry.py`
Expected: FAIL, `ModuleNotFoundError: No module named 'capture.fleet'`

- [ ] **Step 3: 구현한다**

`capture/fleet/__init__.py`:

```python
"""기기 함대(설계 docs/specs/2026-11-06-device-fleet-design.md). 기기 차이는 데이터와 전략으로만 가른다."""
```

`capture/fleet/registry.py`:

```python
"""기기 레지스트리: data/devices.json(판 2)을 읽는 읽기 전용 모델과 형식 검사(설계 2.1, 2.2).

사람이 선언하는 것만 여기 있다(계정과 등급, 사람이 확인한 능력, 순서와 제외 규칙).
기계가 재는 것은 capture.fleet.traits(측정 저장소)에 있다. 옮기는 동안 옛 키(apps, takeover,
pool 등)가 같은 파일에 같이 있어도 읽지 않고 거부하지도 않는다.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

DEVICES_PATH = Path(__file__).resolve().parents[2] / "data" / "devices.json"

TIERS: dict[str, frozenset[str]] = {
    "baemin": frozenset({"membership", "basic", "none"}),
    "coupangeats": frozenset({"wow", "basic", "none"}),
    "yogiyo": frozenset({"membership", "basic", "none"}),
    "ddangyo": frozenset({"basic", "none"}),
}

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True)
class Account:
    account: str
    tier: str
    since: str


@dataclass(frozen=True)
class Device:
    id: str
    name: str
    serial: str
    wireless: str | None
    os: str
    enabled: bool
    priority: int
    accounts: dict
    abilities: dict
    quirks: dict
    taps: dict

    def tier(self, app: str) -> str | None:
        a = self.accounts.get(app)
        return a.tier if a else None

    def account(self, app: str) -> str | None:
        a = self.accounts.get(app)
        return a.account if a else None

    def ability(self, name: str):
        return self.abilities.get(name)


@dataclass(frozen=True)
class Order:
    step: str
    order: tuple
    why: str
    since: str
    review_after: str


@dataclass(frozen=True)
class Exclusion:
    step: str
    device: str
    why: str
    since: str
    review_after: str


@dataclass(frozen=True)
class Fleet:
    devices: tuple
    step_order: dict
    exclusions: tuple

    def by_id(self, device_id: str) -> Device:
        for d in self.devices:
            if d.id == device_id:
                return d
        raise KeyError(device_id)

    def find(self, conn: str) -> Device | None:
        """연결 이름(시리얼 또는 선언한 무선 주소)으로 찾는다. 선언 안 한 주소는 None."""
        if not conn:
            return None
        for d in self.devices:
            if conn == d.serial or (d.wireless and conn == d.wireless):
                return d
        return None

    def enabled(self) -> list[Device]:
        return sorted((d for d in self.devices if d.enabled), key=lambda d: d.priority)


def _is_date(v) -> bool:
    if not isinstance(v, str) or not _DATE.match(v):
        return False
    try:
        date.fromisoformat(v)
    except ValueError:
        return False
    return True


def _rule_fields(where: str, rule) -> list[str]:
    if not isinstance(rule, dict):
        return [f"{where}: dict여야 한다"]
    out = []
    if not isinstance(rule.get("why"), str) or not rule["why"].strip():
        out.append(f"{where}.why: 비었다(이유를 적는다)")
    for k in ("since", "review_after"):
        if not _is_date(rule.get(k)):
            out.append(f"{where}.{k}: YYYY-MM-DD여야 한다(지금 {rule.get(k)!r})")
    return out


def _device_errors(i: int, d, ids: set, serials: set, prios: dict) -> list[str]:
    if not isinstance(d, dict):
        return [f"devices[{i}]: dict여야 한다"]
    w = f"devices[{i}]({d.get('id', '?')})"
    errs = []
    for k in ("id", "name", "serial", "os"):
        if not isinstance(d.get(k), str) or not d.get(k):
            errs.append(f"{w}.{k}: 비었거나 문자열이 아니다")
    if not isinstance(d.get("enabled"), bool):
        errs.append(f"{w}.enabled: true 또는 false여야 한다")
    p = d.get("priority")
    if not isinstance(p, int) or isinstance(p, bool):
        errs.append(f"{w}.priority: 정수여야 한다")
    elif d.get("enabled") is True:
        if p in prios:
            errs.append(f"{w}.priority: {p}가 {prios[p]}와 겹친다(켜진 기기끼리)")
        prios[p] = d.get("id")
    if d.get("id") in ids:
        errs.append(f"{w}.id: 겹친다")
    ids.add(d.get("id"))
    if d.get("serial") in serials:
        errs.append(f"{w}.serial: 겹친다")
    serials.add(d.get("serial"))
    accts = d.get("accounts")
    if not isinstance(accts, dict):
        errs.append(f"{w}.accounts: 앱별 dict여야 한다(판 2, 지금 {type(accts).__name__})")
    else:
        for app, a in accts.items():
            if app not in TIERS:
                errs.append(f"{w}.accounts.{app}: 모르는 앱({sorted(TIERS)} 중 하나)")
                continue
            if not isinstance(a, dict):
                errs.append(f"{w}.accounts.{app}: {{account, tier, since}}여야 한다")
                continue
            if a.get("tier") not in TIERS[app]:
                errs.append(f"{w}.accounts.{app}.tier: {a.get('tier')!r}는 {sorted(TIERS[app])} 중 하나여야 한다")
            if not isinstance(a.get("account"), str) or not a["account"]:
                errs.append(f"{w}.accounts.{app}.account: 계정 이름이 비었다")
            if not _is_date(a.get("since")):
                errs.append(f"{w}.accounts.{app}.since: YYYY-MM-DD여야 한다")
    abil = d.get("abilities", {})
    if not isinstance(abil, dict):
        errs.append(f"{w}.abilities: dict여야 한다")
    else:
        for name, ab in abil.items():
            if not isinstance(ab, dict) or "value" not in ab or not _is_date(ab.get("checked")):
                errs.append(f"{w}.abilities.{name}: {{value, checked(YYYY-MM-DD)}}여야 한다")
    return errs


def validate(data) -> list[str]:
    """형식 오류 목록. 빈 목록이면 통과. 옛 키는 보지 않는다."""
    if not isinstance(data, dict):
        return ["최상위가 dict가 아니다"]
    errs = []
    if data.get("schema") != 2:
        errs.append(f"schema: 2여야 한다(지금 {data.get('schema')!r})")
    devs = data.get("devices")
    if not isinstance(devs, list) or not devs:
        return errs + ["devices: 비었다"]
    ids: set = set()
    serials: set = set()
    prios: dict = {}
    for i, d in enumerate(devs):
        errs += _device_errors(i, d, ids, serials, prios)
    orders = data.get("step_order", {})
    if not isinstance(orders, dict):
        errs.append("step_order: dict여야 한다")
        orders = {}
    for step, o in orders.items():
        w = f"step_order.{step}"
        errs += _rule_fields(w, o)
        seq = o.get("order") if isinstance(o, dict) else None
        if not isinstance(seq, list) or not seq:
            errs.append(f"{w}.order: 비었다")
            continue
        errs += [f"{w}.order: 모르는 기기 {x}" for x in seq if x not in ids]
        if len(set(seq)) != len(seq):
            errs.append(f"{w}.order: 같은 기기가 두 번 있다")
    excl = data.get("exclusions", [])
    if not isinstance(excl, list):
        errs.append("exclusions: 목록이어야 한다")
        excl = []
    for i, e in enumerate(excl):
        w = f"exclusions[{i}]"
        errs += _rule_fields(w, e)
        if isinstance(e, dict):
            if not isinstance(e.get("step"), str) or not e.get("step"):
                errs.append(f"{w}.step: 비었다")
            if e.get("device") not in ids:
                errs.append(f"{w}.device: 모르는 기기 {e.get('device')!r}")
    return errs


def from_dict(data: dict) -> Fleet:
    errs = validate(data)
    if errs:
        raise ValueError("devices.json 형식 오류(설계 2.1):\n  " + "\n  ".join(errs))
    devices = tuple(
        Device(id=d["id"], name=d["name"], serial=d["serial"], wireless=d.get("wireless") or None,
               os=d["os"], enabled=d["enabled"], priority=d["priority"],
               accounts={app: Account(a["account"], a["tier"], a["since"]) for app, a in d["accounts"].items()},
               abilities={k: v["value"] for k, v in d.get("abilities", {}).items()},
               quirks=dict(d.get("quirks") or {}), taps=dict(d.get("taps") or {}))
        for d in data["devices"])
    orders = {s: Order(s, tuple(o["order"]), o["why"], o["since"], o["review_after"])
              for s, o in data.get("step_order", {}).items()}
    excl = tuple(Exclusion(e["step"], e["device"], e["why"], e["since"], e["review_after"])
                 for e in data.get("exclusions", []))
    return Fleet(devices, orders, excl)


def load(path: Path | None = None) -> Fleet:
    p = Path(path) if path else DEVICES_PATH
    return from_dict(json.loads(p.read_text(encoding="utf-8")))
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `python -m pytest -q tests/test_fleet_registry.py`
Expected: PASS(13 passed)

- [ ] **Step 5: 커밋한다**

메시지 파일(Write 도구): `feat(fleet): 기기 레지스트리 읽기 모델과 형식 검사 (#179)` + 빈 줄 + 끝 두 줄.

```powershell
git add capture/fleet/__init__.py capture/fleet/registry.py tests/test_fleet_registry.py
git commit -F <메시지 파일> -- capture/fleet/__init__.py capture/fleet/registry.py tests/test_fleet_registry.py
git show --stat HEAD
```

### Task 2: `devices.json`을 그 자리에서 판 2로

**Files:**
- Modify: `data/devices.json`(최상위 `schema`, `step_order`, `exclusions` 더함. 기기 넷에 `enabled`, `priority`, `abilities`를 더하고 `accounts`를 dict로. 옛 키는 남긴다)
- Modify: `tests/test_run_routine_pool.py:41`(`accounts`를 문자열로 이어 붙여 배민 멤버십을 찾는다. dict가 되면 `TypeError`. 리뷰 2026-11-06)
- Test: `tests/test_fleet_devices_real.py`

**Interfaces:**
- Consumes: `registry.load`, `registry.validate`(Task 1)
- Produces: 판 2 칸이 든 `data/devices.json`. 기기 id `sub3`(노트20), `sub4`(V50), `main`(A8), `sub`(V30). `step_order`는 지금 `pool` 열다섯 단계의 순서를 옮긴 것(4c만 V50 먼저).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/test_fleet_devices_real.py`:

```python
"""실제 data/devices.json이 판 2로 읽히고 1절 확정값과 맞는다(설계 1절, 사용자 2026-11-06)."""
from __future__ import annotations

import json

from capture.fleet import registry as reg

RAW = json.loads(reg.DEVICES_PATH.read_text(encoding="utf-8"))


def test_real_devices_json_has_no_format_errors():
    assert reg.validate(RAW) == []


def test_priority_order_is_note20_v50_a8_v30():
    assert [d.id for d in reg.load().enabled()] == ["sub3", "sub4", "main", "sub"]


def test_accounts_match_section_1():
    f = reg.load()
    for i in ("sub3", "sub4", "main", "sub"):
        d = f.by_id(i)
        assert (d.tier("baemin"), d.account("baemin")) == ("membership", "주계정"), i
        assert (d.tier("yogiyo"), d.account("yogiyo")) == ("membership", "주계정"), i
        assert (d.tier("ddangyo"), d.account("ddangyo")) == ("basic", "주계정"), i
    assert [f.by_id(i).tier("coupangeats") for i in ("sub3", "sub4", "main", "sub")] == ["wow", "wow", "basic", "basic"]


def test_abilities_match_user_confirmations():
    f = reg.load()
    assert f.by_id("sub3").ability("share_link_copy") is True      # 사용자 2026-11-06
    assert f.by_id("sub4").ability("share_link_copy") is True
    assert f.by_id("main").ability("share_link_copy") is True
    assert f.by_id("sub").ability("share_link_copy") is None       # 선언 없음 = 자격 없음(설계 2.3)
    assert f.by_id("sub3").ability("coupangeats_hub_top_cards") is True
    assert f.by_id("sub4").ability("coupangeats_hub_top_cards") is False


def test_old_keys_still_there_for_current_code():
    """옛 키는 계획 3(A1-4)까지 남는다. 지금 run_routine이 읽는다."""
    assert "pool" in RAW and "couponbox_device" in RAW
    assert all("apps" in d and "takeover" in d for d in RAW["devices"])


def test_step_order_copies_pool_order_except_4c():
    pool = {k: v for k, v in RAW["pool"].items() if not k.startswith("_")}
    order = RAW["step_order"]
    assert set(order) == set(pool)
    for step, spec in pool.items():
        if step == "4c":
            assert order[step]["order"] == ["sub4", "main", "sub3"]   # V50 권장(사용자 2026-11-06)
        else:
            assert order[step]["order"] == spec["phones"], step
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `python -m pytest -q tests/test_fleet_devices_real.py`
Expected: FAIL(`schema: 2여야 한다`, `accounts: 앱별 dict여야 한다` 등)

- [ ] **Step 3: `data/devices.json`을 고친다(Edit 도구)**

3-1. 첫 줄 `{` 다음에 `"schema": 2,`를 넣는다.

3-2. 기기마다 `"accounts": "<문장>"` 줄을 아래 dict로 바꾸고, 그 앞에 `"enabled"`, `"priority"`, 그 뒤에 `"abilities"`를 넣는다. 자유 문장을 읽는 곳은 `tests/test_run_routine_pool.py:41` 하나다(`Grep '"accounts"|get\("accounts"'`를 `capture/`, `scripts/`, `tests/` 모두에). 그 줄을 이렇게 바꾼다:

```python
    member = {d["id"] for d in REAL["devices"]
              if ((d.get("accounts") or {}).get("baemin") or {}).get("tier") == "membership"}
```

`sub3`(노트20):

```json
      "enabled": true,
      "priority": 1,
      "accounts": {
        "baemin": {"account": "주계정", "tier": "membership", "since": "2026-11-06"},
        "coupangeats": {"account": "주계정", "tier": "wow", "since": "2026-11-06"},
        "yogiyo": {"account": "주계정", "tier": "membership", "since": "2026-11-06"},
        "ddangyo": {"account": "주계정", "tier": "basic", "since": "2026-11-06"}
      },
      "abilities": {
        "share_link_copy": {"value": true, "checked": "2026-11-06"},
        "coupangeats_hub_top_cards": {"value": true, "checked": "2026-11-05"}
      },
```

`sub4`(V50): 위와 같고 `"priority": 2`, abilities는

```json
      "abilities": {
        "share_link_copy": {"value": true, "checked": "2026-11-05"},
        "coupangeats_hub_top_cards": {"value": false, "checked": "2026-11-02"}
      },
```

`main`(A8): `"priority": 3`, `coupangeats`는 `{"account": "기본 계정", "tier": "basic", "since": "2026-11-06"}`, abilities는 `{"share_link_copy": {"value": true, "checked": "2026-10-07"}}`.

`sub`(V30): `"priority": 4`, `coupangeats`는 `{"account": "기본 계정", "tier": "basic", "since": "2026-11-06"}`, abilities는 `{}`.

`_excluded.device`(X6)는 이 계획에서 건드리지 않는다(레지스트리는 `devices` 목록만 읽는다. 옮기는 것은 A1-4).

3-3. 최상위 `"pool"` 바로 앞에 `step_order`와 `exclusions`를 넣는다. `why`는 지금 `pool`의 `why`에서 낡은 문장("V50 제외(비회원)", "V50 1순위")을 뺀 것이다.

```json
  "step_order": {
    "3":  {"order": ["sub3"], "why": "쿠팡이츠 와우 주계정이고 허브 상단 카드가 뜨는 폰은 노트20뿐", "since": "2026-11-05", "review_after": "2026-12-06"},
    "3s": {"order": ["sub3"], "why": "3과 같은 허브", "since": "2026-11-05", "review_after": "2026-12-06"},
    "5a": {"order": ["sub3"], "why": "3이 쿠폰을 받은 계정의 쿠폰함", "since": "2026-11-05", "review_after": "2026-12-06"},
    "6":  {"order": ["sub4", "sub3"], "why": "V50 먼저, 노트20은 3, 3s, 5a를 맡는다", "since": "2026-11-05", "review_after": "2026-12-06"},
    "7":  {"order": ["sub4", "sub3"], "why": "6과 같다. V30은 와우가 아니라 11-05 15:28 회차 45분 상한", "since": "2026-11-05", "review_after": "2026-12-06"},
    "4a": {"order": ["sub", "sub4", "sub3", "main"], "why": "A8은 덤프가 느려(1회 6.5초, 다른 폰 3~5초, 11-05) 맨 뒤", "since": "2026-11-05", "review_after": "2026-12-06"},
    "4g": {"order": ["sub", "sub4"], "why": "4a와 같은 배민 폰 먼저", "since": "2026-11-05", "review_after": "2026-12-06"},
    "2":  {"order": ["main", "sub", "sub4", "sub3"], "why": "먼저 빈 배민 폰. 노트20은 마지막 대체", "since": "2026-11-05", "review_after": "2026-12-06"},
    "5":  {"order": ["main"], "why": "원장 배민 쿠폰함은 A8 먼저", "since": "2026-11-05", "review_after": "2026-12-06"},
    "3w": {"order": ["sub", "main"], "why": "와우 아닌 쿠팡이츠 계정 V30 먼저", "since": "2026-11-05", "review_after": "2026-12-06"},
    "4b": {"order": ["main", "sub4", "sub3"], "why": "땡겨요 A8 먼저", "since": "2026-11-05", "review_after": "2026-12-06"},
    "4d": {"order": ["sub4", "main"], "why": "공유 링크 복사 V50 먼저", "since": "2026-11-05", "review_after": "2026-12-06"},
    "4c": {"order": ["sub4", "main", "sub3"], "why": "V50은 요기요 주소 시트에서 입력창이 안 뜬다(사용자 2026-11-06). 다른 폰은 주소 변경 로직으로 대체", "since": "2026-11-06", "review_after": "2026-12-06"},
    "4f": {"order": ["main", "sub4", "sub3"], "why": "4c 대체 순서와 같다", "since": "2026-11-05", "review_after": "2026-12-06"},
    "5y": {"order": ["main", "sub4", "sub3"], "why": "요기요 쿠폰함 A8 먼저", "since": "2026-11-05", "review_after": "2026-12-06"}
  },
  "exclusions": [
    {"step": "4b", "device": "sub", "why": "V30은 땡겨요를 켜 두면 덤프 성공률 1/10(2026-09-30, docs/setup/DUAL-DEVICE.md)", "since": "2026-09-30", "review_after": "2026-12-06"}
  ],
```

- [ ] **Step 4: 새 시험과 지금 시험 전부를 돌린다**

Run: `python -m pytest -q tests/test_fleet_devices_real.py tests/test_fleet_registry.py`
Expected: PASS

Run: `python -m pytest -q -m "not ci_only"`
Expected: Task 2 이전과 같은 결과(새 칸 때문에 깨지는 시험이 없어야 한다). 이전 결과는 Task 2 시작 전에 한 번 돌려 실패 목록을 적어 둔다(작업 폴더에 `mono/`가 없어 실패하는 시험이 있다).

- [ ] **Step 5: 커밋한다**

메시지: `data(devices): devices.json에 판 2 칸, 계정 등급, 능력, 단계 순서, 제외 (#179)`. 본문에 "옛 키는 계획 3(A1-4)까지 남긴다".

```powershell
git add data/devices.json tests/test_fleet_devices_real.py tests/test_run_routine_pool.py
git commit -F <메시지 파일> -- data/devices.json tests/test_fleet_devices_real.py tests/test_run_routine_pool.py
git show --stat HEAD
```

알고 넘어가는 것: 수집 중 `capture/device_profile.py:111` `save_spot`이 `devices.json`을 `indent=2`로 다시 쓴다. 한 줄로 적은 `step_order` 항목이 여러 줄로 풀려 diff가 커지지만 값은 같다(지금 `pool`도 같은 처지). `spots`를 측정 저장소로 옮기는 A1-4 뒤에는 수집이 `devices.json`을 쓰지 않는다.

### Task 3: 측정 저장소와 잠금

**Files:**
- Create: `capture/fleet/traits.py`
- Test: `tests/test_fleet_traits.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `traits.store_path() -> Path`(환경변수 `FLEET_TRAITS`가 있으면 그것, 없으면 `%LOCALAPPDATA%\delivery-discount-tracker\fleet\device_traits.json`, `LOCALAPPDATA`가 없으면 `~/.local/share/...`)
  - `traits.file_lock(path: Path, wait_s: float = 30.0)`(컨텍스트 관리자, 못 잡으면 `TimeoutError`). 계획 2의 폰별 잠금도 이것을 쓴다(`wait_s=140`).
  - `traits.read_all(path: Path | None = None) -> dict`, `traits.get(serial, path=None) -> dict`, `traits.update(serial, path=None, **values) -> dict`(그 폰의 새 값)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/test_fleet_traits.py`:

```python
"""측정 저장소(설계 2.1): 잠근 쓰기, 바꿔치기, 깨진 파일은 빈 측정."""
from __future__ import annotations

import threading

import pytest

from capture.fleet import traits


@pytest.fixture
def store(tmp_path, monkeypatch):
    p = tmp_path / "fleet" / "device_traits.json"
    monkeypatch.setenv("FLEET_TRAITS", str(p))
    return p


def test_store_path_follows_env(store):
    assert traits.store_path() == store


def test_missing_store_is_empty(store):
    assert traits.read_all() == {} and traits.get("S1") == {}


def test_update_creates_and_merges(store):
    traits.update("S1", model="M", airplane_cmd=True)
    traits.update("S1", android_sdk=31)
    traits.update("S2", model="N")
    assert traits.get("S1") == {"model": "M", "airplane_cmd": True, "android_sdk": 31}
    assert traits.get("S2") == {"model": "N"}
    assert store.read_bytes().endswith(b"\n") and b"\r\n" not in store.read_bytes()


def test_spots_merge_by_name(store):
    traits.update("S1", spots={"a": [0.1, 0.2]})
    traits.update("S1", spots={"b": [0.3, 0.4]})
    assert traits.get("S1")["spots"] == {"a": [0.1, 0.2], "b": [0.3, 0.4]}


def test_corrupt_store_is_empty_and_reported(store, capsys):
    store.parent.mkdir(parents=True)
    store.write_text("{깨진", encoding="utf-8")
    assert traits.read_all() == {}
    assert "[suspect]" in capsys.readouterr().out
    traits.update("S1", model="M")                 # 깨진 파일 위에 새로 쓴다
    assert traits.get("S1") == {"model": "M"}


@pytest.mark.real_wait
def test_concurrent_updates_lose_nothing(store):
    def work(i):
        for j in range(10):
            traits.update(f"S{i % 2}", **{f"k{i}_{j}": j})
    ts = [threading.Thread(target=work, args=(i,)) for i in range(6)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    allv = traits.read_all()
    keys = set(allv["S0"]) | set(allv["S1"])
    assert keys == {f"k{i}_{j}" for i in range(6) for j in range(10)}


@pytest.mark.real_wait
def test_lock_times_out_when_held(tmp_path):
    lock = tmp_path / "x.lock"
    with traits.file_lock(lock):
        got = []

        def other():
            try:
                with traits.file_lock(lock, wait_s=0.3):
                    got.append("잡음")
            except TimeoutError:
                got.append("시간 초과")
        t = threading.Thread(target=other)
        t.start()
        t.join()
    assert got == ["시간 초과"]
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `python -m pytest -q tests/test_fleet_traits.py`
Expected: FAIL, `ImportError: cannot import name 'traits'`

- [ ] **Step 3: 구현한다**

`capture/fleet/traits.py`:

```python
"""측정 저장소: 기기가 스스로 답하는 값(설계 2.1, 2.4). 코드만 쓴다.

저장소(data/) 밖, 수집 PC의 %LOCALAPPDATA%에 둔다. data/ 아래 새 파일은 PR 데이터 가드가 막고
(scripts/check_pr_state_files.py), 수집 중에 쓰면 작업 트리가 더러워진다. 시험은 FLEET_TRAITS로 옮긴다.

쓰기는 update 하나다: 잠금을 잡고, 임시 파일에 쓰고, os.replace로 바꿔치기한다. 읽기도 잠근다
(Windows에서 다른 핸들이 열려 있으면 os.replace가 실패한다).
"""
from __future__ import annotations

import contextlib
import json
import os
import tempfile
import time
from pathlib import Path

LOCK_WAIT_S = 30.0


def store_path() -> Path:
    env = os.environ.get("FLEET_TRAITS")
    if env:
        return Path(env)
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
    return Path(base) / "delivery-discount-tracker" / "fleet" / "device_traits.json"


if os.name == "nt":
    import msvcrt

    def _try_lock(fh) -> None:
        fh.seek(0)
        msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)

    def _unlock(fh) -> None:
        fh.seek(0)
        msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
else:
    import fcntl

    def _try_lock(fh) -> None:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    def _unlock(fh) -> None:
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


@contextlib.contextmanager
def file_lock(path: Path, wait_s: float = LOCK_WAIT_S):
    """연 파일 핸들에 잠금을 건다. 프로세스가 죽으면 OS가 푼다(설계 3절). wait_s 안에 못 잡으면 TimeoutError."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(path, "a+b")
    try:
        deadline = time.monotonic() + wait_s
        while True:
            try:
                _try_lock(fh)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"잠금을 {wait_s:g}초 안에 못 잡았다: {path}") from None
                time.sleep(0.05)
        try:
            yield
        finally:
            _unlock(fh)
    finally:
        fh.close()


def _lock_of(p: Path) -> Path:
    return p.with_name(p.name + ".lock")


def _read(p: Path) -> dict:
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        print(f"  [suspect] 측정 저장소를 못 읽었다 - 빈 측정으로 친다: {p} ({exc})", flush=True)
        return {}
    return data if isinstance(data, dict) else {}


def read_all(path: Path | None = None) -> dict:
    p = Path(path) if path else store_path()
    if not p.exists():
        return {}
    with file_lock(_lock_of(p)):
        return _read(p)


def get(serial: str, path: Path | None = None) -> dict:
    return dict(read_all(path).get(serial) or {})


def update(serial: str, path: Path | None = None, **values) -> dict:
    """serial 칸에 values를 덮어쓴다. spots만 이름 단위로 합친다. 그 폰의 새 값을 돌려준다."""
    p = Path(path) if path else store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with file_lock(_lock_of(p)):
        data = _read(p)
        cur = dict(data.get(serial) or {})
        for k, v in values.items():
            if k == "spots" and isinstance(v, dict):
                cur["spots"] = {**(cur.get("spots") or {}), **v}
            else:
                cur[k] = v
        data[serial] = cur
        fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=p.name + ".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
                f.write("\n")
            os.replace(tmp, p)
        except BaseException:
            with contextlib.suppress(OSError):
                os.unlink(tmp)
            raise
        return dict(cur)
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `python -m pytest -q tests/test_fleet_traits.py`
Expected: PASS(7 passed). 수집 PC(Windows)와 CI(ubuntu) 둘 다에서 돈다. 잠금 갈래가 OS마다 다르므로 PR CI 결과로 ubuntu 쪽을 확인한다.

- [ ] **Step 5: 커밋한다**

메시지: `feat(fleet): 측정 저장소, 잠근 쓰기와 바꿔치기 (#179)`

```powershell
git add capture/fleet/traits.py tests/test_fleet_traits.py
git commit -F <메시지 파일> -- capture/fleet/traits.py tests/test_fleet_traits.py
git show --stat HEAD
```

### Task 4: 전원 상태 읽기 하나

**Files:**
- Create: `capture/fleet/power.py`
- Test: `tests/test_fleet_power.py`

**Interfaces:**
- Consumes: `capture.common.run_adb`(기본 실행기)
- Produces: `power.wakefulness(serial, run=None) -> str | None`(`Awake`, `Asleep`, `Dozing`, `Dreaming`, 못 읽으면 `None`), `power.is_awake(serial, run=None) -> bool`. `run`은 `(serial, *args) -> str` 셸 실행기. 계획 2에서 `phone_cycle.is_awake`, `is_asleep`이 이것에 위임하고 `tests/conftest.py`의 패치가 이것으로 옮긴다(설계 2.2). 이 계획에서는 아직 아무 데서도 안 부른다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/test_fleet_power.py`:

```python
"""전원 상태 읽기(설계 2.2 power.py)."""
from capture.fleet import power


def _run(out=None, exc=None):
    def run(serial, *args):
        assert args == ("dumpsys", "power")
        if exc:
            raise exc
        return out
    return run


def test_reads_wakefulness_values():
    for v in ("Awake", "Asleep", "Dozing", "Dreaming"):
        assert power.wakefulness("S", run=_run(f"  mWakefulness={v}\n  other=1")) == v


def test_unreadable_is_none_and_not_awake():
    assert power.wakefulness("S", run=_run("garbage")) is None
    assert power.wakefulness("S", run=_run(exc=RuntimeError("adb 끊김"))) is None
    assert power.is_awake("S", run=_run(exc=RuntimeError("adb 끊김"))) is False


def test_is_awake_only_for_awake():
    assert power.is_awake("S", run=_run("mWakefulness=Awake")) is True
    assert power.is_awake("S", run=_run("mWakefulness=Dozing")) is False
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `python -m pytest -q tests/test_fleet_power.py`
Expected: FAIL, `ImportError`

- [ ] **Step 3: 구현한다**

`capture/fleet/power.py`:

```python
"""전원 상태 읽기 하나(설계 2.2). 전략, 측정기, 옛 phone_cycle.is_awake가 모두 이것을 부르게 된다(계획 2).

삼성은 꺼지면 Dozing, LG는 Asleep으로 간다(부록 A 11-03). "꺼짐"은 "Awake가 아님"으로 판정한다.
"""
from __future__ import annotations

import re

_WAKE = re.compile(r"mWakefulness=(\w+)")


def _adb_shell(serial: str, *args: str) -> str:
    from capture.common import run_adb
    return run_adb(serial, "shell", *args, timeout=30).decode("utf-8", "replace")


def wakefulness(serial: str, run=None) -> str | None:
    run = run or _adb_shell
    try:
        out = run(serial, "dumpsys", "power")
    except Exception:                                   # noqa: BLE001  못 읽으면 모른다
        return None
    m = _WAKE.search(out or "")
    return m.group(1) if m else None


def is_awake(serial: str, run=None) -> bool:
    return wakefulness(serial, run) == "Awake"
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `python -m pytest -q tests/test_fleet_power.py`
Expected: PASS(3 passed)

- [ ] **Step 5: 커밋한다**

메시지: `feat(fleet): 전원 상태 읽기 하나 (#179)`

```powershell
git add capture/fleet/power.py tests/test_fleet_power.py
git commit -F <메시지 파일> -- capture/fleet/power.py tests/test_fleet_power.py
git show --stat HEAD
```

### Task 5: 읽기 측정기

**Files:**
- Create: `capture/fleet/probe.py`
- Test: `tests/test_fleet_probe.py`

**Interfaces:**
- Consumes: `registry.load`, `registry.DEVICES_PATH`(Task 1), `traits.get`, `traits.update`(Task 3)
- Produces:
  - `probe.adb(serial, args: list[str]) -> tuple[int, str, str]`(returncode, stdout, stderr)
  - `probe.parse_wm_size(out: str) -> dict`(`{"physical": [w, h] | None, "override": [w, h] | None}`)
  - `probe.parse_airplane(out: str, err: str) -> bool | None`
  - `probe.read_traits(serial, run=adb) -> dict`(`model`, `android_sdk`, `display`, `webview`, `airplane_cmd`)
  - `probe.changes(old: dict, new: dict) -> list[str]`, `probe.anomalies(t: dict) -> list[str]`
  - `probe.main(argv=None, run=adb, now=None) -> int`. CLI `python -m capture.fleet.probe --read [--serial S ...]`. 계획 2가 `--act`를 더한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/test_fleet_probe.py`:

```python
"""읽기 측정기(설계 2.4 첫 줄). 실행기를 주입해 진짜 adb를 안 부른다."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from capture.fleet import probe, registry, traits

V50_OUT = {
    ("getprop", "ro.product.model"): (0, "LM-V500N\n", ""),
    ("getprop", "ro.build.version.sdk"): (0, "31\n", ""),
    ("wm", "size"): (0, "Physical size: 1440x3120\nOverride size: 1080x2340\n", ""),
    ("dumpsys", "package", "com.google.android.webview"): (0, "    versionCode=1 \n    versionName=156.0.8078.47\n", ""),
    ("cmd", "connectivity", "airplane-mode"): (0, "disabled\n", ""),
}
A8_AIRPLANE = (255, "", "No shell command implementation.\n")


def fake(table):
    def run(serial, args):
        return table.get(tuple(args), (1, "", "모르는 명령"))
    return run


def test_parse_wm_size():
    assert probe.parse_wm_size("Physical size: 1080x2400\n") == {"physical": [1080, 2400], "override": None}
    assert probe.parse_wm_size(V50_OUT[("wm", "size")][1]) == {"physical": [1440, 3120], "override": [1080, 2340]}
    assert probe.parse_wm_size("") == {"physical": None, "override": None}


def test_parse_airplane_reads_stderr():
    assert probe.parse_airplane("disabled\n", "") is True
    assert probe.parse_airplane("enabled\n", "") is True
    assert probe.parse_airplane("", "No shell command implementation.\n") is False
    assert probe.parse_airplane("", "error: device offline") is None


def test_read_traits_v50():
    t = probe.read_traits("S", run=fake(V50_OUT))
    assert t == {"model": "LM-V500N", "android_sdk": 31,
                 "display": {"physical": [1440, 3120], "override": [1080, 2340]},
                 "webview": "156.0.8078.47", "airplane_cmd": True}


def test_read_traits_a8_has_no_airplane_cmd():
    t = probe.read_traits("S", run=fake({**V50_OUT, ("cmd", "connectivity", "airplane-mode"): A8_AIRPLANE}))
    assert t["airplane_cmd"] is False


def test_changes_and_anomalies():
    assert probe.changes({"android_sdk": 30, "model": "M"}, {"android_sdk": 31, "model": "M", "webview": "1"}) == ["android_sdk: 30 -> 31"]
    assert probe.anomalies({"display": {"physical": [1440, 3120], "override": [1080, 2340]}}) != []
    assert probe.anomalies({"display": {"physical": [1080, 2400], "override": None}}) == []


@pytest.fixture
def world(tmp_path, monkeypatch):
    store = tmp_path / "traits.json"
    monkeypatch.setenv("FLEET_TRAITS", str(store))
    data = {"schema": 2, "devices": [
        {"id": "p1", "name": "폰1", "serial": "S1", "os": "android", "enabled": True, "priority": 1,
         "accounts": {}, "spots": {"coupangeats.my_tab": [0.9, 0.925]}},
        {"id": "p2", "name": "폰2", "serial": "S2", "os": "android", "enabled": False, "priority": 2, "accounts": {}}]}
    dev = tmp_path / "devices.json"
    dev.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(registry, "DEVICES_PATH", dev)
    return store


NOW = datetime(2026, 11, 6, 2, 46, tzinfo=timezone.utc)


def test_main_reads_enabled_devices_seeds_spots_and_reports(world, capsys):
    assert probe.main(["--read"], run=fake(V50_OUT), now=NOW) == 0
    s1 = traits.get("S1")
    assert s1["model"] == "LM-V500N" and s1["measured_at"].startswith("2026-11-06T02:46")
    assert s1["spots"] == {"coupangeats.my_tab": [0.9, 0.925]}        # devices.json에서 처음 한 번
    assert traits.get("S2") == {}                                       # 꺼진 기기는 안 잰다
    out = capsys.readouterr().out
    assert "S1" in out and "[suspect]" in out and "덮어쓴 해상도" in out


def test_main_reports_change_on_second_run_and_keeps_spots(world, capsys):
    probe.main(["--read"], run=fake(V50_OUT), now=NOW)
    traits.update("S1", spots={"coupangeats.my_tab": [0.5, 0.5]})      # 판독기가 새로 찾은 자리
    newer = {**V50_OUT, ("getprop", "ro.build.version.sdk"): (0, "33\n", "")}
    probe.main(["--read"], run=fake(newer), now=NOW)
    assert "android_sdk: 31 -> 33" in capsys.readouterr().out
    assert traits.get("S1")["spots"] == {"coupangeats.my_tab": [0.5, 0.5]}   # 첫 값으로 덮지 않는다


def test_main_counts_unreachable_device(world, capsys):
    assert probe.main(["--read", "--serial", "S1"], run=fake({}), now=NOW) == 1
    assert "응답 없음" in capsys.readouterr().out
    assert traits.get("S1") == {}
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `python -m pytest -q tests/test_fleet_probe.py`
Expected: FAIL, `ImportError`

- [ ] **Step 3: 구현한다**

`capture/fleet/probe.py`:

```python
"""측정기(설계 2.4). 이 판은 읽기 측정(--read)만 한다. 조작 측정(--act)은 계획 2가 더한다.

    python -m capture.fleet.probe --read                 켜진 기기 전부
    python -m capture.fleet.probe --read --serial S ...  지정한 기기만

읽기 측정은 폰 상태를 바꾸지 않는다. 결과는 측정 저장소(capture.fleet.traits)에 쓰고,
이전 값과 달라진 것과 이상(덮어쓴 해상도)을 찍는다.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime

from capture.fleet import registry, traits

_SIZE = re.compile(r"(Physical|Override) size: (\d+)x(\d+)")
_WEBVIEW = re.compile(r"versionName=(\S+)")


def adb(serial: str, args: list[str]) -> tuple[int, str, str]:
    """stdout과 stderr를 따로 받는다(run_adb는 stdout만 주고 실패면 예외다, capture/common.py:96)."""
    p = subprocess.run(["adb", "-s", serial, "shell", *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=30)
    return p.returncode, p.stdout, p.stderr


def parse_wm_size(out: str) -> dict:
    found = {m.group(1).lower(): [int(m.group(2)), int(m.group(3))] for m in _SIZE.finditer(out or "")}
    return {"physical": found.get("physical"), "override": found.get("override")}


def parse_airplane(out: str, err: str) -> bool | None:
    """cmd connectivity airplane-mode가 있나. 없다는 말은 stderr로 온다(A8, Android 8)."""
    if "No shell command implementation" in (out or "") + (err or ""):
        return False
    if re.search(r"\b(enabled|disabled)\b", out or ""):
        return True
    return None


def read_traits(serial: str, run=adb) -> dict:
    def sh(*args: str) -> str:
        return run(serial, list(args))[1].strip()

    sdk = sh("getprop", "ro.build.version.sdk")
    webview = _WEBVIEW.search(sh("dumpsys", "package", "com.google.android.webview"))
    _, out, err = run(serial, ["cmd", "connectivity", "airplane-mode"])
    return {
        "model": sh("getprop", "ro.product.model") or None,
        "android_sdk": int(sdk) if sdk.isdigit() else None,
        "display": parse_wm_size(sh("wm", "size")),
        "webview": webview.group(1) if webview else None,
        "airplane_cmd": parse_airplane(out, err),
    }


def changes(old: dict, new: dict) -> list[str]:
    return [f"{k}: {old[k]!r} -> {v!r}" for k, v in new.items()
            if k in old and k != "measured_at" and old[k] != v]


def anomalies(t: dict) -> list[str]:
    d = t.get("display") or {}
    if d.get("override"):
        o, p = d["override"], d.get("physical")
        return [f"덮어쓴 해상도 {o[0]}x{o[1]}(실제 {p[0]}x{p[1]}). 정본은 실제 해상도다(설계 2.3). "
                "추가 화면을 뗐으면 `wm size reset`, `wm density reset`" if p else
                f"덮어쓴 해상도 {o[0]}x{o[1]}"]
    return []


def _raw_spots() -> dict:
    data = json.loads(registry.DEVICES_PATH.read_text(encoding="utf-8"))
    return {d.get("serial"): d.get("spots") for d in data.get("devices", []) if d.get("spots")}


def main(argv: list[str] | None = None, run=adb, now: datetime | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--read", action="store_true", required=True, help="읽기 측정(폰 상태를 안 바꾼다)")
    ap.add_argument("--serial", nargs="*", help="기기 시리얼. 없으면 켜진 기기 전부")
    args = ap.parse_args(argv)
    fleet = registry.load(registry.DEVICES_PATH)
    targets = args.serial or [d.serial for d in fleet.enabled()]
    seeds = _raw_spots()
    stamp = (now or datetime.now().astimezone()).isoformat(timespec="minutes")
    bad = 0
    for s in targets:
        try:
            t = read_traits(s, run)
        except (subprocess.SubprocessError, OSError) as exc:
            t, err = None, exc
        if not t or t.get("model") is None:
            bad += 1
            print(f"{s}: 응답 없음{'' if t else f' ({err})'} - 측정 안 함", flush=True)
            continue
        old = traits.get(s)
        t["measured_at"] = stamp
        if "spots" not in old and seeds.get(s):
            t["spots"] = seeds[s]
        traits.update(s, **t)
        name = getattr(fleet.find(s), "name", s)
        disp = t["display"]["physical"]
        size = f"{disp[0]}x{disp[1]}" if disp else "?"
        print(f"{s}({name}): {t['model']} sdk {t['android_sdk']} 화면 {size} "
              f"웹뷰 {t['webview']} airplane_cmd {t['airplane_cmd']}", flush=True)
        for line in changes(old, t):
            print(f"  바뀜: {line}", flush=True)
        for line in anomalies(t):
            print(f"  [suspect] {line}", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `python -m pytest -q tests/test_fleet_probe.py`
Expected: PASS(9 passed)

- [ ] **Step 5: 실기 읽기 측정(읽기만)**

예약 수집 시각(00:01, 08:30, 15:55)과 그 회차가 도는 동안을 피한다. 수집이 도는지 먼저 본다:

```powershell
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ForEach-Object { $_.CommandLine } | Select-String 'run_routine|full_audit'
cd <사용자 폴더>\_dev\wt-pool-units; python -m capture.fleet.probe --read
```

Expected: 켜진 네 폰 줄이 찍히고 종료 코드 0. 1절 표와 같은 값(노트20 sdk 33, V50 sdk 31 화면 1440x3120 덮어쓴 해상도 없음, A8 sdk 26 airplane_cmd False, V30 sdk 28). 다르면 1절 표와 대조해 사용자에게 보고한다. 저장소 파일 `%LOCALAPPDATA%\delivery-discount-tracker\fleet\device_traits.json`이 생겼는지 본다.

- [ ] **Step 6: 커밋한다**

메시지: `feat(fleet): 읽기 측정기, 모델, sdk, 화면, 웹뷰, airplane_cmd (#179)`. 본문에 Step 5의 실기 결과 요약 한 줄.

```powershell
git add capture/fleet/probe.py tests/test_fleet_probe.py
git commit -F <메시지 파일> -- capture/fleet/probe.py tests/test_fleet_probe.py
git show --stat HEAD
```

### Task 6: 단계 요구와 자격 계산

**Files:**
- Create: `capture/fleet/eligibility.py`
- Modify: `scripts/run_routine.py`(`task_table` 바로 아래에 `NEEDS` 표. 아직 아무 데서도 안 쓴다)
- Test: `tests/test_fleet_eligibility.py`

**Interfaces:**
- Consumes: `registry.Fleet`, `registry.Device`(Task 1)
- Produces:
  - `eligibility.Need(tiers: dict = {}, accounts: dict = {}, abilities: dict = {}, same_device_as: str | None = None, share: bool = False, helpers: Need | None = None)`, 메서드 `admits(device) -> bool`
  - `eligibility.candidates(fleet, step, need) -> list[str]`(기기 id, 순서대로)
  - `eligibility.helper_candidates(fleet, step, need) -> list[str]`
  - `eligibility.pool_table(fleet, needs: dict[str, Need]) -> dict`(지금 `devices.json` `pool`과 같은 모양: `{step: {"phones": [...], "share"?: True, "same_phone_as"?: str, "helpers"?: [...]}}`, 키 순서는 `needs` 키 순서)
  - `eligibility.problems(fleet, needs) -> list[str]`(모르는 단계의 규칙, 자격 없는 폰을 적은 순서)
  - `eligibility.not_bindable(table: dict, ready_steps) -> set[str]`(지금 집을 수 있는 단계의 1순위 폰 id, 설계 5.1 거들기 묶기 규칙. 계획 3의 `Pool`이 쓴다)
  - `run_routine.NEEDS: dict[str, Need]`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/test_fleet_eligibility.py`:

```python
"""자격 계산(설계 5절). 가짜 함대로 규칙을 본다. 실제 devices.json 대조는 Task 7."""
from __future__ import annotations

from capture.fleet import registry as reg
from capture.fleet.eligibility import Need, candidates, helper_candidates, not_bindable, pool_table, problems


def _dev(i, prio, ce="wow", bm="membership", share=None, enabled=True):
    d = {"id": i, "name": i, "serial": i.upper(), "os": "android", "enabled": enabled, "priority": prio,
         "accounts": {"coupangeats": {"account": "주계정", "tier": ce, "since": "2026-11-06"},
                      "baemin": {"account": "주계정", "tier": bm, "since": "2026-11-06"}},
         "abilities": {}}
    if share is not None:
        d["abilities"]["share_link_copy"] = {"value": share, "checked": "2026-11-06"}
    return d


def fleet(*devs, order=None, excl=()):
    rules = {s: {"order": o, "why": "시험", "since": "2026-11-05", "review_after": "2026-12-06"}
             for s, o in (order or {}).items()}
    ex = [{"step": s, "device": d, "why": "시험", "since": "2026-11-05", "review_after": "2026-12-06"} for s, d in excl]
    return reg.from_dict({"schema": 2, "devices": list(devs), "step_order": rules, "exclusions": ex})


F = fleet(_dev("a", 1), _dev("b", 2, ce="basic", share=True), _dev("c", 3, share=False),
          _dev("d", 4, enabled=False))


def test_tier_is_exact_match_and_disabled_are_out():
    assert candidates(F, "3", Need(tiers={"coupangeats": "wow"})) == ["a", "c"]
    assert candidates(F, "3w", Need(tiers={"coupangeats": "basic"})) == ["b"]


def test_ability_must_be_declared_and_equal():
    assert candidates(F, "4d", Need(abilities={"share_link_copy": True})) == ["b"]   # a는 선언 없음


def test_order_puts_listed_first_then_priority():
    f = fleet(_dev("a", 1), _dev("b", 2), _dev("c", 3), order={"2": ["c"]})
    assert candidates(f, "2", Need()) == ["c", "a", "b"]


def test_order_cannot_widen_and_is_reported():
    f = fleet(_dev("a", 1), _dev("b", 2, ce="basic"), order={"3": ["b", "a"]})
    need = {"3": Need(tiers={"coupangeats": "wow"})}
    assert candidates(f, "3", need["3"]) == ["a"]
    assert any("3" in p and "b" in p for p in problems(f, need))


def test_exclusion_removes_phone():
    f = fleet(_dev("a", 1), _dev("b", 2), excl=[("4b", "a")])
    assert candidates(f, "4b", Need()) == ["b"]


def test_rules_for_unknown_step_are_reported():
    f = fleet(_dev("a", 1), order={"9z": ["a"]}, excl=[("8z", "a")])
    ps = problems(f, {"2": Need()})
    assert any("9z" in p for p in ps) and any("8z" in p for p in ps)


def test_helpers_are_helper_need_minus_candidates():
    need = Need(tiers={"coupangeats": "wow"}, share=True, helpers=Need(tiers={"baemin": "membership"}))
    assert helper_candidates(F, "7", need) == ["b"]


def test_pool_table_shape_and_key_order():
    needs = {"3": Need(tiers={"coupangeats": "wow"}),
             "5a": Need(tiers={"coupangeats": "wow"}, same_device_as="3"),
             "7": Need(tiers={"coupangeats": "wow"}, share=True, helpers=Need(tiers={"baemin": "membership"}))}
    t = pool_table(F, needs)
    assert list(t) == ["3", "5a", "7"]
    assert t["3"] == {"phones": ["a", "c"]}
    assert t["5a"] == {"phones": ["a", "c"], "same_phone_as": "3"}
    assert t["7"] == {"phones": ["a", "c"], "share": True, "helpers": ["b"]}


def test_not_bindable_is_first_of_each_ready_step():
    t = {"4a": {"phones": ["v30", "v50"]}, "4c": {"phones": ["v50", "a8"]}, "2": {"phones": ["a8"]},
         "3": {"phones": ["n20"]}, "6": {"phones": []}}
    assert not_bindable(t, ["4c", "2", "3", "6", "없는단계"]) == {"v50", "a8", "n20"}
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `python -m pytest -q tests/test_fleet_eligibility.py`
Expected: FAIL, `ModuleNotFoundError: No module named 'capture.fleet.eligibility'`

- [ ] **Step 3: `capture/fleet/eligibility.py`를 구현한다**

```python
"""단계 요구와 자격 계산(설계 5절).

단계가 무엇을 필요로 하는지는 코드(run_routine.NEEDS), 어느 폰을 먼저 쓸지와 뺄지는 데이터
(devices.json step_order, exclusions). 순서는 자격을 넓히지 못한다. 결과는 지금 devices.json
"pool"과 같은 모양이라 run_routine.Pool이 그대로 받는다(계획 3).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from capture.fleet.registry import Device, Fleet


@dataclass(frozen=True)
class Need:
    tiers: dict = field(default_factory=dict)        # 앱 -> 등급(정확 일치)
    accounts: dict = field(default_factory=dict)     # 앱 -> 계정 이름
    abilities: dict = field(default_factory=dict)    # 능력 -> 값(선언 없음은 불합격)
    same_device_as: str | None = None                # 그 단계를 돈 폰만(실행 중에 Pool이 좁힌다)
    share: bool = False                              # 집을 때 노는 다른 후보를 같이 잡는다
    helpers: "Need | None" = None                    # 맡지는 못해도 거드는 폰의 조건

    def admits(self, d: Device) -> bool:
        return (all(d.tier(app) == t for app, t in self.tiers.items())
                and all(d.account(app) == n for app, n in self.accounts.items())
                and all(name in d.abilities and d.ability(name) == v for name, v in self.abilities.items()))


def candidates(fleet: Fleet, step: str, need: Need) -> list[str]:
    out = {e.device for e in fleet.exclusions if e.step == step}
    ok = [d.id for d in fleet.enabled() if d.id not in out and need.admits(d)]
    rule = fleet.step_order.get(step)
    head = [i for i in (rule.order if rule else ()) if i in ok]
    return head + [i for i in ok if i not in head]


def helper_candidates(fleet: Fleet, step: str, need: Need) -> list[str]:
    if need.helpers is None:
        return []
    main = set(candidates(fleet, step, need))
    return [d.id for d in fleet.enabled() if d.id not in main and need.helpers.admits(d)]


def pool_table(fleet: Fleet, needs: dict) -> dict:
    table: dict = {}
    for step, need in needs.items():
        row: dict = {"phones": candidates(fleet, step, need)}
        if need.same_device_as:
            row["same_phone_as"] = need.same_device_as
        if need.share:
            row["share"] = True
        if need.helpers is not None:
            row["helpers"] = helper_candidates(fleet, step, need)
        table[step] = row
    return table


def problems(fleet: Fleet, needs: dict) -> list[str]:
    out = []
    for step, rule in fleet.step_order.items():
        if step not in needs:
            out.append(f"step_order.{step}: NEEDS에 없는 단계")
            continue
        ok = set(candidates(fleet, step, needs[step]))
        out += [f"step_order.{step}: {i}는 이 단계 자격이 없다(순서는 자격을 넓히지 못한다)"
                for i in rule.order if i not in ok]
    out += [f"exclusions: {e.step}는 NEEDS에 없는 단계" for e in fleet.exclusions if e.step not in needs]
    return out


def not_bindable(table: dict, ready_steps: Iterable[str]) -> set[str]:
    """지금 집을 수 있는 남은 단계에서 1순위인 폰. 거들기로 묶지 않는다(설계 5.1)."""
    return {table[s]["phones"][0] for s in ready_steps if s in table and table[s].get("phones")}
```

- [ ] **Step 4: `scripts/run_routine.py`에 `NEEDS`를 더한다**

`task_table` 함수 끝(`    ]` 다음 빈 줄) 아래, `SCREEN_OFF_MS = ...` 위에 넣는다:

```python
# 단계 요구(설계 docs/specs/2026-11-06-device-fleet-design.md 5.1). 키 순서가 풀의 집는 순서다
# (지금 devices.json "pool" 키 순서와 같다). 계획 3에서 Pool이 이것으로 계산한 표를 쓴다.
from capture.fleet.eligibility import Need  # noqa: E402

NEEDS: dict[str, Need] = {
    "3":  Need(tiers={"coupangeats": "wow"}, abilities={"coupangeats_hub_top_cards": True}),
    "3s": Need(tiers={"coupangeats": "wow"}, abilities={"coupangeats_hub_top_cards": True}),
    "5a": Need(tiers={"coupangeats": "wow"}, abilities={"coupangeats_hub_top_cards": True}, same_device_as="3"),
    "6":  Need(tiers={"coupangeats": "wow", "baemin": "membership"}),
    "7":  Need(tiers={"coupangeats": "wow", "baemin": "membership"}, share=True,
               helpers=Need(tiers={"baemin": "membership"})),
    "4a": Need(tiers={"baemin": "membership"}, share=True),
    "4g": Need(tiers={"baemin": "membership"}),
    "2":  Need(tiers={"baemin": "membership"}),
    "5":  Need(accounts={"baemin": "주계정"}),
    "3w": Need(tiers={"coupangeats": "basic"}),
    "4b": Need(tiers={"ddangyo": "basic"}),
    "4d": Need(tiers={"ddangyo": "basic"}, abilities={"share_link_copy": True}),
    "4c": Need(tiers={"yogiyo": "membership"}),
    "4f": Need(tiers={"yogiyo": "membership"}),
    "5y": Need(tiers={"yogiyo": "membership"}),
}
```

`run_routine.py`는 34줄에서 저장소 뿌리를 `sys.path`에 넣고 37줄부터 `# noqa: E402`로 import한다. 같은 꼴이라 모듈 수준 import가 된다.

- [ ] **Step 5: 시험이 통과하는지 본다**

Run: `python -m pytest -q tests/test_fleet_eligibility.py tests/test_run_routine.py tests/test_run_routine_pool.py`
Expected: PASS

- [ ] **Step 6: 커밋한다**

메시지: `feat(fleet): 단계 요구 NEEDS와 자격 계산 (#179)`

```powershell
git add capture/fleet/eligibility.py scripts/run_routine.py tests/test_fleet_eligibility.py
git commit -F <메시지 파일> -- capture/fleet/eligibility.py scripts/run_routine.py tests/test_fleet_eligibility.py
git show --stat HEAD
```

### Task 7: 실제 표 대조와 재검토 날짜 점검

**Files:**
- Test: `tests/test_fleet_pool_parity.py`
- Test: `tests/test_fleet_review_dates.py`

**Interfaces:**
- Consumes: `registry.load`, `eligibility.pool_table`, `eligibility.problems`, `run_routine.NEEDS`
- Produces: 시험 고정값 `POOL_SNAPSHOT`(2026-11-06 `a565ff0`의 `devices.json` `pool`). 계획 3(A1-4)이 `pool`을 지운 뒤에도 이 대조가 남는다.

- [ ] **Step 1: 시험을 쓴다**

`tests/test_fleet_pool_parity.py`:

```python
"""계산한 자격이 지금 pool 표와 같다. 다른 곳은 설계 5.3에서 승인한 차이뿐이다.

POOL_SNAPSHOT은 2026-11-06 a565ff0의 data/devices.json "pool"이다. pool을 지운 뒤에도
이 고정값으로 대조한다. 새 차이가 나면 설계 5.3 표에 한 줄 더하고 APPROVED에 넣는다.
"""
from __future__ import annotations

from capture.fleet import registry
from capture.fleet.eligibility import pool_table, problems
from scripts.run_routine import NEEDS

POOL_SNAPSHOT = {
    "3": {"phones": ["sub3"]},
    "3s": {"phones": ["sub3"]},
    "5a": {"phones": ["sub3"], "same_phone_as": "3"},
    "6": {"phones": ["sub4", "sub3"]},
    "7": {"phones": ["sub4", "sub3"], "share": True, "helpers": ["main", "sub"]},
    "4a": {"phones": ["sub", "sub4", "sub3", "main"], "share": True},
    "4g": {"phones": ["sub", "sub4"]},
    "2": {"phones": ["main", "sub", "sub4", "sub3"]},
    "5": {"phones": ["main"]},
    "3w": {"phones": ["sub", "main"]},
    "4b": {"phones": ["main", "sub4", "sub3"]},
    "4d": {"phones": ["sub4", "main"]},
    "4c": {"phones": ["main", "sub4", "sub3"]},
    "4f": {"phones": ["main", "sub4", "sub3"]},
    "5y": {"phones": ["main", "sub4", "sub3"]},
}

# 설계 5.3 표. 사용자 2026-11-06.
APPROVED = {
    "4c": ["sub4", "main", "sub3", "sub"],   # V50 권장, 요기요 네 폰 같은 계정
    "4g": ["sub", "sub4", "sub3", "main"],   # 배민 네 폰 다 주계정 멤버십
    "5": ["main", "sub3", "sub4", "sub"],    # 배민 네 폰 다 주계정
    "4d": ["sub4", "main", "sub3"],          # 노트20 공유 링크 복사 됨
    "4f": ["main", "sub4", "sub3", "sub"],   # 요기요 네 폰 같은 계정
    "5y": ["main", "sub4", "sub3", "sub"],
}


def test_needs_cover_pool_steps_in_pick_order():
    assert list(NEEDS) == list(POOL_SNAPSHOT)


def test_computed_table_matches_pool_except_approved():
    table = pool_table(registry.load(), NEEDS)
    for step, old in POOL_SNAPSHOT.items():
        want = {**old, "phones": APPROVED.get(step, old["phones"])}
        assert table[step] == want, step


def test_no_rule_problems():
    assert problems(registry.load(), NEEDS) == []
```

`tests/test_fleet_review_dates.py`:

```python
"""재검토 날짜가 지난 순서, 제외 규칙을 알린다(설계 5.2). 1b 점검이라 수집을 막지 않는다."""
from __future__ import annotations

from datetime import date

import pytest

from capture.fleet import registry

pytestmark = pytest.mark.non_gate


def test_no_rule_is_past_review_date():
    f = registry.load()
    today = date.today().isoformat()
    late = [f"step_order.{o.step}({o.review_after}): {o.why}" for o in f.step_order.values() if o.review_after < today]
    late += [f"exclusions {e.step}/{e.device}({e.review_after}): {e.why}" for e in f.exclusions if e.review_after < today]
    assert not late, ("재검토 날짜가 지났다. 이유가 아직 맞는지 보고 review_after를 늦추거나 규칙을 지운다"
                      "(data/devices.json):\n  " + "\n  ".join(late))
```

- [ ] **Step 2: 돌린다**

Run: `python -m pytest -q tests/test_fleet_pool_parity.py tests/test_fleet_review_dates.py`
Expected: PASS. 실패하면 계산이나 데이터가 설계 5.3과 다르다는 뜻이다. 실패한 단계를 설계 5.3 표와 견주고, 데이터(Task 2) 오타면 고치고, 설계에 없는 차이면 멈추고 사용자에게 보인다.

- [ ] **Step 3: 전체 시험**

Run: `python -m pytest -q -m "not ci_only"`
Expected: Task 2 Step 4에서 적어 둔 기존 실패 말고 새 실패 없음.

- [ ] **Step 4: 커밋하고 push한다**

메시지: `test(fleet): 계산한 자격과 지금 pool 대조, 재검토 날짜 점검 (#179)`

```powershell
git add tests/test_fleet_pool_parity.py tests/test_fleet_review_dates.py
git commit -F <메시지 파일> -- tests/test_fleet_pool_parity.py tests/test_fleet_review_dates.py
git show --stat HEAD
```

push(Bash 도구): `git -C /c/Users/Jaewun/_dev/wt-pool-units push`

- [ ] **Step 5: 진행을 남긴다**

설계 문서 9절 표에서 A1-1, A1-2, A3-1의 상태를 "끝(커밋 해시, 시험 수)"으로 고치고, 이슈 #179에 한 댓글로 남긴다(무엇을 했나, 실기 읽기 측정 결과, 다음은 계획 2). 설계 문서 커밋은 `docs(spec): 계획 1 진행 반영 (#179)`.
