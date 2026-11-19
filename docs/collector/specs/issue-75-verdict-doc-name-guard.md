<!-- 원본: tracker docs/specs/issue-75-verdict-doc-name-guard.md — 여기서 고치지 않는다 -->
# 설계: 교차검증 판정 목록 문서가 가리키는 이름이 코드에 있는지 지킨다 (이슈 #75)

- 상태: 설계 (구현 전)
- 영역: **export** (폰 불필요. 시험 파일 하나와 문서 두 줄. 판정 코드는 바꾸지 않는다)
- 읽은 것: 이슈 입력, `docs/setup/CROSS-CHECK-VERDICTS.md` 전체, `docs/specs/issue-53-cross-check-verdict-list.md` 전체(4번 T1, T2와 11번 변경 이력), `docs/workflow/LOCAL-RULES.md`, `AGENTS.md` 33행, `mono/docs/CHANGE-PROPAGATION.md` 9번, `tests/test_doc_claims.py` 머리(`non_gate` 표식 관례). 이름 11개 + 상수 4개의 정의 자리는 grep으로 직접 확인했다.
- **읽지 않은 것**: `docs/HARNESS.md` §11(점검 명령), `pytest.ini` 본문, `scripts/doc_claims.py` 본문. 구현자가 확인한다.

## 1. 이슈를 그대로 받으면 안 되는 곳

1. **"후속 이슈 아직 없음"을 #75로 고치면 틀린다.** 문서 3절의 그 문구는 "판정 줄이 운영 출력에 안 나옴" 결함의 후속을 가리킨다. #75는 이름을 지키는 시험이라 그 결함을 안 닫는다. 이슈 참고 절은 그 결함을 #72가 흡수한다고 적는다. 그대로 #75를 적으면 #75가 닫힐 때 결함 표시를 지워도 되는 줄 안다(조용히 거짓이 되는 자리).
   - 설계: 문구를 `후속 이슈: #72(판정 줄 출력). 이 문서의 이름 목록을 지키는 시험은 #75`로 고친다.
   - **리뷰 포인트:** 요구사항은 "이 이슈 번호로"라고 적었다. #72가 이 결함을 실제로 흡수하는지는 이슈 입력만으로 확인하지 못했다. 사용자가 #75로 원하면 구현자는 문구만 바꾼다. 시험은 영향 없다.
2. **이슈의 "시험 이름"은 기계 판독 목록에 없다.** 요구사항은 "함수, 상수, 시험 이름"을 말하는데, 문서 끝 목록은 함수와 상수 11개뿐이고 본문이 가리키는 시험 이름(`test_t8_back_on_hub_revives`, `test_upload_guard_does_not_block_dropped_offer`, `test_53_*` 넷)은 목록 밖 산문에 있다. 목록만 지키면 시험 이름이 바뀌어도 통과한다. 아래 3번에서 목록을 넓히고, 산문에 새 시험 이름이 생기면 목록에도 넣게 막는다.
3. **목록이 본문보다 좁다.** 문서 표와 본문은 `HUB_ROUND_GAP`, `HUB_ROUND_APART`, `EVENT_CARD_SECTIONS`, `OK`, `build_export`, `main`(두 파일)을 가리키는데 목록에 없다. 목록에 더한다.

## 2. 지키는 범위와 못 지키는 범위 (시험 머리말에 그대로 적는다)

지킨다:

- 목록의 파일이 있다.
- 목록의 이름이 그 파일의 최상위 정의(함수, 클래스, 상수 대입)로 있다.
- 문서 본문 산문에 백틱으로 적힌 `test_` 이름이 모두 목록에 있다(목록 밖 이름이 조용히 안 지켜지는 길을 막는다).
- `AGENTS.md` 문서 표에 이 문서 경로가 있고 그 파일이 있다.

못 지킨다:

- "매장 혜택은 오퍼에 작용하지 않는다", "정정은 통과한다" 같은 **방향 문장.** 이름이 같아도 동작이 바뀌면 문장은 거짓이 된다. 이 문서 2절 "한계"가 이미 적었다.
- 이름은 그대로고 입력이나 조건이 바뀐 경우.
- 산문의 함수, 상수 이름이 목록에 빠진 경우(시험 이름만 산문 대조를 한다. 함수 이름은 `classify_detail`처럼 일반 낱말과 구분되지 않아 정규식으로 짚으면 오탐이 많다. 4번 참고).
- 목록 밖 판정 코드가 새로 생긴 경우("읽은 범위에서 없다"는 주장).

