<!-- 원본: tracker docs/specs/issue-171-store-benefits-own-step.md — 여기서 고치지 않는다 -->
# 이슈 #171: 매장 혜택 읽기를 3단계에서 떼어 3b 단계로

영역: **collect**. 폰이 필요하다. 구현 뒤 실제 수집으로 시험한다(`scripts/collect_trial.ps1`).

## 1. 배경

11-05 00:01 회차 3단계(`scripts/coupangeats_weekly.py --write`)가 90분 상한(`scripts/run_routine.py` `STEP_TIMEOUT_LONG["3"]`)에 끊겼다. 끊긴 3단계 뒤로 3s, 3w, 5a, 5b, 6, 7이 선행 실패로 건너뛰어졌고, 8단계는 쿠팡이츠 허브와 쿠폰함을 반영하지 못했다(이슈 본문, `logs/steps/2026-11-05/3.log` 112~164줄).

코드로 확인한 원인은 셋이다.

- **3단계 하나에 일이 둘이다.** 허브 읽기(앞 27분)와 매장 혜택 읽기(`main` 802~807행, `run_store_benefits` → `probe`)가 한 프로세스, 한 상한 안에 있다. 00:01은 `--read-all`이라 쿠폰함에 없는 브랜드를 전부 읽는다(`read_all_mode`). 이번엔 30곳이었다.
- **허브 값을 맨 끝에 쓴다.** `coupangeats-weekly-<날짜>.json`은 매장 혜택 읽기 뒤 826~877행에서 쓴다. `coupangeats-firstcome-<날짜>.json`도 같다. 프로세스가 끊기면 이미 읽은 허브 값이 하나도 안 남는다.
- **매장 혜택 결과도 맨 끝에 쓴다.** `run_store_benefits`는 `read(...)`가 다 끝난 뒤에야 상태 파일(`coupangeats_storestatus_<날짜>.json`)과 쿠폰 파일(`coupangeats_storecoupons_<날짜>.json`)을 쓴다. 25곳을 읽고 끊겨도 0곳이 남는다.

11-04 00:01 3단계도 74분이었다(`data/devices.json` `_split_20261104`). 상한 턱밑에서 돌다 넘은 것이다.

## 2. 요구사항 비판

| 이슈의 방향 | 판단 |
|---|---|
| 1. 허브 값을 매장 혜택 전에 먼저 쓴다 | 채택하되 **형태를 바꾼다.** 같은 프로세스 안에서 쓰는 순서만 바꾸면 3단계가 여전히 상한에 끊겨 `fail`이 되고, 3s, 5a, 5b, 6, 7이 계속 건너뛰어진다(`Runner.worker`가 선행 `fail`을 `skip`으로 만든다). 8단계도 3단계 판정이 `PASS`일 때만 허브 파일을 싣는다(`reflect_daily.py` 225행). 파일이 남아도 반영되지 않는다. 그래서 매장 혜택을 **다른 단계(3b)**로 떼어 3단계가 허브만 읽고 끝나게 한다. 쓰는 순서 문제는 그것으로 같이 풀린다 |
| 2. 매장 혜택을 떼어 와우 계정 폰끼리 나눠 읽는다 | **떼는 것만 이번에 한다. 두 폰 나눠 읽기는 후속으로 미룬다.** 이유는 §2.1 |
| 3. 한 곳에 5~8분 걸리는 매장의 원인을 #97, #98과 본다 | 이번에 안 한다. 3b를 떼면 그 시간이 3단계 상한을 먹지 않는다. 곳별 소요 로그는 이미 있다(`probe`의 `(<초>초, 허브 복귀: …)`). 원인 분석은 후속(§9) |

### 2.1 두 폰 나눠 읽기를 미루는 이유

