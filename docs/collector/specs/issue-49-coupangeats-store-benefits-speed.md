<!-- 원본: tracker docs/specs/issue-49-coupangeats-store-benefits-speed.md — 여기서 고치지 않는다 -->
# 이슈 #49: 쿠팡이츠 3단계 속도 개선(매장 혜택 읽기)

영역: **collect** (폰이 필요하다. 구현 뒤 실제 수집 시험 필수)

## 1. 배경과 목표

3단계(`scripts/coupangeats_weekly.py`)가 낮 수집에서 약 37분 걸린다(2026-10-23 08:58 시작, 매장 혜택 읽기 09:19 시작). 이슈가 지목한 비용은 둘이다.

- 허브 카드 39장 클릭: 약 16분 (`capture/coupangeats_hub.py` `_open_visible_cards`)
- 쿠폰함에 없는 15곳의 매장 혜택 읽기: 곳당 약 1분 (`capture/coupangeats_store_benefits.py` `probe`)

이 설계는 **매장 혜택 읽기**(`probe`)만 다룬다. 허브 카드 클릭은 범위 밖이다(§8).

"37분 → 20분대"는 **측정 전 추정**이다. 이 문서의 어떤 숫자도 §3 측정으로 바뀔 수 있다.

## 2. 요구사항 비판

이슈의 제안 셋을 그대로 받지 않는다.

| 제안 | 판단 |
|---|---|
| 1. 연속 `no_store`는 낮에 건너뜀 | 채택. 단 건너뜀이 5b에서 "기록 없음 = 실패"로 읽히는 구멍이 있어 §4에서 막는다 |
| 2. 뒤로가기로 허브 복귀 | 채택. 단 복귀를 양성 신호로 확인하고 실패하면 강제종료로 되돌린다(§5) |
| 3. 허브를 한 번 내리며 차례로 읽기 | **이번에 안 한다.** 구조 변경이라 한 PR에서 리뷰 가능한 범위를 넘고, 1·2를 재측정한 뒤 남는 시간으로 정당화한다(§8) |

그리고 제안 2가 맞는다면 제안 3의 이득은 줄어든다. 허브에 뒤로가기로 돌아오면 스크롤 위치가 남아 있어("스크롤 위치는 왕복해도 그대로", `_open_visible_cards` 독스트링) 처음부터 다시 내리는 비용이 사라진다. 3은 2의 결과를 보고 정한다.

## 3. 측정 먼저 (구현 전과 후 같은 방법)

구간별 실측 표를 만들어 PR 본문 "확인"에 붙인다. "개선 전"은 구현 전에 만들고, "개선 후"는 §7 시험 로그로 만든다.

- 입력: `logs/steps/<날짜>/3.log`와 원장 시각, `captures/coupangeats_storestatus_<날짜>.json`.
- 구간: (a) 3단계 시작~허브 카드 클릭 끝, (b) 매장 혜택 읽기 전체, (c) 매장 혜택 곳별(브랜드, 결과 상태, 소요), (d) 고정 대기 합(`time.sleep` 합).
- 곳별 소요를 재려면 `probe`가 브랜드마다 `  쿠팡이츠 <브랜드>: ... (<초>초)`를 한 줄에 남겨야 한다. 지금 로그엔 시각이 없어 곳별 구간을 못 잰다(구현 항목).
- 표는 `docs/setup/ROUTINE-TIMING.md`에 날짜와 함께 한 줄 추가한다(이 파일이 이미 단계 소요를 다룬다).
- 비교 기준: 같은 폰, 같은 시간대(낮), 같은 쿠폰함 상태. 하루치만으로 "20분대"를 단정하지 않고 시험 1회와 이어지는 낮 수집 2회를 본다.

## 4. 제안 1: 연속 `no_store`는 낮에 건너뜀

### 규칙