## 3. 시험 설계

새 파일 `tests/test_cross_check_verdicts_doc.py`. `pytestmark = pytest.mark.non_gate`(`tests/test_doc_claims.py`와 같은 관례. 수집 게이트가 아니다).

문서 목록 형식은 지금 그대로다: `- \`경로\`: \`이름\`, \`이름\``. 구현자가 목록을 다음으로 넓힌다.

| 파일 | 이름 |
| --- | --- |
| `check_deploy.py` | 기존 다섯 |
| `scripts/build_ce_couponbox_records.py` | `store_cross_check`, `main` |
| `capture/coupangeats_store_benefits.py` | `OK`, `ABSENT`, `merge_status` |
| `export_data.py` | `couponbox_residual`, `hub_read_rounds`, `build_export`, `COUPONBOX_SECTION`, `HUB_READ_MIN_BRANDS`, `HUB_ROUND_GAP`, `HUB_ROUND_APART`, `EVENT_CARD_SECTIONS` |
| `scripts/deploy_export.py` | `main` |
| `tests/test_check_deploy.py` | `test_53_mixed_winner_rows_same_day_block_as_detail_loss`, `test_53_mixed_winner_rows_later_day_pass`, `test_53_accept_loss_clears_only_named_brand_detail_loss` |
| `tests/test_ce_couponbox_residual.py` | `test_t8_back_on_hub_revives`, `test_upload_guard_does_not_block_dropped_offer`, `test_53_store_benefit_coupon_counts_as_couponbox_and_can_drop` |

`scripts/check_routine.py`의 5b는 함수 이름이 아니라 단계 이름이라 목록에 넣지 않는다(구현자가 5b의 정의 자리를 보고, 이름이 있으면 넣는다).

시험 함수:

- **T1 `test_listed_names_exist_in_code`:** 목록을 읽어 각 파일을 `ast`로 파싱하고 최상위 `FunctionDef`, `AsyncFunctionDef`, `ClassDef`, `Assign`(튜플 대입 포함. `OK, NO_STORE, ... = ...` 꼴이 있다), `AnnAssign`의 이름 집합에 목록 이름이 있는지 본다. 없는 이름을 **모아서 한 번에** `파일: 이름` 줄로 실패 메시지에 낸다(첫 실패에서 멈추지 않음. 이슈의 "어느 이름인지 보임").
- **T2 `test_name_list_is_not_empty_or_truncated`(양성 신호):** 목록 절을 못 찾으면 실패한다. 파싱한 이름이 최소 개수(구현 시점 목록 개수에서 둘을 뺀 값을 상수로 박는다) 미만이면 실패한다. 목록이 지워지거나 형식이 바뀌어 0개를 읽고 "다 있음"으로 통과하는 길을 막는다. 이 프로젝트가 깨지는 방식 그대로다.
- **T3 `test_checker_reports_missing_name`(검사기 자체 시험):** 검사 함수를 `check_names(root, listed) -> list[str]` 꼴로 분리하고, 임시 폴더에 `def a(): ...`, `X, Y = 1, 2`만 있는 파일을 만들어 `["a", "X", "Z"]`를 주면 정확히 `Z`만 돌려주고 파일 이름이 메시지에 든다. 없는 파일을 가리켜도 실패로 돌려준다. 이것이 완료 조건 첫째 칸("이름 하나가 사라지면 실패하고 어느 이름인지 보임")을 지금의 저장소와 무관하게 박는다.
- **T4 `test_prose_test_names_are_listed`:** 목록 절 앞의 본문에서 백틱으로 싼 `test_[a-z0-9_]+` 토큰을 모아 목록의 시험 이름에 다 있는지 본다. 본문에 시험 이름을 더하고 목록을 안 고치면 실패한다. 시험 이름은 접두어 `test_`라는 구조 표지가 있어 산문 파싱 오탐이 거의 없다. 함수, 상수 이름은 이 방식을 안 쓴다(2번 "못 지킨다").
- **T5 `test_agents_md_points_to_doc`:** `AGENTS.md`에 `docs/setup/CROSS-CHECK-VERDICTS.md`가 들어 있고 그 파일이 있다. 링크 글자 모양이 아니라 경로 문자열 포함만 본다(표 문구는 바뀐다).

