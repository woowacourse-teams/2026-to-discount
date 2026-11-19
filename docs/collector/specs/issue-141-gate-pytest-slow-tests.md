<!-- 원본: tracker docs/specs/issue-141-gate-pytest-slow-tests.md — 여기서 고치지 않는다 -->
# 이슈 #141 수집 1단계 pytest가 느려진 원인을 매 회차 남기고, 테스트가 실제 기기 대기를 타지 못하게 막기

- 영역: `export` (폰 없이 끝남. 고치는 것은 `tests/conftest.py`, `scripts/run_routine.py`의 1단계 명령, `scripts/check_routine.py`의 1단계 근거 문구, `tests.yml`. 수집 로직은 안 바꾼다)
- 출처: 이슈 #141 (11-03 wsl 점검, 메인 확인: 326초 → 617초, 테스트 수 약 7% 증가)

## 1. 문제와 이슈 절차 비판

1단계(`python -m pytest tests -q -m "not ci_only and not non_gate"`)는 관문이라 빼지 못한다. 617초면 00:01 회차의 폰 단계가 약 10분 늦게 시작한다. 이슈의 가설은 둘이다. (a) 느린 테스트가 새로 들어옴, (b) 다른 작업과 겹친 부하.

이슈 절차를 그대로 따르지 않는 이유:

1. **"폰 안 쓰는 시간에 한 번 `--durations=25`"는 한 번의 관측이다.** 617초는 예약 회차에서 났다. 손으로 한 번 잰 값은 (b)를 못 가른다. 같은 머신, 같은 시각이 아니기 때문이다. 대신 **매 예약 회차의 1단계가 느린 테스트 상위를 로그에 남기게 한다**(§3-1). 그러면 다음 회차부터 (a)와 (b)가 로그만으로 갈린다.
   - (a)면 같은 몇 개가 매번 위에 있다.
   - (b)면 상위가 고르게 다 같이 느리고 회차마다 순위가 바뀐다.
2. **"상위 몇 개를 가짜로 바꾼다"는 테스트 하나씩 고치는 일이다.** 코드를 읽어 보니 느림이 생기는 길은 구조적이다(§1-1). 테스트별로 고치면 다음 테스트가 같은 길로 다시 들어온다. 그래서 길 자체를 `conftest.py`에서 막는다(§3-2, §3-3).
3. **"느린 통합 테스트는 CI에서만"은 관문을 비운다.** `ci_only`는 1단계에서 빠진다. 수집 동작을 지키는 테스트를 빼면 관문이 그만큼 못 본다. 그래서 옮길 수 있는 테스트를 규칙으로 좁힌다(§3-4).

### 1-1. 코드로 찾은 원인 후보 (측정 전, 미확인)

설계자 세션은 pytest를 돌릴 수 없다. 아래는 코드를 읽어 찾은 길이다. **어느 것이 617초의 몫인지는 §3-1 측정 전에는 모른다.**

| 후보 | 근거 | CI와 수집 PC에서 다르게 도는가 |
| --- | --- | --- |
| (c) 가짜 시리얼로 실제 `adb`를 부름 | `capture/common.py` `run_adb`, `_cat_ui`의 `adb reconnect`, `wait-for-device`(시간 상한 20초, 30초), `_rm_ui`(11-02 추가)의 `wait-for-device` 30초, `capture/guards.py`, `capture/thermal.py`, `capture/device_profile.py`가 `subprocess.run(["adb", ...])`을 직접 부른다. 테스트가 이 길을 바꿔 끼우지 않으면 수집 PC는 진짜 adb 서버에 가짜 시리얼을 묻는다. `wait-for-device`는 없는 시리얼에 상한까지 기다린다 | **다르다.** CI 러너에는 `adb`가 없어 `FileNotFoundError`로 바로 끝난다. 수집 PC에서만 느리다. 이슈가 말한 "메인 작업 폴더에서 2~3분"과 "예약 회차 10분"의 차이를 일부 설명할 수 있다 |
| (d) 실제 `time.sleep` | `capture/phone_cycle.py`의 `wake`(2초 ×3), `clean_apps`(2초), `_toggle_tile`(1.5~2초 ×3), `_wait_airplane`(2초 ×최대 8), `set_wifi_on`(최대 45초). 11-03에 #101, #110, #127이 깨우기 경로를 늘렸다. `conftest.py`는 `is_asleep`, `is_awake`, `keyguard_showing`만 바꿔 끼우고 `time.sleep`은 그대로다 | 같다. 둘 다 느리다 |
| (e) 새 인터프리터, 실제 git | `test_split_modules_import.py`가 모듈 19개마다 새 파이썬을 띄운다. `test_git_sync.py`, `test_check_pr_state_files.py`(11-03 추가), `test_reflect_commit_paths.py`, `test_publish_brand_links.py`가 임시 저장소에서 실제 git을 돈다. `test_run_routine.py`의 시간 초과 시험은 1초 상한으로 실제 프로세스를 끊는다 | 윈도에서 프로세스 생성이 리눅스보다 몇 배 느리다 |
| (b) 부하 겹침 | 이슈 가설. 다른 세션의 pytest, 빌드, 수집 시험과 겹침 | 수집 PC만 |

