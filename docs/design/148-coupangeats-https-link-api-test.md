# 148. 쿠팡이츠 https 링크가 API 응답까지 그대로 나가는지 테스트로 고정

추적 이슈: [#148](https://github.com/woowacourse-teams/2026-to-discount/issues/148)

## 결론

`BrandComparisonServiceTest`에 테스트를 더한다. 원장 쿠팡이츠 오퍼의 `link`가 `https://share.coupangeats.com/…`이면 `compare()` 결과의 오퍼 `link`가 같은 문자열인지, `fromBanner`가 거짓인지 본다. `coupangeats://` 링크도 같은 테스트에서 함께 본다. API 코드는 바꾸지 않는다.

[설계 141](141-coupangeats-human-link.md)의 "API 테스트" 항목이 구현에서 빠져서 따로 낸 이슈다. 내용은 141과 같고, 이번에는 이 테스트만 다룬다.

## 배경

웹 `offerLink`는 오퍼 `link`가 `coupangeats://` 또는 `https://share.coupangeats.com/`로 시작하면 그대로 쓴다. 웹이 그 링크를 받으려면 API가 `OfferRecord.link`를 바꾸거나 버리지 않고 응답까지 실어야 한다.

확인한 것:

- `Offer.from(record)`가 `r.link()`를 그대로 `Offer`로 옮긴다(`Offer.java:65`). 형식 검사 코드는 찾지 못했다.
- 같은 앱 오퍼 병합에서도 `link`는 이긴 쪽 값을 유지한다(`Offer.java:183~188`).
- 지금 `link`를 확인하는 테스트는 `https://example.test/…` 값을 쓰는 배너 오퍼 경로(`BrandComparisonServiceTest.java:942`, `:967`)와 `OfferConvergenceTest`뿐이다. 원장 쿠팡이츠 오퍼에 쿠팡이츠 주소를 싣는 테스트는 없다.
- `OfferRecord.Builder`에 `link(String)`이 있다(`OfferRecord.java:108`). 테스트 헬퍼 `rec(...)`(`BrandComparisonServiceTest.java:103`)는 `link`를 받지 않는다.

## 변경

`api/src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java`에 테스트 하나를 더한다. 위치는 `bannerOfferCarriesItsOwnLinkAndLeavesBrandLinksAlone`(925행) 앞이다. 기존 헬퍼와 import로 충분해서 새 import와 새 파일은 없다.

```java
@Test
void coupangeatsLedgerOfferLinkReachesTheResponseAsIs() {
    // 웹 offerLink가 쿠팡이츠 사람 링크를 그대로 쓴다. API가 link를 바꾸거나
    // 버리면 웹은 허브 링크로 내려가고 화면에서는 티가 나지 않는다.
    String brands = """
            brands:
              청년피자:
                category: pizza
            """;
    for (String link : List.of("https://share.coupangeats.com/test", "coupangeats://test")) {
        OfferRecord record = OfferRecord.builder("coupangeats", "청년피자")
                .amount(10000)
                .offerType("discount")
                .rawText("10000원")
                .capturedAt("2026-07-27T14:20:00+09:00")
                .screenshotPath("path.jpg")
                .soldOut(false)
                .link(link)
                .build();
        Offer offer = serviceWith(List.of(record), brands).compare().get(0).offers().get(0);
        assertEquals(link, offer.link());
        assertNotEquals(Boolean.TRUE, offer.fromBanner());
    }
}
```

- 링크는 실제 서비스 주소가 아니라 `/test` 같은 임의 값이다.
- `fromBanner`를 함께 보는 이유: 웹이 이 칸으로 원장 오퍼와 배너 오퍼를 가른다(설계 141). 배너 경로로 잘못 세워진 오퍼는 같은 링크여도 웹에서 허브 링크로 바뀐다. `fromBanner`의 타입(`Boolean`인지 `boolean`인지)은 `Offer.java:31`을 보고 `assertFalse`나 `assertNotEquals` 중 맞는 쪽으로 쓴다.
- `serviceWith(records, yaml)`(49행)은 시계를 `FIXED_TODAY`로 두고 배너를 비운다. 이 오퍼는 배너 없이 원장에서만 선다.
- 응답 JSON 직렬화는 이 테스트 범위 밖이다. 오퍼 `link`는 Jackson이 필드 이름 그대로 내보내는 레코드 칸이고, 이슈 범위는 비교 서비스 테스트다. 컨트롤러 계층 확인이 필요하면 `BrandControllerTest`를 따로 보는 별도 이슈로 한다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에 오퍼 `link` 전용 묶음은 없다. 가까운 묶음만 짚는다.

- 2번(배너 모양)과 3번(묶음 배너): 배너 `url`이 오퍼 `link`로 흐르는 길이다. 이번에 배너 코드와 `BannerOffers`를 바꾸지 않는다. 테스트는 배너 없는 원장 경로만 본다.
- 8번(배포 순서): 테스트만 더하고 운영 코드가 같아서 배포 순서 제약이 없다.
- 6번(화면 글자), 9번(새 파일): 새 문구와 새 파일이 없다.
- 웹과의 짝: 웹 쪽 접두사 규칙은 `offerLink.js`에 있고 이 테스트는 그 입력 쪽(API 응답)을 지킨다. 웹 코드와 테스트는 이번에 건드리지 않는다.
- 결론: 같이 고칠 자리가 없다.

## 구현자에게

- 만지는 경로는 `api/src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java` 하나다. API 구현자 역할이다. `api/src/main`은 바꾸지 않는다. 테스트가 실패하면 원인을 이슈에 남기고 멈춘다.
- 테스트가 실제로 보는지 증명한다. `Offer.java:65`의 `r.link()`를 임시로 `null`로 바꿔 새 테스트가 실패하는 것을 본다. 한 번 더 `r.link()`를 `"https://example.test/x"` 같은 고정값으로 바꿔도 실패하는지 본다. 되돌린 뒤 `api/src/main`에 diff가 없어야 한다.
- 웹이 아니므로 프리뷰 절차는 해당 없다. main에 직접 커밋하지 않는다.

## 검증

- API 테스트가 통과한다(`docs/WORKFLOW.md` §5의 명령). 새 테스트 이름이 출력에 보인다.
- `git diff --stat`에 `BrandComparisonServiceTest.java`만 나온다.
- `Offer.java:65`를 임시로 고쳤을 때 새 테스트가 실패하고, 되돌리면 통과한다.

## 열린 질문

없음.
