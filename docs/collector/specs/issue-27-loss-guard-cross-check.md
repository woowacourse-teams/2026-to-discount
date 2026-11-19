<!-- 원본: tracker docs/specs/issue-27-loss-guard-cross-check.md — 여기서 고치지 않는다 -->
# 설계: 소실 가드가 서버의 잘못된 와우 배지를 정본으로 보지 않게, 쿠폰함 관측과 교차검증 (이슈 #27)

- 상태: 설계 (구현 전)
- 영역: **export** (폰 불필요)
- 읽은 것: `check_deploy.py` 전체(`losing_detail` 72~144행, `staleness` 147~161행), `scripts/deploy_export.py` 221~275행, `tests/test_check_deploy.py` 141~151행, `store.py` 79~87행(membership 주석), `export_data.py` 42~43행, `docs/setup/COLLECTION-INCIDENTS.md` 757~762행, `mono/docs/CHANGE-PROPAGATION.md`, `docs/specs/issue-25-*.md`(형식).

## 1. 지금 코드가 하는 일

- `losing_detail`은 서버 행마다 `DETAIL_FIELDS`(`tiers`, `badge`, `minOrderAmount`, `conditions`, `expiresAt`) 중 채워진 값이 들어오는 후보에서 전부 비면 "소실"로 센다.
- `badge`의 면제는 하나다(138~140행). 서버 배지가 `MEMBERSHIP_BADGES`에 들고 후보 중 하나가 `membership`이 `None`, `"none"`이 아닌 값을 가질 때. "배지가 `membership`으로 자리를 옮겼다"는 뜻이다.
- 이슈의 10-22 16:05 건은 이 면제에 걸리지 않는다. 서버 배지 원문이 `'쿠팡와우 전용쿠폰'`인데 `MEMBERSHIP_BADGES = {"와우회원전용", "배민클럽", "요기패스"}`에 없고, 들어오는 행의 `membership`도 `"none"`이다. 쿠팡이츠 쿠폰함 빌더는 와우 쿠폰에 이 두 원문을 다 쓴다(`tests/capture/test_coupangeats.py` 512행 `쿠팡와우 전용쿠폰`, `tests/test_build_ce_couponbox_records.py` 94행 `와우회원전용`).
- `membership`의 값 의미는 `store.py` 79~87행이 정한다. **`"none"`은 관측이고 `None`은 모름이다.** 쿠폰함 빌더만 `"none"`을 찍고 허브 카드, 브랜드관 목록은 표시가 없어 `None`으로 둔다. 이 설계의 양성 신호가 이 구분 위에 선다.

## 2. 비판: 이슈 요구를 그대로 받으면 안 되는 곳

1. **배지 원문 하나만 `MEMBERSHIP_BADGES`에 더하면 안 된다.** 더하면 "면제 늘리기"다. 면제는 `membership`이 채워진 경우의 이야기이고, 이번 건은 membership이 `"none"`이라 그 면제가 열리지 않는다. 그래서 새 갈래가 필요하다. 다만 새 갈래도 어떤 배지가 "멤버십 주장"인지 알아야 하므로 원문 집합은 필요하다. 이를 `MEMBERSHIP_BADGES`에 `'쿠팡와우 전용쿠폰'`을 더해 쓴다(기존 면제도 같은 배지에서 열려야 일관된다. 던킨 건이 `'와우회원전용'` 원문일 때만 풀린 것은 우연이다). 이것은 기존 갈래의 보정이지 면제 확대가 아니라고 못 박는 시험을 둔다(7번 T6).
2. **모든 배지를 정정 대상으로 넓히지 않는다.** `포장 +1,000` 같은 배지는 멤버십 주장이 아니다. 같은 금액 행이 `membership none`이어도 그 배지가 없는 것과 모순되지 않는다. 멤버십 배지에만 건다.
3. **교차검증은 "membership이 none인 같은 금액 행이 있다"로 충분하다고 보지 않을 수 있는 구멍이 하나 남는다.** 쿠폰함 판독이 와우 표기를 놓쳐 `"none"`으로 찍는 경우(판독 실패)다. 그때는 서버의 와우 배지가 맞고 가드가 막는 게 옳았다. 이 구멍은 조건으로 닫을 수 없다. 이슈가 요구한 대로 **정정의 근거를 출력에 남겨 올린 뒤 사람이 본다**(4번)로 받고, 남는 위험으로 PR 본문에 적는다.