(c)는 (d)보다 먼저 본다. 테스트 하나가 상한(20~30초)까지 기다리면 몇 개만으로 수백 초가 된다. 또 (c)는 2026-09-13, 14 `ADB_SERIAL` 사고(테스트가 실제 adb를 때림, `ROUTINE-SPEC.md` 사고 F)와 같은 모양이다. 느린 것뿐 아니라 테스트가 연결된 실기 폰을 건드릴 수 있는 길이다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에 pytest, `conftest.py`, `run_routine.py` 1단계 명령, `check_routine.py`, `tests.yml` 묶음이 없다(문서에서 `pytest`, `conftest`, `tests.yml`, `check_routine`, `ROUTINE-SPEC`을 찾았고 맞는 줄 0개). 없다고 확인하고 시작한다. 아래는 이 저장소 안에서 같이 움직이는 자리다.

| 자리 | 넣는가 | 이유 |
| --- | --- | --- |
| `scripts/run_routine.py` 1단계, 1b단계 명령에 `--durations` | 넣음 | 측정을 매 회차로(§3-1) |
| `scripts/check_routine.py` 1단계 근거 문구 | 넣음, 판정은 안 바꿈 | 판정은 PASS/FAIL 그대로. 근거 칸에 소요와 최상위 셋을 덧붙인다(§3-1). `reflect_daily.py`가 판정 표를 읽으므로 판정 값은 건드리지 않는다 |
| `tests/test_check_routine.py` | 넣음 | 근거 문구가 바뀌면 같이 고친다. 기존 `N passed` 단언이 깨지지 않게 문구는 `N passed` 뒤에 붙인다 |
| `tests/conftest.py` 외부 기기 실행 차단, sleep 예산 | 넣음 | 구조로 막기(§3-2, §3-3) |
| `pytest.ini` 새 마커 `real_wait` | 넣음 | sleep 예산에서 빠지는 표식(§3-3) |
| `.github/workflows/tests.yml` pytest 줄에 `--durations` | 넣음 | CI 쪽 비교 기준을 같은 형식으로 남긴다. CI 결과는 바꾸지 않는다 |
| `docs/setup/ROUTINE-SPEC.md` 단계 1 표 | 넣음 | 명령이 바뀐다. "성공 신호" 칸의 `2026-09-14 기준 N = 531`도 구현 시점 값으로 고친다 |
| `docs/workflow/HANDOFF.md` 또는 인계 파일의 예약 시각 주의 | 넣음 | 이슈 절차 4. 다만 문서로만 막지 않는다. 겹침은 §3-1 로그로 드러난다 |
| 수집 코드(`capture/*.py`)의 `time.sleep`, `adb` 호출 | 안 고침 | 수집 동작은 그대로다. 시험이 그 길을 못 타게 할 뿐이다. 수집 코드를 고치지 않으므로 폰 시험과 예약 끄기가 필요 없다 |
| `ci_only` 이동 | 규칙만 정함(§3-4) | 측정 결과에 따라 구현자가 고른다 |

