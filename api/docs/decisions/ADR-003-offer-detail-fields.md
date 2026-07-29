# ADR-003. 할인 상세(최소주문금액·구간)를 오퍼에 싣고, 비어 있음도 데이터로 둔다

- 상태: 채택
- 날짜: 2026-07-29

## 맥락

목록에 뜨는 값은 "최대 7,000원 할인" 한 줄뿐이다. 이 문구만으로는 실제로
얼마를 아끼는지 알 수 없다 — 요기요 브랜드 쿠폰은 주문금액 구간별로 할인이
갈리고, "최대 n원"은 가장 높은 구간의 값이다. 즉 **"최대 n원"의 정체는
구간표에 있다.**

그런데 그 구간표는 앱 목록 화면에 없다. 쿠폰 상세를 열어야 보인다. 지금
원장(`log.jsonl`) 107건 중 최소주문금액이 적힌 건은 **0건**이다.

여기서 갈림길이 있었다.

1. 데이터가 없으니 상세 화면도 나중에 만든다
2. 스키마부터 뚫고, 없는 값은 "미확인"으로 드러낸다

## 결정

**2번.** 오퍼에 `minOrderAmount`, `tiers`, `conditions`를 추가하고, 값이 없으면
`null`로 내려보낸다. 화면은 그 자리를 감추지 않고 "미확인"이라고 쓴다.

```java
public record Offer(String platform, Integer amount, String qualifier,
                    OfferStatus status, String rawText, String screenshotPath,
                    String capturedAt,
                    Integer minOrderAmount, List<DiscountTier> tiers, String conditions)

public record DiscountTier(Integer minOrder, Integer amount)
```

API는 이 값을 해석하지 않는다. 원장에 있으면 그대로 흘려보내고, 판단은
화면이 한다. `tiers`가 채워지면 그 중 가장 큰 `amount`가 곧 목록의 "최대 n원"이다.

## 근거

- **비어 있다는 사실이 사용자에게 필요한 정보다.** "최소주문 미확인"은
  "이 앱이 더 싸 보이지만 조건을 확인하고 주문해라"는 뜻이고, 그냥 감추면
  사용자는 조건이 없는 줄 안다.
- **수집이 반영될 자리를 먼저 만든다.** 스키마가 없으면 캡처를 늘려도 넣을
  데가 없다. 반대로 자리가 있으면 원장 한 줄만 채워도 화면에 바로 뜬다
  (API·프론트 재배포 불필요 — `POST /api/reload`).
- **`capturedAt`을 함께 내린다.** 할인 정보는 언제 기준인지가 신뢰의 절반이다.

## 결과

- 원장 스키마(tracker `schema.py`)에 `min_order_amount`, `tiers`,
  `conditions` 추가. 손으로 채우는 값이라 `tiers`는 모양을 검증한다.
- 프론트는 브랜드 카드를 펼쳐 앱별 상세를 보여준다(로고·이름 헤더 또는
  금액 칩을 누르면 펼쳐지고, 마우스가 있는 환경에선 hover로도 열린다).
- 응답 스키마 회귀는 `BrandControllerTest`가 막는다 — 값이 `null`이어도
  키는 있어야 한다.

## 아직 안 한 것

구간 데이터 수집. 앱에서 쿠폰 상세를 하나씩 열어 캡처해야 하고, 그건
[tracker의 수집 계획](../../../delivery-discount-tracker/docs/plans/2026-07-29-offer-detail-collection.md)에서 다룬다.

## 뒤집을 조건

앱마다 조건 구조가 크게 갈려서(예: 특정 메뉴 한정, 시간대 한정) `tiers` 하나로
못 담게 되면, 앱별 서브타입으로 쪼갠다. 지금은 4개 앱 모두 "금액 구간 → 할인액"
한 가지 모양이라 공통 구조로 둔다.