- **완료 조건에 필요 없다.** 완료 조건은 "3단계가 상한 안에 끝나고, 매장 혜택이 끊겨도 허브 값이 8단계에 반영된다"이다. 3b로 떼면 3단계는 허브만 읽어 27분(월요일 49분)이고, 3b가 끊겨도 3단계는 `PASS`라 8단계가 허브 값을 싣는다.
- **같은 계정 동시 사용이 확인되지 않았다.** 노트20과 V50은 둘 다 `주계정(쿠팡이츠 와우)`이다(`data/devices.json`). 매장 혜택 시트("총 N원 쿠폰 추가 적용 가능")는 계정에 따라 다를 수 있으니, 같은 계정이라는 점은 오히려 필요한 조건이다. 그런데 `run_routine.py` 머리 주석은 "같은 계정 동시 로그인은 배민·쿠팡이츠가 세션을 끊는다"고 한다. 설계 [2026-11-02 배민 4a 다기기](2026-11-02-baemin-4a-multi-device-design.md) §1은 이 주석과 #66("폰 3대 병렬에서 문제 없었다")이 어긋난다고 적었고, 아직 정리되지 않았다. 확인 없이 두 폰에 같은 일을 맡기면 세션이 끊겨 두 폰 다 `lost_hub`로 끝날 수 있다.
- **나눠 읽으면 상태 파일 쓰는 곳이 둘이 된다.** 두 프로세스가 같은 상태 파일을 읽고 고치고 쓰면 경합이 생긴다. 잠금이나 일감 나누기 설계가 따로 필요하다. 한 PR에서 리뷰할 범위를 넘는다.
- **3b를 떼고 매 곳 쓰도록 해 두면 나중에 붙이기 쉽다.** 후속 작업은 3b를 두 번(두 폰) 띄우고 브랜드를 나눠 받게 하는 일만 남는다(§9).

## 3. 설계

### 3.1 단계 나누기

| 단계 | 명령 | 폰 | 하는 일 | 남기는 파일 |
|---|---|---|---|---|
| 3 | `coupangeats_weekly.py --write` | 쿠팡이츠 배정(V50) | 허브 읽기, 받기, 쿠폰함 확인. **매장 혜택은 안 읽는다** | `coupangeats-weekly-<날짜>.json`, `coupangeats-firstcome-<날짜>.json`, 하루 행사 파일, **새 `coupangeats_storeplan_<날짜>.json`** |
| 3b(새) | `coupangeats_weekly.py --store-benefits --write` (00:01이면 `--read-all`) | 쿠팡이츠 배정(V50) | 계획 파일의 브랜드를 매장 혜택에서 읽는다 | `coupangeats_storestatus_<날짜>.json`, `coupangeats_storecoupons_<날짜>.json` (브랜드마다 갱신) |

- 새 스크립트를 만들지 않고 `coupangeats_weekly.py`에 `--store-benefits` 갈래를 둔다. `--events-only`, `--nonwow`와 같은 꼴이다. 허브 주소(`find_hub_key`)와 드라이버 준비를 같이 쓴다. 새 파일이 없어 CHANGE-PROPAGATION §9(새 파일)도 건드리지 않는다.
- `--store-benefits`는 허브를 다시 읽지 않는다. 계획 파일만 읽고 `run_store_benefits(...)`를 부른다. 지금 `probe`가 첫 브랜드에서 `_reenter_hub`로 허브를 여는 동작은 그대로다.

### 3.2 계획 파일 (3단계가 3b에 넘기는 것)

3단계는 지금 `missing`(쿠폰함에 없는 고정 쿠폰 브랜드)을 계산하는 자리(804~805행)에서 계산만 하고 파일로 남긴다.

```json
{"date": "2026-11-05", "changed": true, "brands": ["CU", "GS25", "..."], "written_at": "2026-11-05T00:28:10+09:00"}
```

- `got["changed"]`가 거짓이면(구성 동일, 지금은 매장 혜택을 안 읽는다) `{"changed": false, "brands": []}`를 쓴다. "읽을 것 없음"과 "3단계가 계획을 안 남김"을 가르기 위해서다.
- 계획 파일은 허브 파일과 같은 자리에서, `--write`일 때만 쓴다. 급감 판정(`suspect`)으로 허브 파일을 안 쓰는 실행은 계획도 안 쓴다. 3b는 계획이 없으면 실패한다(§4).
- 같은 날 두 번째 실행(10:55, 15:55)은 계획을 덮어쓴다. 그 실행의 3b가 그 계획을 읽는다. 상태 파일 병합 규칙(`merge_status`)은 그대로라 앞 실행의 `ok`가 지워지지 않는다.