## 3. 결정

### 3.1 판정 규칙

`losing_detail`의 `badge` 분기에 갈래를 하나 더한다. 다음을 **모두** 만족하면 소실이 아니라 정정이다.

1. `field == "badge"`이고 서버 `badge`가 `MEMBERSHIP_BADGES`에 있다.
2. 서버 행에 `amount`가 있다(없으면 같은 금액을 못 가린다. 막는다).
3. 후보(같은 브랜드, 같은 앱의 들어오는 행) 중 `amount`가 서버 행과 같고 `membership == "none"`(문자열 정확히)인 행이 하나 이상 있다.
4. 같은 금액 후보 중 `membership`이 `None`, `"none"` 밖의 값인 행이 없다(있으면 기존 면제가 이미 푼다. 이 갈래를 타지 않는다).

그 밖은 지금처럼 소실이다. 특히 막혀야 하는 경우:

- 같은 금액 후보가 없다. 금액이 다르면 다른 쿠폰이다(`store._same_coupon`의 원칙. 뽑기 구간 때문에 허브 금액은 쿠폰함과 다를 수 있다).
- 같은 금액 후보가 있으나 `membership`이 `None`이거나 키가 없다(허브 행, 모름). `"none"`이 아니다.
- 후보가 허브 행뿐이다. 위와 같다.

판정은 `amount` 필드(대표 금액)로 한다. `tiers` 안 금액까지 맞추지는 않는다. 이번 건의 쿠폰함 행은 단일 금액 행이다. tiers가 있는 서버 행의 와우 배지는 이 갈래에서 막힌 채 둔다(과소 면제 쪽으로 틀린다. 필요하면 후속).

### 3.2 정정 목록을 따로 낸다

지금 `losing_detail`은 문자열 목록만 돌려준다. 정정을 알리려면 같은 순회에서 두 갈래를 나눠 받아야 한다.

- `check_deploy.py`에 `classify_detail(incoming, server) -> tuple[list[str], list[str]]`(소실 줄, 정정 줄)을 두고 지금의 순회 본문을 옮긴다.
- `losing_detail(incoming, server)`는 `classify_detail(...)[0]`을 돌려주는 얇은 껍데기로 남긴다. 호출처(`staleness`, `scripts/deploy_export.py` 39행, `tests/test_check_deploy.py`)의 서명이 그대로다.
- 정정 줄 형식: `꾸브라꼬숯불치킨 / coupangeats: badge '쿠팡와우 전용쿠폰' -> 정정 (서버 5,000원 행 와우 배지 / 들어오는 5,000원 행 membership none, 쿠폰함 관측)`. 브랜드, 앱, 금액, 서버 배지 원문, 들어오는 행의 membership 값이 줄에 다 있어야 한다.

### 3.3 출력에 남긴다

- `scripts/deploy_export.py`: `thin`(251~274행 부근) 다음에 `관측으로 정정되는 오퍼 N건`을 같은 모양으로 찍는다. 미리보기와 `--apply` 모두 찍는다(올린 뒤 로그에서 보려면 apply 쪽에 있어야 한다). 10건 넘으면 `… N건 더`로 줄이되 **건수는 전체**를 찍는다.
- `check_deploy.main`: `사라짐` 출력 옆에 같은 줄을 찍는다.
- `staleness`의 반환(사유 문자열 또는 `None`)은 바꾸지 않는다. 정정은 막지 않으니 반환에 섞지 않는다.

### 3.4 `--accept-loss`는 그대로

`staleness`의 필터(157~158행)는 손대지 않는다. 정정은 `lost`에 들어가지 않으니 필터와 겹치지 않는다.

