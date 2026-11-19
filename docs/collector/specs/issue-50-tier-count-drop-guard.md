<!-- 원본: tracker docs/specs/issue-50-tier-count-drop-guard.md — 여기서 고치지 않는다 -->
# 설계: 업로드 가드가 구간 수 감소를 소실로 본다 (이슈 #50)

- 상태: 설계 (구현 전)
- 영역: **export** (폰 불필요)
- 읽은 것: `check_deploy.py` 전체(`classify_detail` 92~174행), `tests/test_coupangeats_tier_loss_38.py` 48~54행(xfail), `tests/test_check_deploy.py` 142~196행, `scripts/deploy_export.py` 278~286행(호출처), `docs/specs/issue-27-loss-guard-cross-check.md`, `docs/specs/issue-38-*.md` §6 T5, `mono/docs/CHANGE-PROPAGATION.md`.

## 1. 지금 코드가 하는 일

- `DETAIL_FIELDS`에 `tiers`가 있지만 판정은 **전부 비었을 때만** 소실이다(163행 `all(not c.get(field) for c in candidates)`). 서버에 구간 둘, 들어오는 쪽에 구간 하나면 후보의 `tiers`가 채워져 있어 통과한다. 이슈 #38의 xfail 시험이 그 모양이다(서버 5,000원·4,000원, 들어오는 5,000원 하나).
- 같은 (브랜드, 앱) 후보가 여럿일 수 있다(`have[key]`). 쿠팡이츠 쿠폰함 빌더는 구간 하나짜리 행을 금액별로 따로 낼 수 있어, 한 행의 `tiers` 길이만 서버와 견주면 오탐이 난다.
- 면제 틀은 이미 있다. 날짜 면제(130·136행)와 #27의 정정(`_corrected_by_couponbox`, 쿠폰함이 `membership == "none"`을 명시 관측한 같은 금액 행)이다.

## 2. 비판: 이슈 요구를 그대로 받으면 안 되는 곳

1. **"구간 수"를 행 하나의 `len(tiers)`로 재면 오탐이 난다.** 후보가 여럿이거나 구간이 행 금액으로 올라간 경우가 있다. 셈의 단위를 **서버 구간 금액 집합 중 들어오는 쪽에서 안 보이는 금액**으로 둔다. "들어오는 쪽에서 보이는 금액"은 후보 전체의 `tiers[].amount`와 행 `amount`의 합집합이다.
2. **금액이 바뀐 것은 소실이 아니다.** 구간 둘이 (5,000, 4,000)에서 (5,000, 3,500)으로 바뀌면 수는 같다. 쿠폰 조건 갱신이고, 같은 날 갱신을 막으면 8월 또래오래처럼 오탐 가드가 된다(`check_deploy.py` 머리말: 오탐을 뱉는 가드는 꺼진다). 그래서 **보이는 금액 집합의 크기가 서버 구간 금액 집합의 크기보다 작을 때만** 소실로 센다.
3. **정정 면제를 안 두면 #27이 푼 사고가 구간 쪽에서 되살아난다.** 꾸브라꼬는 서버 허브의 5,000원 와우 표기가 틀렸고 쿠폰함이 비와우로 정정했다. 그 정정으로 구간 하나가 사라지는 업로드는 막으면 안 된다(이슈 할 일 둘째 줄).
4. **판독 실패 위험은 남는다.** 쿠폰함이 구간 하나를 못 읽어 `"none"`으로 찍는 경우는 조건으로 못 닫는다. #27 §2-3과 같이 정정 근거를 출력에 남기고 사람이 본다.

## 3. 결정

### 3.1 판정 규칙

`classify_detail`의 서버 행 순회에서 `DETAIL_FIELDS` 루프 **다음**에 구간 검사를 더한다(기존 날짜·만료 면제 뒤라서 그 면제를 그대로 입는다).

1. 서버 행의 `tiers`에서 `amount`가 정수인 구간 금액 집합 `S`를 만든다. `|S| < 2`면 검사하지 않는다(구간이 하나면 기존 `tiers` 검사의 몫).
2. 후보 중 `tiers`가 채워진 행이 하나도 없으면 검사하지 않는다(기존 `tiers` 없음 줄이 이미 막는다. 같은 사고를 두 줄로 내지 않는다).
3. 들어오는 쪽에서 보이는 금액 집합 `V` = 후보 전체의 `tiers[].amount` ∪ 후보 `amount`.
4. `|V| < |S|`이고 `M = S − V`가 비어 있지 않을 때 소실 후보다. 곧 보이는 금액 수가 서버 구간 수보다 적고, 서버 금액 중 빠진 것이 있을 때다.
5. `M`의 금액마다 정정 여부를 가른다. 정정이면 `fixed`에, 아니면 `out`에 한 줄을 넣는다.
   - 정정 조건은 **모두**다. (a) 서버가 그 구간에 멤버십을 주장한다: 구간의 `membership`이 `None`, `"none"` 밖의 값이거나, 구간 금액이 행 `amount`와 같고 서버 `badge`가 `MEMBERSHIP_BADGES`에 있다. (b) 후보 중 `amount`가 같고 `membership == "none"`(문자열)인 행이 있다. (c) 같은 금액 후보 중 `None`, `"none"` 밖 멤버십을 가진 행이 없다.
   - 그 밖은 소실이다. 멤버십 주장이 없는 구간(이슈의 xfail 모양)은 정정 근거가 있을 수 없으므로 소실이다.