- 건너뛰는 조건: **직전 `N=2`개 날짜 파일**(`captures/coupangeats_storestatus_<날짜>.json`, 달력에서 가장 최근 2개 날짜)에서 그 브랜드의 상태가 둘 다 `no_store`.
- `N`은 상수 `SKIP_AFTER_NO_STORE = 2`. 근거: 1회는 일시적 화면 오류(`no_store`는 "카드를 눌러도 매장 화면으로 안 감"으로 판정되어 웹뷰 지연에도 나올 수 있다)와 구분이 안 되고, 2회 연속이면 이틀 내내 같은 결과다.
- **00:01 실행(시각 < 03시)은 늘 전부 읽는다.** 판정은 `run_audit`(`scripts/run_routine.py:221`)와 같은 시각 규칙이되 월요일 조건은 뺀다. 월요일 낮에도 3단계는 건너뛴다. `coupangeats_weekly.py`에 `--read-all`(기본: 시각 < 03시) 인자를 둔다. 손 실행은 `--read-all`로 전부 읽는다.
- 이 규칙은 `no_store`에만 적용한다. `no_sheet`, `no_coupon`, `lost_hub`, `ok`는 건너뛰지 않는다.

### 조용히 잃지 않는 장치 (5b와의 맞물림)

건너뛴 브랜드는 오늘 상태 파일에 기록이 없다. `store_cross_check`는 기록 없는 브랜드를 실패로 본다(`scripts/build_ce_couponbox_records.py:269`). 그러면 낮마다 `[suspect]`가 뜬다. 그래서:

- 새 상태 `skipped`를 추가한다. `capture/coupangeats_store_benefits.py`의 `ABSENT`에 포함해 5b에서 미관측으로 분류한다(실패 아님). `skipped`는 "이전 이틀 `no_store`였고 오늘 낮엔 안 봤다"는 뜻이며, `no_store`와 다르게 **관측이 아니다**.
- 같은 날 00:01이 이미 `no_store`로 읽었다면 `skipped`로 덮지 않는다. `merge_status`가 이미 있는 관측(`ok`뿐 아니라 `ABSENT` 상태)을 `skipped`가 덮지 못하게 고친다.
- **연속 횟수는 관측된 `no_store`만 센다.** `skipped`와 기록 없음은 연속을 끊는다. 따라서 00:01이 실패한 날 다음 낮에는 자동으로 전부 읽는다(안전한 방향으로 깨진다).
- 로그에 건너뛴 브랜드 수와 이름을 남긴다: `쿠팡이츠 매장 혜택: N곳 건너뜀(이틀 연속 매장 없음, 00:01에 다시 읽는다): 이름, ...`. 0곳이어도 `0곳 건너뜀`을 찍어 "건너뜀 로직이 돌았다"가 보이게 한다.
- 5b 출력(`매장 혜택 교차검증`)에 `건너뜀 N곳`을 따로 센다. `미관측`과 섞지 않는다.

### 하루 늦게 잡히는 위험

매장이 새로 생기면 다음 00:01에 잡힌다(이슈 "주의"). 허용한다. 완화: 낮 수집에서 **허브에 그 브랜드의 쿠폰이 쿠폰함에도 들어왔는지**는 5b가 이미 대조하므로(쿠폰이 있으면 `confirmed`), 쿠폰함으로 들어오는 브랜드는 건너뜀 후보에서 제외한다(`missing` 목록이 이미 그렇다).

## 5. 제안 2: 뒤로가기로 허브 복귀

현재 `probe`는 브랜드마다 `_reenter_hub`(`open_promotion(force_stop=True)`, 스플래시 25~30초)로 연다.

### 변경

- 첫 브랜드만 `_reenter_hub`로 연다(허브 위치를 확정).
- 브랜드를 읽은 뒤 `read_store_benefits`가 이미 뒤로 두세 번 누른다. 그 직후 **허브에 닿았는지 양성 신호**로 확인한다: `h.on_hub(nodes)`와 `HUB_MARKER in xml`(`_reenter_hub`의 `ready`와 같은 기준).
  - 닿았으면 다음 브랜드는 재진입 없이 현재 화면에서 카드를 찾는다.
  - 못 닿았으면 뒤로 한 번 더, 그래도 못 닿으면 **지금처럼 `_reenter_hub`(강제종료)로 되돌린다**. 되돌렸다는 사실은 로그에 남긴다(`허브 복귀: 뒤로가기 / 재진입`).
- 허브가 지난 스크롤 자리를 기억해 바닥에서 열린다는 기존 대응(방향 전환, `stuck` 두 번)은 그대로 둔다.
- `read_store_benefits`의 `back` 횟수는 경로마다 다르다(`no_store` 1, `no_sheet` 2, 정상 3). 횟수를 믿지 않고 위 확인이 판정한다.

### 양성 신호