`run_routine.py`와 `check_routine.py`는 예약 수집이 부르는 코드다. `AGENTS.md` 규칙에 따라 병합 뒤 다음 예약 전에 수집 PC에서 1단계만 골라 돌려 본다(§7 끝).

## 3. 결정

### 3-1. 매 회차 측정 (이슈 절차 1을 대신함)

1. `run_routine.py`의 1단계와 1b단계 명령 끝에 `--durations=15 --durations-min=1.0`을 붙인다. 1초 넘는 단계(setup, call, teardown)만 최대 15줄 찍힌다.
2. `check_routine.py`의 1단계 PASS 근거를 `"{n} passed, 최상위: {이름} {초}s, …"`로 바꾼다. 셋까지. 판정 값(PASS/FAIL)은 바꾸지 않는다.
   - durations 줄 형식은 `12.34s call     tests/x.py::test_y`다. 정규식으로 셋을 뽑는다.
   - **양성 신호:** durations 머리줄(`slowest 15 durations` 또는 `slowest durations`)이 섹션에 있는데 1초 넘는 줄이 0개면 근거에 `1초 넘는 테스트 없음`을 적는다. 머리줄 자체가 없으면 `소요 측정 없음`을 적는다. 둘을 같은 빈칸으로 두지 않는다. 머리줄 없이 빈칸이면 "빠르다"와 "옵션이 빠졌다"가 구별되지 않는다.
3. `tests.yml`의 pytest 줄에도 같은 옵션을 붙인다. CI 기록과 수집 PC 기록을 같은 형식으로 견준다.

1단계 전체 소요(초)는 이미 로그 끝 `소요: 1)617s …` 줄에 있다. 새로 만들지 않는다.

### 3-2. 테스트가 외부 기기 실행 파일을 못 부르게 막기 (후보 c)

`tests/conftest.py`에 autouse 장치를 둔다. `subprocess.Popen`을 감싸 첫 인자의 실행 파일 이름(경로를 떼고 확장자를 뗀 소문자)이 `adb`, `scrcpy`, `powershell`, `pwsh` 중 하나면 `FileNotFoundError`를 던진다.

- `subprocess.run`, `check_output`, `call`은 모두 `Popen`을 거치므로 한 자리로 막힌다.
- **CI와 같은 결과를 낸다.** CI에는 `adb`가 없어 이미 `FileNotFoundError`가 난다. 그래서 지금 CI에서 초록인 테스트는 이 장치 뒤에도 같은 길을 탄다. 수집 PC에서만 다르게 돌던 차이를 없앤다.
- 테스트가 `subprocess.run`이나 `run_adb`를 직접 바꿔 끼우면 그 가짜가 먼저다(테스트 안 `monkeypatch`가 autouse보다 나중에 적용된다). 기존 가짜는 그대로 돈다.
- `scripts/` 쪽에서 `shutil.which("adb")`로 존재부터 확인하는 코드가 있는지 구현자가 찾는다(`grep -rn 'which(' scripts capture`). 있으면 같은 장치에서 `None`을 돌려준다. 없으면 없다고 인계에 적는다.
- 실제 adb가 꼭 필요한 테스트는 지금 없어야 한다. 차단 뒤 깨지는 테스트가 나오면 그 테스트는 수집 PC에서 실기를 건드리던 것이다. 구현자는 가짜로 바꾸고 PR 본문에 이름을 적는다. 차단을 푸는 표식은 만들지 않는다.
- 세션 끝에 막은 횟수를 찍는다: `외부 기기 실행 차단: N회 (adb N1, powershell N2 …)`. 0이어도 찍는다. 장치가 걸려 있다는 양성 신호다.

부수 효과: 테스트가 연결된 실기 폰을 건드리는 길(사고 F 계열)도 같이 막힌다.

### 3-3. 실제 sleep 예산 (후보 d)

`tests/conftest.py`에 autouse 장치를 둔다. `time.sleep`을 감싸 **요청한 초를 테스트별로 더한다.** 실제로 자는 것은 그대로 둔다(줄이지 않는다). 테스트가 끝날 때 합이 예산을 넘으면 그 테스트를 실패로 만든다.

