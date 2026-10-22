# 155. 오퍼에 qualifiers(구조화 조건) 칸 추가

추적 이슈: [#155](https://github.com/woowacourse-teams/2026-to-discount/issues/155)
상위 설계: [#151](https://github.com/woowacourse-teams/2026-to-discount/issues/151)의 "API: `OfferRecord`, `Offer`" 절(`docs/design/151-unified-offer-badges.md`, `feat/151-unify-card-detail-badges` 브랜치에 있다)

## 결론

`OfferRecord`와 `Offer`에 nullable `List<String> qualifiers`를 더하고, 해석 없이 그대로 넘긴다. 영역은 API 하나다(`api/`). 웹 코드는 이 이슈에서 바꾸지 않는다.

- 키가 없는 옛 `export.json`과 `null`은 `null`로 내려간다("모름"). `[]`는 `[]`로 내려간다("조건 없음을 관측").
- 같은 (브랜드, 앱) 중복을 합칠 때 `conditions`와 같은 규칙이다. 승자 값이 있으면 승자 것, 없으면 패자 것(ADR-006).
- 배너에서 세운 오퍼는 `qualifiers`를 비운다(`null`).
- 계약 파일 `contracts/offer-cases.json`의 `offerKeys`와 예시 응답에 `qualifiers`를 넣는다.

## 배경

#151에서 웹은 `offer.qualifiers`(예: `["첫 주문"]`)로 "첫 주문" 칩을 만든다. 지금 API는 `conditions` 문자열만 보낸다. 2026-10-22 권한자 결정으로 API 변경을 #151에서 이 이슈로 옮겼다.

코드에서 확인한 현재 상태

- `OfferRecord`(`api/.../offer/OfferRecord.java`)는 21칸 레코드이고 `qualifiers`가 없다. `qualifier`(단수 문자열, "최대" 등 확실성 표기)와 이름이 비슷하다. 다른 칸이다.
- `Offer`(`api/.../offer/Offer.java`)는 레코드 생성자를 다섯 곳에서 위치 인자로 부른다(`from`, `withDetailFrom`, `convergedWith`, `withFirstComeTier`, `withIsNew`).
- `OfferRepository`는 `FAIL_ON_UNKNOWN_PROPERTIES`를 끄고 읽는다. tracker가 `qualifiers`를 먼저 내보내도 API는 모르는 키를 무시한다. 읽기 실패는 `IOException | JacksonException`을 잡아 로그를 남기고 `IllegalStateException`으로 올린다(ADR-012).
- 웹 `offerContract.test.js`는 계약 파일의 `offerKeys`와 예시 응답 칸이 같은지 본다. #151 웹 브랜치는 `offer.qualifiers`를 읽는데 `offerKeys`에 칸이 없어 실패한다. main의 웹은 아직 이 칸을 읽지 않는다(`web/src`에서 `qualifiers`를 찾지 못했다).

**확인하지 못한 것:** 운영 `export.json`에 `qualifiers`가 이미 실리는지는 이 세션에서 보지 못했다. 이슈 본문은 원장에 칸이 있고 내보내기가 아직 안 싣는다고 말한다. 이 문서는 그 말을 따른다.

## 변경

### `OfferRecord`

- 정식 생성자 끝에 `List<String> qualifiers`를 더한다(`firstSeenAt` 뒤). 끝에 두는 이유: 앞 칸이 문자열 열여섯 칸이라 위치로 끼우면 자리가 바뀌어도 컴파일이 못 잡는다. 같은 이유로 빌더가 있다.
- 빌더에 `qualifiers(List<String> v)`와 필드, `build()` 인자를 더한다.
- 주석은 `tiers`와 `tierMode`의 방식으로 쓴다. 키가 없는 옛 행은 `null`, API는 해석하지 않는다.
- 클래스 주석의 "칸이 21개" 문구(빌더 설명)를 22개로 고친다.

### `Offer`

- 레코드 끝(`isNew` 뒤)에 `List<String> qualifiers`를 더한다. JSON 이름은 필드 이름 그대로다. 끝에 두는 이유: `conditions` 옆에 끼우면 `String conditions` 다음 `String expiresAt`처럼 같은 타입이 이웃해 인자 순서 실수를 못 잡는다. `List<String>`은 이웃과 타입이 달라 컴파일이 잡는다.
- `Offer.from`: `r.qualifiers()`를 그대로 넘긴다. 복사하거나 정규화하지 않는다(ADR-003: 판단은 화면 몫). 빈 목록을 `null`로 바꾸지 않고 `null`을 빈 목록으로 바꾸지 않는다.
- 나머지 네 생성자 호출 자리는 다음과 같이 맞춘다.

| 자리 | `qualifiers` |
|---|---|
| `withDetailFrom` | 합친 값(아래) |
| `convergedWith` | 승자(`this`) 값 그대로. 구간만 늘린다. |
| `withFirstComeTier` | 상시(`this`) 값 그대로. `conditions`가 상시 것인 것과 같다. 선착순 오퍼의 `qualifiers`는 버린다. |
| `withIsNew` | `this` 값 그대로 |

### 중복 합치기 (`withDetailFrom`, ADR-006)

`mergedConditions`와 같은 모양으로 `mergedQualifiers`를 만든다.

```java
List<String> mergedQualifiers = qualifiers != null ? qualifiers
        : sameCoupon ? other.qualifiers : null;
```

- 승자가 `[]`이면 값이 있는 것이다. 패자의 `["첫 주문"]`로 덮지 않는다(`!= null` 판정).
- `sameCoupon`(금액이 서로 다르면 다른 쿠폰으로 보고 상세를 안 섞는 규칙)을 따른다. `conditions`와 같다. 금액이 다른 쿠폰의 "첫 주문"이 승자에 붙으면 5,000원 전체 메뉴 쿠폰이 첫 주문 한정으로 보인다(`withDetailFrom` 주석의 훌랄라참숯바베큐치킨 사례와 같은 모양).
- **같이 고칠 자리:** 함수 중간의 "아무것도 안 바뀌었으면 `this`를 돌려준다" 조건(`mergedMinOrder == minOrderAmount && ...`)에 `mergedQualifiers == qualifiers`를 더한다. 빠뜨리면 `qualifiers`만 합쳐진 경우 값이 조용히 버려지고 테스트의 다른 칸은 초록이다.
- 새 `Offer`를 만드는 반환문에도 `mergedQualifiers`를 넣는다.
- tracker `store.MERGEABLE_DETAIL`과 글자까지 같아야 한다는 주석(ADR-016)이 `withDetailFrom`에 있다. **이 세션은 tracker 코드를 읽지 못했다.** tracker가 `qualifiers`를 `MERGEABLE_DETAIL`에 넣는지는 확인되지 않았다. 후속 이슈에서 tracker 쪽이 같은 규칙인지 확인한다.

### `BannerOffers`

`common(...)` 빌더는 `qualifiers`를 설정하지 않는다. 빌더 기본값 `null`이 곧 비움이다. 코드를 더하지 않고, 테스트로 "배너 오퍼의 `qualifiers`는 `null`"을 박는다. 코드에 주석 한 줄(배너에는 이 칸이 없다)을 `common`에 더한다.

### 계약 파일 `api/src/test/resources/contracts/offer-cases.json`

- `offerKeys`에 `"qualifiers"`를 알파벳 순서 자리(`qualifier` 바로 다음)에 더한다. `OfferContractTest`가 `TreeSet`으로 견주므로 순서는 파일 가독성용이다.
- `exportKeys`에 `"qualifiers"`를 더한다. tracker 검사는 export의 칸이 `exportKeys` 안에 있는지를 본다. 칸을 더해 두면 tracker가 싣기 시작해도 막히지 않고, 안 실어도 막히지 않는다.
- 기존 세 사례의 `offer`에 `"qualifiers": null`을 더한다(record에 키가 없다). 키가 없는 옛 행이 `null`로 가는 것을 계약으로 박는 셈이다.
- 사례 하나를 더한다. record에 `"qualifiers": ["첫 주문"]`, offer에 같은 값. 합성 픽스처다(ADR-009). 운영 스냅샷을 복사하지 않는다. 기존 사례 모양을 따라 쿠팡이츠 단일 쿠폰으로 만든다.
- 파일 맨 위 `note`에 `qualifiers`(2026-10-22, #155) 한 문장을 더한다: 원장의 구조화 조건, 키가 없으면 `null`.
- `exportDropped`에는 넣지 않는다. 응답까지 나간다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 닿는 곳을 짚는다.

- **배너 모양(2번):** 닿지 않는다. 배너 칸을 바꾸지 않는다. `BannerOffers`는 새 칸을 비워 두기만 한다.
- **확실성 판정(1번):** 닿지 않는다. `qualifiers`는 `certainty`에 영향을 주지 않는다. `Certainty.fromQualifier`가 읽는 것은 단수 `qualifier`다.
- **화면에 나가는 글자(6번):** 닿는다. 다만 이 이슈는 문구를 정하지 않는다. 값은 원장이 주고 API는 넘기기만 한다. "첫 주문"을 칩으로 써도 되는지는 #151의 열린 질문에서 이미 답을 받았다.
- **저장소 경계와 배포 순서(8번):** 닿는다. 순서는 아래다.
- **같은 묶음의 나머지:**

| 자리 | 이 이슈에 넣나 | 이유 |
|---|---|---|
| `OfferRecord`, `Offer`, 중복 합치기, `BannerOffers` | 넣는다 | 이슈 요구사항 |
| `contracts/offer-cases.json` | 넣는다 | 웹, tracker가 함께 읽는 계약. 빠지면 웹 `offerContract.test.js`가 실패 |
| `api/README.md`의 오퍼 칸 설명 | 구현자가 확인해 있으면 넣는다 | 읽은 문서에 `OfferRecord` 설명이 있다. 칸 목록을 적는 곳이면 같이 고친다 |
| 웹 `web/src` | 넣지 않는다 | #151 웹 브랜치가 읽는다. 이 이슈는 API 먼저 나가야 하는 쪽이다 |
| tracker `export_data.py`, `store.MERGEABLE_DETAIL` | 넣지 않는다 | 비공개 저장소(ADR-002). 후속 이슈 |
| `docs/PROJECT-STRUCTURE.md` | 해당 없음 | 새 파일이 없다 |

### 배포 순서

내보내기와 웹 사이의 순서를 명시한다.

1. **API(이 이슈)가 먼저.** `qualifiers`가 없는 옛 `export.json`에서도 `null`로 돈다. 웹은 `qualifiers`가 `null`이면 옛 방식(`conditions`가 "첫 주문"과 정확히 같을 때만 칩)으로 돈다. 응답에 새 칸이 `null`로 늘기만 한다.
2. **tracker 내보내기.** API가 키를 알기 전에 먼저 실어도 `FAIL_ON_UNKNOWN_PROPERTIES`가 꺼져 있어 깨지지 않는다(`OfferRepository` 주석, 2026-08 실측 세 번). 그래도 순서는 API 먼저를 지킨다. 키를 아는 서버가 읽어야 "조용히 안 보이는" 상태가 없다.
3. **웹.** 웹의 과도기 대체 경로(`conditions` 정확 일치)는 운영 응답에 `qualifiers`가 실제로 온 것을 확인한 뒤에 걷는다. 웹 쪽 프리뷰와 360px 확인은 웹 PR의 몫이다.

## 하지 않는 것

- `qualifiers` 값의 검증, 정규화, 중복 제거, 순서 정렬. ADR-003에 따라 판독 파이프라인이 만든 값을 그대로 넘긴다.
- `conditions`에서 "첫 주문"을 걷어내는 일. 웹이 `qualifiers`를 읽는 것이 운영에서 확인된 뒤 다른 변경으로 한다(#151 설계).
- `Certainty`와 정렬에 `qualifiers` 반영.
- 응답 키 순서 보장. `OfferContractTest`는 칸 이름과 값만 본다.

## 테스트

새 테스트 파일은 만들지 않는다(`web/package.json`의 `test` 변경과 `PROJECT-STRUCTURE.md` 재생성이 필요 없다). 기존 파일에 더하고, 구현자는 새 테스트 이름이 출력에 나오는지 본다.

1. **읽기 네 경우** (`OfferRecordTest` 또는 `OfferContractTest`): 같은 JSON 한 줄에서 `qualifiers`를 바꿔 `OfferRepository`와 같은 설정의 매퍼(`JsonMapper.builderWithJackson2Defaults()`, 알 수 없는 키 무시)로 `OfferRecord`를 읽고 `Offer.from`까지 간다. `OfferRecordTest`의 `firstSeenAtPassesThroughFromExportJsonToOffer`(269행)가 같은 모양의 선례다.
   - 키 없음 → `Offer.qualifiers()`가 `null`.
   - `null` → `null`.
   - `[]` → 빈 목록(`null`이 아님).
   - `["첫 주문"]` → 같은 목록.
2. **잘못된 모양:** `"qualifiers": "첫 주문"`(배열이 아닌 문자열)을 읽을 때 결과를 테스트로 박는다. Jackson 3과 Jackson 2 기본값(`builderWithJackson2Defaults`)에서 `ACCEPT_SINGLE_VALUE_AS_ARRAY`가 꺼져 있으면 `JacksonException`이 난다. 이 경우 `OfferRepository.reload`는 로그를 남기고 실패하며 이전 캐시를 유지한다(ADR-012, 같은 길). 기본안은 **느슨하게 받지 않는다**(문자열 하나를 배열로 받는 설정을 켜지 않는다). 모양이 틀린 원장은 조용히 고쳐 읽지 않고 reload가 크게 실패하는 쪽이 낫다. 실제 동작을 먼저 돌려 보고, 설명과 다르면 테스트와 이 문서를 실제에 맞춘다.
3. **중복 합치기** (`OfferConvergenceTest` 또는 `OfferRecordTest`의 중복 합치기 케이스 근처):
   - 승자 `qualifiers`가 `null`, 패자 `["첫 주문"]`, 금액 같음 → 합친 오퍼가 `["첫 주문"]`.
   - 승자 `["첫 주문"]`, 패자 `["다른 값"]` → 승자 것.
   - 승자 `[]`, 패자 `["첫 주문"]` → `[]`(빈 목록도 값이다).
   - 승자 `null`, 패자 `["첫 주문"]`, 금액 다름 → `null`(`sameCoupon`이 아니면 안 섞는다).
   - 재현 확인: `mergedQualifiers`를 합치되 "바뀐 게 없으면 `this`" 조건만 빼면 첫 케이스가 실패하는지 구현자가 한 번 본다(조건을 빠뜨리는 실수를 테스트가 잡는다는 증거).
4. **다른 변환에서 보존:** `withFirstComeTier`, `convergedWith`, `withIsNew`를 거쳐도 `qualifiers`가 그대로다. 한 케이스로 `withIsNew` 호출 뒤 값이 같은지 본다.
5. **배너:** `BannerOffers.of(...)`가 만든 `OfferRecord`의 `qualifiers()`가 `null`이다. 기존 `BannerOffers` 테스트 근처에 더한다.
6. **계약:** `OfferContractTest`가 네 사례(기존 셋 + 새 하나)를 통과한다. `offerKeys`와 응답 칸이 같고 `qualifiers` 값이 글자까지 같다.
7. **웹 계약:** 웹 `npm test`의 `offerContract.test.js`가 통과한다. main에서는 웹이 `qualifiers`를 아직 안 읽으므로 계약 파일만 바뀌어도 초록이 맞다. 이 테스트가 `qualifiers`를 읽는 웹 브랜치(#151)에서 초록이 되는지는 그 브랜치가 이 변경을 받은 뒤 확인된다. **이 문서를 쓴 세션에서는 확인하지 못했다.**
8. **전체:** API 테스트 전체가 통과한다. 위치 인자 생성자를 부르는 테스트가 있다면 컴파일 오류가 난다. 이 세션은 `api/src` 전체에서 `new Offer(`, `new OfferRecord(`를 찾았고 `Offer.java`와 `OfferRecord.java`의 빌더 안에만 있었다. 테스트에서는 빌더만 쓴다.

## 열린 질문

답 없이도 기본안으로 시작할 수 있다.

1. **잘못된 모양(문자열 하나)을 느슨하게 받을까?** 기본안은 받지 않는다. 위 테스트 2번 참고.
2. **`withFirstComeTier`에서 선착순 오퍼의 `qualifiers`를 버려도 되나?** 기본안은 버린다. 상시 오퍼의 `conditions`가 오퍼 전체의 조건이고 선착순 문구는 구간 `note`로 간다는 기존 규칙과 같다. 선착순 쪽에 구조화 조건이 실리면 그때 구간 단위 칸이 필요하다. 지금 원장에는 그런 사례를 보지 못했다.

## 후속

- tracker `export_data.py`가 원장의 `qualifiers`를 내보내기에 싣는다. 비공개 저장소에서 따로 이슈를 만든다. `store.MERGEABLE_DETAIL`에 `qualifiers`를 넣는 문제도 함께 확인한다.
- #151 설계 문서의 "분리한 API 이슈 번호: 미기재"를 #155로 채운다.
- 운영 응답에 `qualifiers`가 실제로 오는 것을 확인한 뒤, 웹의 `conditions` 정확 일치 대체 경로를 걷는다.