### 3.3 3b가 브랜드마다 쓴다

`run_store_benefits`가 `read(missing, status)`로 끝에 한 번 쓰던 것을, **브랜드 하나를 읽을 때마다** 상태와 쿠폰을 쓰도록 바꾼다.

- `probe`에 `on_brand(brand, got)` 콜백을 더한다. 브랜드 하나가 끝나면(결과 상태가 `status`에 들어간 뒤) 부른다. `run_store_benefits`가 그 콜백에서 지금과 같은 병합(`merge_status`, storecoupons의 브랜드 단위 교체)으로 두 파일을 쓴다.
- 쓰기는 **임시 파일에 쓰고 `os.replace`로 바꾼다.** 쓰는 도중에 프로세스가 끊기면 반쯤 쓴 JSON이 남는다. 그러면 `_status`가 `ValueError`로 `{}`를 돌려 앞 실행의 관측까지 조용히 사라진다. `add_hubseen`(583행)이 이미 쓰는 방식이다.
- 건너뜀(`skipped`) 브랜드는 읽기 전에 한 번 쓴다. 지금 동작(건너뛴 것만 있어도 상태 파일을 쓴다)과 같다.
- 끊기면 그 순간 읽던 한 곳만 기록이 없다. 그 한 곳은 §4의 "못 읽음"으로 드러난다.

### 3.4 조율기 (`scripts/run_routine.py`)

- `task_table`에 `Task("3b", "3b) coupangeats_weekly --store-benefits", [..., "--store-benefits", "--write"], "coupangeats", ["3", "5a"])`를 더한다. 표에서 5a 바로 뒤에 둔다. V50 줄 순서가 3 → 3s → 5a → 3b가 되어 쿠폰함(5a)이 매장 혜택 때문에 늦어지지 않는다.
  - 선행에 5a를 넣는 이유는 순서다. 같은 폰 줄이라 표 순서로도 맞지만, 넘겨받기(takeover)로 다른 폰에 갔을 때도 5a와 3b가 같은 앱을 동시에 열지 않게 한다.
  - `SOFT_AFTER`에 `("3b", "5a")`를 더한다. 5a가 실패해도 매장 혜택은 읽는다. 5a 결과를 쓰지 않는다.
- `STEP_TIMEOUT_LONG`에 `"3b": 90 * 60`을 더한다. 3단계 상한 90분은 허브 읽기만 남으므로 그대로 둔다(월요일 49분). 줄이는 것은 실측을 본 뒤로 미룬다(§8).
- `midnight_read_all`이 `--read-all`을 3이 아니라 **3b**에 붙인다. 3단계의 `--read-all` 인자는 `--store-benefits`와 함께일 때만 뜻이 있다. `--store-benefits` 없이 `--read-all`을 주면 "3단계는 매장 혜택을 안 읽는다, 3b로 돌려라"를 찍고 rc 2로 끝낸다. 손 실행이 전부 읽었다고 착각하지 않게 하기 위해서다.
- 5b의 선행을 `["3", "5a", "3b"]`로 바꾸고 `SOFT_AFTER`에 `("5b", "3b")`를 더한다. 3b가 끊겨도 5b는 돌고, 3b가 쓴 만큼으로 교차검증한다.
- 8단계 선행은 그대로다. 5b를 기다리므로 3b도 기다린다.
- `STEP_TITLES`에 `"3b": ("쿠팡이츠 매장 혜택", "쿠폰함에 없는 브랜드를 매장 혜택 시트에서 읽는다 (00:01은 전부)")`를 더한다.
- `takeover`: `data/devices.json`의 노트20, A8 `takeover`에 `3`이 있는 폰에는 `3b`도 더한다. 3을 넘겨받은 폰이 3b를 못 넘겨받으면 3b만 "기기 없음"으로 실패한다. 와우 계정이 아닌 A8(`쿠팡 기본값`)이 3을 넘겨받는 것은 지금도 같은 문제라 이번에 바꾸지 않는다.

### 3.5 판정기 (`scripts/check_routine.py`)

