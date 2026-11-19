<!-- 원본: tracker docs/specs/issue-55-event-card-hub-rounds.md — 여기서 고치지 않는다 -->
# 설계: 행사 카드로 읽힌 브랜드를 허브 회차 판정에 센다 (이슈 #55)

- 상태: 설계 (구현 전)
- 영역: **export** (폰 불필요. 수집 코드는 바꾸지 않는다)
- 읽은 것: `export_data.py` 334~398행(`COUPONBOX_SECTION`, `HUB_READ_MIN_BRANDS`, `_is_ce_hub`, `hub_read_rounds`, `couponbox_residual`), `scripts/coupangeats_weekly.py` 370~422행(`random_event_records`, `fixed_event_records`)과 690~722행(호출부), `tests/test_ce_couponbox_residual.py` 1~70행, `docs/specs/issue-46-coupangeats-couponbox-residual-offer.md` 전체, `data/log.jsonl` 15586행(10-23 호식이 스페셜 특가 행), `mono/docs/CHANGE-PROPAGATION.md`(쿠폰함 묶음 검색).
- **읽지 않은 것**: 이슈 본문이 가리키는 `captures/coupangeats-hub-events-<날짜>.json` 실물(captures는 원장 밖이고 이 세션에 없다). 10-23 호식이 원장 행 전부(294행 중 세 줄만 열었다). `couponbox_residual` 호출부(`build_export` 안)의 `winners` 구성. 구현자가 먼저 읽고 6번 전제를 확정한다.

## 1. 지금 코드가 하는 일과 구멍

- `_is_ce_hub`는 `hub_tab.no` 또는 `hub_tab.link`가 있고 쿠폰함 구역이 아닌 쿠팡이츠 행만 허브 출처로 센다(`export_data.py` 350~353행).
- `hub_read_rounds`는 그 행만 시각 20분 간격으로 회차로 묶고, 서로 다른 브랜드 수가 15 이상인 회차만 "정상으로 읽음"으로 돌려준다.
- 행사 카드 행(`fixed_event_records`의 `릴레이 슈퍼딜 > 스페셜 특가`, `random_event_records`의 `위클리 슈퍼딜 > 이벤트 쿠폰`)은 `hub_tab`을 달지 않는다(`coupangeats_weekly.py` 386~421행에 필드가 없다). 그래서 `_is_ce_hub`가 거짓이고 회차의 브랜드 집합에 안 들어간다.
- 결과: KFC, BHC, 호식이두마리치킨, 후라이드참잘하는집은 허브 화면에 분명히 있는데 `couponbox_residual`의 `b1`, `b2`에서 빠진다. 쿠폰함 구획 행이 승자인 날 그 브랜드는 "허브에서 연속 두 회차 없음"으로 읽혀 내려간다(10-23 호식이).
- `last_hub`(전에 허브에 섰는가)도 같은 `_is_ce_hub`라 행사 카드로만 선 브랜드는 조건 2에서 먼저 걸러져 내려가지 않는 경우도 있다. 지금 내려가는 쪽은 "예전에 일반 허브 카드로 선 적이 있고 지금은 행사 카드로만 선" 브랜드다.

## 2. 비판: 이슈 요구를 그대로 받으면 안 되는 곳