- 예산: 테스트 하나당 요청 합 **2초**. 근거: 기존 테스트 중 실제 시간이 의미 있는 `test_run_routine.py`의 가짜 단계가 0.3초 단위다. 구현자는 측정해서 지금 넘는 테스트를 모두 고친 뒤 이 값을 확정한다. 바꾸면 PR 본문에 근거를 적는다.
- 벽시계가 아니라 **요청한 초**를 센다. 그래서 수집 PC가 바쁠 때도 결과가 CI와 같다. 관문에 들어가는 검사가 부하에 따라 빨개지면 수집이 멈춘다. 그러면 안 된다.
- 빠지는 표식: `@pytest.mark.real_wait`. `pytest.ini`에 마커를 정의하고 이유를 쓴다. 붙일 수 있는 테스트는 시간 자체를 시험하는 것뿐이다(예: 시간 초과 끊기, 병렬 단계 순서). 붙인 테스트는 PR 본문에 목록으로 적는다.
- 다른 스레드에서 부른 sleep도 센다(`test_run_routine.py`는 스레드로 단계를 돌린다). 현재 테스트 id에 붙여 더한다. 스레드 안전하게 잠금을 쓴다.
- 자식 프로세스 안의 sleep은 못 센다(`test_atomic_merge.py`, `test_run_routine.py`의 `python -c "...time.sleep(30)"`). 그 둘은 §3-1의 durations로 본다. 한계 표(§3-5)에 둔다.
- 실패 문구: `실제 sleep 합 N.N초 > 예산 2초: 가장 큰 호출 위치 <파일:줄> (M회)`. 호출 위치를 잡아 두면 어떤 수집 함수가 새는지 바로 보인다.

고치는 방법(예산을 넘는 테스트마다): 그 테스트에서 `time.sleep`을 `lambda s: None`으로 바꿔 끼우거나, 부르는 모듈의 대기 상수를 0으로 바꿔 끼운다. 테스트 개수는 줄이지 않는다(이슈 절차 2).

### 3-4. `ci_only`로 옮겨도 되는 테스트의 규칙 (이슈 절차 3)

옮기는 것은 셋을 모두 만족할 때만이다.

1. §3-1 측정에서 수집 PC 기준 한 테스트(또는 한 파라미터 묶음)가 10초를 넘는다.
2. §3-2, §3-3을 적용한 뒤에도 그렇다.
3. 수집 결과를 바꾸는 코드를 지키지 않는다. 예: 문서, 워크플로, 저장소 구조 검사.

`test_split_modules_import.py`는 3을 못 맞춘다. 수집 모듈의 순환 import가 깨지면 수집이 시작부터 죽는다. 그래서 관문에 남긴다. 느리면 19개를 새 인터프리터 하나에서 차례로 import하는 식으로 합치지 않는다(앞선 import가 순환을 가린다, 파일 머리말). 대신 `pytest-xdist`도 들이지 않는다(새 의존성, 수집 PC 설치 필요). 이 테스트는 측정값을 PR 본문에 적고 그대로 둔다.

git을 실제로 쓰는 테스트(`test_git_sync.py`, `test_check_pr_state_files.py`, `test_reflect_commit_paths.py`, `test_publish_brand_links.py`)는 대부분 수집 PC의 push, 반영 경로를 지킨다. 3을 못 맞추면 관문에 남는다. 구현자가 파일별로 판단하고 PR 본문 표에 이유를 적는다. `non_gate`도 같은 규칙으로 고른다(1b로 옮기면 관문에서 빠지지만 매 회차 돈다).

### 3-5. 부하 겹침 (후보 b, 이슈 절차 4)

