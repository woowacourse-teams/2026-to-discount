<!-- 원본: tracker docs/specs/issue-114-unread-sweep-takedown.md — 여기서 고치지 않는다 -->
# 이슈 #114 판독 실패 브랜드와 배짱할인 행의 옛 오퍼를 내린다

- 상태: 설계 초안
- 영역: `collect` (폰 없이 끝나는 `export` 부분이 먼저, `baejjang_daily.py` 한 줄이 폰 시험을 요구한다. §6)
- 이슈: [#114](https://github.com/nn98/delivery-discount-tracker/issues/114)
- 관련: [ADR-020](../decisions/ADR-020-sweep-is-recorded-not-inferred.md), `docs/setup/RULE-AUDIT-2026-10-08.md` 1번(unread 기준일)

## 1. 문제

종료일이 없는 오퍼는 "이번 전수에 안 보였다"로만 내려간다(`export_data.is_stale_sweep`). 기준일은 `data/sweeps.jsonl`의 앱별 최신 전수 날짜다. 두 곳에서 기준일이 실제 관측보다 과거에 머문다.

| 사례 | 지금 | 왜 남나 |
|---|---|---|
| 배민 피나치공 | 11-02 V50이 브랜드관 7,500원을 읽음. 11-03 A8은 "가게 없음" | `reflect_daily._unread_entry`가 `no_store`를 unread로 묶는다. `latest_sweep_dates`가 unread 브랜드의 기준일을 "마지막으로 읽힌 전수 날짜"(11-02)로 잡아 V50 행(11-02)은 `captured_at < cutoff`가 안 된다. 다음 전수도 가게 없음이면 영원히 남는다 |
| 배민 맥도날드 | 10-30 배짱할인 선착순 행(품절)이 export에 있다 | 4a 전수에서 매주 unread라 읽힌 날짜가 없다(`default=""`). 배짱할인 행은 2단계(`baejjang_daily.py`, 매일) 관측인데 판정은 4a sweeps(`baemin`)로 한다. 2단계가 며칠째 그 행을 안 봤어도 기준이 없다 |

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`의 9개 묶음에 `sweeps.jsonl`, `unread`, `is_stale_sweep`이 없다. 닿는 묶음은 없고, 이 변경은 mono(api, web)를 건드리지 않는다. 표에 없으므로 아래 코드 쪽 같은 칸 이름 사용처를 직접 쟀다.

| 자리 | 이번에 넣나 | 이유 |
|---|---|---|
| `export_data.latest_sweep_dates`, `is_stale_sweep` | 넣는다 | 판정 본체 |
| `scripts/reflect_daily.record_full_sweeps`, `_unread_entry` | 넣는다 | `unread`를 적는 쪽(원인 1) |
| `scripts/baejjang_daily.py` | 넣는다 | 2단계 관측을 적는 쪽(원인 2). 폰 필요 |
| `record_sweep.py` (`read_sweeps`, `ALLOWED_PLATFORMS`) | 넣는다 | `reflect_daily`가 `(platform, date)`로 중복을 거른다. 새 줄이 같은 키로 부딪힌다 |
| `weekly_check.py` | 안 넣는다. 확인만 | `latest_sweep_dates`를 그대로 부른다. 새 키가 늘어도 호출 모양은 같다. 테스트 `test_weekly_check.py`가 초록인지만 본다 |
| `scripts/full_audit.py` `_settled`, `_unread` | 안 넣는다 | 재시도와 보고서 문구용. 같은 `no_store`를 읽지만 판정은 sweeps 쪽과 별개다 |
| `docs/setup/ROUTINE-SPEC.md`, `CROSS-CHECK-VERDICTS.md` | 넣는다 | 새 sweep 줄 형식과 N일 규칙을 적는다(소실 가드 입력이 바뀐다) |
| 소실 가드(`--accept-loss`) | 확인한다 | 이 변경으로 export에서 행이 빠지는 것은 가드에 걸린다. 구현 PR이 피나치공과 맥도날드가 걸리는지 실데이터로 본다 |
| 원장 `data/log.jsonl` | 안 건드린다 | §5 |

## 3. 결정

### 3-1. 가게 없음을 관측으로 돌린다 (원인 1)

**양성 신호.** 배민 `no_store`는 `capture/brand_links._open_and_read`에서 `wait_for_baemin_brand_page`(브랜드 이름이 화면에 있음)와 두 번의 로그인 벽 검사를 통과한 뒤에만 붙고, 값이 없고 문구 "배달 가능한 가게가 없어요"가 뷰 트리에 있을 때만 붙는다. 즉 브랜드관이 열린 것은 이미 구조로 증명된 뒤다. `no_store`가 붙은 결과에서 `error`, `session_suspect`, `coupon_unread`가 함께 없으면 "쿠폰 없음 관측"이다.

- `_unread_entry`에서 `no_store`를 뺀다. 단 앱은 배민만이다. 쿠팡이츠 `no_store`는 매장 혜택 상태값으로 뜻이 다르고(`coupangeats_store_benefits`), 이 함수는 앱 인자가 없어 배민 결과에서만 부르는 자리(`record_full_sweeps`)에서 걸러 쓴다. 구현은 `_unread_entry(entry, platform)`로 바꾼다.
- 양성 신호는 필드로 따로 안 적는다(캡처 코드를 바꾸지 않기 위함). 대신 "no_store가 위 세 실패와 함께 오면 unread"를 `_unread_entry`가 가른다.

**반박과 대안.** 피나치공은 "비회원 V50은 읽었고 A8 주계정은 가게 없음"이다. 가게 없음이 계정 차이라면 이 변경은 V50만 보이는 오퍼를 내린다. `_open_and_read` 주석은 "배민 브랜드관 쿠폰은 주소와 무관하게 읽는다(2026-11-02)"라서 주소 탓은 아니라고 본다. 계정 탓인지는 **미확인**이다. 그래서 가게 없음 한 번으로는 내리고(기준일 = 그 전수), 이슈 요구대로 도는 unread 연속 규칙(3-2)은 별개로 둔다.

### 3-2. unread가 연속이면 내린다 (N은 14일)

`latest_sweep_dates`의 unread 처리를 바꾼다. 브랜드 B의 연속 unread 구간은 "마지막으로 B가 읽힌 전수 다음 전수부터 최신 전수까지"다.

- 구간의 첫 전수 날짜부터 최신 전수 날짜까지 **14일 이상**이면 B의 기준일을 최신 전수 날짜로 올린다(= 안 보인 것으로 판정, 내림). 14일 미만이면 지금처럼 마지막으로 읽힌 날짜.
- N을 전수 횟수가 아니라 일수로 둔 이유: 앱마다 전수 간격이 다르다(요기요, 땡겨요는 매일, 배민 4a는 사실상 주 1회). 횟수로 하면 앱마다 뜻이 달라진다. 14일은 월요일 교체(주간) 두 번을 지나도 못 읽은 경우다.
- **플랫폼 전체 실패는 세지 않는다.** 한 전수에서 unread가 읽은 브랜드 수의 50% 이상이면 그 전수는 구간에 안 센다(앱 전체 로그인 벽 등, 2026-10-29 V50 9곳 전부 실패 같은 날). 2주 로그아웃이 살아 있는 오퍼를 통째로 내리는 것을 막는다. 11-02 배민은 38/158이라 센다. 이 50%는 근거 실측이 없는 값이라 리뷰에서 확인한다(§8).
- 한 번도 읽힌 적 없는 브랜드(맥도날드)도 같은 규칙. 지금은 `default=""`라 영원히 안 내려간다.
- ADR-020 "기본값은 아무것도 안 내림"과의 관계: 14일 규칙은 그 기본값을 일정 기간 뒤 뒤집는다. 내려간 오퍼는 다시 읽히면 즉시 복귀하므로(다음 전수에 읽히면 구간이 끊긴다) 비용이 작다. ADR 끝 절을 "unread 연속 14일"로 갱신한다.

### 3-3. 배짱할인 행은 2단계 관측 날짜로 판정한다 (원인 2)

- `sweeps.jsonl`에 새 줄 종류를 둔다: `{"platform": "baemin", "scope": "baejjang", "date": "...", "records": N, "note": "2단계 배짱할인"}`. `scope`가 있는 줄은 `latest_sweep_dates`의 앱 최신 날짜(`baemin`)에 **섞지 않고** 키 `baemin:baejjang`로 따로 담는다. 섞으면 매일 쓰는 2단계가 4a 전수 기준일을 올려 4a 브랜드관 행이 다 내려간다. 이것이 이 변경에서 가장 위험한 자리라 테스트로 박는다(§4 T5).
- `is_stale_sweep`: `section`이 "배짱할인"으로 시작하는 행(선착순, 이번주)은 `baemin:baejjang`만 본다. 없으면 `""`이라 안 내린다(4a 날짜로 대신 판정하지 않는다).
- `reflect_daily.record_full_sweeps`의 중복 검사 키를 `(platform, scope, date)`로 넓힌다. 안 넓히면 같은 날 4a가 적은 `(baemin, day)` 때문에 2단계 줄이 안 써진다, 반대도 같다.
- **쓰는 곳.** 2단계 줄은 `baejjang_daily.py --write`가 적는다(8단계가 아니라). 8단계는 `captures/`의 파일 유무로 2단계 수행을 알 수 없다. 이유: 값이 0이면 "파일을 안 만든다"(`baejjang_daily.py:187`)라 "읽었는데 없음"과 "못 읽음"이 같은 빈 자리다. 맥도날드가 정확히 이 경우다.
- **양성 신호.** 줄을 쓰는 조건은 둘 다다. (a) 핫딜 읽기 상태가 `unread`가 아니다(`read` 또는 `none`; `none`은 "없다"가 확인된 상태). (b) 인기 브랜드 탭에서 브랜드 카드가 1곳 이상 읽혔다. (b)가 없으면 탭이 안 열린 날도 "다 안 보임"으로 적혀 모든 배짱할인 행이 내려간다. 순수 함수 `baejjang_observed(hot_state, deals, cards) -> bool`로 뽑아 단위 시험한다(폰 없이).
- (b) 때문에 탭이 통째로 비는 주말 사이에는 줄이 안 써져 옛 행이 남는다. 안 내리는 쪽으로 틀리므로 받아들인다.
- 브랜드가 아니라 앱 단위 기준이라 "다른 브랜드 카드가 읽힌 날 맥도날드만 안 보임"이 곧 맥도날드 행의 종료다. 같은 주 월요일 교체 규칙과 맞는다.

### 3-4. 이미 박힌 데이터

- 피나치공(V50 11-02 행): 3-1과 3-2 적용 뒤 다음 전수에서 가게 없음이 다시 나오면 내려간다. 이미 적힌 11-02, 11-03 줄은 안 고친다(sweeps는 기록이고 소급하지 않는다). 임시로 넣은 targeted 제외 행(`--revive`)은 구현 PR이 병합되고 다음 전수가 끝난 뒤 사람이 푼다. 이 PR이 풀지 않는다.
- 맥도날드: 병합 뒤 첫 2단계 `--write`가 `baemin:baejjang` 줄을 쓰면 10-30 행이 다음 export에서 빠진다.

## 4. 결론을 박는 테스트

모두 `tests/test_export_sweeps.py`(기존 파일, 기존 패턴 `latest_sweep_dates([], path)`) 또는 `tests/test_reflect_daily.py`에 둔다. 실제 `data/sweeps.jsonl`을 읽지 않고 `tmp_path`에 줄을 쓴다.

| # | 시험 | 박는 것 |
|---|---|---|
| T1 | 피나치공 재현: baemin 11-02 전수(피나치공 읽힘), 11-03 전수(피나치공 `no_store`). 11-02 행 | `record_full_sweeps`가 피나치공을 unread에 **안** 넣고, `is_stale_sweep`이 11-02 행을 `True`로 판정 |
| T2 | `no_store`와 `error`가 같이 있는 엔트리, `no_store`와 `session_suspect`, `no_store`와 `coupon_unread` | 셋 다 unread(양성 신호가 깨진 경우) |
| T3 | 쿠팡이츠 결과의 `no_store` | unread로 남음(앱을 가른다) |
| T4 | 14일 규칙: 같은 브랜드가 8일 간격 전수 둘(구간 8일)에서 unread / 14일 간격 둘에서 unread / 중간에 읽힘이 끼면 구간이 끊김 | 앞은 내리지 않음, 가운데는 내림, 뒤는 내리지 않음 |
| T5 | 2단계 줄(`scope: baejjang`) 때문에 4a 기준일이 안 올라감: baemin 4a 11-02, baejjang 11-03. 4a 행(11-02 캡처) | `latest_sweep_dates["baemin"] == "2026-11-02"`, 그 행은 내려가지 **않음** |
| T6 | 맥도날드 재현: 배짱할인 선착순 행 10-30, 4a는 매주 unread(읽힌 날 없음), baejjang 줄 11-03 | 그 행 `is_stale_sweep == True`. baejjang 줄이 없으면 `False`(안 내림) |
| T7 | 배짱할인 행이 4a 날짜로는 안 내려감: baejjang 줄 없음, 4a 최신 11-03, 행 10-30 | `False`(4a 기준으로 대신 판정하지 않는다) |
| T8 | 전체 실패 전수 제외: 한 전수에서 읽은 브랜드의 50% 이상이 unread | 그 전수는 14일 구간에 안 셈 |
| T9 | `baejjang_observed`: 핫딜 `unread`, 카드 0곳, 핫딜 `none`과 카드 1곳, `read`와 카드 1곳 | `False`, `False`, `True`, `True` |
| T10 | `record_full_sweeps` 중복 키: 같은 날 `(baemin, None)`과 `(baemin, baejjang)` 줄 | 둘 다 써짐, 같은 줄을 다시 부르면 안 써짐 |
| T11 | 기존 `test_latest_sweep_dates_reads_the_sweep_log`, `test_export_sweeps.py` 전체, `test_weekly_check.py` | 무수정 통과 |

HARNESS §11의 점검 명령을 돌린다(별칭표 없이 한 줄 포함).

## 5. 원장

`data/log.jsonl`을 건드리지 않는다. 행을 지우지도, 새 관측을 넣지도 않는다. 내려가는 것은 export 단계의 필터 결과뿐이고, 원장의 옛 행은 그대로 남는다("지우지는 않는다" `is_stale_sweep` 머리말). `data/sweeps.jsonl`은 append-only로 새 줄만 더한다. 기존 줄 수정 없음.

## 6. 영역 분할과 구현 순서

폰이 필요한 곳은 `baejjang_daily.py`의 줄 쓰기 하나다. 나머지는 폰 없이 끝난다.

1. (export) `export_data`, `reflect_daily`, `record_sweep` 변경과 T1~T8, T10, T11. `baejjang_observed`를 `scripts/baejjang_daily.py`에 두되 T9로 폰 없이 시험.
2. (collect) `baejjang_daily.py --write`가 `baemin:baejjang` 줄을 쓰는 연결. `scripts/collect_trial.ps1 -Command "python scripts/baejjang_daily.py --write"`로 예약을 끄고 시험한다. 예약 수집이 부르는 코드이므로 다음 예약 전에 돌린다(AGENTS.md).
3. 문서: `ROUTINE-SPEC.md`(새 줄 형식), `CROSS-CHECK-VERDICTS.md`(소실 가드가 이 경로로 걸림), ADR-020 끝 절.

1과 2를 한 PR에 둘지 나눌지는 구현자가 정한다. 나눌 때 1만 병합되면 안전하다(2단계 줄이 없어 배짱할인 행은 안 내려가고, 가게 없음 변경과 14일 규칙만 켜진다).

## 7. 검토한 대안

- **no_store를 필드(`brand_page_open`)로 양성 신호화**: 캡처 코드와 폰 시험이 늘고 이미 쌓인 결과에는 없어 소급 안 됨. 구조상 이미 보장된 신호를 한 번 더 적는 것이라 뺐다.
- **배짱할인 판정을 원장 날짜로**(행이 안 생긴 날 = 안 보인 날): 행이 0인 날과 못 읽은 날이 같아진다. 이 이슈의 원인이라 불가.
- **N을 전수 횟수로**: 앱마다 간격이 달라 뜻이 갈린다. 일수로 정했다.
- **unread를 아예 기준일에서 빼고 전부 내림**: 로그인 벽 같은 전체 실패에 살아 있는 오퍼가 통째로 내려간다.

## 8. 리뷰 포인트

- **가게 없음이 계정 차이일 수 있다.** V50은 읽고 A8은 가게 없음이라면, 이 변경은 V50에서만 보이는 오퍼를 내린다. 계정 차이인지 확인되지 않았다.
- 14일과 50%는 실측 근거 없는 값이다. 11-02 배민 unread 38/158(24%)이 유일한 관측이다.
- 탭이 통째로 빈 날 배짱할인 행이 남는 것(3-3)을 받아들여도 되는가.
