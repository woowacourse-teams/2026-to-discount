# ADR-030. 제외는 관측이 아니라 판단이다

- 날짜: 2026-09-16
- 상태: 확정
- 관련: [ADR-016](ADR-016-confirmed-beats-recency-on-dedup.md),
  [ADR-020](ADR-020-sweep-is-recorded-not-inferred.md),
  [ADR-028](ADR-028-today-expiry-is-not-an-observed-end-date.md),
  mono `docs/design/28-review-screen.md` §9-3

## 맥락

오퍼를 화면에서 내려야 할 때가 있다. 잘못 읽었거나, 메뉴, 지역 한정이라
비교 대상이 아니거나, **계정별 타겟딜**이라 다른 사람에겐 없는 쿠폰이거나
(2026-09-15 두 계정 대조: 쿠팡이츠 60계치킨, 처갓집, 피자헛, 배스킨라빈스,
반올림피자), 같은 쿠폰이 다른 표기로 또 들어왔거나.

지금까지는 두 가지로 했다.

1. **수집기에서 막는다**: `capture.coupangeats.TARGETED_BRANDS`. 화면에
   표시가 없어 사람이 목록을 유지한다. 새 입구(다른 수집 경로, 검수 화면)가
   생기면 거기서도 또 막아야 한다.
2. **정정 행에 `expires_at`을 어제로 적는다**: `captures/ce_targeted_takedown_*.json`.
   `is_live`가 걸러 내려간다. 그런데 이건 **거짓 관측**이다. ADR-028이 "오늘
   만료"를 관측이 아니라며 비우기로 한 것과 정확히 반대 방향이고, 원장을
   읽는 사람은 "09-14에 끝났다"로 읽는다. 그리고 지속되지 않는다. 다음
   자동 수집이 같은 쿠폰을 보면 더 최신이라 이긴다(ADR-016). 배너에서 같은
   일이 09-15에 났다(사람이 내린 배너를 루틴이 되살림, ROUTINE-SPEC 사례 Z).

원장은 append-only고 판별은 도메인 전환 시점(`store._prefer` →
`export_data.build_export` → API `Offer.preferredOver`)에서 일어난다. 그러니
"내린다"도 **행을 지우거나 값을 꾸미는 게 아니라, 판단 행을 덧붙이고 판별
규칙이 그 판단을 존중하는 것**이어야 한다.

## 결정

1. 스키마에 **`excluded`** 필드를 둔다. 기본 None. 값은
   `{"reason", "note", "by", "at"}`이고 `reason`은 넷 중 하나:

   | reason | 뜻 | 지속 |
   |---|---|---|
   | `misread` | 잘못 읽음 | 아니오, 다음 관측이 정정 |
   | `limited` | 메뉴, 지역, 시간 한정, 비교 대상 아님 | 예 |
   | `targeted` | 계정별 타겟딜 | 예 |
   | `duplicate` | 같은 쿠폰의 다른 표기 | 예 |

   사람 판단이므로 **`capture_mode: manual`에만** 허용한다(schema가 거부).
2. **`store._prefer`가 제외 판단을 확정, 최신 규칙보다 먼저 본다.** 지속형
   제외 행은 **같은 쿠폰**(`_same_coupon`: 금액이 같거나 한쪽이 모름)의
   **이후 자동 관측**을 이긴다. 다른 금액이 오면 다른 쿠폰이라 판단이 안
   미친다. 새 오퍼로 선다. `excluded` 없는 **manual** 행은 이긴다. 그것이
   되살리기다.
3. **`export_data.build_export`는 승자가 제외 행이면 내보내지 않는다.** 그
   (앱, 브랜드)는 화면에서 통째로 빠진다. 원장엔 남는다.
4. 제외 행은 승자 행의 복사본에 `excluded`를 단 것이다(`scripts/exclude_offer.py`).
   증거 화면은 승자 것을 그대로 가리킨다. "무엇을 제외했는가"의 근거다.
   `expires_at`은 건드리지 않는다.
5. 검수 화면(mono 22번)이 생기면 같은 행을 만든다. 수집기의 `TARGETED_BRANDS`는
   당분간 그대로 둔다. 이중 방어이며, 수집기가 막으면 원장에 안 들어와
   판단 행이 필요 없다. 그 목록을 없애도 원장 규칙만으로 같은 결과가 나와야
   한다(테스트 `test_persistent_exclusion_beats_later_auto_observation_of_same_coupon`).

## 결과

- 2026-09-16: 09-15 타겟딜 5건에 `targeted` 제외 행을 넣었다. export는 172건
  그대로(이미 `expires_at` 정정으로 빠져 있었다). 앞으로는 정정 행 방식을
  쓰지 않는다.
- 미니PC `reflect_daily`의 같은 날 보류(`held_by_human`)는 제외 행에도 그대로
  걸린다(manual이므로).
- API는 export.json만 읽으므로 자바 쪽에 규칙을 옮길 것이 없다. 원장을 직접
  읽는 경로가 생기면 그때 `Offer.preferredOver`에 같은 규칙을 둔다.

## 하지 않은 것

- `excluded`를 관측 행(auto)에 허용하는 것. 수집기가 스스로 "타겟딜"이라 판단하게
  두면 화면에 표시가 없는 것을 추측하게 된다. 판단은 사람 것이다.
- 제외 행에서 `amount`를 비우는 것. 비우면 `_is_confirmed`가 거짓이 되어 보류로
  떨어지고 관측 행에 진다. 값은 그대로 두고 필드로 가른다.