- 인계 파일(`docs/workflow/HANDOFF.md`)에 한 줄: "예약 수집 시각(`ROUTINE-SPEC.md` §1) 앞뒤 15분에는 수집 PC에서 전체 pytest, 빌드, 수집 시험을 돌리지 않는다."
- 문서만으로는 못 막는다. 대신 §3-1의 로그가 겹침을 드러낸다. 판정은 (a)와 (b)를 가르는 기준으로 한다: 최상위 셋이 지난 회차와 같고 초가 비슷하면 (a), 고르게 늘었으면 (b).
- 겹침을 자동으로 막는 장치(예: 1단계 시작 때 다른 pytest 프로세스 감지)는 이번에 안 넣는다. §3-1 결과로 (b)가 확인되면 후속 이슈로 낸다(§8 열린 질문 2).

### 3-6. 한계

| 한계 | 설명 | 대응 |
| --- | --- | --- |
| 자식 프로세스 안 sleep | §3-3 예산이 못 센다 | §3-1 durations로 본다 |
| 벽시계 상한 없음 | 테스트 하나의 실제 소요는 실패로 만들지 않는다 | 부하에 따라 관문이 빨개지는 것을 피하려는 선택. durations로 본다 |
| CI는 리눅스, 수집 PC는 윈도 | 프로세스 생성 비용이 다르다 | 두 기록을 같은 형식으로 남겨 견준다(§3-1의 3) |
| 이번 PR로 얼마나 빨라지는지 | 설계 시점에 모른다 | 구현자가 CI 전후 durations를 PR 본문에 적는다. 수집 PC 값은 병합 뒤 첫 예약 로그로 확인(후속 조치) |

## 4. "없다 / 0 / 통과" 자리와 양성 신호

| 출력 | 가를 신호 |
| --- | --- |
| 판정기 1단계 근거 "1초 넘는 테스트 없음" | 섹션에 durations 머리줄이 있다. 머리줄이 없으면 `소요 측정 없음`으로 따로 적는다 |
| 세션 끝 "외부 기기 실행 차단: 0회" | 줄 자체가 찍힌다(장치가 걸렸다). 줄이 없으면 장치가 안 걸린 것이다. `test_conftest_guards.py`가 줄의 존재를 박는다 |
| sleep 예산 "통과" | 예산 장치가 요청을 세고 있다는 증명: 시험이 일부러 3초를 요청하는 가짜 호출(실제로 자지 않게 안쪽 sleep을 바꿔 끼움)을 넣으면 실패가 나야 한다 |
| 1단계 `N passed` | 기존과 같다. N은 줄면 안 된다. 구현자는 전후 N을 PR 본문에 적는다(테스트를 지워 빨라진 게 아님을 증명) |

## 5. 테스트 (결론을 박는 곳)

새 `tests/test_conftest_guards.py` (관문에 남김):

- `run_adb("FAKE", "shell", "echo")`가 1초 안에 `FileNotFoundError`로 끝난다. 수집 PC에서도 같다.
- `subprocess.run(["C:\\x\\adb.exe", "devices"])`처럼 경로와 확장자가 붙어도 막힌다. `scrcpy`, `powershell`도 막힌다.
- `subprocess.run([sys.executable, "-c", "pass"])`와 `git --version`은 막히지 않는다.
- 차단 횟수 집계 함수가 순수 함수로 있고, 0일 때도 문구를 돌려준다.
- sleep 예산 판정 함수를 순수 함수(`over_budget(total, budget) -> bool`, 호출 위치 집계)로 빼서 시험한다. 그리고 `pytester`로 작은 테스트 파일을 돌려 (1) 예산 초과 테스트가 실패하고 문구에 호출 위치가 나오는지, (2) `real_wait` 표식이 붙으면 통과하는지, (3) 다른 스레드에서 부른 sleep도 세는지 확인한다. `pytester` 안 sleep은 실제로 자지 않게 바꿔 끼운다.
  - `pytester`가 이 저장소 conftest를 못 물려받으면 장치를 `tests/_guards.py` 같은 모듈로 빼고 conftest와 시험이 둘 다 import한다. 구현자가 고른다.

`tests/test_run_routine.py`에 추가:

- 1단계와 1b단계 명령에 `--durations=15`와 `--durations-min=1.0`이 있다. 1단계 마커 필터 `not ci_only and not non_gate`는 그대로다.

`tests/test_check_routine.py`에 추가:

