<!-- 원본: tracker docs/specs/issue-143-baejjang-stage2-sweep-writer.md — 여기서 고치지 않는다 -->
# 이슈 #143 배짱할인 2단계 전수 기록을 8단계가 쓴다

- 상태: 설계 초안
- 영역: `export` (폰 없이 끝난다. 수집 코드 `baejjang_daily.py`의 `main()`은 안 바꾼다. §6)
- 이슈: [#143](https://github.com/nn98/delivery-discount-tracker/issues/143)
- 선행: [#114 설계](issue-114-unread-sweep-takedown.md) §3-3, 구현 `fe0b893`(#115)
- 관련: [ADR-020](../decisions/ADR-020-sweep-is-recorded-not-inferred.md), `docs/setup/ROUTINE-SPEC.md` "`data/sweeps.jsonl` 줄 형식"

## 1. 문제와 실제 원인

이슈는 "2단계 기록이 11-03부터 쌓여 비교할 날짜가 없다"고 적었다. 확인해 보니 **2단계 기록은 한 줄도 없다.**

| 확인 | 결과 |
|---|---|
| `data/sweeps.jsonl`에서 `scope` 키 검색 | 0줄 |
| `scope: baejjang` 줄을 쓰는 코드 | 없음. `scripts/baejjang_daily.py:116` `baejjang_observed`는 정의만 있고 `main()`이 부르지 않는다. 테스트 T9만 부른다 |
| `ROUTINE-SPEC.md:696` | "쓰는 쪽(`baejjang_daily.py --write`, `baejjang_observed`가 참일 때)은 폰 시험 뒤 연결한다" |

#114 설계 §6의 2번(수집 쪽 연결)이 안 됐다. 그 결과 `is_stale_sweep`의 배짱할인 가지는 늘 `sweeps.get("baemin:baejjang", "") == ""`가 되어 아무 행도 내리지 않는다. #115 전에는 4a 날짜로 내렸으니 되돌림이다.

`data/export.json`(오늘 내보내기 파일)에서 확인한 내용:

| 브랜드 | 남은 행 | 캡처 |
|---|---|---|
| 갓튀긴후라이드 | 배짱할인 주말핫딜 선착순 3,000원, 오전 10시 오픈 | 2026-10-11 16:04 |
| 피자헛 | 배짱할인 주말핫딜 선착순 7,000원, 오전 10시 오픈. 이슈의 "최소주문 없는 두 번째 오퍼"의 출처가 이것이다 | 2026-10-04 16:04 |
| 맥도날드 | 배짱할인 주말핫딜 선착순 | 2026-10-30 |
| 그 밖 | 배짱할인 행 50건 중 40건쯤이 11-04보다 오래됐다. 가장 오래된 것은 09-05 | |

원장에는 2단계 행이 거의 매일 들어온다(마지막은 `baejjang-weekend-2026-11-04`). 판정 입력만 비어 있다.

## 2. 이슈 제안에 대한 판단

이슈는 "2단계 기록이 없는 날은 원장의 마지막 2단계 관측 날짜로 대신 판정하고, 행이 0인 날과 못 읽은 날은 2단계 로그의 양성 신호로 가른다"고 했다. **원장 대체 판정은 넣지 않는다.** 대신 빠진 쓰기를 연결한다. 이유는 다음과 같다.

1. **비교할 날짜가 쌓일 필요가 없다.** 판정 기준은 `max(date)` 한 값이다. `scope: baejjang` 줄이 한 번만 써져도 그보다 오래된 배짱할인 행은 다음 내보내기에서 전부 빠진다. 대체 경로는 연결이 되는 순간 쓸모가 없어진다. 그런데도 남으면 판정 경로가 영구히 둘이 된다.
2. **원장 날짜는 핫딜을 못 읽은 날을 못 가린다.** 원장에 2단계 행이 생기는 조건은 "인기 브랜드 패널 또는 선착순이 1건 이상"이다(`baejjang_daily.py:195`). 핫딜 읽기가 `unread`로 끝나도 패널이 읽히면 행이 생긴다. 그러면 그날 핫딜에서만 오던 선착순 행이 "안 보였다"로 내려간다. #114 §7이 같은 이유로 버린 안이다.
3. **export가 로그를 읽으면 안 된다.** 단계 로그(`logs/`)는 수집 PC에만 있고 저장소, CI, `weekly_check.py`에는 없다. 판정 자리가 둘로 갈린다.

이슈가 요구한 "2단계 로그의 양성 신호"는 받아들인다. 다만 **쓰는 쪽(8단계)** 에서 쓴다. 8단계는 이미 같은 로그로 2단계를 판정한다(`check_routine.judge`).

### 왜 2단계가 아니라 8단계가 쓰나 (#114 결정을 고친다)

#114 §3-3은 `baejjang_daily.py --write`가 줄을 쓰기로 했다. 이 자리는 위험하다.

- 2단계가 줄을 써도 8단계가 그 출처를 넣지 않을 수 있다. 판정기가 2단계를 `SUSPECT`로 보거나(N이 직전의 절반 이하), 거부 행이 있어 `skipped_all`이 되는 경우다.
- 그러면 "오늘 다 봤다"는 줄만 남고 오늘 행은 원장에 없다. 결과는 **배짱할인 전체가 화면에서 사라지는 것**이다.
- 실제로 일어난 적이 있다. 2026-09-21 00:01, 4단계 출처가 보류됐는데 전수 줄이 써져 배민 90건이 사라졌다. `reflect_daily.py:694-699`의 `audit_held` 가드는 그 사고 때문에 생겼다.

그래서 4a 줄과 같이 **원장에 넣는 자리(8단계 `reflect_daily`)가 넣은 뒤에 쓴다.** 덤으로 수집 코드를 안 바꾸니 폰 시험도 필요 없다.

## 3. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`의 아홉 묶음에는 `sweeps.jsonl`, `is_stale_sweep`, `reflect_daily`가 없다. 따라서 닿는 묶음이 없다. 서버와 웹 코드도 안 바뀐다. 8번 묶음(저장소 경계와 배포 순서)은 `export.json` 내용만 바뀌므로 해당이 없다. 표에 없으니 코드 쪽 자리를 직접 쟀다.

| 자리 | 이번에 넣나 | 이유 |
|---|---|---|
| `scripts/reflect_daily.py` `main()`, 새 함수 `record_baejjang_sweep` | 넣는다 | 쓰는 자리 |
| `scripts/check_routine.py` 2단계 판정 | 넣는다(파서 하나 추가) | 같은 로그 구역을 이미 읽는다. 핫딜 상태 파서를 이 옆에 둔다. 판정 결과(PASS, SUSPECT, FAIL)는 안 바꾼다 |
| `scripts/baejjang_daily.py` `baejjang_observed` | 옮긴다 | 정의만 있고 안 불린다. `reflect_daily`로 옮기고 인자를 `(hot_state, deals: int)`로 바꾼다. `main()`은 한 줄도 안 바뀐다 |
| `export_data.latest_sweep_dates`, `is_stale_sweep` | 안 넣는다 | #115로 이미 `baemin:baejjang`를 읽는다. 바꿀 필요 없음 |
| `record_sweep.py` | 안 넣는다 | `scope` 줄은 이미 중복 검사에서 빠진다 |
| `weekly_check.py` | 안 넣는다. 테스트로 확인만 | `latest_sweep_dates`를 그대로 부른다 |
| 소실 가드(`check_deploy.staleness`) | 확인한다 | 첫 줄이 써지는 날 배짱할인 행 40건쯤이 한꺼번에 빠진다. `vanishing`은 출력만 하고 막지 않는다. `losing_detail`은 같은 (브랜드, 앱)에 더 최근 행이 있으면 통과한다. 구현 PR이 실데이터로 `deploy_export.py`(미리보기, `--apply` 없이)를 돌려 막히는지 본다 |
| `banner_routine.py`, `offer_link_check.py` | 안 넣는다 | 2단계 산출물 파일을 직접 읽는다. 원장이나 sweeps를 안 본다 |
| `docs/setup/ROUTINE-SPEC.md` 696행, ADR-020 끝 절 | 넣는다 | 쓰는 쪽이 8단계로 바뀐 것을 적는다 |
| 원장 `data/log.jsonl` | 안 건드린다 | §5 |

## 4. 결정

### 4-1. 쓰는 조건 (양성 신호)

8단계 `--apply`에서 원장에 넣은 뒤, 아래가 **모두** 참일 때만 `{"platform": "baemin", "scope": "baejjang", "date": <day>, "records": <넣은 2단계 행 수>, "note": "2단계 배짱할인(reflect_daily가 적음)"}`을 쓴다.

| # | 조건 | 무엇을 증명하나 |
|---|---|---|
| a | 판정기의 2단계 결과가 `PASS`다 | 파일이 있고, Traceback이 없고, 인기 브랜드 패널이 1곳 이상이고, 직전의 절반 아래로 안 떨어졌다 |
| b | 2단계 출처의 결정이 `skipped_all`이 아니다 | 오늘 2단계 행이 원장에 들어갔다. 09-21 사고 가드와 같다 |
| c | 로그의 2단계 구역에 핫딜 상태 줄이 있고 값이 `read` 또는 `none`이다 | 핫딜 구역을 읽었다. `none`은 "없다"를 확인한 상태다 |
| d | 계류(`hold`) 중이 아니다 | `apply_now`가 참일 때만 쓴다. 4a 줄과 같다 |

- (c)의 줄은 `baejjang_daily.py:162-163`이 찍는다: `주말핫딜 선착순 N곳(…) · 타겟 M곳 (핫딜 카드 K장 중, 상태 <state>)`. 파서 `hot_state(section) -> str | None`를 `check_routine.py`에 둔다. 줄이 없으면 `None`이고, `None`이면 쓰지 않는다(미관측). 정규식은 `상태 (read|none|unread)\)`로 끝만 짚는다. 앞쪽 글자는 바뀐 적이 있다(#138).
- 재시도로 구역에 상태 줄이 둘이면 **마지막** 줄을 쓴다.
- `--pass 2`로 사람이 판정을 덮어도 (c)는 로그 그대로 본다. 실패한 실행의 상태가 `unread`면 안 쓴다. 안 내리는 쪽으로 틀리므로 받아들인다.
- 같은 날 이미 `(baemin, baejjang, day)` 줄이 있으면 안 쓴다. 하루 여러 번 도는 날(월요일 세 번) 대비다.
- `baejjang_observed(hot_state, deals: int) -> bool`가 (c)와 "패널 1곳 이상"을 합친다. `deals`는 판정기가 이미 읽는 `브랜드 할인 (\d+)곳`의 N이다.

### 4-2. 원장 대체 판정은 안 둔다

§2. `export_data.is_stale_sweep`는 #115 그대로 둔다. `baemin:baejjang`가 없으면 안 내린다.

### 4-3. 병합 뒤 첫 실행

- 첫 8단계가 줄을 쓰면 그날보다 오래된 배짱할인 행이 다음 내보내기에서 한꺼번에 빠진다. 갓튀긴 10-11, 피자헛 10-04, 맥도날드 10-30 행도 여기에 든다.
- 그날 다시 읽힌 브랜드는 새 행으로 남는다.
- 빠지는 행 중 같은 브랜드의 다른 배민 행이 있는 것(예: 갓튀긴 브랜드관 3,000원)은 그 행이 남는다.

### 4-4. 날짜 단위 판정이 내리는 것

선착순 카드는 하루짜리다. 오후 실행(16시대)에만 보이고 다음 날 00시대 실행에 안 보이는 카드는 다음 날 내려간다. 11-04 00:26 실행도 선착순 카드를 읽었으니(내보내기 파일 `capturedAt`), 00시대에 카드가 비는 것이 상례는 아니라고 본다. 리뷰에서 확인한다(§8).

## 5. 원장

`data/log.jsonl`을 건드리지 않는다. 지우는 행도, 새로 넣는 관측도 없다. 빠지는 것은 내보내기 필터 결과뿐이고 옛 행은 원장에 그대로 있다. `data/sweeps.jsonl`에는 새 줄만 덧붙인다. 기존 줄은 안 고치고 소급 줄도 안 쓴다.

## 6. 결론을 박는 테스트

새 파일 `tests/test_baejjang_sweep_line.py`. `tmp_path`에 로그, 2단계 파일, sweeps를 쓰고 실제 `data/`는 안 읽는다. 기존 `tests/test_unread_sweep_takedown.py`의 `_audit` 패턴을 따른다.

| # | 시험 | 박는 것 |
|---|---|---|
| T1 | 갓튀긴 재현: 원장 행 10-11 선착순, 8단계 11-05 조건 a~d 모두 참 | 줄이 써지고 `is_stale_sweep`이 10-11 행을 `True`로 판정 |
| T2 | 맥도날드(10-30)와 피자헛(10-04 7,000원) 같은 방식 | 둘 다 `True`. 11-05에 다시 읽힌 브랜드의 11-05 행은 `False` |
| T3 | 핫딜 상태 `unread` | 줄 없음. 세 행 모두 `False`(안 내림) |
| T4 | 로그에 상태 줄이 없음 | 줄 없음(미관측을 "없다"로 안 본다) |
| T5 | 2단계 판정 `SUSPECT`, 또는 2단계 출처 `skipped_all` | 줄 없음. 09-21 사고 재현 |
| T6 | 계류 중(`apply_now` 거짓) | 줄 없음 |
| T7 | 같은 날 두 번 부름 | 한 줄 |
| T8 | `hot_state` 파서: `tests/fixtures/after-open-2026-09-30.log` 2단계 구역 | `"none"`. 재시도로 줄이 둘이면 마지막 값 |
| T9 | 글자 지킴: `scripts/baejjang_daily.py` 원문에 `상태 {hot_state})`가 있다 | 수집 쪽이 줄 모양을 바꾸면 이 시험이 깨진다 |
| T10 | `baejjang_observed`(옮긴 뒤): `("unread", 3)`, `("read", 0)`, `("none", 1)`, `("read", 1)` | `False`, `False`, `True`, `True`. 기존 T9는 새 위치로 고친다 |
| T11 | 4a 기준일이 안 움직인다: 4a 11-02, 새로 쓴 baejjang 11-05, 4a 행 11-02 | `latest_sweep_dates["baemin"] == "2026-11-02"`, 4a 행 `False` |
| T12 | 기존 `test_unread_sweep_takedown.py`, `test_export_sweeps.py`, `test_check_routine.py`, `test_weekly_check.py`, `test_reflect_daily.py` | T9 위치 변경 말고 무수정 통과 |

HARNESS §11 점검 명령을 돌린다(별칭표 없이 돌리는 마지막 줄 포함).

## 7. 영역과 구현 순서

폰이 필요한 곳은 없다. `export`다.

1. `check_routine.hot_state`, `reflect_daily.baejjang_observed`와 `record_baejjang_sweep`를 넣고 `main()`의 4a 줄 쓰는 자리 옆에서 부른다. `baejjang_daily.py`에서는 안 불리던 `baejjang_observed`만 지운다. 이 파일의 diff는 그 함수 정의를 지운 것뿐이어야 한다.
2. T1~T12.
3. 실데이터로 미리보기를 본다. `reflect_daily.py <날짜>`(`--apply` 없이)로 쓸 줄을 출력하게 하고, 그 줄을 넣은 임시 sweeps로 `export_data`를 돌려 빠지는 행 수와 목록을 PR에 적는다.
4. 문서: `ROUTINE-SPEC.md` 696행(쓰는 쪽이 8단계, 조건 a~d), ADR-020 끝 절 한 문장.
5. 병합 뒤: 8단계는 예약 수집이 부르는 코드다. 다음 예약 전에 수집 PC에서 8단계만 골라 돌린다(`AGENTS.md`, 사용자 2026-10-15). 클라우드 구현자는 못 하니 PR 후속 조치로 넘긴다.

## 8. 검토한 대안

- **이슈 제안: 원장 마지막 2단계 날짜로 대체 판정한다.** §2 1~3번 때문에 뺐다.
- **#114대로 `baejjang_daily.py --write`가 쓴다.** 8단계가 출처를 보류하면 배짱할인 전체가 사라진다(§2). 폰 시험도 필요하다.
- **2단계가 관측 기록 파일(`captures/baejjang-observed-<날짜>.json`)을 남기고 8단계가 그걸 읽는다.** 로그 글자보다 구조적이다. 하지만 수집 코드를 바꿔 폰 시험이 필요하고, 판정기는 어차피 같은 로그를 읽는다. 로그 줄 모양은 T9가 지킨다. 줄 모양이 다시 바뀌어 T9가 깨지면 그때 이 안으로 옮긴다.
- **수집 PC 로그에서 지난 날짜 줄을 소급해 쓴다.** 줄 하나로 충분해서(§2 1번) 필요 없다.

## 9. 리뷰 포인트

- **핫딜 상태가 `unread`인데 패널이 읽힌 날은 줄을 안 쓴다.** 그날은 옛 행이 하루 더 남는다. 받아들여도 되는가.
- **00시대 실행에서 선착순 카드가 비는 날이 잦은지는 확인하지 않았다.** 잦으면 오후에 본 선착순 행이 다음 날 새벽에 내려간다(§4-4).
- **첫 실행에서 40건쯤이 한꺼번에 빠진다.** 구현 PR의 미리보기 목록을 사람이 보고 승인하는가.
- `targeted_skip.json`에 배민 브랜드가 들어가면, 그 브랜드의 새 행은 안 들어가는데 옛 배짱할인 행은 내려간다. 지금은 쿠팡이츠만 있다. 4a 줄도 같은 동작이다.