"복귀 성공"은 `on_hub`가 참일 때만이다. 화면이 아무것도 안 그려진 빈 트리나 매장 화면에서 카드를 못 찾으면 `LOST_HUB`가 되므로, 그 전에 재진입 경로를 한 번 타서 `LOST_HUB`가 늘지 않게 한다(이전 동작 이상이어야 한다).

## 6. 폭발 반경 (`mono/docs/CHANGE-PROPAGATION.md`)

`CHANGE-PROPAGATION.md`에서 `store_benefits`, `storestatus`, `coupangeats_storecoupons`로 찾은 묶음은 **없다**. 쿠팡이츠 줄(126행)은 `banner_routine.ce_min_order()`의 출처 목록이고, 이 변경은 그 입력(쿠폰함 원장)을 바꾸지 않는다. 표에 없으므로, 코드로 따라간 실제 소비자를 대신 적는다.

| 자리 | 영향 | 이번에 |
|---|---|---|
| `scripts/build_ce_couponbox_records.py` `store_cross_check` | `skipped` 상태를 모르면 실패로 셈 | 넣는다 (`ABSENT` 공유, 출력에 건너뜀 집계) |
| `capture/coupangeats_store_benefits.py` `merge_status`, `ABSENT` | `skipped`가 관측을 덮으면 안 됨 | 넣는다 |
| `scripts/coupangeats_weekly.py` 호출부(616~642행) | 인자 `--read-all`, 건너뛸 목록 계산 | 넣는다 |
| `coupangeats_storestatus_*.json`을 읽는 다른 곳 | `scripts/`에서 이 파일 이름이 나오는 곳은 `coupangeats_weekly.py`(쓰기)와 `build_ce_couponbox_records.py`(읽기)뿐이다(설계 때 검색) | 구현 첫 단계에서 `rg storestatus`를 다시 돌려 늘었으면 같이 고친다 |
| `docs/setup/ROUTINE-SPEC.md` 3단계, `ROUTINE-TIMING.md`, `COLLECTION-INCIDENTS.md` | 낮 수집이 일부 건너뛴다는 사실, 새 로그 줄 | 넣는다 (사실만 한 줄) |
| mono (`web`, `api`) | 원장·export 꼴 불변 | 안 넣는다. 원장 레코드 필드를 건드리지 않는다 |
| 허브 카드 클릭(`_open_visible_cards`) | 별개 구간 | 안 넣는다(§8) |

## 7. 테스트와 끝 조건

결론은 테스트로 박는다(`tests/test_coupangeats_store_benefits.py` 확장, 필요하면 `tests/test_build_ce_couponbox_records*.py`).

1. `skip_candidates(history, today_all)`: 직전 두 날짜가 `no_store`이면 건너뜀. 하나만 `no_store`거나 `skipped`/기록 없음이 끼면 건너뛰지 않음. `no_sheet`/`ok`는 건너뛰지 않음.
2. `read_all`이면(00:01) 후보가 비어 전부 읽음.
3. `merge_status`: `ok`, `no_store`는 `skipped`로 덮이지 않음. `skipped`는 이후 `no_store`/`ok`로 덮임.
4. `store_cross_check`: `skipped` 브랜드가 실패 목록에 없고 건너뜀으로 집계됨. 기록 없는 브랜드는 여전히 실패.
5. 건너뛴 수 로그 줄이 0곳일 때도 나옴(출력 캡처).
6. 복귀 확인: 가짜 드라이버로 (a) 뒤로가기로 허브에 닿으면 `_reenter_hub`를 안 부르고, (b) 못 닿으면 부르고, (c) 둘 다 실패하면 `LOST_HUB`와 `[suspect]`가 나옴.
7. 기존 `test_cross_check_*` 통과 유지.

실제 시험(수집 구현자, 폰 사용):

- `scripts/collect_trial.ps1 -Command "python scripts/coupangeats_weekly.py --write"`로 3단계를 실제 수집한다. 예약 시각(`ROUTINE-SPEC.md`)을 피한다. 도는 예약을 끊지 않는다.
- 시험은 두 번: 건너뜀 켜진 낮 모드와 `--read-all`.
- 같은 날 5b(`build_ce_couponbox_records.py`)를 돌려 `매장 혜택 교차검증` 줄이 **개선 전과 같은 확인/미관측/실패 수**(건너뜀만 미관측에서 빠져 별도 집계)인지, 쿠폰 레코드 목록이 같은지 비교한다. 숫자만 보지 않고 브랜드 이름 목록을 비교한다.
- §3 표를 개선 전과 후로 만들어 PR에 붙인다. 목표 20분대는 추정이므로 못 미쳐도 실측을 적는다.

