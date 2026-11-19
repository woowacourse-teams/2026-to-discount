<!-- 원본: tracker docs/specs/issue-43-export-qualifiers-field.md — 여기서 고치지 않는다 -->
# 이슈 #43: 내보내기에 qualifiers(구조화 조건) 싣기

- 영역: `export` (폰이 필요 없다)
- 읽은 것: 이슈 입력과 nn98 댓글(2026-10-23), `export_data.py`(`FIELDS`, `build_export`), `store.py`(`MERGEABLE_DETAIL`, `_prefer`, `_same_coupon`), `schema.py`(기본값 표), `check_deploy.py`(`DETAIL_FIELDS`), `tests/test_export_fields.py`, `scripts/build_ce_couponbox_records.py`, `data/log.jsonl`, mono `docs/design/155-offer-qualifiers-field.md`, `mono/docs/CHANGE-PROPAGATION.md`, `docs/workflow/LOCAL-RULES.md`.
- 읽지 못한 것: mono `Offer.withDetailFrom` 코드 본체. mono 설계 155의 "중복 합치기" 절을 근거로 쓴다. 구현자가 코드로 다시 확인한다.

## 1. 먼저 걸리는 것: 원장에 qualifiers 행이 없다

이슈 본문은 "원장 행의 `qualifiers`"가 있다고 전제한다. 확인한 결과는 다르다.

- `data/log.jsonl`에서 `"qualifiers"` 키를 가진 행이 **0건**이다(`grep -c '"qualifiers"' data/log.jsonl` → 0).
- `qualifiers`는 수집기 안의 쿠폰 사전(`capture/coupangeats_couponbox.py:205`, `capture/coupangeats_store_benefits.py:53`)에만 있다. 빌더(`scripts/build_ce_couponbox_records.py`)가 이것을 원장 행으로 옮길 때 `tiers[].note`와 `conditions`(236행)로 풀어 쓰고, `qualifiers` 키는 적지 않는다.
- 그래서 이 이슈만 구현하면 **운영 export에 `qualifiers`가 한 건도 실리지 않는다.** 테스트는 초록이고 끝 조건 둘째 줄("API 응답에 값이 오는 것 확인")은 영원히 못 채운다. `AGENTS.md`가 말한 "없다를 관측으로 읽는" 꼴이다.

결정(설계자 권고, 권한자가 뒤집을 수 있다):

1. 이 PR(`export`)은 이슈 범위대로 **원장에 값이 있으면 싣는 통로**만 만든다.
2. 원장에 값을 쓰는 쪽은 **별도 이슈**로 나눈다(후속 조치). 거기서 정할 것: 어느 빌더가 어떤 문구를 `qualifiers`로 적을지, 이미 `conditions`에 풀어 쓰는 "첫 주문"을 옮길지 복제할지. 영역은 빌더가 `scripts/`라 폰이 필요 없으면 `export`, 수집기(`capture/`)를 건드리면 `collect`다.
3. 이 PR의 끝 조건은 "통로 테스트 통과"로 하고, "운영 API 응답 확인"은 후속 이슈의 끝 조건으로 옮긴다. PR 본문에 미확인으로 적는다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 `export_data`, `qualifiers`, `conditions`를 찾았지만 **일치하는 줄이 없다**(grep 0건). 표에 없다고 번지지 않는 것은 아니라서, 코드를 따라 번지는 자리를 직접 쟀다.

