<!-- 원본: tracker docs/specs/2026-11-06-device-fleet-plan-3.md — 여기서 고치지 않는다 -->
# 기기 함대 계획 3: 풀 연결, 시작 점검, 상태기계 연결, 실측, 옛 키 제거

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `run_routine`이 손 목록(`devices.json` `pool`) 대신 계산한 자격 표로 돌고, 회차 시작에 측정값이 빈 폰을 막고, 폰마다 상태기계로 준비와 반납을 하고, 사건 기록을 회차 기록에 합친다. 실제 회차로 검증한 뒤 옛 키와 옛 고정 큐를 지운다.

**Architecture:** `scripts/run_routine.py`에 `effective_pool(cfg)` 하나를 두고 `pool`을 읽던 세 곳(`main` 925~960줄, `Pool.__init__`, `pool_plan`)이 이것만 부른다. 판 2 대장이면 `eligibility.pool_table(registry.load(), NEEDS)`, 아니면 옛 `cfg["pool"]`. 거들기 묶기는 `eligibility.not_bindable`. 준비와 반납은 `lifecycle.Session`을 폰마다 스레드로. 옛 고정 큐(`assign`, `router`, `step_pins`, `takeover`)와 옛 키는 실측 회차가 통과한 뒤 마지막 작업에서 지운다.

**Tech Stack:** Python 3.12/3.14, pytest.

**Spec:** `docs/specs/2026-11-06-device-fleet-design.md` 9절 순서 9~11(A3-2, 실측, A1-4), 5절, 4절, 7절, 10절 V-2, V-9, V-11. 계획 1, 2의 `capture/fleet/` 위에 선다.

## 리뷰 1 반영 (2026-11-06, 구현 전)

계획 콜드 리뷰(새 Opus 5.5 세션)의 지적에 대한 결정이다. 아래 Task 본문과 다르면 이 절이 이긴다.

높음:
- **H1 표 출처:** `effective_pool(cfg)`는 판 2면 `pool_table(registry.from_dict(cfg), NEEDS)`. 이미 읽은 cfg를 쓴다(시험의 tmp 대장이 닿는다). `main`에서 한 번만 계산해 `Pool`, `pool_plan`에 넘긴다.
- **H2 측정 저장소 시험:** `tests/conftest.py`에 판 2 시험용 픽스처 `measured_traits(serials)`를 두어 tmp `FLEET_TRAITS`에 세 칸(`adb_wake`, `airplane_cmd`, `wifi_svc`)을 채운다. 판 2로 `rr.main`을 돌리는 시험은 모두 이것을 쓴다.
- **H3 준비 대상:** 준비와 반납은 `enabled_ids(cfg).values()` 중 붙은 USB 시리얼만. 무선 이름은 준비하지 않는다(무선으로 비행기 모드를 켜면 끊긴다, strategy가 막는다).
- **H4 알림 자리:** `make_ops`와 `Runner` 생성을 준비 앞으로 옮긴다. 제외된 폰과 `Session.warnings`는 `notes`와 알림으로.
- **H5 state.json 키:** 새 키 `fleet`(`devices`는 이미 붙은 시리얼 목록이고 콘솔이 읽는다).
- **H6 실측 명령:** `--skip 8 4e 6 7`과 함께, 4d, 4f, 4g의 `--apply`가 mono `brands.yml`에 쓰는 것과 서버 대시보드 싱크(`make_ops`)를 어떻게 할지는 **실측 전에 사용자에게 묻는다**(공유 시스템, 되돌릴 수 없는 쓰기). 기본안은 4d, 4f, 4g도 건너뛰고 싱크를 끄는 것.