- `STEPS`에 `"3b"`를 3 뒤에 더한다.
- 3b 판정:
  - `PASS`: `매장 혜택 계획 N곳` 줄이 있고 `매장 혜택 읽음 X/N곳`에서 X = N(건너뜀은 읽음으로 센다).
  - `SUSPECT`: X < N(못 읽은 곳 이름을 근거로), `[suspect]` 줄, 또는 `[timeout]`.
  - `FAIL`: 계획 파일 없음, `Traceback`.
  - 계획이 `changed: false`면 `PASS`("구성 동일, 읽을 것 없음").
- 3단계 판정은 그대로다. 매장 혜택 로그 줄이 3단계 구획에서 빠지는 것만 확인한다(3단계 판정이 그 줄을 읽지 않는지 구현 때 확인).

## 4. 양성 신호: "없다 / 0 / 통과"를 내는 자리

| 자리 | 지금 | 이번에 |
|---|---|---|
| 3b가 "읽을 것 없음"으로 끝남 | 계획이라는 것이 없다. 3이 매장 혜택을 안 부르면 아무 줄도 안 남는다 | 계획 파일의 `changed`와 `brands`로 가른다. 로그 `매장 혜택 계획 N곳(구성 동일이면 '구성 동일 - 읽지 않음')`. 계획 파일이 없으면 rc 1과 `계획 파일이 없다: <경로>`. 조용히 0곳으로 끝나지 않는다 |
| 3b가 끊겨 일부만 읽음 | 0곳이 남아 5b는 상태 파일이 없어 교차검증을 아예 안 한다(361행 `if status_path.exists()`). "검증 안 함"이 출력에 안 보인다 | 브랜드마다 써서 읽은 만큼 남는다. 5b가 계획과 상태를 맞대 **계획에 있는데 상태가 없는 브랜드**를 `unread`(못 읽음)로 센다 |
| 5b `매장 혜택 교차검증: … 실패 0곳` | 상태 파일에 적힌 브랜드만 돈다. 적히지 않은 브랜드는 셀 자리가 없다 | 계획 파일이 기준 목록이 된다. 출력에 `못 읽음 N곳`을 더하고 이름을 찍는다. 계획 파일이 없으면 `[suspect] 매장 혜택 계획 파일이 없다 - 교차검증 기준이 없다` |
| 3b 끝 줄 | 없다 | `매장 혜택 읽음 X/N곳(건너뜀 S곳 포함)`. 판정기가 X와 N을 맞댄다 |
| 상태 파일이 깨짐 | `_status`가 `{}`를 돌려 앞 관측이 사라진다 | 임시 파일과 `os.replace`로 반쯤 쓴 파일이 안 생긴다 |

### 4.1 5b와 8단계에서 "못 읽음"의 무게

- `unread`는 `failed`(허브 복귀 실패 등)와 섞지 않는다. 5b의 사유 파일(`coupangeats_couponbox_suspects_<날짜>.json`)에 `"unread": [브랜드...]` 칸을 따로 둔다. 5b 판정은 `SUSPECT`다.
- `reflect_daily.partial_ok`는 `failed`가 비고 `unread`만 있어도 열어야 한다. 못 읽은 브랜드는 정의상 쿠폰함에 없는 브랜드라(계획 = 쿠폰함에 없는 것) 그 브랜드의 쿠폰함 레코드는 원래 없다. 다른 브랜드 레코드를 막을 이유가 없다. 못 읽은 브랜드는 오늘 새 행이 없고 원장의 어제 값이 남는다. 보류 목록(`routine-<날짜>.md` `### 보류한 브랜드`)에 `<브랜드> (unread)`로 남긴다.
- `failed`가 있으면 지금 규칙(`PARTIAL_OK_STATUSES`, 3곳, 20%) 그대로다. `unread`는 그 셈에 넣지 않는다.
- 이 바꿈은 [`docs/setup/CROSS-CHECK-VERDICTS.md`](../setup/CROSS-CHECK-VERDICTS.md)의 5b 줄과 `ROUTINE-SPEC.md` 5b "SUSPECT일 때 반영" 칸에 같이 적는다.

## 5. 폭발 반경 (`mono/docs/CHANGE-PROPAGATION.md`)