6. 줄 형식: 소실은 `꾸브라꼬숯불치킨 / coupangeats: tiers 4,000원 구간 -> 없음 (서버 구간 2개 / 들어오는 1개)`. 정정은 `... tiers 5,000원 구간 -> 정정 (서버 와우 표기 / 들어오는 5,000원 행 membership none, 쿠폰함 관측)`. 앞부분이 `브랜드 / 앱:`이라 `staleness`의 `--accept-loss` 필터(`line.split(" / ")[0]`)가 그대로 먹는다.

`_corrected_by_couponbox`는 `badge` 기준이라 그대로 못 쓴다. 후보 조회 부분만 `_non_wow_row(candidates, amount)`로 뽑아 두 곳이 같이 쓰게 하고, 기존 시험이 그대로 통과하는지 먼저 본다.

### 3.2 출력

- `classify_detail`의 반환 서명은 그대로다. 정정 줄은 기존 `format_corrections`가 `관측으로 정정되는 오퍼 N건`으로 찍는다. `deploy_export.py` 278·286행, `check_deploy.main`은 고치지 않는다.
- `staleness`의 반환과 `--accept-loss` 필터도 그대로다.

## 4. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에 `check_deploy`, `classify_detail`, 업로드 가드, 구간(tiers) 소실을 다룬 줄은 **없다**(1~9번 묶음을 읽고 확인). 코드에서 직접 쟀다.

| 자리 | 넣는가 | 이유 |
| --- | --- | --- |
| `check_deploy.py` `classify_detail` | 넣는다 | 이슈 본문 |
| `tests/test_coupangeats_tier_loss_38.py` | 넣는다 | xfail 표시 제거와 `pytest` 임포트 정리(끝 조건) |
| `tests/test_check_deploy.py` | 넣는다 | 정정 면제 시험 추가(끝 조건) |
| `scripts/deploy_export.py` | 안 넣는다 | 호출 서명이 같고 출력이 `format_corrections`를 거친다 |
| `docs/setup/COLLECTION-INCIDENTS.md` | 넣는다 | #27이 적은 항목 옆에 "구간 수 감소로 막혔을 때: 줄의 `tiers N원 구간`을 보고 쿠폰함에서 실제로 빠졌는지 확인" 한 줄 |
| `.github/workflows/`의 배포 워크플로 | 확인만 | 구현자가 `check_deploy.main`을 직접 부르는지 읽는다. **읽지 않았다** |
| `export_data.py`, `store.py`, 웹, API | 안 넣는다 | 산출물이 안 바뀐다. 업로드 판정만 바뀐다 |
| `docs/decisions/ADR-024` | 안 넣는다 | 우회 플래그를 만들지 않는 결정과 충돌하지 않는다 |
| 원장 `data/log.jsonl` | 안 건드린다 | 5번 |

## 5. 원장 append-only

원장을 읽지도 쓰지도 않는다. `check_deploy`는 들어오는 `export.json`과 서버 `export.json` 두 파일만 본다. 구간이 막혀서 고쳐야 하면 원장 정정은 삭제가 아니라 더 늦은 시각의 새 관측이다(`ingest.py` 머리말). 이 PR은 그 일을 하지 않는다.

## 6. "없다 / 0 / 통과"의 양성 신호

| 자리 | 조용히 거짓이 되는 때 | 양성 신호 |
| --- | --- | --- |
| 구간 소실 "없음"으로 통과 | 후보에 `tiers`가 아예 없어 검사를 건너뛴 것을 "구간 안 줄었다"로 읽음 | 검사를 건너뛰는 조건은 3.1의 1, 2번 둘뿐이고, 2번은 기존 `tiers` 없음 줄이 대신 막는다. T6이 후보 `tiers` 없음에서 여전히 막히는지 본다 |
| 정정으로 통과 | 쿠폰함 판독 실패로 `"none"`이 찍힘 | 근거는 `membership == "none"` 문자열 + 같은 금액 + 서버의 멤버십 주장, 셋이 같이 있을 때뿐이다. `None`, 키 없음은 근거가 아니다. T3, T4 |
| 정정으로 통과 | 줄에 근거가 안 남음 | 정정 줄에 금액, 서버 표기, 들어오는 membership 값이 다 있다. 정정이 있을 때만 `관측으로 정정되는 오퍼` 줄이 찍히고, 없으면 줄이 없다(기존 `format_corrections`) |
| 보이는 금액 집합 | 행 `amount`를 합집합에 안 넣어 쿠폰함이 금액별로 행을 나눈 정상 업로드를 막음 | T5가 "구간 둘이 두 행으로 나뉘어 들어옴"이 통과하는지 본다 |

