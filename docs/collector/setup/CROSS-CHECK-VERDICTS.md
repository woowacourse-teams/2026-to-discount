<!-- 원본: tracker docs/setup/CROSS-CHECK-VERDICTS.md — 여기서 고치지 않는다 -->
# 교차검증 판정 목록

오퍼를 막거나 알리거나 내리는 판정 셋의 입력, 시점, 방향, 코드 자리를 한 장에 모은다(이슈 #53, 출처 PR #47).
코드 자리는 파일과 함수 이름으로 적는다. 행 번호는 코드가 바뀌면 틀린다.

**판정이 도는 순서:** 수집, 매장 혜택 교차검증(5b) → 원장 반영(8단계) → 내보내기(`export_data.build_export`, 허브 대 쿠폰함) → 업로드(`scripts/deploy_export.py`, 소실 가드).

이 문서가 읽은 파일(2026-10-29): `check_deploy.py`, `export_data.py`, `scripts/deploy_export.py`, `scripts/build_ce_couponbox_records.py`, `capture/coupangeats_store_benefits.py`, `scripts/check_routine.py`(5b). 아래 "없다"는 이 범위에서 없다는 뜻이다. 저장소 전체에서 없다는 주장이 아니다.

## 한눈에

세 판정은 "내림, 유지, 보류" 한 축에 안 놓인다. 방향 칸과 작용 대상 칸을 따로 둔다.

| | 소실 가드 | 매장 혜택 교차검증 | 허브 대 쿠폰함 |
| --- | --- | --- | --- |
| 입력 | 들어오는 `data/export.json`과 서버 `export.json` 두 파일. 원장은 안 읽는다 | 3단계가 매장 혜택 시트에서 읽은 브랜드별 상태(`captures/coupangeats_storestatus_<날짜>.json`)와 쿠폰함 쿠폰(매장 혜택 쿠폰을 합친 뒤) | 원장 전체 이력(`records`)과 브랜드별 승자 행 |
| 시점 | 업로드 직전, 배포 1회마다 | 쿠팡이츠 쿠폰함 빌더 실행 때(5b), 하루 1회 | 내보내기 실행마다. 허브를 정상으로 읽은 최근 수집 회차 둘(D1, D2)로 판정 |
| 방향 | 상세 소실, 낡음: **배포 중단**. 정정: **통과**(근거를 출력). 사라지는 오퍼 목록: 출력만 | **오퍼에 작용 안 함.** 확인, 미관측, 실패를 출력하고 실패만 `[suspect]`로 올린다 | 조건이 다 맞으면 오퍼를 **내보내기에서 뺀다**. 회차가 모자라거나 붙어 있으면 **유지**(보류 줄) |
| 작용 대상 | 새 파일의 업로드(서버 오퍼는 그대로 선다) | 판정기 결과(5b `SUSPECT`) | 내보내기 결과(`export.json`). 원장은 안 고친다 |
| 판정 자리 | `check_deploy.py`의 `staleness`, `classify_detail`, `_corrected_by_couponbox`, `vanishing`, `format_corrections`. 호출은 `scripts/deploy_export.py`의 `main` | `scripts/build_ce_couponbox_records.py`의 `store_cross_check`와 `main`. 상태 값은 `capture/coupangeats_store_benefits.py`의 `OK`, `ABSENT`, `merge_status`. 판정기는 `scripts/check_routine.py`의 5b | `observation_paths.py`의 `couponbox_residual`, `hub_read_rounds`와 `export_data.py` `build_export`의 호출 줄. 상수 `COUPONBOX_SECTION`, `HUB_READ_MIN_BRANDS`, `HUB_ROUND_GAP`, `HUB_ROUND_APART`, `EVENT_CARD_SECTIONS` |
| 풀어 주는 수단 | `--accept-loss <브랜드>`: 상세 소실만 푼다. 최신성은 못 푼다. 정정은 막지 않아 풀 것이 없다 | 없음(알림뿐) | 허브에 돌아온 행이 생기면 같은 규칙으로 되살아난다. 손으로 `excluded`는 별개 |
| 구조 근거 | `membership == "none"` 명시 관측, `amount` 일치, 같은 날 캡처 비교 | `ABSENT` 상태 집합과 쿠폰함 브랜드 이름 집합 | `section`과 `hub_tab.no/link`, `capture_mode == "auto"` |
| 도입 | 최신성, 상세 소실은 이슈 #27 이전. 정정은 #27 | 2026-10-22 사용자 | 이슈 #46, #55 |

## 1. 소실 가드

**배포를 막는다.** 들어오는 `export.json`이 서버 것보다 얕아지는지를 두 파일만 보고 판정한다. 갈래가 셋이고 방향이 다르다.

- 최신성(`staleness`의 앞 절반): 들어오는 파일의 최신 `capturedAt`이 서버보다 이르면 **막는다.** 수기입력 행은 비교에서 뺀다.
- 상세 소실(`classify_detail`의 소실 줄): 서버에 채워져 있던 `tiers`, `badge`, `minOrderAmount`, `conditions`, `expiresAt`이 같은 (브랜드, 앱)의 들어오는 행 전부에서 비면 **막는다.** 들어오는 행이 모두 더 늦은 날 캡처면 갱신이라 통과한다(같은 날은 그대로 본다).
- 정정(`classify_detail`의 정정 줄, `_corrected_by_couponbox`, `format_corrections`): 서버의 멤버십 배지를 같은 금액의 `membership == "none"` 관측이 반박하면 **통과**하고 근거를 찍는다. 막힘을 푸는 조건 네 개는 [이슈 #27 설계 3.1](../specs/issue-27-loss-guard-cross-check.md)을 따른다. 요약: 배지가 멤버십 배지이고, 서버 금액이 있고, 같은 금액의 들어오는 행이 있고, 그 중 멤버십 있는 행이 없고 `none` 명시 행이 있다.
- 사라지는 오퍼(`vanishing`): (브랜드, 앱) 쌍이 통째로 빠지면 목록만 **출력하고 막지 않는다.** 만료로 인한 정상 제거와 사고를 이 층에서 가를 근거가 없다.

자동으로 소실에서 빼는 경우는 셋이다(모두 양성 신호가 있을 때만, 못 읽은 날은 서지 않는다).

- 구간 `expiresAt`이 어제까지인 구간.
- 쿠폰함 행의 구간이 **오늘 쿠폰함을 읽은 행**에서 안 보임(쿠폰이 쿠폰함을 떠난 것: 만료, 사용). 허브와 브랜드관 행의 구간에는 안 선다(사용자 2026-11-18).
- 월 1회 구간(`note`에 "월 1회")이 **오늘 허브를 읽은 행**(위클리 슈퍼딜)에서 안 보임(한도 소진: 소진 카드는 고정 목록에서 빠진다). 월 1회가 아닌 구간과 섞인 행은 월 1회 금액만 빠진다(ADR-039).

일부러 지운 값에 막혔다면 우회 플래그를 찾지 않고 서버 `export.json`을 먼저 고친다(ADR-024). `--accept-loss <브랜드>`가 있지만 사람이 정정한 브랜드를 이름으로 부를 때만 쓴다.

## 2. 매장 혜택 교차검증

**오퍼를 건드리지 않는다.** 장보기, 쇼핑 카드(CU 등)는 쿠폰함에 안 들어와 3b(15:55 회차만)가 매장 혜택 시트에서 따로 읽는다. 그 결과를 쿠폰함 쿠폰과 대조해 사람에게 알린다(`store_cross_check`).

- 상태 값 여섯: `ok`, `no_store`, `no_sheet`, `no_coupon`, `absent_hub`, `lost_hub`. 앞의 `ok`는 읽음이고, `no_store`, `no_sheet`, `no_coupon`, `absent_hub`은 `ABSENT`(미관측), `lost_hub`은 허브로 못 돌아옴이다. `absent_hub`은 3b가 허브를 위아래 끝까지 훑고(양끝에서 화면이 안 움직임을 확인) 그 브랜드의 고정 카드가 없거나 소진, 오픈 전이라 눌리지 않는 경우다. 월 1회 쿠폰은 한도가 차면 `수량소진`으로 허브 아래에 밀려 눌리지 않는다(ADR-039). 끝까지 못 훑으면 없다고 단정하지 않고 브랜드마다 찾는 예전 방식으로 읽는다.
- 가르는 규칙: 쿠폰이 하나라도 있으면(쿠폰함 또는 매장 혜택) **확인.** 없는데 상태가 `ABSENT`면 **미관측**(실패 아님, 오퍼를 안 만든다). 그 밖은 **실패**이고 `[suspect]`로 찍는다. 판정기 5b가 `[suspect]` 줄을 `SUSPECT`로 올린다.
- 같은 날 앞선 실행이 `ok`로 읽은 브랜드는 `merge_status`가 `ok`로 둔다.
- **못 읽음(이슈 #171).** 3단계의 계획 파일(`coupangeats_storeplan_<날짜>.json`)이 기준 목록이다. 계획에 있는데 상태가 없는 브랜드는 `unread`로 세고 `failed`와 섞지 않는다. 5b는 SUSPECT, 8단계 `partial_ok`는 `failed`가 비고 `unread`만 있으면 쿠폰함 레코드를 반영한다(못 읽은 브랜드는 쿠폰함에 없는 브랜드라 그 레코드가 원래 없다). 계획이 없는 회차는 세지 않는다.
- 한계: "이 판정은 오퍼에 작용하지 않는다"는 시험이 못 지킨다. 코드가 나중에 오퍼를 내리도록 바뀌면 이 문장이 조용히 거짓이 된다. `store_cross_check`의 반환이 쓰이는 곳은 `build_ce_couponbox_records.py`의 `main`의 출력 두 갈래뿐이다. 이름 시험(`tests/test_cross_check_verdicts_doc.py`)이 지키는 것과 못 지키는 것은 그 시험 머리말에 있다.

## 3. 허브 대 쿠폰함

**내보내기에서 오퍼를 뺀다.** 쿠팡이츠 오퍼의 근거는 허브 탭 행(지금 받을 수 있다)과 쿠폰함 행(이미 받아 둔 쿠폰)이다. 허브에서 내려갔는데 쿠폰함 근거만 남은 승자를 내린다(`couponbox_residual`).

내리는 조건 다섯, 모두 맞을 때:

1. 승자가 쿠팡이츠이고 `section == COUPONBOX_SECTION`이다.
2. 그 브랜드가 전에 허브에 섰다(허브 탭 행 또는 행사 카드 행, `EVENT_CARD_SECTIONS`).
3. 허브를 정상으로 읽은 최근 회차 D1, D2 둘 다에 없다.
4. 승자 관측이 D2 이후다.
5. D1과 D2의 시작이 `HUB_ROUND_APART` 이상 떨어져 있다.

**유지(보류)**: 정상으로 읽은 회차가 둘 미만이거나(`hub_read_rounds`가 브랜드 수 `HUB_READ_MIN_BRANDS` 미만 회차를 "못 읽음"으로 뺀다), 두 회차가 붙어 있으면 내리지 않고 "쿠폰함 잔존 판정 보류" 줄을 남긴다. 회차는 `HUB_ROUND_GAP`을 넘게 쉬면 끊는다. 설계 원문은 날 기준이고 구현은 **회차 기준**이다. 이 문서는 구현을 따른다.

원장은 안 고친다. 허브에 돌아온 행이 생기면 같은 규칙으로 되살아난다(`tests/test_ce_couponbox_residual.py`의 `test_t8_back_on_hub_revives`).

**허브가 없는 앱(배민, 요기요): 브랜드 화면 대 쿠폰함(이슈 #91).** 쿠폰함 경로가 단독 근거(`stands_alone`)인 동안은 세기만 한다(지금 전부). 끈 앱은 `_judge_brand_screen`이 브랜드 화면 방문(`brand_visits`, `BRAND_VISIT_GAP`으로 끊음)으로 가른다. 마지막 방문에 같은 `offer_key`가 있으면 단독이 아니고, 방문이 앱별 최근 창(`recent_window`) 밖이면 보류, 전에 선 적 있는 키가 창 안 마지막 방문에서 빠졌고 쿠폰함이 그 뒤 관측이면 내보내기에서 뺀다. 줄은 `노출 판정 [앱]`으로만 찍고 허브 경고 줄에 섞지 않는다. 실측은 `scripts/shadow_count.py`.

**허브 구획 오퍼: 안 보이면 주 중간에도 내린다(`_hub_unseen`, 2026-11-07, tracker #186, #188).** 종료일이 없는 쿠팡이츠 `위클리 슈퍼딜 > 브랜드 할인`, `위클리 슈퍼딜 > 선착순 특가` 오퍼는 수집일 다음 일요일로 추정 만료되어(`estimated_expiry`) 주 중간에 허브에서 내려간 것이 일요일까지 남았다(11-05 16:01 이후 푸라닭 3,500, 왓더버거 3,000, CU 1,000). 정상으로 읽은 최근 허브 회차 D1, D2에 그 브랜드가 둘 다 없고 마지막 관측이 D2보다 앞서면 내보내지 않는다(`HUB_EVERY_ROUND_SECTIONS`, `_hub_unseen_cut`, `_hub_unseen`). 회차가 둘 미만이거나 두 회차가 `HUB_ROUND_APART` 안이면 보류한다. 카드를 절반만 읽는 기기(화면 폭 1440의 V30)의 회차가 기준이 되지 않게 D1, D2 크기가 최근 10회차 중앙값의 80% 미만이면 보류한다. **행사 카드(`EVENT_CARD_SECTIONS`)는 대상이 아니다(2026-11-18 결정, tracker #191).** 읽기가 깨지면 행이 안 쌓여 살아 있는 카드까지 내려가기 때문이다(11-03~05 허브에 랜덤박스가 있는데 행사 카드 행이 0). 읽기 복구(#188) 뒤 쌓인 `이벤트 쿠폰` 행을 보면 행사 카드는 허브에서 깜빡인다. 같은 (브랜드, 금액)이 며칠 안 보이다 다시 나온다: 푸라닭 치킨 7,000원은 11-07~12 매일 보이다 11-13~15 없고 11-16~18 다시 보였다. BHC 7,000원(11-02 → 11-13~15), 굽네치킨&피자 7,000원(11-07~12 없음 → 11-13~15)도 같다. 한 회차는 허브를 다 읽었어도 그날 행사 카드 순환에 안 걸린 것일 수 있어, D1, D2 두 회차 부재로 내리면 살아 있는 행사를 내린다. 시험: `tests/test_export_hub_unseen.py`의 `test_event_cards_and_a_single_good_round_are_left_alone`. 건너뛰기 목록의 브랜드는 새 행이 안 쌓여 이 판정에 걸리지만, 원래 추정 만료가 일요일에 내리던 것이라 노출이 바뀌지는 않았다(11-05부터 export에 없음, `export.json` 이력). 건너뛰기를 "기존 값 유지"로 볼지 "숨기기"로 볼지 의도는 열린 일이다(가드 점검 2026-11-07).

## 4. 판정끼리 부딪칠 때

판정끼리 서로를 호출하지 않고, **우선순위를 정하는 코드는 없다.** 아래 순서는 파이프라인 순서의 결과다. 순서가 바뀌면 결론이 바뀐다.

확인됨(코드를 읽었고 시험이 박는다):

- 허브 대 쿠폰함이 오퍼를 내보내기에서 빼면, 소실 가드는 그 오퍼를 서버에는 있고 들어오는 파일에는 없는 것으로 본다. (브랜드, 앱)이 통째로 빠지면 `vanishing`이 출력만 하고 막지 않는다(`test_upload_guard_does_not_block_dropped_offer`).
- #114: 배민 가게 없음, unread 연속 14일, 2단계 배짱할인 줄로 export에서 빠지는 행도 같은 경로로 소실 가드에 잡힌다.
- **같은 (브랜드, 앱)에 다른 승자 행이 남아 있을 때** 허브 대 쿠폰함이 쿠폰함 행만 빼면, 서버의 쿠폰함 행(`tiers`, `badge` 있음)이 후보 전부 빔으로 읽혀 **상세 소실로 배포가 막힌다.** 들어오는 행이 모두 더 늦은 날 캡처면 갱신으로 통과한다(`test_53_mixed_winner_rows_same_day_block_as_detail_loss`, `test_53_mixed_winner_rows_later_day_pass`).
- 정정은 막음이 아니라 통과라서 `--accept-loss`와 겹치지 않는다. `--accept-loss`는 소실 줄만 거르고 최신성은 못 푼다(`test_53_accept_loss_clears_only_named_brand_detail_loss`).
- 매장 혜택 교차검증은 다른 둘과 직접 부딪치지 않는다. 오퍼를 세우지도 내리지도 않는다. 다만 매장 혜택에서 읽어 쿠폰함 목록에 합친 쿠폰은 빌더가 `section: "쿠폰함 보유쿠폰"`으로 적어 허브 대 쿠폰함에서 쿠폰함 근거로 쳐진다. 허브에 섰던 브랜드면(원장에서 CU, GS25, 이마트24, GS더프레시가 허브 탭 행을 갖는다) 두 회차 연속 허브에 없을 때 내려간다(`test_53_store_benefit_coupon_counts_as_couponbox_and_can_drop`).

확인되지 않음:

- **위 둘째 항목의 막힘이 실제 운영에서 일어났는지.** 시험은 모양만 재현했다. 운영 서버 파일로 돌려 보지 않았다.
- **판정끼리의 우선순위를 정하는 코드는 이 문서가 읽은 파일 밖에 있는지.** 읽은 범위에는 없다.

## 월간쿠폰 노출 종료(`ended_monthly`, 이슈 #157)

**쿠폰함 만료일을 마지막 노출일로 내리는 판정이다. 양성 신호 없이는 안 내린다.** 허브 월간 구성에서 오늘과 직전 구성 둘 다 없는 월간쿠폰을 노출이 끝난 것으로 보고 `expires_at`을 마지막 노출일로 덮는 것이 2026-10-20 사용자 결정이다. 그런데 이 판정은 쿠폰함에 있는, 곧 이 계정이 받은 쿠폰에만 적용되고, 받은 월간쿠폰 카드는 그 계정 허브에서 사라진다(`remember_monthly` 머리말). 그래서 "구성에 없다"만으로는 받아서 사라진 것과 내려간 것을 못 가른다. 2026-11-04에 청년피자, 던킨의 살아 있는 쿠폰(11-30)이 11-03으로 내려가 소실 가드를 막았다.

- 판정 자리: `build_ce_couponbox_records.py`의 `ended_monthly`와 `build`의 `monthly_ended_confirmed` 인자. 이 인자로 넘어온 (브랜드, 금액)만 덮는다. 지금은 아무도 안 넘긴다. 신호를 만드는 일(허브의 종료 표시, 받지 않은 계정에서 확인)은 후속이다.
- 덮지 않은 쌍은 판정을 안 바꾸고 이름만 남긴다: 빌더 로그의 `월간 유지` 줄(5b를 안 올린다), `captures/coupangeats_couponbox_monthly_<날짜>.json`, 보고서 `### 덮어쓰지 않은 월간쿠폰`.
- 쿠폰함 원문의 만료일이 수집일보다 이르면(신호로 덮은 값은 뺀다) 판독 실패로 보고 그 브랜드를 오늘 반영하지 않는다(`past_expiry`, 5b `SUSPECT`, 단계 8이 `partial_ok`로 그 브랜드만 보류). 원장의 직전 값이 그대로 남는다.

## 기계 판독 목록

이 문서가 가리키는 자리다. 이름이 코드에서 바뀌면 이 문서도 같이 고친다. 이 목록은 `tests/test_cross_check_verdicts_doc.py`가 읽는다. 형식(`- \`경로\`: \`이름\``)을 바꾸면 시험도 고친다.

- `check_deploy.py`: `staleness`, `classify_detail`, `_corrected_by_couponbox`, `vanishing`, `format_corrections`
- `scripts/build_ce_couponbox_records.py`: `store_cross_check`, `main`
- `capture/coupangeats_store_benefits.py`: `OK`, `ABSENT`, `merge_status`
- `export_data.py`: `build_export`, `_hub_unseen`, `_hub_unseen_cut`, `HUB_EVERY_ROUND_SECTIONS`
- `observation_paths.py`: `couponbox_residual`, `hub_read_rounds`, `COUPONBOX_SECTION`, `HUB_READ_MIN_BRANDS`, `HUB_ROUND_GAP`, `HUB_ROUND_APART`, `EVENT_CARD_SECTIONS`, `_judge_brand_screen`, `brand_visits`, `BRAND_VISIT_GAP`
- `scripts/deploy_export.py`: `main`
- `tests/test_check_deploy.py`: `test_53_mixed_winner_rows_same_day_block_as_detail_loss`, `test_53_mixed_winner_rows_later_day_pass`, `test_53_accept_loss_clears_only_named_brand_detail_loss`
- `tests/test_ce_couponbox_residual.py`: `test_t8_back_on_hub_revives`, `test_upload_guard_does_not_block_dropped_offer`, `test_53_store_benefit_coupon_counts_as_couponbox_and_can_drop`
- `tests/test_export_hub_unseen.py`: `test_event_cards_and_a_single_good_round_are_left_alone`