표에서 `store_benefits`, `storestatus`, `storecoupons`, `3단계`로 찾았다. 걸리는 묶음은 §8의 **쿠팡이츠 공유 링크 두 자리** 하나다("수집 3단계가 읽는 수집 PC의 mono 사본"). 이 변경은 3단계가 허브를 여는 방법을 바꾸지 않고, 3b는 3단계가 남긴 허브 키 캐시(`captures/.coupangeats-hub-key`)로 연다. 그 묶음의 나머지(`offerLink.js`, `offerChip.snapshot.json`)는 넣지 않는다. 월요일 링크 교체 절차도 그대로다. 단 월요일에 옛 링크로 3단계가 실패하면 3b도 선행 실패로 건너뛰는 것을 `ROUTINE-SPEC.md` 3b 절에 한 줄 적는다.

표에 없는 소비자는 코드로 따라갔다(`rg storestatus|storecoupons|coupangeats-weekly-`, mono 제외).

| 자리 | 영향 | 이번에 |
|---|---|---|
| `scripts/coupangeats_weekly.py` `main` | 매장 혜택 호출을 빼고 계획 파일을 쓴다. `--store-benefits` 갈래 | 넣는다 |
| `capture/coupangeats_store_benefits.py` `run_store_benefits`, `probe` | 브랜드마다 쓰기, 원자적 쓰기, 끝 줄 | 넣는다 |
| `scripts/run_routine.py` 작업표, `SOFT_AFTER`, `STEP_TIMEOUT_LONG`, `midnight_read_all`, `STEP_TITLES` | 3b 추가 | 넣는다 |
| `data/devices.json` `takeover` | 3을 넘겨받는 폰에 3b | 넣는다 |
| `scripts/check_routine.py` `STEPS`, 3b 판정 | 새 단계 판정 | 넣는다 |
| `scripts/build_ce_couponbox_records.py` `store_cross_check`, 사유 파일 | 계획 대비 `unread` | 넣는다 |
| `scripts/reflect_daily.py` `partial_ok` | `unread`만 있으면 연다 | 넣는다 |
| 콘솔 수집 탭(`capture/ops`, 단계 행) | `STEP_TITLES`와 `runbook_links`(ROUTINE-SPEC `### 단계 3b:` 제목)로 따라간다 | 구현 때 3b 행이 뜨는지 `--dry-run` 배정 표와 현황 파일로 본다. 콘솔 코드는 안 고친다(제목 표에서 읽는다) |
| `scripts/collect_all.py`(손 실행 묶음) | 3단계를 부르면 매장 혜택이 빠진다 | 구현 첫 단계에서 3단계를 부르는지 보고, 부르면 3b도 이어 부르게 넣는다 |
| `docs/setup/ROUTINE-SPEC.md` 단계 3 "매장 혜택 읽기" 칸, 새 `### 단계 3b:`, 단계 5b, `ROUTINE-TIMING.md`, `COLLECTION-INCIDENTS.md` | 위치가 바뀐 사실 | 넣는다(사실만) |
| mono `web`, `api` | 원장과 export 꼴 불변 | 안 넣는다 |

## 6. 원장 (`data/log.jsonl`)

직접 건드리지 않는다. 3b가 쓰는 파일은 `captures/`의 하루 파일이고, 원장은 지금처럼 8단계(`reflect_daily.py`)만 쓴다. `partial_ok`를 여는 경우가 늘지만 새 행을 더할 뿐 지우지 않는다. 못 읽은 브랜드는 새 행이 없을 뿐이고 원장의 앞선 행은 남는다. append-only는 그대로다.

## 7. 테스트 (결론을 박는 자리)

`tests/test_coupangeats_store_benefits.py`, `tests/test_run_routine.py`, `tests/test_check_routine.py`, `tests/test_reflect_ce_partial.py`를 늘린다.

