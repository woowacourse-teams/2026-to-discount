<!-- 원본: tracker docs/specs/issue-92-phone-lock-owner-warning.md — 여기서 고치지 않는다 -->
# 이슈 #92: 수동 수집이 정기 수집과 같은 폰을 동시에 쥔다 (1단계: 경고)

영역: `collect`. 고칠 자리(`capture/common.py` `run_adb`, `scripts/run_routine.py`, `scripts/collect_trial.ps1`)는 예약 수집이 부르는 코드다. 폰 없는 테스트로 판정을 박지만, `AGENTS.md`의 "수집 코드를 바꿨으면 실제 수집으로 시험한다"에 걸려 실기 시험이 필요하다(§7).

## 1. 문제

- 2026-11-02 09:10 사람이 정기 3단계를 끄자 `run_routine`이 3단계를 재시도로 다시 띄웠다. 사람이 직접 돌린 `coupangeats_weekly --write --accept-drop`과 Note20에서 겹쳐 둘 다 깨졌다(uiautomator dump 실패, 허브 카드 줄어듦). 출처: 이슈 본문, `docs/workflow/FRICTION-LOG.md:46`.
- 지금 폰 잠금은 `collect_trial.ps1`로 돌린 시험에만 걸린다(`scripts/trial_lock.py`, 폰 단위, 이슈 #268).
  - 그 잠금을 보고 비키는 쪽: `verify_bot`, `device_watch`, `offer_link_check`, `capture/fleet/probe.py --act`.
  - 정기 수집(`run_routine`)은 이 잠금을 잡지도 보지도 않는다.
  - `run_routine._dev_locks`(`scripts/run_routine.py:537`)는 한 프로세스 안의 스레드 잠금이다. 넘겨받은 단계가 그 폰의 제 단계와 겹치지 않게 할 뿐, 큐 밖의 직접 실행(`python scripts/...`)은 못 본다.
- 사용자 결정(2026-11-15, 이슈 본문 "결정"): 진입점에 잠금을 실제로 적용해 본다. 정기 수집을 깨지 않는 것이 잠금의 절대성보다 우선이다. 1단계는 경고만, 막기(2단계)는 한 주 관찰 뒤 별도로 정한다.

### 1-1. 이슈 메모를 그대로 쓰지 않는 자리

이슈 메모는 "`run_routine`과 `collect_trial`이 폰 잠금을 잡는다, `trial_lock.py`를 재사용한다"이다. `trial_lock.acquire`를 `run_routine`이 그대로 부르면 두 가지가 깨진다.

1. **예약 켜기, 끄기 참조 세기가 어긋난다.** `acquire`는 첫 등록자가 `schedule.state`(예약이 원래 켜져 있었나)를 적고, 마지막 해제자가 그 값으로 예약을 되살린다(`trial_lock.py:165-181`, `collect_trial.ps1:78-85`). 손으로 돌린 `run_routine`이 먼저 등록해 `state=1`을 적은 뒤, 다른 폰으로 시험이 시작해 나중에 끝나면, 그 시험은 "원래 켜져 있었다"로 읽고 사람이 꺼 둔 예약(홀드)을 푼다. 반대로 시험이 `first=false`라 예약을 끄지 않아 시험 중에 예약이 뜰 수도 있다.
2. **정기 수집이 막힌다.** `acquire`는 폰이 겹치면 `ok=false`(종료 코드 3)를 돌려준다. 정기 수집이 이 값에 멈추면 "정기 수집을 깨지 않는다"에 어긋난다.

그래서 같은 레지스트리(`collect_trial.d/`)를 쓰되 **회차 표(`<pid>.routine`)를 시험 표(`<pid>.trial`)와 다른 종류로 둔다.** 회차 표는 폰 겹침 판정에는 들어가고 예약 참조 세기에는 안 들어간다. 회차 등록은 겹쳐도 실패하지 않는다(§3-2).

옛 잠금 파일(`collect_trial.lock`)에는 회차를 적지 않는다. 그 파일을 읽는 `verify_bot`, `device_watch`, `offer_link_check`, `probe.trial_lock_held`는 회차 중인지를 이미 `logs/state.json`(`link_watch.routine_running`)으로 따로 본다. 옛 파일 뜻을 바꾸면 그 넷의 동작이 같이 바뀐다(§2).

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md` 1~10번 묶음에 폰 잠금, `trial_lock.py`, `run_routine.py`, `run_adb`를 가진 자리는 없다. 이 변경은 mono의 api, web, 배포에 닿지 않는다. 9번(새 파일)은 tracker의 새 모듈과 테스트 파일이라 해당 없다(mono 구조 문서, web 테스트 사슬, beggars-ops 배포 목록 모두 무관).

tracker 안에서 같이 움직이는 자리(표에 없는 논리적 결합)는 아래다. 이번 작업에 넣을지를 줄마다 정한다.

| 자리 | 묶인 이유 | 이번에 |
|---|---|---|
| `scripts/trial_lock.py` 레지스트리 형식 | 회차 표를 더한다 | 넣는다. 시험 표, 옛 잠금, `schedule.state`의 뜻은 바꾸지 않는다 |
| `scripts/collect_trial.ps1` | 이미 `COLLECT_TRIAL_PID`를 싣는다. 주인 토큰도 싣는다 | 넣는다(한 줄) |
| `capture/fleet/probe.py` `trial_lock_held` | `COLLECT_TRIAL_PID`를 "하네스가 띄운 조작 측정인가"로 쓴다 | 안 넣는다. 토큰을 새 변수(`PHONE_LOCK_OWNER`)로 두어 이 뜻을 건드리지 않는다 |
| `verify_bot`, `device_watch`, `offer_link_check`의 옛 잠금 읽기 | 옛 잠금 파일 형식 | 안 넣는다. 옛 파일에 회차를 안 적는다(§1-1) |
| 폰 명령을 직접 부르는 16개 파일 | 관문을 안 지나면 경고가 안 남는다 | 관문 대상과 제외를 표로 확정하고 테스트로 박는다(§3-4) |
| `run_routine._dev_locks` | 프로세스 안 스레드 잠금 | 그대로 둔다. 다른 일이다(넘겨받기 겹침) |

## 3. 설계

### 3-1. 주인 토큰

- 환경변수 `PHONE_LOCK_OWNER=<잠금을 쥔 프로세스 pid>`.
  - `collect_trial.ps1`: 잠금을 잡은 뒤 `$env:PHONE_LOCK_OWNER = "$PID"`(`COLLECT_TRIAL_PID` 줄 옆). 시험 표의 pid와 같은 값이다.
  - `run_routine`: 회차 표를 등록한 뒤 `os.environ["PHONE_LOCK_OWNER"] = str(os.getpid())`. 단계 스크립트는 `_attempt`의 `env = {**os.environ, ...}`(`run_routine.py:623`)로 상속한다. 회차 프로세스 안의 화면 가드(`capture.guards.Guard`)도 같은 환경을 본다.
- **물려받은 토큰이 살아 있으면 다시 등록하지 않는다.** `collect_trial.ps1 -Command "python scripts\run_routine.py ..."`처럼 시험 안에서 회차가 돌면, 자식 `run_routine`은 토큰 `X`(ps1 pid)를 물려받는다. 여기서 자기 pid `Y`로 덮어쓰면 그 아래 단계는 토큰 `Y`를 들고, 폰의 주인 목록에 `X`도 있어 경고가 난다. 그래서 `run_routine`은 `PHONE_LOCK_OWNER`가 있고 그 pid가 레지스트리에 살아 있으면 등록과 덮어쓰기를 둘 다 건너뛴다.
- 토큰이 있지만 그 pid가 죽었거나 레지스트리에 없으면 없는 것으로 본다(낡은 환경 상속).

### 3-2. 회차 표 (`scripts/trial_lock.py`)

```python
def hold(pid: int, serials: list[str], kind: str = "routine", base=None, alive=None) -> dict:
    """회차가 쓰는 폰을 적는다. 겹쳐도 실패하지 않는다(정기 수집을 막지 않는다).
    -> {"ok": True, "overlap": [{"pid": .., "kind": "trial"|"routine", "serials": [...]}], "stale_removed": n}"""

def unhold(pid: int, kind: str = "routine", base=None) -> None: ...

def holders(serial: str, base=None, alive=None) -> list[dict]:
    """그 폰을 쥔 살아 있는 표들(시험, 회차, 옛 잠금의 \"전체\"). 폰을 안 밝힌 표는 모든 폰을 쥔다."""
```

- 파일: `collect_trial.d/<pid>.routine`(첫 줄 pid, 이하 폰). `_guard`(O_EXCL 짧은 잠금) 안에서 쓴다.
- `_live_entries`는 `*.trial`과 `*.routine`을 다 읽되 항목에 `kind`를 붙인다. 죽은 pid의 표는 지금처럼 치운다(낡은 잠금이 정기 수집을 막지 않는다, 이슈 결정 4번).
- `acquire`(시험)의 겹침 판정은 회차 표도 본다. 회차가 쥔 폰으로 시험을 시작하면 종료 코드 3. 지금도 예약 작업이 `Running`이면 `collect_trial.ps1`이 종료 코드 2로 먼저 막으므로, 새로 막히는 경우는 "사람이 `run_routine`을 손으로 돌리는 중에 같은 폰 시험"뿐이다.
- `acquire`의 `first`, `schedule.state`, `release`의 `last`는 **시험 표만** 센다. 회차 표가 있어도 시험은 `first=true`로 예약을 끄고, 마지막 시험이 예약을 되살린다(지금과 같다).
- `_write_legacy`는 시험 표만 적는다(§1-1).
- `run_routine`: `attached`가 정해진 뒤(`run_routine.py:1117` 이후, 기기 준비 전) `hold(os.getpid(), attached)`. `main`의 `finally`에서 `unhold`. 넘겨받을 폰도 `attached` 안이라 회차 동안 바뀌지 않는다. 단계마다 잡고 놓지 않는 이유: 단계 사이 틈에 들어온 직접 실행은 곧 다음 단계와 겹치는데 경고가 안 남는다.
- `hold`의 `overlap`이 비어 있지 않으면 통합 로그와 알림에 한 줄 남기고 그대로 돈다: `[phone-lock] 회차 시작: <폰>을 시험(PID n)이 쥐고 있다 - 그대로 돈다`.
- `--dry-run`은 등록하지 않는다(폰을 안 잡는다).

### 3-3. 관문 (`capture/phone_lock.py`, 새 모듈)

```python
def note_use(serial: str, *, base=None, alive=None, notify=None) -> str | None:
    """이 프로세스가 그 폰을 써도 되는가를 프로세스마다 폰당 한 번 본다. 1단계는 막지 않는다.
    돌려주는 값: None(조용히 통과) 또는 경고 한 줄(이미 찍고 알린 것)."""
```

판정 순서:

1. 이 프로세스에서 같은 폰을 이미 봤으면 바로 돌아간다(모듈 안 집합). 폰 명령 수백 번마다 파일을 읽지 않는다.
2. 연결 이름을 폰으로 맞춘다. `capture.fleet.registry.load().find(serial)`이 있으면 그 `Device.serial`, 없으면 받은 문자열. 이유: 같은 폰이 USB와 무선 두 이름으로 뜬다(2026-10-17 노트20). 회차는 USB 이름으로, 직접 실행은 무선 이름으로 쥐면 글자가 달라 경고를 놓친다. 표에 적는 쪽(`hold`, `collect_trial` 폰 목록)도 같은 함수로 맞춘다.
3. `trial_lock.holders(폰)`. 비었으면 통과.
4. `PHONE_LOCK_OWNER`가 주인 목록의 pid 중 하나면 통과.
5. 아니면 경고 한 줄을 표준 출력에 찍고 슬랙으로 한 번 알린다(`capture/slack_notify.py`).
   - 줄: `[phone-lock] 경고: <폰 이름>(<시리얼>)을 <회차|시험>(PID n)이 쥐고 있는데 토큰 없이 들어왔다 - 1단계라 막지 않는다 (명령: <sys.argv 앞 세 낱말>)`
   - 같은 줄을 `logs/phone-lock.jsonl`에 한 줄 JSON으로 덧붙인다(`{"ts","serial","holder_pid","holder_kind","argv","owner_env"}`). 한 주 관찰(§8)의 입력이다.
6. 어떤 예외도 관문 밖으로 나가지 않는다(`except Exception` → `[phone-lock] 판정 못 함: <예외>` 한 줄, 통과). 관문이 수집을 죽이면 "정기 수집을 깨지 않는다"에 어긋난다.

`PYTEST_CURRENT_TEST`가 있으면 기본 `base`는 쓰지 않는다. 테스트는 `base`를 넘겨서만 판정한다(실제 PC 레지스트리를 테스트가 읽지 않게).

### 3-4. 관문을 지나는 자리 (16개 파일 확정)

`Grep '"adb"' capture scripts`(2026-11-15)와 `u2.connect` 한 곳으로 뽑았다. 기준: 화면이나 앱 상태를 바꾸거나 화면을 읽는 수집 경로면 관문, `adb devices`처럼 폰 목록이나 기기 정보만 읽으면 제외.

| 파일 | 부르는 것 | 판정 | 이유 |
|---|---|---|---|
| `capture/common.py` `run_adb` | 수집 명령 전부 | 관문 | 모든 수집이 지나는 한 곳. 따옴표 처리 바로 뒤, `_start_fdump_early` 앞 |
| `capture/common.py` `_device_state`, `_cat_ui` 재연결 | `get-state`, `reconnect`, `wait-for-device` | 제외 | `run_adb` 안에서만 불린다. 이미 그 폰을 봤다 |
| `capture/fleet/adb.py` | `adb shell` | 관문 | 함대 측정이 직접 부른다 |
| `capture/fleet/dumpers.py` | `u2.connect`, `pkill uia2` | 관문 | u2 덤프는 `run_adb`를 안 지난다 |
| `capture/fleet/fdump.py` | `app_process`, `push`, `pkill` | 관문 | 덤프 경로 |
| `capture/guards.py` | `shell`, `KEYCODE_BACK` | 관문 | 화면을 바꾼다. 회차 안에서는 토큰이 있어 조용하다 |
| `scripts/measure_dump_ways.py` | `ps`, `pkill` | 관문 | 측정 스크립트를 손으로 돌리는 일이 잦다 |
| `scripts/stop_all.py` | `force-stop`, `KEYCODE_HOME` | 제외 | 사람이 모두 멈추려고 부른다. 경고가 늘 나서 관찰을 흐린다 |
| `scripts/run_routine.py` | `start-server`, `wait-for-device`, `echo ok`, 준비 명령 | 제외 | 주인 프로세스 자신 |
| `scripts/device_watch.py`, `capture/thermal.py` | `devices`, `dumpsys battery`, 온도 읽기 | 제외 | 상태 읽기만. 옛 잠금을 이미 본다 |
| `scripts/bootstrap_check.py`, `scripts/_env_paths.py`, `capture/device_profile.py` | `version`, `devices`, `getprop` | 제외 | 기기 정보 읽기 |
| `capture/fleet/probe.py` | `devices` | 제외 | 목록 읽기. `--act`는 `trial_lock_held`가 따로 막는다 |
| `capture/yogiyo_drv.py`, `capture/baemin_drv.py` | `hasattr(drv, "adb")` | 해당 없음 | 글자만 맞고 adb를 부르지 않는다 |

### 3-5. 막기(2단계)는 이번에 안 한다

이슈 끝 조건대로 1단계는 경고만이다. 2단계에서 `note_use`가 경고 대신 예외를 올리고 `--force`로 넘기는 일은 §8의 관찰 뒤 별도 이슈로 정한다. 함수 이름과 돌려주는 값은 2단계에서 바꾸지 않아도 되게 둔다(경고 줄을 돌려주는 자리가 예외를 올리는 자리가 된다).

## 4. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 미관측과 헷갈리는 것 | 양성 신호 |
|---|---|---|
| `note_use`가 조용함 | 레지스트리를 못 읽었는데(경로 틀림, 권한) "주인 없음"으로 통과 | 판정을 못 하면 조용히 넘지 않고 `[phone-lock] 판정 못 함` 줄을 찍는다. 레지스트리 폴더 자체가 없으면 "주인 없음"이 맞다(아무도 안 잡았다) |
| 경고 0건(한 주 관찰) | 관문을 안 지나는 길로 들어와 경고가 안 난 것인지, 정말 겹침이 없었던 것인지 | 회차 로그에 `[phone-lock] 회차 표 <pid> <폰들>` 줄(등록 양성 신호)이 매 회차 있다. 관문 대상 파일은 테스트 12가 박는다. 실기 시험에서 한 번은 회차가 쥔 폰으로 토큰 없는 읽기 명령을 일부러 넣어 경고가 나는지 본다(§6 실기) |
| 연결 이름 | 무선 이름으로 들어와 글자가 달라 "주인 없음" | §3-3 2번의 이름 맞추기. 테스트 7 |
| 회차 표 등록 | 등록이 실패했는데 회차는 돌고 경고도 안 남 | `hold`가 예외면 `[phone-lock] 회차 표 못 적음: <예외>`를 로그와 알림에 남긴다. 회차는 계속 돈다 |
| 낡은 잠금 | 죽은 pid 표로 경고가 계속 나 오탐이 쌓임 | `holders`가 `pid_alive`로 거르고 치운다. 테스트 4 |
| `check_routine` 판정 | `[phone-lock]` 줄이 단계 구획에 섞여 판정을 흐림 | 회차 시작 줄은 `r.append`로 구획 밖 머리(`====` 줄 다음)에 적는다. 단계 안 경고는 회차 안이라 토큰이 있어 안 난다. `check_routine`이 `[phone-lock]` 줄을 실패로 안 세는지 테스트 14 |

## 5. 원장 (append-only)

원장(`data/log.jsonl`)을 건드리지 않는다. 새로 쓰는 파일은 `collect_trial.d/<pid>.routine`(PC 공용 자리, 원장 아님)과 `logs/phone-lock.jsonl`(관찰 기록, 덧붙이기만)이다.

## 6. 시험 (결론은 테스트로 박는다)

### 폰 없이

`tests/test_trial_lock.py`(기존 파일에 더함). `base=tmp_path`, `alive`는 가짜.

1. `test_routine_hold_does_not_count_for_schedule`: 회차 표가 있는 상태에서 다른 폰 시험 `acquire` → `first=True`, `schedule.state`는 시험이 넘긴 `task_enabled` 값. 그 시험 `release` → `last=True`.
2. `test_routine_hold_never_fails`: 시험이 쥔 폰으로 `hold` → `ok=True`, `overlap`에 그 시험 pid.
3. `test_trial_refused_on_routine_phone`: 회차가 쥔 폰으로 시험 `acquire` → `ok=False`, `holder`가 회차 pid.
4. `test_dead_routine_hold_is_ignored`: 죽은 pid 회차 표 → `holders`가 비고 표 파일이 지워진다.
5. `test_legacy_file_has_no_routine`: 회차 표만 있을 때 `collect_trial.lock`이 없다. 시험과 회차가 같이 있으면 옛 파일 폰 줄은 시험 폰만.

`tests/capture/test_phone_lock.py`(새 파일). `notify`와 기록 경로를 가짜로 받는다.

6. `test_owner_token_passes`: 회차 표 pid=100, `PHONE_LOCK_OWNER=100` → `None`, 알림 0회.
7. `test_wireless_name_maps_to_same_phone`: 회차가 USB 시리얼로 쥐고, 무선 주소로 `note_use`, 토큰 없음 → 경고 한 줄. 이 시험이 끝 조건 첫째(토큰 없는 직접 실행이 회차가 쥔 폰에 들어오면 경고)를 무선 이름까지 박는다.
8. `test_no_token_on_trial_phone_warns`: 시험 표 pid=200, 토큰 없음 → 경고 줄에 `시험(PID 200)`, 알림 1회, `phone-lock.jsonl` 한 줄.
9. `test_warns_once_per_phone`: 같은 폰으로 세 번 → 알림 1회.
10. `test_stale_token_is_no_token`: 토큰 300인데 300 표가 없음 → 경고.
11. `test_gate_never_raises`: `holders`가 예외 → `판정 못 함` 줄, 예외 안 남.
12. `test_gate_covers_callers`: `capture/`, `scripts/`에서 `"adb"`가 든 `subprocess.run` 자리와 `u2.connect` 자리를 가진 파일을 모두 뽑아, §3-4의 관문 집합이나 제외 집합(시험 안의 두 목록) 중 하나에 있음을 확인한다. 관문 집합 파일은 `note_use(` 호출이 있어야 한다. 새 파일이 분류 없이 폰 명령을 부르면 여기서 깨진다.

`tests/test_run_routine_*.py` 옆(기존 `Runner` 가짜를 쓴다).

13. `test_routine_children_inherit_token`: `hold` 뒤 `_attempt`가 만든 `env`에 `PHONE_LOCK_OWNER=<회차 pid>`. 물려받은 토큰이 살아 있으면 `hold`를 안 부르고 토큰을 안 덮는다. 이 둘이 끝 조건 둘째(정기 수집과 `collect_trial` 시험은 경고 없이 돈다)를 박는다.
14. `test_check_routine_ignores_phone_lock_lines`: 통합 로그 머리에 `[phone-lock]` 줄이 있어도 `check_routine` 판정이 같다.

`tests/test_collect_trial_harness.py`(기존, 소스 정적 검사):

15. `PHONE_LOCK_OWNER`를 `acquire` 성공 뒤, `& cmd /c $Command` 앞에서 싣는다.

### 실기 (`scripts/collect_trial.ps1`, 예약 시각을 피해서)

- 예약을 끄고 회차 하나를 짧게 돈다: `collect_trial.ps1 -Command "python scripts\run_routine.py --no-audit --skip 8"`. 보는 것: 통합 로그에 `[phone-lock] 회차 표` 줄이 없다(시험 안 회차는 등록을 건너뛴다), 단계 로그에 `[phone-lock] 경고`가 0줄이다. 0줄의 양성 신호는 같은 시각 `collect_trial.d/`에 시험 표가 있었다는 것(시험 시작 출력의 폰 줄).
- 그 회차가 도는 동안 다른 창에서 토큰 없이(`env -u PHONE_LOCK_OWNER`) 같은 폰 읽기 명령 하나(예: `python -c "from capture.common import run_adb; run_adb('<폰>', 'shell', 'echo', 'ok')"`)를 넣어 경고 한 줄과 알림 한 건이 나는지 본다. 화면을 바꾸지 않는 명령이라 회차를 깨지 않는다.

## 7. 구현 순서

1. `trial_lock.py`: `kind`, `hold`, `unhold`, `holders`. 시험 1~5. 기존 `test_trial_lock.py` 통과.
2. `capture/phone_lock.py`와 연결 이름 맞추기. 시험 6~11.
3. `run_adb`와 §3-4 관문 파일에 `note_use`. 시험 12.
4. `run_routine.py`: 등록, 토큰, `finally` 해제, 회차 머리 줄. 시험 13~14.
5. `collect_trial.ps1`: 토큰 한 줄. 시험 15.
6. `python -m pytest` 전체, `docs/HARNESS.md` §11 점검(마지막 줄까지).
7. 실기 시험(§6).
8. `docs/setup/COLLECTION-INCIDENTS.md`에 "`[phone-lock] 경고`" 항목(증상, 확인 명령 `logs/phone-lock.jsonl`, 조치), `docs/HARNESS.md` 시험 잠금 절에 회차 표 한 줄.

## 8. 열린 질문과 후속

- **한 주 관찰(1단계 → 2단계).** `logs/phone-lock.jsonl`을 모아 오탐(낡은 잠금, 상속 누락)과 진짜 겹침을 가른다. 오탐이 0이면 2단계(막기, `--force` 우회와 로그)를 별도 이슈로 연다.
- **반대 방향(직접 실행이 먼저, 회차가 나중).** 이번 사고는 회차가 먼저 돌고 있었다. 직접 실행이 먼저 폰을 쓰는 중에 회차가 그 폰 단계를 시작하면 직접 실행은 표가 없어 회차는 모른다. 1단계 범위 밖이다. 2단계에서 "토큰 없는 실행이 경고 뒤 자기 표를 적는다"로 막을지 같이 정한다.
- **`stop_all.py` 제외.** 사람이 멈추려고 부르는 명령이라 뺐다. 회차 중에 불리면 회차가 깨지는 건 같으니 2단계에서 다시 본다.
- **옛 잠금 파일에 회차를 적을지.** `verify_bot` 등이 `state.json` 대신 레지스트리 하나만 보게 하면 묶음이 줄지만 그 넷의 동작이 바뀐다. 이번에는 안 한다.