| 자리 | 이번에 넣나 | 이유 |
|---|---|---|
| `export_data.build_export`(내보내기 칸 추가) | 넣는다 | 본 작업 |
| `store.MERGEABLE_DETAIL`(병합 목록) | 넣는다 | 이슈 둘째 할 일, nn98 댓글. 3번 참고 |
| mono `OfferRecord`, `Offer.withDetailFrom`, `contracts/offer-cases.json`의 `exportKeys` | 안 넣는다 | mono는 읽기용 체크아웃이고 설계 155(#155)가 맡았다. 설계 155는 `exportKeys`에 `qualifiers`를 더한다. `_contract_allows`가 이 파일을 읽는 방식과 같은 선례가 있어(`firstSeenAt`) 4번에서 다룬다 |
| `weekly_check.export_drift` | 코드는 안 건드린다 | 원장 재생성과 커밋된 export를 키 합집합으로 견주므로 새 칸도 자동으로 견진다. 시험으로 박는다(5번 T5) |
| `check_deploy.DETAIL_FIELDS`(상세 소실 가드) | 안 넣는다 | 이 가드는 서버 값이 있다가 사라지면 막는다. `qualifiers`가 원장에 안 쓰이는 지금은 서버에도 값이 없어 걸릴 것이 없다. 후속 이슈에서 원장이 값을 쓰기 시작하면 그때 넣을지 정한다(그 이슈의 끝 조건에 적는다) |
| `schema.py` 기본값 표 | 안 넣는다 | 기본값을 만들면 "없으면 키를 뺌"이 깨진다. 정규화가 이 칸을 새로 만들지 않는다는 것을 시험으로 박는다(T3) |
| `drop_high_min_order`, `camel_tiers` | 안 건드린다 | `{**item}` 복사라 키가 따라간다. T4가 확인한다 |
| `apply_first_seen`, `_seen_key` | 안 건드린다 | 칸 하나가 더 느는 것이 신규 판정에 닿지 않는다 |
| 웹 `chipsOf`, mono `offerContract.test.js` | 안 넣는다 | 웹은 #155 이후 별도 PR |

## 3. 변경

### 3-1. 싣기 (`export_data.build_export`)

`FIELDS` 표에 넣지 않는다. 표는 `{camel: record.get(snake)}`로 **키를 항상 만들고 값이 없으면 `None`을 싣는다.** 이슈는 "없으면 키를 뺌(`null`을 새로 만들지 않음)"이라 이 길은 맞지 않는다.

`item = {...}`를 만든 직후(553행 부근)에 한 자리를 더한다.

```python
# 원장의 구조화 조건. 있을 때만 싣는다(null을 새로 만들지 않는다). FIELDS 표는 None도 키로 만들어 못 쓴다.
if record.get("qualifiers") is not None:
    item["qualifiers"] = record["qualifiers"]
```

- **그대로 싣는다.** 복사, 정규화, 중복 제거, 정렬을 하지 않는다. mono 설계 155가 같은 규칙이다(ADR-003: 판단은 화면 몫).
- 빈 목록 `[]`은 **값으로 취급해 싣는다.** `None`(미관측)과 `[]`(읽었는데 조건 없음)은 다르다. 빈 목록을 키 없음으로 바꾸면 이 구분을 지운다. 웹이 `[]`을 어떻게 읽는지는 확인하지 못했다(리뷰 질문 1).
- 모양 검증은 하지 않는다(문자열 배열이 아니어도 막지 않는다). 모양이 틀린 원장은 mono가 읽기에서 크게 실패한다(설계 155 6번). 여기서 조용히 고치지 않는다.

### 3-2. 병합 (`store.MERGEABLE_DETAIL`)

`MERGEABLE_DETAIL`에 `"qualifiers"`를 더한다: `("min_order_amount", "tiers", "conditions", "membership", "qualifiers")`.

규칙은 `store._prefer`의 기존 루프 그대로다: **승자 값이 `None`이고 패자 값이 `None`이 아니며 `_same_coupon`(금액이 같음)일 때만 패자 값을 옮긴다.** 승자 값이 있으면(빈 목록 포함) 승자가 이긴다.

nn98 댓글이 요구한 대조 결과(설계 155 "중복 합치기" 절 기준):

| 상황 | tracker `_prefer`(더한 뒤) | mono `withDetailFrom`(설계 155) |
|---|---|---|
| 승자 있음 | 승자 값 | 승자 값 |
| 승자 `None`, 패자 있음, 금액 같음 | 패자 값 | 패자 값 |
| 승자 `None`, 패자 있음, 금액 다름 | `None` | `null` |
| 승자 `[]`, 패자 `["첫 주문"]` | `[]` | `[]` (null만 채움) |

네 줄이 같다. 같은 규칙이라는 결론은 mono 설계 문서 기준이다. mono 코드 본체는 읽지 못했으므로 구현자가 `Offer.withDetailFrom`의 실제 코드를 읽고 같은지 확인하고, 다르면 PR에 적고 mono 이슈로 올린다(`mono`는 읽기용이라 이 PR에서 못 고친다).

`store.py` 92행 주석("API의 `Offer.withDetailFrom`과 글자까지 같아야 한다")이 있는 자리에 `qualifiers` 한 줄을 더한다. 주석만으로 끝내지 않고 T6이 맞물림을 박는다.

## 4. 계약 파일과 배포 순서

`export_data._contract_allows`는 mono `contracts/offer-cases.json`의 `exportKeys`를 읽어 `firstSeenAt`를 싣는다. `qualifiers`는 같은 길을 **따르지 않는다.**

- 이유: 설계 155가 `exportKeys`에 `qualifiers`를 더하는 것은 "tracker가 싣기 시작해도 막히지 않고, 안 실어도 막히지 않는다"를 위해서다. API는 모르는 키를 무시한다(`FAIL_ON_UNKNOWN_PROPERTIES` 꺼짐). 그래서 API보다 tracker가 먼저 나가도 깨지지 않는다.
- 값이 없으면 키가 없으니 mono가 없는 CI에서도 export는 달라지지 않는다.
- 다만 `firstSeenAt`처럼 계약에 있을 때만 싣는 방어를 걸지는 않는다. 걸면 mono 체크아웃이 없는 곳에서 통로가 조용히 꺼져 T1이 환경에 따라 달라진다.

순서: tracker(이 PR)와 API(#155) 중 어느 쪽이 먼저 나가도 된다. 웹이 `qualifiers`를 읽는 것은 둘 뒤다.

## 5. 관측과 미관측 (양성 신호)

이 변경이 "없다"를 내는 자리는 둘이다.

1. **키 없음 = 원장에 `qualifiers` 칸이 없음.** 이것은 "조건이 없다"가 아니라 "원장이 아직 그 칸을 안 쓴다"일 수 있다. 1번에서 보았듯 지금은 전부 그렇다. 그래서 후속 이슈 전에는 키 없음을 "조건 없음"으로 읽지 않는다. 양성 신호는 **`[]`이다** — 칸이 있고 비었다면 읽고 비었다는 뜻이라 키 없음과 구분해 싣는다(3-1).
2. **병합이 `None`일 때만 채움.** `[]`은 관측이라 옛 값으로 덮지 않는다(`min_order_amount`의 `0`과 같은 규칙, `tests/test_min_order_none.py:39`).

**수 대신 내용을 읽는다.** 구현자는 PR 전에 합성 원장 하나로 `build_export`를 돌려 출력 항목의 `qualifiers` 값을 눈으로 확인한다. "테스트 통과"만으로 끝내지 않는다.

## 6. 결론을 박을 테스트

새 파일 `tests/test_export_qualifiers.py`. `tests/test_export_fields.py`의 `_rec()` 모양과 날짜 고정(`DAY`)을 따른다. 시험은 `data/sweeps.jsonl`과 끊는다(10-08 CI 실패 선례).

| 번호 | 시험 | 박는 결론 |
|---|---|---|
| T1 | 원장 행에 `qualifiers: ["첫 주문"]` → `build_export` 항목의 `qualifiers == ["첫 주문"]` | 있으면 그대로 실린다(끝 조건 첫째) |
| T2 | 키 없는 행 → `"qualifiers" not in item` | `null`을 새로 만들지 않는다(끝 조건 둘째). `item.get("qualifiers") is None`으로 쓰면 키가 `None`으로 실려도 통과하므로 **`not in`으로 쓴다** |
| T3 | 같은 행을 `schema` 정규화에 통과시켜도 `qualifiers` 키가 생기지 않음 | 정규화가 기본값을 채워 T2를 깨지 않는다 |
| T4 | `qualifiers: []` → 항목에 `[]`로 실린다. 구간 있는 행과 `drop_high_min_order`를 거친 행도 값이 유지된다 | 빈 목록은 값이고, 후처리가 복사하며 잃지 않는다 |
| T5 | `weekly_check.export_drift`: 같은 원장으로 만든 커밋된 export와 대조해 `[]`. `qualifiers`만 바꾸면 그 칸이 드리프트로 잡힌다 | 새 칸이 원장 칸으로 대조에 들어간다(상태 칸이 아님). `tests/test_export_fields.py`와 맞물린다 |
| T6 | 병합 4경우: 승자 있음 / 승자 `None`, 패자 있음, 금액 같음 / 금액 다름 / 승자 `[]`, 패자 값 있음 | 3-2의 표. mono 설계 155의 `withDetailFrom` 시험과 같은 케이스 이름을 쓴다 |
| T7 | `MERGEABLE_DETAIL`에 `qualifiers`가 있고, 그 목록이 `store._prefer`에서 실제로 쓰이는지(T6이 간접으로 본다) | 목록만 고치고 루프를 안 타는 회귀를 막는다 |

모든 시험은 합성 픽스처다(운영 원장 행을 복사하지 않는다).

## 7. 원장 append-only

원장(`data/log.jsonl`)을 **읽기만 한다.** 이 변경은 원장 행을 쓰거나 고치거나 지우지 않는다. 정규화(T3)가 새 키를 만들지 않으므로 기존 행이 다시 쓰일 때도 모양이 늘지 않는다. 원장에 `qualifiers`를 쓰는 일은 후속 이슈의 몫이고, 거기서도 정정은 더 늦은 시각의 새 관측으로 한다.

## 8. 하지 않는 것

- 원장에 `qualifiers`를 쓰는 빌더 변경(후속 이슈).
- `conditions`에서 "첫 주문"을 걷어내는 일. 웹이 `qualifiers`를 읽는 것이 운영에서 확인된 뒤 다른 변경으로 한다(mono 설계 155 8번).
- `check_deploy.DETAIL_FIELDS`에 `qualifiers` 추가(2번 표).
- 값 검증, 정규화, 순서 정렬.

## 9. 리뷰 질문

1. 빈 목록 `[]`을 키 없음으로 접지 않고 `[]`로 싣는 것에 동의하는가? 웹이 `[]`을 `null`과 같게 읽는지는 **확인하지 못했다.**
2. 원장이 값을 쓰지 않는 상태에서 이 PR을 먼저 병합해도 되는가? 값이 안 실려 운영은 그대로이고 끝 조건의 운영 확인은 후속 이슈로 옮긴다.
3. `MERGEABLE_DETAIL`에 더하는 것이 `[]`과 옛 값의 병합에서 mono와 같은가? mono 코드 본체는 읽지 못했다.

## 10. 후속 조치

- 원장에 qualifiers 쓰기: 쿠팡이츠 쿠폰함 빌더(`scripts/build_ce_couponbox_records.py`)가 쿠폰의 `qualifiers`를 원장 행의 `qualifiers`로 적는다. 와우회원전용 처리와 `conditions`에 풀어 쓰는 "첫 주문"의 중복 여부를 정한다. 끝 조건: 합성 쿠폰으로 빌더 시험이 `qualifiers`를 확인하고, 병합 뒤 운영 API 응답에 값이 오는 것을 서버 조회로 기록한다. `check_deploy.DETAIL_FIELDS` 추가 여부도 이 이슈에서 정한다.