1. **3단계가 매장 혜택을 안 부른다.** `coupangeats_weekly.main`을 가짜 드라이버와 가짜 `read_weekly_deals`로 돌려 `probe`가 불리지 않고, 계획 파일과 허브 파일이 같이 생기는지. 되돌림(3단계에 매장 혜택이 다시 붙는 것)을 막는 핵심 테스트다.
2. **계획 파일:** 구성 변경이면 `brands`가 쿠폰함에 없는 고정 쿠폰 브랜드와 같다. 구성 동일이면 `changed: false, brands: []`. `--write`가 없거나 급감 판정이면 계획 파일이 없다.
3. **브랜드마다 쓴다:** `run_store_benefits`에 셋째 브랜드에서 예외를 내는 가짜 `read`를 주면, 상태 파일에 앞 두 곳이 남고 storecoupons에 그 두 곳 쿠폰이 남는다.
4. **원자적 쓰기:** `os.replace` 직전에 예외를 내면 기존 상태 파일 내용이 그대로다.
5. **`merge_status` 유지:** 같은 날 앞 실행의 `ok`가 브랜드마다 쓰기에서도 안 덮인다(기존 테스트가 새 경로로도 도는지).
6. **3b 계획 없음:** 계획 파일이 없으면 rc 1과 `계획 파일이 없다`. `changed: false`면 rc 0과 `구성 동일` 줄.
7. **조율기:** 작업표에 3b가 있고 선행이 `["3", "5a"]`, 5b 선행에 3b, `SOFT_AFTER`에 `("3b", "5a")`, `("5b", "3b")`. `midnight_read_all`이 00:01에 `--read-all`을 3b에만 붙인다(기존 테스트 150행의 `== ["3"]`을 `== ["3b"]`로). `step_timeout("3b") == 90 * 60`.
8. **3b가 끊겨도 5b, 8이 돈다:** `Runner`에 3b `fail`을 주면 5b가 `skip`이 아니다. 3b `fail`이어도 3 `PASS`면 8단계 `sources`가 허브 파일을 싣는다.
9. **5b `unread`:** 계획 3곳, 상태 2곳이면 출력에 `못 읽음 1곳`과 그 이름, 사유 파일 `unread`에 그 브랜드. 계획 파일이 없으면 `[suspect]` 줄.
10. **`partial_ok`:** `failed` 비고 `unread`만 있으면 열리고 보류 목록에 `(unread)`. `failed`에 허용 밖 상태가 있으면 `unread`와 상관없이 닫힌다.
11. **판정기:** 3b 구획 `읽음 30/30`은 PASS, `25/30`은 SUSPECT(못 읽은 이름), 계획 없음은 FAIL, `구성 동일`은 PASS.
12. **takeover 짝:** `devices.json`에서 `takeover`에 `3`이 있는 폰은 `3b`도 있다(짝이 빠지면 빨개진다).

실제 시험(수집 구현자, 폰 사용, 예약 시각을 피한다):

- `scripts/collect_trial.ps1 -Command "python scripts/coupangeats_weekly.py --write"` 뒤 `-Command "python scripts/coupangeats_weekly.py --store-benefits --write --read-all"`. 3단계 로그에 매장 혜택 줄이 없고, 3b 로그에 `계획 N곳`과 `읽음 N/N곳`이 있는지 본다.
- 끊김 시험: 3b를 몇 곳 읽힌 뒤 손으로 끊는다. 상태 파일에 읽은 곳이 남는지, `python scripts/build_ce_couponbox_records.py`가 `못 읽음`에 나머지 이름을 찍는지 본다. 숫자가 아니라 브랜드 이름 목록으로 본다.
- 첫 00:01 회차 뒤 `python scripts/check_routine.py <날짜>`로 3과 3b 판정, 3단계 소요(27분 안팎인지), 8단계가 허브를 실었는지(`reports/routine-<날짜>.md`) 본다.

## 8. 하지 않는 것

- 3단계 상한 90분을 줄이지 않는다. 허브만 남은 3단계의 실측을 사흘 본 뒤 정한다.
- 매장 혜택 읽기 속도(한 곳 5~8분)는 손대지 않는다.
- 와우 계정이 아닌 폰(A8)이 3, 3b를 넘겨받는 문제는 이번 범위가 아니다(지금도 같다).

## 9. 후속

