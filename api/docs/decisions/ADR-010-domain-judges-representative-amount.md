# ADR-010. 카드 대표 금액은 도메인이 판정한다

- 날짜: 2026-08-13
- 상태: 확정
- 관련: [ADR-003](ADR-003-offer-detail-fields.md), [ADR-006](ADR-006-dedup-merges-loser-detail.md),
  [ADR-008](ADR-008-drop-expired-offers-at-request-time.md),
  tracker [ADR-019](../../../delivery-discount-tracker/docs/decisions/ADR-019-cumulative-tiers-and-domain-judged-amount.md),
  tracker [ADR-014](../../../delivery-discount-tracker/docs/decisions/ADR-014-coupangeats-record-guaranteed-floor.md)

## 맥락

`OfferRecord.amountAsOf`는 대표 금액을 **내리기만 하고 올리지는 않는다.**
그 근거는 javadoc에 이렇게 적혀 있다.

> 원장의 대표값은 단순한 "가장 큰 구간"이 아니라 "일반 사용자가 실제로
> 받을 수 있는 최대"라서다. 품절 구간에서 안 뽑고, 멤버십 전용 구간에서도
> 안 뽑는다. 그 조건들은 구간에 실려 있지 않아 여기서 다시 만들 수 없다.

즉 "구간에 없는 정보를 사람이 알고 넣었으니 도메인은 손대지 말라"는
규칙이었다. 타당했다 — 그 시점에는.

그런데 tracker [ADR-019](../../../delivery-discount-tracker/docs/decisions/ADR-019-cumulative-tiers-and-domain-judged-amount.md)가
겹쳐 쓰는 쿠폰(`tier_mode: cumulative`)을 도입하면서 전제가 깨졌다.
요기요 굽네치킨은 쿠폰 두 장이 문턱마다 다르게 겹친다.

```
17,000원 이상 → 4,000
25,000원 이상 → 4,000 + 1,250 = 5,250
```

이 값은 구간에서 **계산으로 나온다.** 사람이 손으로 더해 원장에 박는 건
가능하지만, 쿠폰이 두 장이고 정률이 섞이면 산수를 틀린다. 실제로 이 설계를
논의하는 과정에서 한 번 틀렸다(25,000원 문턱을 7,000원으로 오독 —
정률 tier의 `amount`가 상한액인 걸 놓쳤다).

## 판단

**`amountAsOf`가 `tierMode`를 보고 갈라진다.**

- `exclusive` — 지금과 완전히 동일하다. 원장 `amount`를 쓰고, 만료·품절
  구간 때문에 내리기만 한다. 위에 인용한 "올리지 않는다" 규칙 그대로다.
- `cumulative` — 사다리를 계산해 **최저 문턱 값**을 대표로 쓴다.

사다리 계산은 `DiscountLadder`가 전담한다. `OfferRecord`는 이미 만료 판정
(`isExpired`·`liveTiers`·`amountAsOf`)으로 무거워서 여기에 더 얹지 않는다.

**원장 `amount`는 그대로 남는다.** 없애지 않는다 — 원장이 원본 출처라는
축은 유지한다. 대신 tracker 테스트가 "모든 `cumulative` 레코드에서 원장
`amount` == 사다리 최저값"을 검증해 오기입을 잡는다.

## 근거

- **계산으로 나오는 값은 계산하는 쪽이 갖는 게 맞다.** 사람이 더해 넣으면
  틀릴 수 있고, 틀려도 아무도 모른다. 도메인이 계산하면 테스트로 고정된다.
- **"올리지 않는다"의 근거가 `cumulative`에는 적용되지 않는다.** 그 규칙은
  "구간에 안 실린 조건(품절·멤버십)이 있어서 구간만 보고 재계산하면 위험"
  이라는 뜻이었다. `cumulative`는 반대다 — 겹친다는 사실 자체가 `tier_mode`로
  구간에 실려 있어서, 계산에 필요한 정보가 전부 데이터에 있다.
- **`exclusive`를 안 건드려서 기존 170건의 동작이 보존된다.** 이 변경은
  새 갈래를 하나 추가하는 것이지 기존 판정을 바꾸는 게 아니다.
- **두 레이어가 같은 규칙을 갖되 한쪽이 다른 쪽을 검증하는 배치**는
  [ADR-006](ADR-006-dedup-merges-loser-detail.md)/tracker ADR-016이 중복
  정리 규칙에 이미 쓴 패턴이다.

## 결과

- `DiscountTier`에 `cap` 추가, `OfferRecord`에 `tierMode` 추가.
- `DiscountLadder` 신설 — 사다리 계산 전담, 단위 테스트 대상.
- API 응답에 `offer.tierMode`, `offer.tiers[].cap`이 추가된다. 기존 필드는
  하나도 안 바뀐다.
- 만료·품절 구간은 사다리에서도 빠진다 — `liveTiers`를 먼저 거른 뒤 사다리를
  세운다. 두 규칙이 합성되는 자리라 테스트로 고정한다.

## 뒤집을 조건

`cumulative` 계산이 화면에 나가는 금액을 실제와 다르게 만드는 사례가 나오면
— 예를 들어 두 쿠폰이 사실은 중복 사용 불가인데 `cumulative`로 잘못 적혀
있었다면 — 그건 계산의 문제가 아니라 데이터의 문제다. 다만 그런 오기입이
반복되면 `cumulative`를 사람이 지정하는 대신 판독 단계에서 앱 문구
("중복 사용 가능" 등)로 확정하는 절차가 필요해진다.