1. **행사 행을 `_is_ce_hub`에 그대로 넣으면 안 된다.** `hub_read_rounds`의 문턱(15)은 "허브 탭 행으로 정상 회차인가"를 가르는 양성 신호다(#46 설계 4.2). 행사 카드 3~4개가 섞여 문턱을 넘기면, 못 읽은 회차(허브 탭 14개 + 행사 3개)가 정상으로 둔갑한다. 이 설계는 **문턱은 허브 탭 브랜드로만 세고, 행사 카드 브랜드는 문턱을 넘긴 회차의 집합에 나중에 더한다.** 이슈의 두 번째 할 일과 같다.
2. **행사 행을 어느 회차에 더할지는 시각으로 정해야 한다.** 행사 행의 `captured_at`은 `_stagger(now, 50 + i)`로 같은 수집 실행 안 몇십 초 간격이다. 회차 시작~끝 시각에 `HUB_ROUND_GAP`을 더한 창 안이면 그 회차의 관측이다. 창 밖의 행사 행은 어느 회차에도 더하지 않는다(미관측으로 둔다).
3. **손으로 넣은 행은 센다고 단정하지 않는다.** 10-23 호식이 스페셜 특가 행(원장 15586행)은 `capture_mode: manual`이고 `hub_tab`이 없다. 사람이 넣은 행은 "그 회차 허브를 기계가 봤다"는 관측이 아니다. 행사 행은 `capture_mode == "auto"`일 때만 센다(양성 신호). 이 선택이 이슈 재현(끝 조건 1)과 부딪히는지는 7번 T1에서 확인한다.
4. **구역 문자열을 새로 복사하지 않는다.** 두 구역 이름은 수집기에만 있고 `export_data.py`에 없다. #46 설계가 이미 `COUPONBOX_SECTION`을 export에 따로 두며 같은 부채를 졌다(상수 옆 `ponytail` 주석). 이번에도 `export_data.py`에 상수를 두고, **수집기가 만든 행의 구역이 그 상수와 같다는 테스트**로 묶는다(7번 T7). 수집기 코드는 안 고친다.
5. **원장은 건드리지 않는다.** 행사 행에 `hub_tab`을 소급해서 채우지 않는다. 판정은 export 단계의 읽기 전용 계산이다.

## 3. 결정 요약

| 항목 | 결정 |
| --- | --- |
| 입력 | 원장의 행사 카드 행: 쿠팡이츠, `capture_mode == "auto"`, `section`이 `EVENT_CARD_SECTIONS`(두 구역) 중 하나, `excluded` 없음 |
| 문턱 | `hub_read_rounds`의 15는 허브 탭 브랜드만으로 센다. 행사 브랜드는 문턱 뒤에 더한다 |
| 더하는 곳 | 시각이 회차 창(시작 − 0, 끝 + `HUB_ROUND_GAP`) 안인 행사 행의 브랜드를 그 회차 집합에 합친다 |
| `last_hub` | 같은 행사 행도 "전에 허브에 섰다"로 센다(조건 2의 입력). 비대칭을 만들지 않는다 |
| 이슈의 `captures/…hub-events-<날짜>.json` | **쓰지 않는다.** 원장 행(`fixed_event_records`가 만든 것)이 같은 정보이고, 원장만 읽는 export의 성질(같은 원장에서 같은 결과)을 지킨다. captures는 원장 밖이라 export 재현성을 깬다 |

captures 파일을 안 쓰는 판단이 틀릴 수 있는 곳: 행사 카드가 읽혔는데 원장에 행으로 안 들어간 경우(`fixed_event_records`는 `won`이 있고 `cap`이 없을 때만, `random_event_records`는 `cap`이 있을 때만 행을 만든다). 그 경우 카드는 화면에 있었는데 원장에 없어 이 판정은 그 브랜드를 못 본다. 8번에서 묻는다.

## 4. 판정 규칙

### 4.1 행사 카드 행 판별

`_is_ce_event_card(record)`: `platform == "coupangeats"`이고 `capture_mode == "auto"`이고 `section in EVENT_CARD_SECTIONS`이고 `excluded`가 없다. 구역은 `COUPONBOX_SECTION`과 겹치지 않는다. 글자 일치이므로 구조 신호(`capture_mode`, `excluded`)와 함께 쓰고, 구역 이름이 바뀌면 T7이 빨개진다.

### 4.2 회차에 더하기

`hub_read_rounds`를 이렇게 바꾼다(반환 모양은 그대로).

1. 지금처럼 `_is_ce_hub` 행만으로 회차를 묶고 브랜드 수 문턱을 건다.
2. 문턱을 넘은 회차마다 (첫 허브 행 시각, 마지막 허브 행 시각)을 안다. 지금 코드는 마지막 시각을 버리므로 함께 들고 간다.
3. 행사 카드 행마다, 시각이 어떤 회차의 `[첫, 마지막 + HUB_ROUND_GAP]` 안이면 그 회차 집합에 브랜드를 더한다. 창이 겹치지 않으므로(회차 사이 최소 간격 36분 > 20분) 둘에 걸치는 행은 없다.
4. 문턱 미만으로 버려진 회차 옆의 행사 행은 더할 곳이 없다. 버린다.

### 4.3 `last_hub`

`couponbox_residual`의 `last_hub`는 `_is_ce_hub(r) or _is_ce_event_card(r)`로 센다.

### 4.4 `couponbox_residual`의 나머지

조건 1~5와 `HUB_ROUND_APART`는 그대로다. 입력 집합 `b1`, `b2`만 넓어진다.

## 5. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`를 "쿠폰함", "hub_read", "허브" 검색으로 찾았다. `couponbox_residual`과 `hub_read_rounds`는 표에 직접 올라 있지 않았다.

| 묶음 | 닿는가 | 넣는가 / 이유 |
| --- | --- | --- |
| #46 쿠폰함 잔존 판정(`export_data.py`, `tests/test_ce_couponbox_residual.py`) | 직접 | 이번 변경의 본체 |
| 수집기 `fixed_event_records`, `random_event_records` | 구역 이름만 읽음 | 코드는 안 고친다. T7로 상수를 묶는다. 안 고쳤으니 `collect_trial.ps1` 시험은 필요 없다(수집 로직 불변) |
| 4. 최소주문 출처(`banner_routine.ce_min_order`) | 안 닿음 | 오퍼가 안 내려가는 방향의 변경이라 #46에서 확인한 "숫자만 채움" 관계가 그대로다. **다시 읽지는 않았다** |
| 3. 묶음 배너(`propose_ce_ops`) | 안 닿음 | 배너 생존은 그날 허브 수집(`got`)으로 정한다(#46 구현 확인). 이번 판정을 읽지 않는다 |
| #27 업로드 가드(`check_deploy`) | 닿지만 이번엔 반대 방향 | 내려가던 오퍼가 서 있게 되므로 소실이 줄어든다. 새 면제는 필요 없다 |
| 웹, API, mono | 안 닿음 | export 파일 모양이 같다. mono 변경 없음 |

## 6. "없다 / 0 / 통과"의 양성 신호

| 자리 | 조용히 거짓이 되는 때 | 양성 신호 |
| --- | --- | --- |
| "허브에 없다" | 행사 카드로만 읽힌 브랜드를 없다고 셈(이번 사고) | 그 회차 창 안의 자동 수집 행사 행(4.1, 4.2). T1 |
| "정상 회차" | 행사 행이 문턱을 채워 못 읽은 회차를 정상으로 셈 | 문턱은 허브 탭 브랜드만 센다(4.2의 1). T2 |
| "허브에 있다" | 수동 입력 행을 기계 관측으로 셈 | `capture_mode == "auto"`(4.1). T3 |
| "허브에 있다" | 회차와 상관없는 시각의 행사 행을 셈 | 회차 창 안일 때만(4.2의 3). T4 |
| "내린 건 0건" | 판정이 안 돈 것과 0건 구분 | #46이 심은 경고 줄(내림 N건 / 보류)이 그대로 나온다. 이번에 줄을 늘리지 않는다 |
| 행사 행 구역 | 수집기가 구역 이름을 바꿔 조용히 안 셈 | T7이 수집기가 만든 행의 구역을 상수와 대조한다 |

## 7. 테스트 (결론을 박는 곳)

`tests/test_ce_couponbox_residual.py`에 추가한다(새 파일이 아니므로 구조 문서 재생성은 필요 없다). #46의 `hub`, `hub_round`, `BASE`, `ce` 헬퍼를 쓴다. 구현 전에 T1이 빨갛게 나오는지 먼저 본다.

- **T1 이번 건(끝 조건 1)**: 호식이 쿠폰함 행(원장 10-22~10-23 모양을 그대로 옮긴 픽스처, `수동 excluded` 행 제외) + 예전 허브 탭 행 + 10-22 16:53, 10-23 01:10 정상 회차 둘. 두 회차의 창 안에 `capture_mode: "auto"`, `section: "릴레이 슈퍼딜 > 스페셜 특가"`, `hub_tab` 없음의 호식이 행이 있다. 오퍼가 **남는다**. 같은 픽스처에서 행사 행만 빼면 오퍼가 내려가는 것(#46 동작)도 한 시험에서 함께 확인해, 행사 행이 원인임을 박는다. 행사 행의 필드는 수집기 함수(`fixed_event_records`)가 만든 것으로 만들지, 손으로 쓰지 않는다.
- **T2 문턱 분리**: 허브 탭 행 브랜드가 문턱 − 1이고 행사 행으로 브랜드 수를 문턱 이상으로 채운 회차는 정상 회차로 안 센다(`hub_read_rounds` 결과에 없다). 허브 탭만 문턱 이상인 회차는 센다.
- **T3 수동 행**: `capture_mode: "manual"`인 스페셜 특가 행은 센다고 단정하지 않는다. 오퍼가 내려간다(#46 동작 유지). 이슈 재현의 원장 15586행이 manual이므로, 구현자가 이 행이 10-23 정규 수집의 auto 행으로도 있는지 원장에서 찾아 T1의 근거로 쓴다. 없으면 8번 질문으로 돌아온다.
- **T4 창 밖**: 회차 끝 + 20분보다 늦은 시각의 행사 행은 그 회차 집합에 안 들어간다.
- **T5 `last_hub`**: 행사 카드로만 선 적이 있는 브랜드의 쿠폰함 행이 두 회차에 없을 때(행사 행 없음) 내려가는 것을 확인한다. 전에 선 근거로 행사 행이 인정되는 것이다.
- **T6 구역 이름 대칭**: 쿠폰함 구역은 행사 구역에 안 들어간다(`COUPONBOX_SECTION not in EVENT_CARD_SECTIONS`).
- **T7 수집기와 상수 일치**: `fixed_event_records`, `random_event_records`가 만든 행의 `section`이 `EVENT_CARD_SECTIONS` 안에 있고 `capture_mode == "auto"`다.
- **기존**: `tests/test_ce_couponbox_residual.py`의 #46 테스트가 하나도 안 바뀌고 통과한다(끝 조건 2). `tests/test_export_data.py`, `tests/test_store.py`, `tests/test_check_deploy.py`도 통과한다. 점검 명령은 `docs/HARNESS.md` §11.

## 8. 사용자에게 물을 것

- 행사 카드가 화면에 읽혔는데 원장에 행으로 안 들어가는 경우(`cap`과 `won`이 둘 다 있거나 둘 다 없는 카드)가 있는가. 있으면 `captures/coupangeats-hub-events-<날짜>.json`을 입력에 넣는 갈래가 필요하고, export가 원장 밖 파일을 읽는 것을 허용하는지 정해야 한다.
- 10-23 호식이 사례를 수동 행으로만 재현할 수 있다면(T3), 사람이 넣은 행도 허브 관측으로 셀 것인가. 기본안은 세지 않는다.

## 9. 원장 append-only

`data/log.jsonl`은 읽기만 한다. 행사 행에 `hub_tab`을 소급해 넣지 않고 `excluded`도 기계가 찍지 않는다. 같은 원장에서 같은 결과가 나온다. 정정이 필요하면 더 늦은 시각의 새 관측(다음 수집의 행사 행)이 한다.

## 10. 하지 않는 것

1. 수집기 변경(행사 행에 `hub_tab`을 달거나 구역 상수를 수집기로 옮기는 일). 필요하면 `collect` 후속.
2. 문턱 15의 변경.
3. `captures/` 파일을 export 입력으로 넣는 일(8번 첫 질문의 답이 "있다"일 때만 별도 이슈).
4. 다른 앱 쿠폰함.
5. `data/log.jsonl` 수정, 소급 정정.

## 11. 범위 점검

한 PR에서 리뷰 가능하다. `export_data.py`의 `_is_ce_event_card` 한 개, 상수 한 개, `hub_read_rounds` 수정, `couponbox_residual`의 `last_hub` 한 줄, 시험 일곱. 10-23 15:55 정규 수집 전에 병합되는 것이 목표라 8번의 두 질문이 막으면 질문과 상관없는 4.2의 문턱 분리와 T2만 먼저 넣는 것도 가능하다.

## 변경 이력

- 2026-10-23: 설계 검수 댓글(nn98 01:48)이 8번 두 질문에 답함. 수동 행은 허브 관측으로 세지 않는다(기본안). 행사 카드 입력은 원장 행만으로 충분하고 captures 파일은 쓰지 않는다. 원장에 10-23 호식이 자동 행사 행은 없어(15586행만 manual) T1은 `fixed_event_records`가 만든 행으로 재현했다. T3는 수동 행이 그 자체로 오퍼가 서므로 `couponbox_residual`을 직접 불러 쿠폰함 행이 내려가는지 본다.