## 4. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에 `check_deploy`, `losing_detail`, `accept-loss`, 배지 소실을 다룬 줄은 **없다**(grep 0건). 코드에서 직접 쟀다.

| 자리 | 넣는가 | 이유 |
| --- | --- | --- |
| `check_deploy.py` `losing_detail`, `MEMBERSHIP_BADGES` | 넣는다 | 이슈 본문 |
| `scripts/deploy_export.py` 출력 | 넣는다 | 3.3. 근거 출력 요구 |
| `tests/test_check_deploy.py` | 넣는다 | 끝 조건 테스트 |
| `docs/setup/COLLECTION-INCIDENTS.md` | 넣는다 | 757행 던킨 건 옆에 10-22 건과 "정정은 출력 `관측으로 정정되는 오퍼`에서 올린 뒤 본다" 한 항목 |
| `.github/workflows/`의 배포 워크플로 | 확인만 | `deploy_export.py`가 같은 `check_deploy`를 쓴다고 머리말(22행)이 말한다. 워크플로가 `check_deploy.main`을 직접 부르는지 구현자가 읽어 확인한다. **읽지 않았다** |
| `store.MERGEABLE_DETAIL`, API `Offer.withDetailFrom` | 안 넣는다 | 병합 규칙은 그대로다. 이 변경은 업로드 가드의 판정만 건드린다. ADR-016 "글자까지 같아야 한다"는 병합 목록 이야기라 걸리지 않는다 |
| `export_data.py`, 웹, API | 안 넣는다 | 산출물이 안 바뀐다. 가드를 통과하는 방식만 바뀐다 |
| `docs/decisions/ADR-024` | 안 넣는다 | "우회 플래그를 만들지 않는다"는 결정과 충돌하지 않는다. 플래그가 아니라 판정을 고친다 |
| 원장 `data/log.jsonl` | 안 건드린다 | 5번 |

## 5. 원장 append-only

원장을 읽지도 쓰지도 않는다. `check_deploy`는 들어오는 `export.json`과 서버 `export.json` 두 파일만 본다. 서버 쪽 잘못된 와우 배지는 이 설계가 고치지 않는다. 다음 업로드가 서버 행을 새 값으로 덮으면서 자연히 사라진다. 원장 정정은 필요 없다(345323c가 수집 쪽을 이미 고쳤다).

## 6. "없다 / 0 / 통과"의 양성 신호

| 자리 | 조용히 거짓이 되는 때 | 양성 신호 |
| --- | --- | --- |
| 정정으로 통과 | 같은 금액 행이 `membership` 모름(`None`)인데 비와우로 읽고 통과 | 통과의 근거는 **`membership == "none"`을 문자열로 명시 관측한 같은 금액 행**이다. `None`, 키 없음, 빈 문자열은 근거가 아니다. T2가 박는다 |
| 정정으로 통과 | 금액이 다른 행을 같은 쿠폰으로 봄 | 서버 `amount`와 후보 `amount`가 정수로 같을 때만. T3 |
| 정정으로 통과 | 후보가 다른 앱 또는 브랜드 행 | 후보는 기존 `have[key]`(같은 브랜드+앱)에서만 뽑는다. 새 조회를 만들지 않는다 |
| "소실 0건" | 정정으로 센 건이 `0`인지 계산을 안 한 건지 구분 안 됨 | 정정 건수 줄은 0건이어도 찍지 않는 대신, **정정이 있을 때만** 근거 줄과 함께 찍는다. 줄이 없으면 정정이 없었다는 뜻으로 읽힌다. 호출처 시험(T5)이 줄 유무를 본다 |
| 올린 뒤 사람이 본다 | 근거가 숫자뿐이라 판독 실패를 못 가림 | 줄에 서버 금액, 서버 배지 원문, 들어오는 membership 값을 다 적는다(3.2) |

## 7. 테스트 (결론을 박는 곳)

`tests/test_check_deploy.py`에 추가한다(같은 모듈의 `rec` 도우미를 쓸 수 있으면 쓴다). 이름은 구현자가 정한다. 구현 전에 T1, T6이 빨갛게 나오는지 먼저 확인한다.