- **3b 두 폰 나눠 읽기**(이슈 방향 2): 먼저 노트20과 V50이 같은 계정으로 쿠팡이츠를 동시에 여는 시험을 한다(같은 시각 각자 매장 혜택 5곳씩, 3회). 세션이 안 끊기면 3b를 두 단계(V50, 노트20)로 띄우고 계획 파일의 브랜드를 잠금 파일로 한 곳씩 가져가게 한다. 느린 매장이 한쪽에 몰리지 않는다. 끝 조건: 00:01 3b가 45분 안에 끝남. 시험에서 세션이 끊기면 `run_routine.py` 머리 주석을 맞는 쪽으로 고치고 이 후속은 닫는다.
- **느린 매장 원인**(이슈 방향 3): 3b 로그의 곳별 소요로 300초 넘는 매장을 사흘 모아 #97, #98과 맞댄다.

## 10. 리뷰 포인트

- **3단계와 3b가 같은 폰(V50)에 줄 서면 00:01 8단계가 지금보다 늦게 돈다(3b 약 75분이 5a 뒤에 붙는다). 받아들일 만한가.** 대신 3단계가 끊겨 쿠팡이츠 전체가 빠지는 일은 없어진다.
- **5b가 `unread`만 있을 때 쿠폰함 레코드를 반영해도 되는가.** 근거는 "계획 = 쿠폰함에 없는 브랜드"라서다. 계획을 만든 뒤 사람이 쿠폰을 받는 등으로 쿠폰함이 바뀌는 경우는 따지지 않았다.
- **같은 날 두 번째 실행의 계획이 앞 실행의 계획을 덮는 것이 맞는가.** 앞 실행의 상태는 `merge_status`로 남으니 덮어도 관측은 잃지 않는다고 봤다.

## 변경 이력

- 2026-11-13 (구현, 이슈 댓글 2026-11-05 01:55, 02:06 반영. 설계와 부딪힌 부분은 댓글이 이긴다):
  - **3b는 15:55 회차에만 돈다**(댓글 01:55 "매장 혜택은 15:55 회차에만 부가 확인으로 둔다. 00:01, 08:30에서는 돌지 않는다"). 설계 §3.4의 `midnight_read_all`로 00:01에 3b에 `--read-all`을 붙이는 부분은 없앤다. `run_routine.store_benefits_round`가 대신한다: 12시 이후 회차면 3단계에 `--plan-store-benefits`를 붙이고, 아니면 3b에 `off_round`를 달아 건너뜀 머리줄만 남긴다(판정기 PASS). `--read-all`은 손 실행용으로 3b에만 남는다. 3단계에 주면 안내와 종료 2.
  - **계획 파일은 3b가 도는 회차에만 남긴다**(`--plan-store-benefits`). 00:01, 08:30에 계획을 남기면 5b가 3b가 안 돈 것을 `못 읽음`으로 셌을 것이다. 5b는 계획이 없으면 못 읽음을 세지 않는다. 계획이 있는데 상태 파일이 없으면 계획의 전부가 `unread`다.
  - **#175의 임시 끔(`STORE_BENEFITS_OFF`)을 지웠다.** 15:55 전용 별도 단계로 옮기면 지운다고 적혀 있었다. 끄는 동안 모든 브랜드를 `skipped`로 적던 동작도 같이 없어진다(00:01, 08:30은 상태 파일을 안 쓴다).
  - **조율기 풀(2026-11-06 기기 풀 설계) 반영.** 설계 쓴 뒤 `NEEDS`와 `step_order`가 생겼다. 3b는 `NEEDS`에 5a처럼 `same_device_as="3"`로 넣고 표 맨 끝에 둔다(같은 폰의 6, 7이 매장 혜택에 밀리지 않게). `data/devices.json`에 `step_order.3b`(노트20)와, `takeover`에 `3`이 있는 두 폰에 `3b`를 더한다.
  - **하지 않은 것(설계 밖, 인계 댓글에 적음):** 댓글 02:06의 "와우 폰끼리 분할"(설계 §2.1의 미룸 이유가 그대로다: 같은 계정 동시 사용 미확인, 상태 파일 경합. 폰 시험이 필요하다), "어제 있다가 오늘 없음을 만료와 사용으로 가르는 분기"(설계에 없는 새 기능), `collect_all.py` 손 실행 묶음에 3b 잇기(15:55 부가 확인으로 바뀌어 불필요).
