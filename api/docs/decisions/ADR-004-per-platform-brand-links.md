# ADR-004. 브랜드 바로가기를 앱 하나(link)에서 앱별 맵(links)으로 바꾼다

- 상태: 채택
- 날짜: 2026-07-29

## 맥락

`Brand.link`는 땡겨요 브랜드 쿠폰 링크 하나만 담는 필드였다(ADR-002).
그런데 배민도 "브랜드 혜택" 탭에서 브랜드별 딥링크(`s.baemin.com/...`)를
제공한다는 게 확인됐고, 실제로 61개 브랜드의 배민 링크를 확보했다.

앱이 둘이 되는 순간 `link: String` 하나로는 표현이 안 된다 — 브랜드 하나가
땡겨요 링크와 배민 링크를 동시에 가질 수 있고, 서로 다른 URL이다.

## 결정

`link: String` → `links: Map<String, String>`(플랫폼 키 -> 링크)로 바꾼다.

```yaml
BBQ:
  category: chicken
  links:
    ddangyo: https://fdofd.ddangyo.com/gateway4.html?Ej2faGu
    baemin: https://s.baemin.com/f3e.6ibml
```

```java
public record Brand(String name, Category category, Map<String, String> links)
```

JSON 응답도 `link` → `links`로 바뀐다(`{"links": {"ddangyo": "...", "baemin": "..."}}`).
없으면 `null`이 아니라 빈 객체 `{}` — "모른다"를 매직값 하나로 표현하지 않는다.

프론트는 오퍼별로 `brandLinks[offer.platform]`을 찾아 그 앱 칩에만 건다
(`OfferChip`). 땡겨요 전용 분기(`offer.platform === 'ddangyo' ? brandLink : ...`)
를 없애고 플랫폼 키로 일반화했다 — 세 번째 앱이 링크를 내놓아도 브랜드
쪽 로직은 안 바뀐다.

## 근거

- **앱이 하나 더 늘 걸 알면서 문자열 하나로 버티는 건 빚이다.** 요기요·
  쿠팡이츠도 링크를 낼 가능성이 있고, 그때마다 필드를 또 추가하느니
  처음부터 맵으로 연다.
- **null보다 빈 맵.** `Brand.unknown()`도 `Map.of()`를 쓴다 — 프론트가
  `brand.links?.[platform]`로 안전하게 접근하고, "링크 없음"과 "브랜드
  자체를 모름"을 굳이 다른 타입으로 안 갈라도 된다.

## 결과

- brands.yml 106개 브랜드 — 기존 73개 중 31개가 배민 링크도 갖게 됨,
  배민에서만 확인된 신규 브랜드 33개 추가(아직 원장에 offer 없음 — 캡처
  전이라 화면엔 안 뜨고, 나중에 export.json에 나타나면 그대로 뜬다).
- `BrandControllerTest`가 `links.ddangyo`와 `links.baemin`이 각각 최소
  한 건 이상 존재함을 못박는다.

## 아직 안 한 것

배민 딥링크 61건 중 원장(export.json)에 실제 offer가 있는 건 28건뿐이다
(나머지 33건은 브랜드 카탈로그에만 있고 화면엔 안 뜬다 — 할인 금액을
캡처해야 카드가 생긴다). 캡처가 늘면 자동으로 채워진다.

## 뒤집을 조건

앱마다 링크 성격이 근본적으로 달라지면(예: 어떤 앱은 브랜드 링크가 아니라
쿠폰함 진입 후 검색이 필요해 딥링크 하나로 못 담으면) `links: Map<String,String>`
으로는 부족해지고 앱별 구조체가 필요해진다. 지금은 4개 앱 모두 "누르면
바로 그 브랜드 쿠폰 페이지" 한 가지 모양이라 맵으로 충분하다.