중간:
- M1, M2: 측정값이 빈 폰만 후보인 단계는 `orphans`로 간다. 시험 기대를 그 문구로. 점검은 cfg를 읽은 뒤(911줄 뒤), 준비 앞. 레지스트리에 없거나 꺼진 폰은 점검하지 않는다. 다 빠져 붙은 폰이 없으면 `[skip]`으로 끝낸다. `missing` 알림이 그 폰을 "안 붙어"로 부르지 않게 제외 이유를 따로 적는다.
- M3: 준비 스레드는 1단계 pytest와 나란히 띄우고 `Pool` 앞에서 기다린다. pytest가 깨지면 준비된 폰을 반납하고 끝낸다.
- M4: 이 계획에서는 `lease`, `end_lease`를 쓰지 않는다(작업 중 깨우기는 지금처럼 단계 하위 프로세스, 설계 4.1). 범위 B로 미룬다. 실행 중 죽은 폰(`Pool.dead`)도 끝에 반납을 한 번 돌린다.
- M5: Task 4에서 깨질 시험 `tests/test_run_routine.py:508-562`(`_finish_one`, `finish_devices`) 다섯 개를 Files에 넣고, 997줄과 1064줄 호출을 세션으로 바꾼다.
- M6: `prepare_devices(..., ops_factory=ops_for)`. PYTEST 가드는 기본 `ops_for`일 때만 건다(시험은 가짜 ops_factory로 상태기계를 돈다).
- M7: 모의 실행은 단계마다 소요 dict를 주는 가짜 `run_cmd`로. 엄밀하게 거는 것은 시작 때 묶기(4a를 V30 혼자, V50, A8, 노트20 안 묶음)뿐, 나머지는 표로 출력.
- M8: 거들기 묶기의 "1순위"는 `busy`로 거르지 않은 계산 순서 1순위(설계대로). 계획 문장 "이미 잡힌 폰을 뺀"은 틀렸다.
- M9: Task 7에서 `PIN_ONLY`를 지워도 대조 단계 3w는 후보가 없으면 실패가 아니라 건너뜀(#104 신호 유지).
- M10: 사건 파일은 회차 id를 이름에 넣는다(`fleet-events-<회차 id>.jsonl`), `FLEET_EVENTS`는 준비 전에 `os.environ`에.

낮음: 줄 번호는 구현 때 다시 찾는다(약 24줄 밀림). `fleet.device(serial)`, 무선 이름 adb 질의(`_hw_serial` 이관), `device_name`과 가드 대상의 `enabled` 거르기는 Task 1에 넣는다. `ready_problems`에 배달앱 프로세스 확인을 더한다. Task 6은 전수조사 포함 약 4시간이라 08:30 회차가 끝난 직후에 시작해야 15:55와 안 겹친다. Task 7의 X6 항목 값(`accounts`, `priority`)은 사용자 확인.

## Global Constraints

- 계획 1, 2의 Global Constraints를 그대로 따른다.
- 지금 수집(main 브랜치, 수집 PC 사본)은 이 브랜치와 무관하다. 실측은 `collect_trial.ps1`로만.
- 실측(V-2) 전에 측정 저장소의 켜진 네 폰에 `adb_wake`, `airplane_cmd`, `wifi_svc`가 다 있어야 한다(2026-11-06 V-1로 채움).
- 옛 고정 큐를 지우는 Task 7은 실측(Task 6)이 통과한 뒤에만 한다.

## Review Focus

1. 계산 표가 지금 `pool`과 다른 단계(4c, 4g, 5, 4d, 4f, 5y)에서 그 단계가 실제로 다른 폰에 가는지 모의 실행으로 본다(설계 5.3, V-9). Task 2가 시험한다.
2. 측정값이 빈 폰은 회차 시작에서 빠지고, 그 폰만 후보인 단계는 "돌 폰 없음"으로 실패한다(조용히 단계 중간에 실패하지 않는다). Task 3이 시험한다.
3. 준비 중 한 폰이 제외돼도 다른 폰과 회차는 계속 간다. 반납은 제외된 폰에도 한 번 돈다. Task 4가 시험한다.
4. V30처럼 `wifi_svc` 거짓이고 `adb_wake` 거짓인 폰은 준비의 타일 갈래 앞에서 scrcpy로 깨운다. 못 깨우면 와이파이 실패, 비행기 모드 끄고 계속(V-11). Task 4가 시험한다.
5. `--dry-run` 출력의 풀 표가 계산 표와 같다. Task 1이 시험한다.

---

### Task 1: `effective_pool`로 표 출처를 하나로

**Files:**
- Modify: `scripts/run_routine.py`(`effective_pool`, `main` 925~960줄, `Pool.__init__` 596~610줄, `pool_plan` 716~727줄)
- Test: `tests/test_run_routine_effective_pool.py`

**Interfaces:**
- Produces: `run_routine.effective_pool(cfg: dict) -> dict | None`(판 2면 계산 표, `pool` 키가 있으면 그것, 둘 다 아니면 None), `run_routine.enabled_ids(cfg) -> dict[str, str]`(켜진 기기 id -> 시리얼)

```python
def enabled_ids(cfg: dict) -> dict[str, str]:
    """켜진 기기 id -> 시리얼. 판 1 대장(enabled 칸 없음)은 다 켜진 것으로 본다."""
    return {d["id"]: d["serial"] for d in cfg.get("devices", []) if d.get("enabled", True)}


def effective_pool(cfg: dict) -> dict | None:
    """풀 표의 출처 하나(설계 5절). 판 2 대장이면 NEEDS와 기기 데이터로 계산한 표, 아니면 옛 손 목록."""
    if cfg.get("schema") == 2:
        from capture.fleet import registry
        from capture.fleet.eligibility import pool_table
        return pool_table(registry.load(), NEEDS)
    pool = cfg.get("pool")
    return {k: v for k, v in pool.items() if not k.startswith("_")} if pool else None
```

`main`: `pooled = effective_pool(cfg) is not None`, `table = effective_pool(cfg)`, `cfg["pool"]`을 읽던 줄을 `table`로, `ids`는 `enabled_ids(cfg)`. `Pool(runner, tasks, cfg, attached, table=table)`로 넘기고 `Pool.__init__`은 `self.spec = table`, `self.ids = enabled_ids(cfg)`. `pool_plan(cfg, attached, table)`.

- [ ] **Step 1: 시험.** 판 2 고정 대장(시험 자료)으로 `effective_pool`이 `pool_table` 결과와 같은지, 판 1(`pool`만)이면 옛 표, 둘 다 없으면 None. `rr.main(["--dry-run"])` 출력의 풀 표 줄이 계산 표 순서와 같은지(`tests/test_run_routine.py`의 `harness` 픽스처를 쓴다).
- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현**(위 코드, 세 곳 바꾸기)
- [ ] **Step 4: 전체 시험.** `tests/test_run_routine_pool.py`의 `FIXED_POOL` 시나리오 시험은 `cfg()`가 판 1(`pool` 키)이라 그대로 돈다. 실제 대장을 읽는 `test_real_pool_*`는 판 2 계산 표를 보도록 바꾼다(원장 안전 규칙은 `test_fleet_devices_real.test_computed_table_keeps_ledger_safety_rules`가 이미 건다).
- [ ] **Step 5: 커밋** `feat(routine): 풀 표 출처를 effective_pool 하나로, 판 2면 계산 표 (#179)`

### Task 2: 거들기 묶기 새 규칙과 모의 실행

**Files:**
- Modify: `scripts/run_routine.py` `Pool.phone`(656~663줄, `mine` 계산)
- Test: `tests/test_run_routine_pool_sim.py`

`mine`(다른 남은 단계의 유일한 후보)을 `not_bindable(table_live, ready)`로 바꾼다. `table_live`는 죽은 폰과 이미 잡힌 폰을 뺀 후보 목록, `ready`는 선행이 끝나 지금 집을 수 있는 남은 단계 id.

```python
ready = [o.id for o in self.pending if all(self.r.by_id[p].done.is_set() for p in o.after)]
live = {o.id: {"phones": [self.ids_rev[s] for s in self.cands(o)]} for o in self.pending}
mine = {self.ids[i] for i in not_bindable(live, ready)}
```

(`self.ids_rev`: 시리얼 -> id. `cands`가 시리얼을 돌려주므로 id로 바꿔 넣고 다시 시리얼로.)

- [ ] **Step 1: 모의 실행 시험.** 가짜 폰 넷(실제 id), 단계마다 가짜 소요(11-06 00:01 회차 로그의 단계 시간을 초 대신 0.01배로), 판 2 실제 대장으로 `rr.main(["--force-audit"])`를 `harness`로 돌려 단계별 돈 폰을 기록한다. 기대: 3, 3s, 5a는 노트20, 4c는 V50, 4a는 V30이 맡고 시작 때 V50, A8, 노트20을 거들기로 묶지 않는다(V-9), 5는 A8. 결과 표를 시험 출력으로 남긴다(사용자에게 보일 표).
- [ ] **Step 2~4:** 실패 → 구현 → 통과
- [ ] **Step 5: 커밋** `feat(routine): 거들기 묶기는 지금 집을 수 있는 단계의 1순위 폰을 빼고, 모의 실행 (#179)`

### Task 3: 회차 시작 측정값 점검

**Files:**
- Modify: `scripts/run_routine.py` `main`(906~920줄 사이)
- Test: `tests/test_run_routine_probe_gate.py`

```python
NEEDED_TRAITS = ("adb_wake", "airplane_cmd", "wifi_svc")


def unmeasured(attached: list[str]) -> dict[str, list[str]]:
    """붙은 폰 중 전략을 고를 측정값이 빈 폰 -> 빈 칸(설계 2.3 규칙 1). 이 폰은 회차에서 뺀다."""
    from capture.fleet import strategy, traits
    out = {}
    for s in attached:
        key = strategy.device_key(s)
        t = traits.get(key)
        miss = [k for k in NEEDED_TRAITS if t.get(k) is None]
        if miss:
            out[s] = miss
    return out
```

`main`에서 `attached`를 구한 바로 뒤: `gap = unmeasured(attached)`, 있으면 `attached = [s for s in attached if s not in gap]`, 알림 한 줄("측정값이 빈 폰을 이번 회차에서 뺐다: 이름(빈 칸). collect_trial로 probe --act"), `notes`에 같은 줄. 판 1 대장(옛 경로)이면 점검하지 않는다.

- [ ] **Step 1: 시험.** 측정 저장소에 두 폰만 다 채우고 하나는 `wifi_svc` 없음 → 그 폰이 `attached`에서 빠지고 알림과 notes에 이름이 나온다. 그 폰만 후보인 단계는 `Pool.sweep`이 "돌 폰이 없다"로 실패한다.
- [ ] **Step 2~4**
- [ ] **Step 5: 커밋** `feat(routine): 회차 시작에 측정값이 빈 폰을 빼고 알린다 (#179)`

### Task 3.5: 기기 객체화(사용자 2026-11-06 "각 디바이스가 자주적으로 결정하는 객체지향")

**Files:** Create `capture/fleet/behaviors.py`(동작 클래스: `AdbKeyWake`, `ScrcpyWake`, `CmdAirplane`, `TileAirplane`, `SvcWifi`, `TileWifi`, 측정값 -> 클래스 표 `WAKE`, `AIRPLANE`, `WIFI`), `capture/fleet/agent.py`(`FleetDevice`: 측정값으로 동작을 골라 `wake()`, `airplane(on)`, `wifi_on()`, 공통 뼈대 한 곳). Modify `capture/fleet/strategy.py`(`wake`, `set_airplane`, `wifi_on`은 이름과 인자를 지킨 채 `FleetDevice`에 맡긴다). Test `tests/test_fleet_agent.py`.

조건 분기(`if use_adb`, `if use_cmd`, `if use_svc`)가 함수에서 사라지고 기기 객체가 고른 동작 클래스로 간다. 새 방식(LG 타일 V-12 등)은 클래스 하나와 표 한 줄. 기존 시험(전략, 측정, 위임, 상태기계, 강제) 91개가 바꾸지 않고 통과한다. Task 4의 `ops_for`는 `FleetDevice`를 받아 쓴다.

### Task 4: 준비와 반납을 상태기계로, 폰마다 동시에

**Files:**
- Create: `capture/fleet/ops.py`(`ops_for(serial, alert, name) -> lifecycle.Ops`)
- Modify: `scripts/run_routine.py` `prepare_devices`, `finish_devices`, `_finish_one`
- Test: `tests/test_fleet_ops.py`, `tests/test_run_routine_sessions.py`

```python
def ops_for(serial: str, alert, name) -> Ops:
    """실제 동작을 Ops로 묶는다. 실패는 동작별 예외로(lifecycle.Ops 계약)."""
    from capture import phone_cycle, thermal
    from capture.common import keyguard_showing, run_adb
    from capture.fleet import strategy

    def wake():
        strategy.wake(serial)
        from capture.common import swipe_keyguard
        swipe_keyguard(serial)

    def ready_problems():
        out = []
        if keyguard_showing(serial):
            out.append("잠금 화면이 남았다")
        return out
    return Ops(wake=wake,
               set_airplane=lambda on: strategy.set_airplane(serial, on),
               wifi_on=lambda: strategy.wifi_on(serial),
               online=lambda: strategy.online(serial),
               clean_apps=lambda: phone_cycle.clean_apps(serial),
               screen_off_ms=lambda ms: run_adb(serial, "shell", "settings", "put", "system", "screen_off_timeout", str(ms)),
               hot_wait=lambda: thermal.wait_if_hot(serial, label=name(serial)),
               alert=lambda msg: alert(f"{name(serial)}: {msg}") if alert else None,
               ready_problems=ready_problems,
               reachable=lambda: strategy.power.wakefulness(serial) is not None)
```

`prepare_devices(serials, alert, name) -> dict[str, Session]`: 폰마다 스레드로 `Session(s, ops_for(...)).prepare()`, 다 끝나기를 기다린다. 제외된 폰(`RETIRED`)은 `attached`에서 빼고 알림(이유 코드). `finish_devices(sessions)`: 폰마다 스레드로 READY면 `release()`. 기존 `_finish_one` 알림 문구(#120)는 `Ops.alert`로 간다.

V-11(V30): `wifi_svc` 거짓이면 `strategy.wifi_on`이 먼저 `wake`(scrcpy)로 깨운 뒤 타일. 깨우기가 안 되면 와이파이 실패 → 상태기계가 비행기 모드를 끄고 핑이 되면 경고만 남기고 READY. 시험 하나를 단다(가짜 Ops로 이 경로).

- [ ] **Step 1: 시험.** 가짜 strategy로 네 폰을 준비, 한 폰 `wake`가 `ProbeNeeded` → 그 폰만 RETIRED, 나머지 READY, 세 스레드가 동시에 돈다(소요가 하나의 합보다 작다), 반납이 READY 폰에만 돌고 RETIRED 폰은 이미 정리됐다.
- [ ] **Step 2~4**
- [ ] **Step 5: 커밋** `feat(routine): 준비와 반납을 폰별 상태기계로, 동시에 (#179)`

### Task 5: 사건 기록을 회차 기록에

**Files:**
- Modify: `scripts/run_routine.py` `main`(회차 시작에 `FLEET_EVENTS`를 회차 로그 폴더의 `fleet-events.jsonl`로, 끝에 `ops.state["devices"]`로 합치기)
- Test: `tests/test_run_routine_events.py`

`devices.<serial>`: `transitions`(목록), `wake`(시도 수, 전략, 실패 수), `wait_s`(상태별 머문 시간 합, 설계 7절). 첫 기준선은 깨우기 실패 수, 상한 초과 수, 대기 합계만.

- [ ] **Step 1~5** 시험 → 구현 → 커밋 `feat(routine): 기기 사건을 회차 state.json에 합친다 (#179)`

### Task 6: 실측 회차(V-2)

- [x] **Step 1(11-07 20:24~22:48 완료, 종료 코드 0, `[done] FAIL=0`):** 수집이 없는 시간에 사용자에게 한 줄 알리고 `powershell -NoProfile -File scripts\collect_trial.ps1 -Command "python scripts\run_routine.py --force-audit --skip 8"`(전수조사 포함, 반영 8단계는 건너뛴다. 원장에 쓰지 않는다).
- [x] **Step 2(11-07 실측, `logs/state.json` 20:24 회차):** 전체 2시간 6분(20:42:56~22:48:51), 단계 19개 전부 ok.
  - 단계별(기기, 시간): 1 pytest 597초 / 1b 64 / 2 A8 653 / 3 노트20 1652 / 3s 노트20 145 / 3w A8 333 / 4a V50 6392(106분, 임계 경로) / 4b A8 213 / 4c V30 3169 / 4d A8 1474 / 4f A8 1 / 4g V50 443 / 4e 12 / 5 A8 171 / 5a 노트20 206 / 5y A8 73 / 5b 1 / **6 노트20 1684(28분)** / **7 노트20 580(9분 40초)**.
  - 11-07 03시 회차(옛 코드) 대비: 6단계 2104초 -> 1684초, 7단계 998초 -> 580초. T5 예상(6단계 약 28분, 7단계 약 10분)이 맞았다. 행사 0건 재시도가 허브 스캔을 두세 번 더 돌던 것이 줄었다.
  - 폰별 대기 합계(`state.json` fleet): 노트20 준비 24초, 반납 8초 / V30 29, 15 / V50 1128, 5 / A8 40, 25. 깨우기 시도 노트20 3, V30 3, V50 12, A8 5, 실패 0. 제외된 폰 없음.
  - 경고: V50 `발열 대기 상한을 넘겼다(안 식은 채 계속)`. V50의 4a가 전체의 임계 경로(106분)다. 4c와 6은 이 실측 코드에서 겹쳐 돌았다(옛 코드, #204 이전).
  - 가드 줄에 `[단계] [기기]`가 붙기 시작했다(T17 근거 아래). 12줄.
  - **T19 정정(11-07 실측 근거):** 요기요 주소 읽기가 낮아지는 일은 같은 계정 동시 사용이 없는 때에도 났다. 4c가 V30에서 20:54에 시작했고 6의 요기요 캐러셀은 21:27에야 시작해, 회사(4곳, 지난번 12곳), 창원(2곳)을 읽던 20:55~21:05에는 요기요를 여는 다른 단계가 없었다. 즉 11-07 04시의 창원 2곳을 6과 겹침 때문이라고 본 추정은 약해졌다. 4c의 읽는 주소 수는 `다른 주소에서 이미 읽은 브랜드 N곳은 건너뜀`에도 좌우된다. #204(6을 4c 뒤로)는 겹침 위험을 없애는 안전한 순서지만 낮은 읽기 수의 원인을 풀지는 못한다. 원인은 열린 일: 같은 폰에서 시간대별로 회사 읽기가 4~12곳으로 달라지는지.
  - **기준선 문제(열린 일):** `data/yogiyo_address_stats.json`의 `got`이 매 실행 덮어써져 4곳으로 낮아진 값이 다음 기준이 된다. 낮은 읽기가 한 번 나면 그다음 회차는 경고가 안 난다(AGENTS.md '0은 관측인지 먼저 가른다'). 낮은 읽기로 기준선을 덮지 않게 고칠 것.
  - **원래 Step 2 요구:** 결과 표: 단계별 돈 폰, 시간, 실패, 폰별 대기 합계, 깨우기 실패 수, 제외된 폰과 이유. 11-06 00:01 회차와 견준다. V-8(V50 4c 덤프 멈춤), V-9(4a 거들기 대가), V-10(LG 깊은 절전), V-11(V30 와이파이)을 이 기록으로 닫거나 남긴다.
- [ ] **Step 3:** 설계 문서 10절과 이슈 #179에 결과(이 절의 Step 2 요약을 옮긴다). 기준선(설계 7절) 기록.

### Task 7: 옛 고정 큐와 옛 키 제거(A1-4)

Task 6이 통과한 뒤에만.

- [ ] `run_routine`의 `assign`, `router`, `step_pins`, `takeover_serial`, `PIN_ONLY`, 고정 큐 갈래, `pooled` 분기를 지운다. 판 2 대장만 받는다.
- [ ] `scripts/verify_bot.py:180`(`apps`), `scripts/device_watch.py:89`(`apps`, `steps`), `scripts/full_audit.py:593`(`baemin.account`)을 레지스트리로.
- [ ] `devices.json`에서 `apps`, `takeover`, `steps`, `assist`, `couponbox_device`, `pool`, `load_factor`, `lock`, `rotate`, `baemin`, 자유 문장 `account`를 지우고 `_excluded`의 X6를 `enabled: false` 항목으로. `_env_paths.device_order`와 가드 대상이 `enabled`로 거른다.
- [ ] `spots`를 측정 저장소로 옮기고 `device_profile.save_spot`이 `traits.update`를 쓰게.
- [ ] `tests/test_fleet_devices_real.test_old_keys_still_there_for_current_code`를 지우고 옛 키가 없음을 거는 시험으로.
- [ ] 전체 시험, 커밋, push, 그리고 PR(설계 9절 "PR 하나", 본문은 이슈 #179와 설계, 계획 셋, 실측 결과).

## 남은 태스크 (살아 있는 목록, 2026-11-07 사용자: 순서대로, 늘 최신화, 새로 생긴 것은 끝에 덧붙인다)

원칙(사용자 11-07): 기기 추가, 계정 변동, 순서 변동 같은 가변 값은 가변 파일(devices.json, 측정 저장소)에만 둔다. 구동과 수집 로직은 캡슐화된 도메인 모델에 둔다. 시험과 CI는 그 도메인과 가변 파일을 참조할 뿐 운영 값을 고정하지 않는다. 계정 등급만 바꾸고 돌리면 바로 돌아야 성공이다.

- [x] T0 결과(11-07 05:06). 실측 4회차 FAIL=0, 124분 45초. 6 35분, 7 16분 38초(V50에서 빠진 뒤), 4a V50 혼자 106분 예산 소진 110/158(T13), V50 와이파이 끊김 재발 없음. 8단계 main에서 원장 165건, 배짱 전수 기록, 서버 업로드(reload 194).
- [x] T19(11-07 sub 분석). **고침 11-07 저녁:** (b) 7단계가 같은 날 제안 파일의 승인 대기 새 배너를 어긋남에서 빼고 `승인 대기 N건`으로 따로 알린다(`scripts/banner_routine.py` `pending_adds`, `split_pending`). (c) 4g가 착지 실패한 가게마다 그 자리에서 증거를 남긴다(`scripts/baemin_links.py`, 태그 `baemin_links_landing_fail`). **(a) 같은 계정 요기요 단계 동시 사용 묶기는 안 했다**(6단계 의존에 4c를 넣으면 6, 7이 4c 끝까지 밀리고, 계정 잠금은 4c가 순회 내내 쥐어 6의 캐러셀이 길게 기다린다. 결정 대기: 6의 요기요 캐러셀만 4c 뒤로 옮길지, 짧게 쥐는 계정 잠금을 둘지). 8단계 SUSPECT 셋의 원인. (1) 요기요 '창원' 2곳: `state.json` 단계 시각과 4c 로그, 캡처 시각으로 맞춰 보니 창원 순회(04:03~04:08)가 6단계의 요기요 캐러셀 훑기(discovered_at 04:03:12, 같은 요기요 주계정, 다른 폰 노트20)와 정확히 겹친다. 회사 순회(03:56~04:02)는 안 겹쳐 12곳으로 정상. 창원은 4곳만 보였고(2곳은 회사에서 읽어 건너뜀) 다시 읽어도 같았다. 같은 계정에서 두 폰이 요기요를 동시에 열어 주소가 흔들렸을 **추정**(확인은 아직 못 함). `scripts/full_audit.py:438`의 기준 `prev_got`는 창원 통계(`data/yogiyo_address_stats.json`)라 이번 2곳이 기준선으로 덮여 다음 회차엔 경고가 안 난다. 방향: 요기요를 여는 단계(4c, 5y, 6의 캐러셀)를 같은 요기요 계정끼리 동시에 못 돌게 묶거나(조율기 NEEDS), 6의 캐러셀 훑기를 4c 뒤로. 다음 회차에 겹침 없이 창원이 10곳대로 돌아오는지가 확인 수단. (2) 4g 착지 1건: 대상 6곳 중 광안천지식당만 실패(받은 링크가 지금 링크와 같고 착지 확인 탈락, 나머지 5곳은 열림). 증거 사진 `captures/_evidence/baemin_links_suspect-20261107-050459.png`는 마지막 6번째 브랜드(돈치킨, 정상 화면)라 실패한 가게를 보여 주지 않는다(증거 저장이 순회 끝에서 마지막 화면을 찍는 것으로 **추정**). 방향: 실패한 가게마다 증거를 따로 남긴다. 광안천지식당은 지역 한정 가게일 가능성(**추정**). (3) 7 '어긋난다': 7의 `새로 올린다` 5건(처갓집 5,500, 두찜, 노랑통닭, 페리카나, 기영이)이 6의 `[승인 필요]` 제안 5건과 같은 브랜드와 금액이다. 7이 6 직후 사람이 승인하기 전에 돌아 승인 대기 제안을 어긋남으로 센다. 10~11월 리포트 38건 중 21건이 SUSPECT(`reports/routine-*.md`의 `| 7 |` 줄). 방향: 7이 같은 날 제안 파일(`captures/banner_proposal_<날짜>.json`)의 승인 대기 항목은 어긋남에서 빼고 `승인 대기 N건`으로 따로 센다.
- [x] T0. 실측 V-2 회차 4번째(11-07 03:00, feat 11313d9) 돌리는 중. 끝나면 결과 기록, 사본 main 복귀(로컬 변경 먼저), 8단계, 업로드 판단.
- [x] T1(11-07 끝, 커밋 뒤 확인). 운영 값을 고정한 시험 정리. tests/test_fleet_pool_parity.py(POOL_SNAPSHOT, APPROVED) 삭제, test_fleet_devices_real.py는 형식과 규칙 검증만, test_run_routine_pool의 REAL pool 시험 삭제, test_run_routine_pool_sim은 계산 표 기준으로. 옛 pool 표와 옛 키 삭제(위 Task 7 항목과 합침), effective_pool의 옛 pool 갈래 삭제.
- [x] T2(11-07, V30 허브 카드 측정만 T11로). 기기 특성을 데이터로. thermal NOT_TEMPERATURE(V50 soc, lmh-)를 측정 저장소 기기별 값으로, 앱별 덤프 가능 여부(V30 배민·요기요 idle 실패)를 측정 trait로 두고 NEEDS가 요구. V30 coupangeats_hub_top_cards 측정.
- [x] T3(11-07, 확인해 보니 대부분 이미 됨). 수집 스크립트의 깨우기, 잠금 확인을 기기 객체(FleetDevice)로. 모든 깨우기가 phone_cycle.wake -> strategy.wake -> FleetDevice 한 길이다. require_unlocked의 겹친 깨우기만 정리. common.wake_and_swipe, phone_cycle 직접 호출 정리.
- [ ] T4. 실측 결과로 Task 6 닫기(설계 10절 V 항목 갱신), PR 하나(#179), 콜드 리뷰. Task 5(사건 기록을 state.json fleet 키로)는 11-07 끝(회차마다 logs/fleet-events-<시각>.jsonl, 끝에 폰별 요약).
- [x] T5(11-07 sub 분석, 고침 `feat/pool-units-sub` 커밋). 6, 7단계 시간. 11-07 03시 회차 6단계 03:46:11~04:21:14(2103.6초, `logs/state.json`). 구간: 배민 핫딜 읽기 약 65초(03:46:11~03:47:16, 첫 대기 기록 시각으로 가름) + 쿠팡이츠 허브 스캔 3번 11분 46초(열기 03:47:16, 03:51:23, 03:55:24, 스캔마다 187, 185, 200초, `captures/coupangeats/hub-2026-11-07-0347, 0351, 0355`, 12화면 x 약 16초) + 03:59~04:03 약 4분(**추정**, 허브 OCR 뒷처리와 땡겨요 API) + 요기요 캐러셀 31곳과 행사 페이지 3곳 약 18분(`yogiyo_events.discovered_at` 04:03:12가 훑기 시작 시각, 둘 사이 경계는 못 가름). 7단계 04:21:15~04:37:54(998초)는 같은 허브 3번(열기 04:22:20, 04:26:23, 04:30:32, 11분 25초)이 대부분. **세 번 읽는 이유**: `capture/coupangeats_hub.py` `read_weekly_deals`가 행사 0건이면 6초 쉬고 두 번 더 훑는다(2026-10-11 카드 덜 그려진 화면 대응). 그런데 11-03부터 허브에 `슈퍼딜`, `반짝핫딜` 글자가 한 번도 없다(11-03~11-07 훑기 192회 중 0, 11-02까지는 있었다). **정정(11-07 15시 이후): 행사 구획이 없는 것이 아니다.** 행사 카드 머리줄이 11-03 00:09 허브부터 `<브랜드> 랜덤박스`로 바뀌었고 파서(`EVENT_HEAD`)가 옛 글자만 받아 행사 0건으로 읽었다(허브 캡처 표본, tracker #188에서 고침). 그래서 재시도는 단계마다 약 6분 30초(6, 7, 3단계)를 헛썼다. #188이 들어가면 행사가 읽혀 재시도 자체가 안 돈다. 고침: 첫 훑기에서 행사 구획 말을 못 봤으면 다시 안 읽는다(구획 제목만 있고 카드가 빈 옛 사례는 그대로 두 번 더). 예상 단축: 6단계 35분 -> 약 28분, 7단계 16분 38초 -> 약 10분(**추정**, 다음 회차 `logs/state.json`의 secs로 확인). 남은 큰 덩어리: 요기요 캐러셀 18분(3시간에 한 번이라 회차 일부만), 허브 스캔 1번 3분, 6, 7 모두 배민 핫딜 읽기 65초. 방향: 6단계 안에 구간 시각을 찍어(지금 6.log는 시각이 없다) 다음에는 추정 없이 가른다.
- [ ] T6. 업로드 소실 가드 보류 건(교촌치킨 선착순 표식) 확인 뒤 올리기.
- [x] T7(11-07). 준비 단계 점검 추가(경고만, 실폰 넷 깨끗함 확인): 배민 링크 처리 앱(V30 Firefox 사례), 중복 와이파이 프로필(V50 iptime open 사례).
- [ ] T8. V30 배민 16.30.0 덤프(could not get idle state) 해결책: uiautomator2 서버 등 대기 시간을 정할 수 있는 덤프. 설치 허락 필요.
- [x] T9(11-07, T1 중 발견). NEEDS "5"(배민 쿠폰함)에 배민 멤버십 등급 조건이 빠져 비회원 폰도 배정될 수 있었다. 고침. 검증: V30 쿠팡이츠, V50 배민 등급과 4c 순서를 바꾼 대장으로 관문 시험을 돌려 기존 실패 6건 외 통과.
- [x] T11 측정(11-07 05:56): V30 허브에 행사 카드가 뜬다(증거 captures/_evidence/coupangeats_promotion_unreached-20261107-055635.png, KFC·BBQ 랜덤박스 최대 7,000원). 그런데 read_weekly_deals가 그 화면을 허브로 못 알아봐 deeplink_did_not_open_app. 능력 선언은 T20 뒤로 미룬다.
- [ ] T20. V30에서 쿠팡이츠 허브 화면 판정(coupangeats.py classify, ready) 실패 원인. 고치면 V30 coupangeats_hub_top_cards 선언(노트20 줄 나누기).
- [ ] T21. A8, V50 앱 덤프 재측정(첫 측정이 틀린 방법이었다. 끊긴 재측정은 메모리 부족으로 강제 종료).
- [ ] T11(원문). V30 coupangeats_hub_top_cards 측정(V30을 와우로 바꿔 3, 3s, 5a, 6, 7 후보가 될 수 있다). 측정 뒤 devices.json abilities에 선언. 폰이 비었을 때.
- [ ] T12. probe --act를 네 폰에 돌려 dumps, thermal_skip을 실측으로 채운다(지금은 11-07 손 실측값을 넣었다: V30 dumps, V50 thermal_skip).
- [x] T13(11-07 코드, 실폰 확인은 다음 실측). 실측 4회차에서 4a가 V50 혼자 106분, 예산 소진으로 158곳 중 110곳. 4a 공용 큐(share)는 시작 순간 노는 폰만 거들기로 묶는다. V30이 빠진 뒤 4a가 V50 혼자 95분 넘게 돌았고, 중간에 노는 노트20, A8이 끼지 못했다. 진행 중인 share 단계에 노는 후보가 합류하게.
- [x] T14(11-07 코드). 풀 단계는 Pool.busy로 단계를 안다(고정 큐 폰은 "단계 없음"). 가드 로그에 [단계 상세정보] [수집 기기]. 지금은 창 이름만 있어 어느 폰, 어느 단계인지 모른다.
- [x] T15(11-07 sub 분석, 고침 같은 커밋). 허브 제목 OCR 경고. 기대값(`RELAY_TIME_RE`, "선착순 ... 오전/오후 N시 오픈" 머리표)이 낡은 것이 아니라, 릴레이 구획이 없는 주에는 다른 구획 제목 그림이 잡혀서 경고가 났다. 재현: `captures/coupangeats/hub-2026-11-07-0347/00.png`의 머리표 상자 (0,1571,1080,1743)를 `ocr_text`로 읽으면 "망설이면 종료되는 혜택!"이고 릴레이 시각 꼴이 아니다(해당 없음). 경고는 회차마다 3단계 40, 3w 8, 6단계 30, 7단계 30, 합 108번(`logs/steps/2026-11-07/*.log`). 시각 읽기는 카드 글자("오후 5시 오픈" 노드)가 맡아 영향이 없다. 고침: main이 같은 날 15:53에 `d616b88`로 고쳤다(앞의 '응원석 N열'을 떼고 정상 제목 열쇠말과 부분 일치, 모르는 제목만 경고). sub의 `RELAY_LOOK_RE` 안은 같은 문제를 푸는 중복이라 버리고 main 쪽을 쓴다.
- [x] T16(11-07 sub 분석, 11-07 저녁 문구 정정 `capture/coupangeats_couponbox.py`: "탭 자리가 접근성 트리에 없다(앱 구현, 정상) — 기기 프로필 자리로 누른다"). 'My 이츠' 탭 자리 없음. 쿠팡이츠 앱 홈 하단 탭 다섯 개가 접근성 트리에 전부 `bounds=[0,0][0,0]`으로 온다(`captures/_evidence/ce_couponbox_menu_missing-20260920-110633.xml`, 홈, 검색, 즐겨찾기, 주문내역, My 이츠 모두). 그래서 `tap_text`가 못 누르고(`capture/coupangeats_nav.py:47`) 이웃 탭 외삽도 안 된다(이웃도 자리 없음, `my_tab_spot(extrapolate=False)`). 실제 누르는 자리는 `data/devices.json` 기기별 `spots["coupangeats.my_tab"]`(노트20 0.9, 0.925)이고 회차마다 정상으로 쿠폰함에 들어간다(5a PASS). 앱이 탭을 접근성에 위치 없이 노출하는 구현인 것은 **추정**. 문제는 로그 문구뿐이다: "이웃 탭 자리(없으면 화면 비율)로 누른다"는 현재 경로(기기 프로필 자리 먼저)와 달라 매 회차 3, 5a, 6, 7단계에서 경고처럼 읽힌다. 방향: 프로필 자리가 있으면 문구를 "기기 프로필 자리로 누른다"로 바꾸거나 찍지 않는다(`capture/coupangeats_couponbox.py:316`). 값 손실 없음.
- [x] T17(11-07 sub 분석, 고친 것 없음). 가드가 본 낯선 창, 11-07 03시 회차 27줄을 `logs/state.json` guard 시각과 단계 시작, 끝 시각으로 맞췄다. **V50(4a, 4g)이 낸 것 8건**: NotificationShade 03:11, 04:39; Chrome(`ChromeTabbedActivity`) 03:12, 03:38, 05:03; ChooserActivity 03:24, 03:42, 05:03. 05:03:20과 05:03:33은 그때 도는 단계가 4g(V50) 하나뿐이라 확정이고, 나머지는 4a(V50)가 늘 같이 돌고 있어 4a로 **추정**(4d, 3s도 후보였으나 4g가 같은 창을 낸 것과 일치). 배민 링크를 앱이 아니라 Chrome이 받고 공유 시트가 뜬다는 뜻이고 T7에서 본 링크 처리 앱 문제와 같은 줄이다. **요기요 쪽 PopupWindow + RecentsActivity 쌍 17건**: 03:53:41~04:24:33, 4c(03:53:23 시작)가 시작한 지 18초 만에 첫 줄이 나오고 5y 시작 13초 뒤 마지막 줄. PopupWindow는 가드가 안 닫고 약 1분 뒤 RecentsActivity를 "남의 창"으로 닫는다. 요기요 주소 선택 시트가 PopupWindow일 **추정**. 6단계 요기요 캐러셀(04:03~)과 겹쳐 폰은 못 가름. 방향: 다음 회차부터 가드 줄에 `[단계] [기기]`가 붙으니(T14) 위 추정을 확인한 뒤, 요기요 PopupWindow를 알려진 창에 올려 소음을 줄이고 V50 배민 링크는 앱이 받게(T7 점검에 경고만 있음) 한다. 값 손실은 이 로그에서 못 봤다. **11-07 실측(가드 줄에 단계, 기기가 붙은 첫 회차) 확정:** Chrome(`ChromeTabbedActivity`)은 4a(V50), 4d(A8), 4g(V50)에서, 공유 선택창(`ChooserActivity`)은 4d(A8), 3s(노트20), 6(노트20), 4g(V50)에서, `PopupWindow`는 6(노트20) 세 번과 5y(A8) 한 번에서, `NotificationShade`는 단계 사이(`[단계 없음]`, 노트20 22:07)에서 났다. 즉 Chrome은 링크를 여는 4a, 4d, 4g, 공유 선택창은 공유 링크를 받는 3s, 4d, 4g와 6, PopupWindow는 요기요를 여는 6(요기요 캐러셀)과 5y다. 요기요 PopupWindow 추정이 맞았다. 알려진 창으로 넣을 후보: 공유 선택창과 Chrome은 해당 단계 직후, PopupWindow는 요기요 단계에서. 가드 코드 수정은 아직 안 했다(닫지 않는 것이 현재 동작이라 값 손실은 없었다).
- [ ] T18. 업로드 보류(교촌 선착순, T6과 같음), 새 브랜드 '상상오리&삼겹' 등록 판단.
- [ ] T10. effective_pool의 옛 pool 갈래(판 1)와 판 1 가짜 대장(FIXED_POOL)을 쓰는 test_run_routine_pool 시험들을 판 2 가짜 대장으로(Task 7 옛 키 삭제와 함께).

