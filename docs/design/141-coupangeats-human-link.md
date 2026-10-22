# 141. 쿠팡이츠 사람 링크(https)를 웹 오퍼 링크로 쓰기

추적 이슈: [#141](https://github.com/woowacourse-teams/2026-to-discount/issues/141)

## 결론

`offerLink`(`web/src/offerLink.js:172`)의 쿠팡이츠 분기를 넓힌다. 오퍼 `link`가 `coupangeats://`로 시작하거나 `https://share.coupangeats.com/`로 시작하면 그대로 쓴다. 단, 배너에서 세운 오퍼(`fromBanner`가 참)의 https 공유 링크는 지금처럼 `COUPANGEATS_LINK`로 바꾼다. 그 밖의 https 주소는 받지 않고 `COUPANGEATS_LINK`로 바꾼다. 링크가 없으면 지금과 같다.

API는 코드를 바꾸지 않고 테스트만 더한다. `OfferRecord.link`를 형식 검사 없이 그대로 싣는다는 것을 테스트로 고정한다.

## 배경

2026-10-22 tracker가 쿠팡이츠 오퍼 링크 규칙을 사람 링크, 이번 주 허브 탭 링크, 공유 링크 순으로 정했다. 사람 링크 자리는 `api/src/main/resources/brands.yml`의 `links.coupangeats`이고 수집 쪽이 그 값을 오퍼의 `link`로 실어 내보낸다. 지금은 사람 링크가 하나도 없어 화면 영향이 없다.

웹은 사람 링크를 버린다. `offerLink.js:175`가 `link`가 `coupangeats://`로 시작할 때만 쓰고 나머지는 `COUPANGEATS_LINK`로 바꾼다. 이 조건은 2026-10-12에 만료된 공유 링크가 오퍼 `link`에 실려 와서 좁혀진 것이다(`offerLink.js:78`의 주석). 그래서 지금 조건을 단순히 풀면 같은 사고가 돌아온다. 이번 설계는 사람이 직접 넣은 링크만 통과시키는 길을 찾는 것이다.

## 확인한 것

- 오퍼 `link`가 생기는 길은 둘이다.
  - 원장 오퍼: tracker가 실은 `link`(export.json). 사람 링크는 여기로 온다.
  - 배너 오퍼: `BannerOffers.common`이 `.link(banner.url())`로 싣는다(`BannerOffers.java:101`). 배너 url은 수집이 매일 갱신하는 허브 공유 링크일 수 있고, 2026-10-12에 만료 링크가 박혀 있던 길이 이쪽이다.
- API는 `link`를 `OfferRecord`(`OfferRecord.java:39`)에서 `Offer`(`Offer.java:65`)로 그대로 옮긴다. 형식 검사 코드는 찾지 못했다. 이슈의 추정이 맞다. 다만 이것을 고정하는 테스트는 `https://example.test/...` 링크뿐이고 쿠팡이츠 주소를 쓴 것은 없다.
- 응답에 `fromBanner`가 있다(`Offer.java:31`). 웹은 이미 `offerClickProps`에서 `!!offer.link`를 `fromBanner`로 보내는데(`offerLink.js:199`), 이름이 같아도 의미가 다르다. 응답의 `fromBanner` 칸을 쓴다.
- `openWithNotice`(`offerLink.js:103`)는 이미 `https://share.coupangeats.com/`와 `coupangeats://`만 안내 화면과 같은 탭 이동을 한다. 그 밖의 https는 안내 없이 `watchAppOpen`만 하고 기본 이동으로 간다.
- 기존 테스트 `offerLink.test.js:28`이 `https://share.coupangeats.com/old` → `COUPANGEATS_LINK`를 못박고 있다. 이 줄은 이번 변경과 정면으로 부딪히므로 바꿔야 한다.

## 변경

### 웹: `web/src/offerLink.js`

```js
const CE_SHARE_PREFIX = 'https://share.coupangeats.com/'

function coupangeatsLink(offer) {
  const link = offer.link
  if (typeof link !== 'string') return COUPANGEATS_LINK
  if (link.startsWith('coupangeats://')) return link
  if (link.startsWith(CE_SHARE_PREFIX) && !offer.fromBanner) return link
  return COUPANGEATS_LINK
}
```

`offerLink`의 쿠팡이츠 줄(175행)은 `return coupangeatsLink(offer)`로 바꾼다. `openWithNotice`의 판별(107~108행)도 같은 상수를 쓰게 맞춘다. 두 곳이 같은 접두사를 따로 적고 있으면 한쪽만 고쳐져 안내 화면이 빠진다(아래 변경 전파 확인).

결정 근거:

- **https 전부 받지 않는 이유:** 허용 범위를 쿠팡이츠 공유 도메인으로 좁힌다. `openWithNotice`가 안내와 앱 열기 처리를 하는 링크가 이 둘뿐이라, 다른 https를 받으면 쿠팡이츠 오퍼가 안내 없이 브라우저로 열린다. 접두사에 `/`까지 넣어 `share.coupangeats.com.evil.example` 같은 주소가 걸리지 않게 한다.
- **배너 오퍼를 제외하는 이유:** 배너 url은 사람이 넣은 값이 아니다. 만료 링크 사고(2026-10-12)가 이 길로 왔다. 사람 링크를 살리면서 이 사고를 되돌리지 않으려면 길을 가른다. `fromBanner`가 거짓인 원장 오퍼의 공유 링크만 통과한다.
- **`coupangeats://`는 배너 오퍼도 통과:** 지금 동작을 그대로 둔다. 바꿀 이유가 없다.
- **`link`가 없는 경우:** `COUPANGEATS_LINK`로 내려간다. 사람 링크가 없는 브랜드는 지금과 같다(끝 조건).

### 웹 테스트: `web/src/offerLink.test.js`

- 28행을 고친다. 원장 오퍼의 `https://share.coupangeats.com/x`는 그대로 나오고, 같은 주소가 `fromBanner: true`면 `COUPANGEATS_LINK`가 나온다.
- 더한다.
  - 쿠팡이츠가 아닌 도메인의 https(`https://example.com/x`)는 `COUPANGEATS_LINK`로 바뀐다.
  - `https://share.coupangeats.com.example.com/x`처럼 접두사만 닮은 주소는 `COUPANGEATS_LINK`로 바뀐다.
  - 링크가 없으면 `COUPANGEATS_LINK`다(29행이 이미 본다. 유지).
- 새 `*.test.js`를 만들지 않으므로 `web/package.json`의 `test`는 건드리지 않는다. 구현자는 새 테스트 이름이 출력에 나오는지 본다.

### API 테스트

코드는 바꾸지 않는다. `BrandComparisonServiceTest`의 `bannerOfferCarriesItsOwnLinkAndLeavesBrandLinksAlone`(925행) 근처에 원장 쿠팡이츠 오퍼 하나를 세우고 `link`가 `https://share.coupangeats.com/…`일 때 `compare()` 결과의 `offers().get(0).link()`가 같은 문자열이고 `fromBanner`가 거짓인지 본다. `coupangeats://` 링크도 한 줄 더한다. 테스트 픽스처 헬퍼(`rec(...)`)가 `link`를 받지 않으면 이 테스트 안에서만 `OfferRecord.builder(...).link(...)`로 만든다. 실제 서비스 주소가 아니라 `https://share.coupangeats.com/test` 같은 임의 값을 쓴다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 `offerLink`, 링크를 직접 다루는 묶음은 없다. 가까운 묶음을 짚는다.

- 2번(배너 모양)과 3번(묶음 배너): 배너 `url`이 오퍼 `link`로 흐르는 길이 이쪽이다. 이번에 배너 필드나 `BannerOffers`를 바꾸지 않는다. 웹이 `fromBanner`를 읽어 길을 가르는 것이 이 묶음과 닿는 유일한 자리다. API 응답에 `fromBanner`가 이미 있어 배포 순서 문제는 없다.
- 8번(배포 순서): 웹이 읽는 칸이 API에 이미 있으므로 API 먼저, 웹 나중 순서를 지키되 순서가 바뀌어도 깨지지 않는다. 옛 응답에 `fromBanner`가 없다고 가정해도 거짓으로 읽혀 배너 공유 링크가 통과할 수 있다는 점만 남는다. 이미 배포된 API라 해당 없음.
- 6번(화면에 나가는 글자): 새 문구가 없다. 해당 없음.
- 9번(새 파일): 새 파일이 없다.
- 표에 없는 묶음 하나: `offerLink`의 쿠팡이츠 판별(`offerLink.js:175`)과 `openWithNotice`의 판별(107~108행)이 같은 접두사를 따로 적고 있다. 한쪽만 넓히면 링크는 맞게 오는데 안내 화면 없이 열린다. 이번에 접두사 상수를 한 곳으로 모아 줄인다. 표에 새 줄을 더할 만큼의 묶음은 아니라서 문서는 고치지 않는다.
- 텔레메트리: `watchAppOpen`(`telemetry.js`)이 쿠팡이츠 링크를 어떻게 가르는지 구현자가 확인한다. 접두사로 가른다면 같은 상수를 쓰게 한다.

## 구현자에게

- 웹과 API 둘을 만진다. 웹 구현자가 `web/`을, API 구현자가 `api/src/test`를 맡는다. API 쪽은 테스트만이라 배포 순서 제약이 없다.
- 테스트가 실제로 보는지 증명한다. `fromBanner` 조건을 임시로 빼고 배너 케이스 테스트가 실패하는 것을, 접두사 비교를 `includes('coupangeats.com')`로 임시로 풀고 닮은 도메인 테스트가 실패하는 것을 각각 한 번 본 뒤 되돌린다.
- 프론트 변경이므로 main에 직접 커밋하지 않는다. 브랜치, 360px 스크린샷, mono `preview/<이름>` push, 승인, 머지 순서를 따른다(`docs/WORKFLOW.md` §3-3). 스크린샷에는 `brands.yml`의 `links.coupangeats` 사람 링크를 임시로 넣은 브랜드를 쓰지 않는다. 대신 프리뷰 픽스처나 응답 목에 사람 링크 오퍼를 넣고, 눌렀을 때 안내 화면 뒤 그 주소로 가는지 본다. 임시 값은 커밋하지 않는다.

## 검증

- `cd web && npm test`가 통과한다. 고친 줄과 새 테스트 이름이 출력에 보인다.
- API 테스트가 통과한다(`docs/WORKFLOW.md` §5의 명령).
- 원장 쿠팡이츠 오퍼에 `https://share.coupangeats.com/…` 링크가 있으면 `offerLink`가 그 주소를 돌려준다.
- 링크가 없는 쿠팡이츠 오퍼는 `COUPANGEATS_LINK`를 돌려준다(끝 조건 2).
- 위 임시 변경 둘에서 해당 테스트가 실패하고, 되돌리면 통과한다.
- 프리뷰 360px 스크린샷과 눌렀을 때의 이동 주소 확인.

## 열린 질문

- **원장 오퍼와 배너 오퍼를 `fromBanner`로 가르는 것이 맞는가?** tracker 이슈 #10이 허브 탭 링크를 `coupangeats://`로 싣는다고 하므로 배너 길과 겹치지 않는다는 것은 이슈 본문으로만 확인했다. 확인하지 않은 가정이다. 배너 쪽 공유 링크를 모두 허용해도 되는 상황이면 `!offer.fromBanner` 한 조건만 빼면 된다.
- **쿠팡이츠가 아닌 https를 받지 않는 것으로 정했다.** 이슈가 "설계에서 정함"으로 열어 둔 부분이다. 나중에 사람이 다른 도메인(예: 쿠팡이츠 단축 주소)을 넣을 일이 생기면 허용 접두사를 늘리는 별도 이슈로 다룬다.