- **T1 끝 조건 1, 이번 건**: 서버 `꾸브라꼬숯불치킨 / coupangeats` `amount 5000`, `badge '쿠팡와우 전용쿠폰'`. 들어오는 행은 같은 앱 `amount 5000`, `badge None`, `membership "none"`(그리고 4,000원 와우 행을 함께 둔다. 실제 모양이다). `staleness(incoming, server)`가 `None`, `losing_detail`은 `[]`, `classify_detail`의 정정 목록에 그 브랜드와 `5,000`과 `none`이 든다.
- **T2 끝 조건 2, 근거 없음**: 같은 서버 행에 대해 들어오는 행이 (a) `membership` 키 없음, (b) `membership None`, (c) 허브 행뿐이다. 셋 다 `staleness`가 막는다(`is not None`). 사유에 `badge`가 들어 있다.
- **T3 다른 금액**: 들어오는 쿠폰함 행이 `amount 4000`, `membership "none"`뿐이다. 서버 5,000원 와우 배지 행은 계속 막힌다.
- **T4 비멤버십 배지**: 서버 배지 `포장 +1,000`, 들어오는 같은 금액 행 `membership "none"`, 배지 없음. 계속 막힌다(2번 비판 2).
- **T5 출력**: `scripts/deploy_export.py`의 미리보기 출력(`capsys`, 서버 읽기와 업로드는 monkeypatch)에 정정이 있을 때 `관측으로 정정되는 오퍼` 줄과 근거가 찍히고, 없을 때는 그 줄이 없다. 파일, ssh를 가리는 일이 크면 줄 만드는 부분을 `check_deploy`의 함수(`format_corrections`)로 빼 단위 시험으로 대신한다.
- **T6 면제 확대 아님**: 기존 `test_membership_badge_moving_into_the_membership_field_is_not_a_loss`(141행)를 그대로 통과한다. 거기 마지막 단언(membership까지 없으면 진짜 소실)이 새 갈래 때문에 풀리지 않는다는 것을 같은 시험에 `membership "none"`, 금액 없음 케이스로 한 줄 더한다(`amount`가 없어 3.1의 2번에서 막힌다).
- **T7 `--accept-loss`**: 기존 `accept_loss` 시험이 있으면 그대로 통과한다. 새로 쓸 것은 없다.
- 기존 `tests/test_check_deploy.py`, `tests/test_store.py`의 소실 관련 시험이 전부 통과한다.

## 8. 사용자에게 물을 것 (구현 전 확인)

- `MEMBERSHIP_BADGES`에 `'쿠팡와우 전용쿠폰'`을 더하는 데 동의하는가(2번 비판 1). 이 원문이 현행 쿠폰함 빌더가 찍는 배지가 맞는지는 `tests/capture/test_coupangeats.py` 541행에서만 봤고 **실제 빌더 코드는 읽지 않았다**. 구현자가 `capture/`에서 배지 원문 출처를 먼저 확인한다.
- 정정 근거를 출력에만 남기는 것(3.3)으로 충분한가. 판독 실패 위험(2번 비판 3)이 마음에 걸리면 정정 건이 있는 업로드를 `--apply`에서 한 번 더 확인받게 할 수 있으나, 자동 흐름이 멈추므로 기본안은 출력만이다.

## 9. 하지 않는 것

1. 가드를 끄거나 `--accept-loss`를 바꾸는 것.
2. `tiers` 안 금액 교차검증(3.1 끝).
3. 배지가 아닌 다른 `DETAIL_FIELDS`의 정정 판정.
4. 서버 `export.json`의 잘못된 배지를 따로 고치는 일.

## 10. 범위 점검

한 PR에서 리뷰 가능하다: `check_deploy.py` 함수 하나를 둘로 가르고 분기 하나, `deploy_export.py` 출력 몇 줄, 시험 여섯, 사고 기록 한 항목. 폰이 필요 없는 `export`이다.
