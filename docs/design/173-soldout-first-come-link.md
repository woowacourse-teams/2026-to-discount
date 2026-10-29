# 173. 소진된 배민 선착순 오퍼의 링크

추적 이슈: [#173](https://github.com/woowacourse-teams/2026-to-discount/issues/173)
출처: [#171](https://github.com/woowacourse-teams/2026-to-discount/pull/171)의 후속 조치

## 결론

영역은 API 하나다(`api/`). 웹과 수집기는 바꾸지 않는다.

- 소진 여부를 아는 값은 이미 원장 행에 있다. `OfferRecord.soldOut`(nullable `Boolean`)이고 `Offer.soldOut`(`boolean`)으로 내려간다. 수집기 이슈는 만들지 않는다.
- 소진된 배민 선착순 오퍼는 **오픈 시각과 상관없이 배짱할인 허브 링크**(`BAEMIN_BAEJJANG_HUB_LINK`)로 보낸다. 기본안이다. 열린 질문 1번에 근거와 대안을 적는다.
- 규칙은 `FirstComeLinkFilter.apply` 한 곳에 넣는다. 기존 조건(배민, 선착순, 오퍼 자신의 링크 없음)은 그대로 두고, 오픈 시각 판정만 "소진이 아닐 때"로 좁힌다.
- 소진되지 않은 오퍼의 동작(오픈 전 허브, 오픈 뒤 원래 링크, 시각을 못 읽으면 그대로)은 바뀌지 않는다.

## 배경

현재 필터(`api/.../offer/FirstComeLinkFilter.java`)는 네 조건이 모두 맞을 때만 링크를 허브로 바꾼다. 앱이 배민, `firstCome`, 오퍼 자신의 링크 없음(`link() == null`), 오픈 시각이 지금보다 뒤.

코드에서 확인한 사실

- **소진 값이 있다.** `Offer.from`이 `Boolean.TRUE.equals(r.soldOut())`로 `soldOut`을 채운다(`Offer.java` 67행). `null`과 `false`는 모두 `false`다. 키가 없거나 `null`이면 "소진 아님"으로 읽힌다. 소진을 모르는 것과 소진이 아닌 것이 구분되지 않는다(AGENTS.md "먼저 알 것" 1번). 이 문서는 그 구분을 새로 만들지 않는다. 열린 질문 3번.
- **필터는 칸을 합친 뒤에 돈다.** `BrandComparisonService.compare`가 `mergeSameFirstCome` 다음에 `FirstComeLinkFilter.apply`를 건다(232행). 그래서 필터가 보는 `soldOut`은 합친 오퍼의 값이다.
- **합친 오퍼의 `soldOut`과 `firstCome`의 뜻** (`Offer.withFirstComeTier`)
  - `soldOut`은 상시와 선착순이 **둘 다** 소진일 때만 `true`다(295행).
  - `firstCome`은 선착순 구간이 대표(`firstLeads`)일 때만 `true`다. 선착순이 소진이고 상시가 살아 있으면 상시가 대표라 `firstCome`이 `false`가 되고, 필터는 건드리지 않는다. 상시 오퍼는 브랜드 쿠폰 페이지에 뜨므로 원래 링크 사다리가 맞다.
  - 둘 다 소진이면 `soldOut = true`, `firstCome = false`(`firstLeads`가 `!first.soldOut`을 요구한다). **이 경우 필터는 `firstCome` 조건에서 이미 걸러져 소진 규칙에 닿지 않는다.** 합쳐진 오퍼의 소진은 이 이슈의 규칙 범위 밖이다. 열린 질문 2번.
  - 합치지 않고 선착순 칸 하나로 남은 오퍼(상시가 없는 브랜드)는 `firstCome = true`이고 `soldOut`이 원장 값 그대로다. **이 이슈의 규칙이 닿는 것은 이 경우다.**
- **"링크 없음"은 표현할 수 없다.** 오퍼의 `link`가 `null`이면 웹 `offerLink`가 `brandLinks → 앱 안 브랜드 검색 → hubLinks → 앱 열기` 순으로 떨어진다(`web/src/offerLink.js` 183~192행). 소진 오퍼를 `link = null`로 두는 것은 지금(오픈 뒤 원래 링크)과 같은 동작이다. 따라서 이슈의 두 후보 가운데 "링크 없음"은 코드 변경이 없는 선택이고, 바뀌는 선택은 허브 하나다.

## 변경

### `FirstComeLinkFilter.apply`

```java
public static Offer apply(Offer offer, LocalTime now) {
    if (!"baemin".equals(offer.platform()) || !offer.firstCome() || offer.link() != null) {
        return offer;
    }
    if (offer.soldOut()) {
        return offer.withLink(BAEMIN_BAEJJANG_HUB_LINK);
    }
    LocalTime opens = opensAt(offer.conditions());
    if (opens == null || !now.isBefore(opens)) {
        return offer;
    }
    return offer.withLink(BAEMIN_BAEJJANG_HUB_LINK);
}
```

- 소진 판정은 오픈 시각 판정 앞에 둔다. 소진이면 오픈 시각을 읽지 않는다. 오픈 시각 문구를 못 읽는 소진 오퍼도 허브로 간다.
- 오퍼 자신의 링크(배너 유래)가 있으면 소진이어도 건드리지 않는다. 기존 규칙과 같다.
- 클래스 주석의 "오픈 전 배민 선착순의 링크를 허브로 돌린다"를 "오픈 전이거나 소진된"으로 고치고, 소진 규칙을 한 문단 더한다. 주석에 이 설계(#173)를 가리킨다.
- `Offer.withLink`와 다른 코드는 바꾸지 않는다.

### 바꾸지 않는 것

- `Offer`, `OfferRecord`, `BrandComparisonService`, `Offer.withFirstComeTier`. 칸을 더하지 않는다.
- 웹. 허브 링크는 이미 `offer.link`로 오는 값이라 `offerLink`가 그대로 쓴다.
- 소진 표시 문구. 새 화면 문구는 없다(CHANGE-PROPAGATION 6번 해당 없음).

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 닿는 곳을 짚는다.

| 묶음 | 닿나 | 이유 |
|---|---|---|
| 1. 확실성 판정 | 닿지 않음 | `soldOut`을 읽지만 판정(`OfferComparison`)이 아니라 링크만 바꾼다. 정렬과 "최고" 배지는 그대로다. |
| 2. 배너 모양 | 닿지 않음 | 배너 칸을 바꾸지 않는다. 배너 유래 오퍼는 자기 링크가 있어 필터를 통과한다. |
| 3. 묶음 배너 | 닿지 않음 | 묶음 배너 구성원의 `soldOut`은 `BannerOffers`가 오퍼마다 싣는다(104행). 필터는 오퍼 단위로 돈다. |
| 6. 화면에 나가는 글자 | 닿지 않음 | 문구를 더하지 않는다. |
| 7. 행동 이벤트 | 닿음, 계약은 안 바뀜 | 웹 `offerClickProps`의 `fromBanner`가 `!!offer.link`다. 소진 선착순 오퍼에 허브 링크가 붙으면 `fromBanner`가 `true`로 찍힌다. 오픈 전 허브 링크(#171)가 이미 같은 방식으로 찍히고 있다. 이벤트 이름과 속성 목록은 그대로다. 열린 질문 4번. |
| 8. 배포 순서 | 닿음 | API만 바뀐다. 웹 선행 조건이 없다. 웹은 옛 응답과 새 응답 모두 `offer.link`를 읽는 같은 코드다. |

같은 묶음의 나머지에 대한 판단

- 수집기(tracker)는 넣지 않는다. 소진 값이 이미 원장 행에 있고 API가 읽는다. 소진 값을 채우는 주기와 정확도는 이 이슈 밖이다. 열린 질문 3번.
- `docs/PROJECT-STRUCTURE.md`는 해당 없음. 새 파일이 없다.

## 테스트

기존 `FirstComeLinkFilterTest`에 더한다. 새 파일은 만들지 않는다(`web/package.json`과 `PROJECT-STRUCTURE.md` 변경 없음). 테스트 픽스처 `firstCome(platform, conditions, link)`는 `soldOut(false)`로 고정이라, 소진 값을 받는 오버로드를 더한다.

1. **소진, 오픈 전:** 배민 선착순, `soldOut(true)`, 조건 "오전 10시 오픈 선착순", 09:59 → 링크가 허브.
2. **소진, 오픈 뒤:** 같은 오퍼, 10:00과 15:00 → 링크가 허브. 이 케이스가 이슈 끝 조건이다(Given 소진된 배민 선착순 / When 필터 / Then 정한 링크).
3. **소진, 오픈 시각 문구 없음:** 조건 "선착순" 또는 `null`, 소진 → 링크가 허브.
4. **소진이어도 건드리지 않는 것:** 요기요 소진 선착순은 `null`, 배민 소진 선착순에 `"https://own"` 링크가 있으면 그대로, 선착순이 아닌 배민 소진 오퍼(`section`이 선착순 아님)는 `null`.
5. **소진이 아닌 것(기존 동작):** 기존 네 테스트가 그대로 통과한다. 오픈 전 허브, 오픈 시각부터 `null`, 시각 못 읽으면 `null`, 소진 아닌 `soldOut(null)`도 오픈 뒤 `null`.
6. **통합** (`BrandComparisonServiceTest`, 1174행 근처의 선착순 링크 테스트 옆): 시계를 오픈 뒤로 두고 `soldOut(true)`인 배민 선착순 원장 기록 하나(상시 없음)가 `compare`를 거쳐 응답 오퍼에서 `link()`가 허브인지 본다. 필터가 칸을 합친 뒤에 돈다는 순서를 함께 박는다.
7. **합친 오퍼:** 상시와 선착순이 함께 있고 선착순만 소진이면 대표는 상시라 `firstCome = false`, 링크는 `null`로 남는다. 기존 동작을 박는 테스트다(필터 규칙이 상시를 허브로 보내지 않는다는 증거).
8. **재현 확인:** 소진 분기를 빼면 1~3번이 실패하는지 구현자가 한 번 본다(필터 호출 조건만 바꾸고 테스트가 초록으로 남는 실수를 잡는다).
9. **전체:** `api/gradlew`로 API 테스트 전체가 통과한다.

**확인하지 못한 것:** 이 세션은 앱 화면과 운영 `export.json`을 보지 못했다. 소진된 쿠폰이 허브 화면에 어떻게 보이는지, 운영 원장의 `soldOut`이 선착순 행에서 실제로 `true`로 오는지는 확인하지 않았다. 아래 열린 질문 1, 3번이다.

## 열린 질문

기본안으로 시작할 수 있다. 1번은 권한자 답이 필요하다.

1. **소진 오퍼를 허브로 보내는 것이 맞나?** 기본안은 허브다. 근거: 오픈 전에는 브랜드 페이지에 쿠폰이 없어 허브로 보내기로 했다(#171). 소진 쿠폰도 브랜드 쿠폰 페이지에서 사라질 가능성이 있어 같은 도착 문제가 생긴다(이슈 본문이 같은 우려를 적었다). **확인하지 못한 가정:** 허브 화면이 소진된 쿠폰을 "소진" 표시로 보여 주는지, 아예 빼는지는 보지 못했다. 허브에서도 안 보이면 허브나 원래 링크나 도착이 같아 규칙의 효과가 없다. 대안은 "링크 없음", 곧 코드 변경 없음(지금 동작)이다. 권한자가 허브 화면에서 소진 쿠폰이 보이는지 한 번 봐 주면 확정된다. 안 보이면 이 이슈는 코드 변경 없이 닫는 것이 맞다.
2. **합쳐진 오퍼에서 둘 다 소진이면 어떻게 하나?** 기본안은 이번에 다루지 않는다. 이 경우 `firstCome = false`라 필터가 닿지 않고 원래 사다리로 간다. 상시도 소진이라 도착할 쿠폰이 없는 것은 같은 문제지만, 허브가 상시 쿠폰까지 보여 주는지 모른다. 후속 후보.
3. **`soldOut`이 `null`인 행을 "모름"으로 구분해야 하나?** 기본안은 구분하지 않는다. 현재도 `null`이 `false`로 읽힌다(`Offer.from`). 원장이 선착순 행의 소진을 항상 채우는지는 이 세션에서 확인하지 못했다. 채우지 않으면 소진 규칙은 조용히 안 걸린다. 운영 `export.json`에서 선착순 행의 `soldOut`이 `null`인 비율을 한 번 보는 것을 후속으로 둔다.
4. **소진 오퍼에 허브 링크가 붙어 `fromBanner`로 찍히는 것을 그대로 두나?** 기본안은 그대로 둔다. 오픈 전 허브가 같은 방식으로 이미 찍힌다. 분석 쪽에서 구분이 필요하면 별도 이슈.

## 후속

- 운영 `export.json`에서 배민 선착순 행의 `soldOut` 값 분포를 확인한다(열린 질문 3번). 수집기 이슈가 필요하면 그때 만든다.
- 허브 화면에서 소진 쿠폰이 어떻게 보이는지 확인한다(열린 질문 1번).