## 8. 하지 않는 것, 후속

- **제안 3(허브 한 번 내리며 차례로 읽기)**: 이번에 안 한다. 1·2 적용 후 `probe` 구간이 여전히 크면 후속 이슈로 낸다. 끝 조건: §3 표에서 `probe`가 3단계의 30% 이상이면 설계한다.
- **허브 카드 39장 클릭(약 16분)**: 이슈의 원인에 `probe`만 있고 이 구간의 원인 분석은 없다. 같은 허브 왕복이라 별도 설계가 필요하다. 후속 이슈로 낸다. 끝 조건: `_open_visible_cards` 곳별 소요 측정.
- 원장(`data/log.jsonl`)은 건드리지 않는다. 상태 파일은 `captures/`(gitignore)의 하루 파일이라 append-only 문제가 없다. 건너뜀은 원장 레코드를 만들지 않으며, 브랜드의 쿠폰이 원장에서 사라지게 하지 않는다(5b가 `no_store`에도 오퍼를 안 만드는 현 동작과 같다).

## 9. 리뷰 포인트

- **`N=2`가 맞는가.** 근거는 추정이다. 지난 상태 파일들로 `no_store`가 하루 만에 `ok`로 바뀐 사례를 세어 구현 전에 확인한다.
- **00:01이 아닌 낮에 새 매장이 열리는 브랜드를 하루 늦게 잡아도 되는가.** 이슈 본문이 허용한 것으로 읽었다.

## 변경 이력

- 2026-10-23 (구현): 권한자 댓글 2번에 따라 `N=2`를 지난 상태 파일로 확인했다. `captures/coupangeats_storestatus_*.json`이 2026-10-22, 10-23 이틀치뿐이라 "이틀 연속 `no_store` 뒤 다음 날 매장"을 셀 셋째 날이 없다. 반례 없음(관측 부족). 두 날 모두 `no_store`인 곳은 7번가피자, 디디치킨, 땅땅치킨, 잠바주스, 치킨인류, 치킨플러스, 포케올데이 7곳으로 같았다. `N=2` 그대로 간다.
- 2026-10-23 (구현): §4 "직전 2개 날짜 파일"을 **어제와 오늘 파일**로 구현했다. "가장 최근 2개 날짜"로 두면 오늘 00:01이 실패해 오늘 파일이 없을 때 그제·어제로 건너뛰어, 같은 절의 "00:01이 실패한 날 다음 낮에는 자동으로 전부 읽는다"와 어긋난다.
- 2026-10-23 (구현): 권한자 댓글 1번에 따라 후속 조치는 "허브 카드 클릭 구간 측정"만 남긴다.
- 2026-10-23 (PR #51 리뷰 반영, 권한자 댓글 04:15): 00:01 전부 읽기는 **실행 시작 시각 기준**으로 정했다. 3단계가 앞 단계를 기다리다 03시를 넘겨 시작해도 00:01 실행이면 전부 읽어야 다음 날 건너뜀 판단이 오늘 관측에 기댄다. `run_routine.midnight_read_all`이 실행 시작이 03시 전이면 3단계 명령에 `--read-all`을 붙이고, `coupangeats_weekly`는 `read_all_mode(--read-all, 지금)`으로 판정한다(손 실행 03시 전도 전부 읽음). 월요일 낮 전수조사 실행은 낮 실행으로 본다.
- 2026-10-23 (PR #51 리뷰 반영): 건너뜀 판정, 로그, 상태 파일 쓰기를 `capture/coupangeats_store_benefits.run_store_benefits`로 뺐다. 건너뜀 줄은 쿠폰함에 없는 브랜드가 0곳이어도 찍는다. 5b 건너뜀 집계는 `build_ce_couponbox_records.split_skipped`.
- 2026-10-23 (PR #51 리뷰 반영): `rg storestatus`(mono 제외) 소비자는 `scripts/coupangeats_weekly.py`(이제 `capture/coupangeats_store_benefits.py`가 쓰기), `scripts/build_ce_couponbox_records.py`(읽기)뿐이다. 문서는 이 설계와 `ROUTINE-SPEC.md`. 늘어난 소비자 없음.