- durations 줄 셋 이상이 있는 1단계 섹션 → PASS, 근거가 `N passed`로 시작하고 가장 긴 셋의 이름과 초를 담는다.
- 머리줄은 있고 줄이 0개 → PASS, 근거에 `1초 넘는 테스트 없음`.
- 머리줄이 없음 → PASS, 근거에 `소요 측정 없음`.
- 기존 FAIL 경로(`FAILED`, `[abort]`, `passed` 없음)는 그대로.

`tests.yml`의 옵션은 기존 CI 연결 시험(문자열 포함)이 있으면 거기에 붙이고, 없으면 새로 박지 않는다(결과를 바꾸지 않는 관측 옵션이다).

## 6. 원장 append-only

`data/log.jsonl`을 건드리지 않는다. 테스트 장치와 로그 문구만 바꾼다. #122의 세션 끝 `data/` 불변 검사는 그대로 돈다.

## 7. 구현 순서와 범위

한 PR로 리뷰 가능한 크기다.

1. CI에서 지금 상태의 `python -m pytest -q --durations=25`를 돌려 상위 25와 전체 초를 PR 본문에 적는다(기준선).
2. §3-2 외부 실행 차단과 시험. 깨지는 테스트를 가짜로 바꾼다.
3. §3-3 sleep 예산과 시험. 넘는 테스트를 고치고, 시간을 시험하는 것만 `real_wait`.
4. §3-1 `run_routine.py`, `check_routine.py`, `tests.yml` 옵션과 시험.
5. §3-4 규칙으로 옮길 후보를 표로 정리. 옮기면 이유를 적는다.
6. 다시 `--durations=25`. 전후 상위, 전체 초, `N passed`를 PR 본문에 적는다.
7. `ROUTINE-SPEC.md` 단계 1 표(명령, N 기준값), `HANDOFF.md` 한 줄(§3-5).

수집 코드를 바꾸지 않으므로 폰 시험과 예약 끄기는 필요 없다. 다만 `run_routine.py`, `check_routine.py`는 예약이 부르는 코드다. 병합 뒤 수집 PC가 pull하고, 다음 예약 전에 `python scripts/run_routine.py`로 1단계만 골라 돌려 로그에 durations가 찍히는지 본다(`--skip`으로 나머지를 뺀다. `AGENTS.md`, 사용자 2026-10-15). 이 시험은 구현자가 클라우드에서 못 하므로 인계 댓글에 할 일로 남긴다.

## 8. 열린 질문

1. **sleep 예산 2초가 맞는가.** 측정 전 값이다. 구현자가 바꾸면 근거를 적는다.
2. **(b)가 확인되면 1단계 시작 때 다른 pytest를 감지해 알릴 것인가.** 이번엔 안 넣고 후속 이슈로 둔다.
3. **`powershell` 차단이 맞는가.** 지금 테스트에서 실제 PowerShell을 띄워야 하는 경우가 있으면(예: `collect_trial.ps1` 시험) 구현자가 알려 준다. 코드에서는 `scrcpy_wake`가 `PYTEST_CURRENT_TEST`로 이미 피한다. 같은 일을 테스트 장치 한 곳에서 한다.

## 변경 이력

- 2026-11-03: 최초 작성
- 2026-11-04: 구현. 장치를 `tests/_guards.py`로 빼고 conftest가 import한다(§5 pytester 대비). `shutil.which`는 `scrcpy` 같은 차단 대상에 `None`을 돌려준다(§3-2, `scripts/clipboard_bridge.py:88`이 있었다). sleep 예산 2초 유지. 권한자 댓글(11-03): 1단계 PASS/FAIL 판정 값은 안 바꿈. 열린 질문 3: `powershell` 차단으로 깨진 테스트 없음.
- 2026-11-04: 구현 중 발견. pytester 시험이 `_guards._real_sleep`을 바꾼 채 두면 뒤 테스트의 sleep이 전부 안 잔다. 시험 파일이 되돌린다. 스레드의 sleep은 그 스레드를 만든 테스트에 센다(끝난 테스트의 스레드가 뒤 테스트 예산을 먹지 않게). 설계 범위 안.