## 7. 테스트 (결론을 박는 곳)

`tests/test_check_deploy.py`에 `_ce`와 같은 도우미 모양으로 추가한다. 이름은 구현자가 정한다. 구현 전에 T1, T2가 빨갛게 나오는지 먼저 확인한다.

- **T1 끝 조건 1**: `tests/test_coupangeats_tier_loss_38.py`의 `test_deploy_guard_flags_tier_count_drop`에서 `@pytest.mark.xfail`을 떼고 통과시킨다. 소실 줄에 `4,000`이 든다는 단언을 더한다. 안 쓰게 되는 `import pytest`는 같은 파일에서 쓰는 곳이 없을 때만 뺀다.
- **T2 `staleness` 경유**: T1과 같은 입력에서 `staleness`가 `None`이 아니고 사유에 `tiers`가 든다. 같은 입력에 `accept_loss={"꾸브라꼬숯불치킨"}`을 주면 통과한다(필터가 새 줄에도 먹는다).
- **T3 정정 면제 (끝 조건 2)**: 서버 `amount 5000`, `badge '쿠팡와우 전용쿠폰'`, `tiers [{5000}, {4000, membership coupangEats}]`. 들어오는 행은 `amount 5000 membership "none"`(구간 하나)와 `4000 coupangEats`. 소실 `[]`, 정정 줄에 `5,000`과 `none`.
- **T4 근거 없는 정정은 막힌다**: T3에서 들어오는 5,000원 행의 `membership`을 (a) 키 없음 (b) `None`으로 바꾸고, 4,000원 행은 지운다. 둘 다 소실.
- **T5 행 분할은 통과**: 서버 구간 (5,000, 4,000). 들어오는 쪽이 `amount 5000` 행과 `amount 4000` 행 둘, 둘 다 `tiers` 없음이 아니라 각자 구간 하나. 소실 `[]`.
- **T6 금액 교체는 통과, 후보 `tiers` 없음은 기존대로 막힘**: 서버 (5,000, 4,000)에 들어오는 (5,000, 3,500)은 통과. 들어오는 후보에 `tiers`가 아예 없으면 기존 `tiers` 없음 줄 한 개만 나오고 새 줄은 안 나온다(중복 줄 없음).
- **T7 날짜 면제 유지**: 들어오는 캡처가 더 늦은 날이면 구간이 줄어도 통과, 서버 구간이 어제 만료이면 통과. 기존 시험(`test_newer_capture_may_replace_an_expired_coupon`, 또래오래 건)이 그대로 통과한다.
- 기존 `tests/test_check_deploy.py`, `tests/test_coupangeats_tier_loss_38.py`, `tests/test_ce_fixed_tier_merge.py`가 전부 통과한다.

## 8. 사용자에게 물을 것 (구현 전 확인)

- "구간 수"를 금액 집합 크기로 재는 데 동의하는가(2번 비판 1, 2). 행 길이로 재면 쿠폰함 행 분할에서 오탐이 난다. **실제 쿠폰함 빌더가 구간을 행으로 나누는지는 읽지 않았다**(`build_ce_couponbox_records`). 구현자가 먼저 확인한다.
- 같은 날 금액 교체(수는 같음)는 통과시키는 것이 맞는가.

## 9. 하지 않는 것

1. 가드를 끄거나 `--accept-loss` 동작을 바꾸는 것.
2. `tiers` 안의 `minOrder`, `note`, `expiresAt` 변화 판정.
3. `export_data.py`의 구간 병합 규칙(#56)과 `store.py` 병합.
4. 서버 `export.json`을 고치는 일.

## 변경 이력

- 2026-10-29 (`/approve-design` 앞 사용자 결정이 이긴다): 서버 구간 금액 중 들어오는 쪽에서 안 보이는 것이 하나라도 있으면 막는다.
  - 3.1 4번의 `|V| < |S|` 조건을 뺐다. 금액 교체(5,000/4,000 -> 5,000/3,500)도 막는다. T6의 "금액 교체는 통과"는 "막힌다"로 바뀐다.
  - 3.1 5번의 정정 면제(a~c)와 `_non_wow_row` 추출, 정정 줄을 뺐다. 자동으로 푸는 기준은 만료일(기존 날짜 면제)뿐이고 그 밖은 사람이 푼다. T3은 "정정 면제 없음"으로, T4는 T3에 흡수된다.
  - 그대로인 것: `|S| < 2` 건너뜀, 후보 `tiers` 없음 건너뜀(중복 줄 방지), 행 금액을 보이는 금액에 넣는 것(행 분할 통과).
  - 소실이 아닌 것을 소실이 아닌 것으로 표현하는 방법이 나오면 그때 고친다(사용자).

## 10. 범위 점검

한 PR에서 리뷰 가능하다: `classify_detail`에 분기 하나와 도우미 하나, 시험 일곱, 사고 기록 한 줄. 폰이 필요 없는 `export`이다.