구현 전에 목록을 넓히기 **전** 상태에서 T1이 통과하고 T4가 실패(`test_t8_back_on_hub_revives` 등이 목록 밖)하는지 먼저 본다. 그리고 목록의 이름 하나를 일부러 바꿔 T1이 그 이름을 보이며 실패하는지 확인하고 되돌린다.

## 4. 문서 수정 (구현자가 한다. 설계자는 `docs/specs/`만 만진다)

- `docs/setup/CROSS-CHECK-VERDICTS.md` 끝 목록을 3번 표로 넓힌다. 목록 머리 문장에 "이 목록은 `tests/test_cross_check_verdicts_doc.py`가 읽는다. 형식(`- \`경로\`: \`이름\``)을 바꾸면 시험도 고친다"를 더한다.
- 3절 후속 문구를 1번 설계대로 고친다. 2절 "한계" 문단 끝에 시험이 못 지키는 것은 시험 머리말에 있다는 가리킴 한 줄을 더한다.
- `AGENTS.md`는 이미 표에 링크가 있다(33행). 고치지 않는다. 150줄 제한을 안 넘긴다.

## 5. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 찾았다.

| 묶음 | 닿는가 | 넣는가 / 이유 |
| --- | --- | --- |
| 1~8 (확실성, 배너, 알림, 글자, 이벤트, 최소주문, 저장소 경계 등) | 안 닿음 | 문서와 시험만 바꾼다. 오퍼 값, 칸 이름, 화면 문구, mono는 안 바뀐다 |
| 9. 새 파일을 더할 때 | **닿음(부분)** | 새 시험 파일 하나. 9번의 항목은 mono 구조 문서, 웹 시험 사슬, beggars-ops 배포 목록, nginx 확장자인데 tracker의 파이썬 시험은 어느 쪽도 아니다. 구조 문서 재생성이 tracker에 따로 있는지 구현자가 `docs/HARNESS.md` §11로 확인한다(**설계자는 읽지 않았다**) |
| 판정 코드(`check_deploy.py` 등) | 안 넣음 | 이름 존재를 읽기만 한다. 코드를 바꾸지 않는다 |
| #53 설계 문서 | 안 넣음 | 설계 기록이다. 4번 T1, T2는 "후속 이슈로 이관"이라고 이미 적혀 있다 |

## 6. "없다 / 0 / 통과"의 양성 신호

| 자리 | 조용히 거짓이 되는 때 | 양성 신호 |
| --- | --- | --- |
| 시험이 "전부 있음"으로 통과 | 목록 절이 사라지거나 형식이 바뀌어 0개를 읽음 | T2: 절 존재와 최소 개수 |
| 시험이 "전부 있음"으로 통과 | 검사기가 이름을 못 찾는 버그로 항상 통과 또는 항상 실패 | T3: 임시 파일로 있는 이름은 통과, 없는 이름은 지목 |
| 목록 밖 시험 이름이 산문에 있음 | 이름이 바뀌어도 아무도 모름 | T4: 산문 시험 이름은 모두 목록에 |
| 이름은 있는데 의미가 바뀜 | `couponbox_residual`이 다른 일을 함 | **못 지킨다.** 2번에 적고 이 설계가 거짓 안심을 만들지 않게 시험 머리말 첫 문단에 쓴다 |

## 7. 원장 append-only

`data/log.jsonl`을 읽지도 쓰지도 않는다. 시험은 소스 파일을 `ast`로 읽기만 한다(실행하지 않는다. 수집 모듈은 import 부작용이 있을 수 있어 import도 하지 않는다).

## 8. 하지 않는 것

1. 판정 코드 수정, 판정 줄 출력 결함 수정(#72).
2. 방향 문장 지키기(이름 존재 시험으로 불가).
3. `AGENTS.md` 줄 수 시험(이슈 요구 밖. #53 T2에 있었으나 이슈 #75는 링크 존재만 요구한다).
4. mono 변경.

## 9. 범위 점검

한 PR에서 리뷰 가능하다: 새 시험 파일 하나(시험 다섯), 문서의 목록과 두세 줄. 영역은 **export**(폰 불필요). 구현자는 `python -m pytest tests/test_cross_check_verdicts_doc.py`와 기존 `tests/test_check_deploy.py`, `tests/test_ce_couponbox_residual.py`를 돌린다.
