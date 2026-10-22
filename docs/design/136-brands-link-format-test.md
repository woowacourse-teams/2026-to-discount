# 136. brands.yml 브랜드 링크 형식 검사 테스트 추가

추적 이슈: [#136](https://github.com/woowacourse-teams/2026-to-discount/issues/136)

## 결론

`BrandCatalogTest`에 실제 `brands.yml`의 모든 `links`를 검사하는 테스트를 더한다. 키는 허용 목록에 있어야 하고, 값은 앱별로 정한 스킴과 호스트여야 한다. 실패 메시지에 브랜드, 키, 값을 적는다. 규칙을 순수 함수로 빼서 작은 예시 YAML로 "어긋나면 실패한다"를 보인다. 운영 코드와 링크 값은 바꾸지 않는다. `brands.yml` 머리 주석에 한 줄만 더한다.

**이슈 본문과 실제 파일이 다르다. 이 설계가 이슈를 한 군데 고친다.** 이슈는 "값은 `https://`로 시작하고, 지금 파일에는 `baemin`이 `s.baemin.com`, `ddangyo`가 `fdofd.ddangyo.com`만 있다"고 적었다. 실제 파일에는 `yogiyo` 링크도 있고, 값이 `https://`가 아니라 앱 딥링크(`yogiyolink://push.page/franchise?fr_id=<숫자>`)다. 이 설계는 `yogiyo`를 허용 목록에 넣고 스킴을 앱별로 정한다(아래 "규칙"). 이슈 문장 그대로 `https://`만 허용하면 지금 파일에서 `./gradlew test`가 실패해, 완료 조건 "지금 파일로 통과"와 부딪힌다.

## 배경

`links`는 사람이 손으로 넣는다(`brands.yml` 20~21행 주석). 2026-10-21에 한 브랜드의 배민 링크에 공유 링크가 아닌 다른 도메인이 들어갔고, 사람이 발견해 PR #118로 고쳤다. `searchAliases`는 `BrandCatalogTest.everyBrandHasNonBlankSearchAliases`(`BrandCatalogTest.java:116`)가 실제 파일을 읽어 지키고 있고, 같은 방식이 `links`에는 없다.

2026-10-22 파일을 직접 센 결과다. `links` 줄은 151곳, 그 아래 앱 링크는 225개다.

| 키 | 개수 | 값의 모양 |
| --- | --- | --- |
| `baemin` | 111 | `https://s.baemin.com/<경로>` |
| `ddangyo` | 55 | `https://fdofd.ddangyo.com/<경로>` |
| `yogiyo` | 59 | `yogiyolink://push.page/franchise?fr_id=<숫자>` |

세 모양에 모두 맞는 줄 수가 111 + 55 + 59 = 225로 전체와 같다. 어긋난 줄은 지금 없다.

`BrandCatalog.readLinks`(`BrandCatalog.java:113`)는 키와 값을 검사 없이 문자열로 그대로 담는다. 운영 코드는 형식 오류를 막지 않으므로, 검사는 테스트가 맡는다.

## 규칙

허용 목록은 테스트 안 상수 하나다.

| 키 | 스킴 | 호스트 | 비고 |
| --- | --- | --- | --- |
| `baemin` | `https` | `s.baemin.com` | |
| `ddangyo` | `https` | `fdofd.ddangyo.com` | |
| `yogiyo` | `yogiyolink` | `push.page` | 이슈 본문에 없던 항목. 파일에 59개 있다 |

- 키가 목록에 없으면 실패한다(`coupangeats` 등 모르는 키 포함). 쿠팡이츠 링크는 웹의 `COUPANGEATS_LINK`와 설계 141의 사람 링크가 맡고 `brands.yml`에는 없다. 이 설계는 쿠팡이츠 키를 허용하지 않는다.
- 값은 `java.net.URI`로 파싱해 스킴과 호스트를 견준다. 문자열 `startsWith`로 견주면 `https://s.baemin.com.evil.test/`가 통과한다. 호스트는 대소문자를 무시하고 정확히 같아야 한다. 스킴은 `HTTP://`처럼 대문자로 적어도 `https`와 같은 것으로 보지 않고 소문자 정확 일치로 본다(앱이 열 수 있는 모양만 허용).
- `https` 앱은 포트나 사용자 정보(`user@host`)가 붙은 값도 실패로 본다. 호스트만 맞고 목적지가 다른 값을 막기 위함이다.
- 값이 문자열이 아니거나(숫자, 목록) 파싱이 안 되거나 공백이 섞였으면 실패한다. snakeyaml이 따옴표 없는 값을 문자열이 아닌 타입으로 읽는 일이 이 저장소에서 이미 났다(CHANGE-PROPAGATION 2번의 `startsAt`). 값을 `String.valueOf`로 바꾸지 말고 타입부터 본다.
- 경로와 질의는 보지 않는다. 경로 형식은 앱이 바꿀 수 있어 잘못 막는 비용이 더 크다. `yogiyo`의 `fr_id=<숫자>` 모양은 검사에 넣지 않는다(근거: 이슈가 호스트까지만 요구한다).

## 변경

### 1. 검사 규칙을 함수로 둔다 (`BrandCatalogTest.java`)

```java
private static final Map<String, LinkRule> LINK_RULES = Map.of(
        "baemin",  new LinkRule("https", "s.baemin.com"),
        "ddangyo", new LinkRule("https", "fdofd.ddangyo.com"),
        "yogiyo",  new LinkRule("yogiyolink", "push.page"));

record LinkRule(String scheme, String host) {}

/** 어긋난 곳마다 "<브랜드>의 links.<키>: <사유> (값: <값>)" 한 줄을 돌려준다. 비면 통과. */
static List<String> linkProblems(Map<String, Map<String, Object>> brands) { ... }
```

- 함수는 테스트 클래스 안 `static` 메서드다. 운영 코드(`BrandCatalog`)에 넣지 않는다.
- 첫 위반에서 멈추지 않고 모든 위반을 모아 돌려준다. 한 번에 여러 브랜드를 잘못 넣어도 한 번 실행으로 다 보인다.
- 메시지 형식은 `백종원의 links.baemin: 호스트가 s.baemin.com이 아니다 (값: https://example.test/x)`처럼 브랜드 이름, 키, 값이 모두 들어간다. 사유는 "허용 목록에 없는 키", "스킴이 https가 아니다", "호스트가 ... 이 아니다", "문자열이 아니다", "URI로 읽을 수 없다" 다섯 가지로 고정한다.
- `links`가 없거나 비어 있으면 통과한다(생략 가능, `brands.yml` 20행). `links`가 맵이 아니면(목록 등) 위반으로 센다.

### 2. 실제 파일 검사 테스트

`everyBrandHasNonBlankSearchAliases`와 같은 방식(`ClassPathResource("brands.yml")`을 `Yaml`로 읽음)으로 파일을 읽어 `linkProblems`를 부른다. 결과가 비어 있지 않으면 `assertTrue(problems.isEmpty(), () -> String.join("\n", problems))`로 실패시킨다.

- 이름 제안: `everyBrandLinkMatchesItsAppShareHost`.
- 이 테스트는 운영 배포가 읽는 파일 자체를 읽는다(`classpath:brands.yml`, `BrandCatalog` 기본값). `discount.brands-path`로 운영이 다른 파일을 가리켜도 저장소 파일을 지키는 검사다.
- 파일 읽기와 `brands` 꺼내기가 `everyBrandHasNonBlankSearchAliases`와 겹친다. 둘이 쓰는 작은 헬퍼 `loadBrandsFile()`로 뽑아 중복을 만들지 않는다. 기존 테스트의 동작은 바꾸지 않는다.

### 3. 규칙이 실제로 잡는 것을 작은 YAML로 보인다

`catalogFor(yaml)`의 기존 방식처럼 텍스트 블록을 `Yaml().load`로 읽어 `linkProblems`에 넣는다. 한 테스트에 한 위반씩 둔다(위반 하나가 다른 위반의 메시지에 가려지지 않게).

| 입력 | 기대 |
| --- | --- |
| `baemin: https://s.baemin.com/abc`, `ddangyo: https://fdofd.ddangyo.com/x?k`, `yogiyo: yogiyolink://push.page/franchise?fr_id=31` | 위반 없음 |
| `baemin: https://example.test/abc` (다른 호스트) | 브랜드, `baemin`, 값이 메시지에 들어간 위반 1건 |
| `baemin: https://s.baemin.com.example.test/abc` (호스트 접두사만 같음) | 위반 1건 |
| `baemin: http://s.baemin.com/abc` | 스킴 위반 1건 |
| `coupangeats: https://s.baemin.com/abc` (모르는 키) | 키 위반 1건. 호스트가 맞아도 실패 |
| `baemin: 12345` (문자열 아님) | 위반 1건 |
| 위반 둘이 서로 다른 브랜드에 있음 | 위반 2건이 모두 나온다 |
| `links` 없음, `links: {}` | 위반 없음 |

각 위반 테스트는 메시지가 브랜드 이름, 키, 값을 모두 포함하는지 `assertTrue(msg.contains(...))`로 본다. 이슈의 "실패 메시지에 셋을 적는다"를 테스트로 박는다.

### 4. `brands.yml` 머리 주석

`brands.yml` 20~21행 `links:` 설명 아래에 한 줄을 더한다. 값 줄은 하나도 바꾸지 않는다.

```
#           형식은 api의 BrandCatalogTest가 막는다 — 키는 baemin/ddangyo/yogiyo만, 값의 스킴과 호스트는 앱별 허용 목록(그 테스트의 LINK_RULES)과 맞아야 한다.
```

주석 줄 하나라 로딩과 파싱에 영향이 없다. 허용 목록 정본은 테스트 상수 한 곳이다. 주석에 호스트를 풀어 적으면 두 번째 정본이 생기므로 호스트는 적지 않고 `LINK_RULES`를 가리킨다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에 `brands.yml`의 `links`를 직접 다루는 묶음은 없다. 가장 가까운 것들을 따져 보았다.

- 2번(배너 모양), 6번(화면 글자): 배너 칸이나 문구를 만들거나 바꾸지 않는다. 해당하지 않는다.
- 9번 "새 파일": 새 파일을 만들지 않는다. 기존 `BrandCatalogTest.java`에 더한다. api 테스트는 Gradle이 클래스 단위로 찾으므로 `web/package.json` 같은 목록 등록이 없다. `docs/PROJECT-STRUCTURE.md`는 파일이 늘지 않아 다시 만들지 않는다.
- 8번 배포 순서와 웹 프리뷰: 테스트와 주석만 바뀌고 화면과 API 응답이 같다. 웹 프리뷰와 360px 스크린샷 대상이 아니다. 배포 순서 문제도 없다.
- **묶음 밖의 짝 둘**: ① 이 허용 목록과 웹의 앱별 링크 처리(`web/src/offerLink.js`가 앱 이름별 딥링크를 만든다)는 값 커네선스 관계다. 앱이 늘면 두 곳이 같이 바뀐다. 이번 작업은 웹을 건드리지 않는다. 이유는 `offerLink.js`의 맵이 오퍼 링크를 만들고, `brands.yml` `links`는 브랜드 공유 링크라 소비처가 다르기 때문이다. 원장에 새 앱이 생기면 허용 목록에 한 줄 더해야 테스트가 막는다는 점만 구현 PR 본문에 적는다. ② `brands.yml` 20~24행 주석이 말하는 tracker의 `check_brands.py`(비공개 저장소)가 `links`를 검사하는지 이 세션은 볼 수 없다. 겹치거나 규칙이 다르면 어느 쪽이 정본인지 정해야 한다. **미확인**이며 열린 질문으로 남긴다.
- 결론: 같이 고칠 자리는 없다. 위 두 짝은 기록만 한다.

## 구현자에게

- 만지는 경로: `api/src/test/java/com/discounttracker/brand/BrandCatalogTest.java`와 `api/src/main/resources/brands.yml`의 머리 주석 한 줄. api 구현자 역할이다. 웹 변경은 없다.
- 운영 코드(`api/src/main/java/`)와 `brands.yml`의 링크 값은 바꾸지 않는다. `git diff`에서 `brands.yml`은 `#` 주석 줄만 더해져야 한다.
- 테스트가 실제로 보는지 증명한다. 실제 파일 검사 테스트가 통과한 뒤, `brands.yml`의 `baemin` 값 하나를 임시로 `http://s.baemin.com/x`로, 다음에 `ddangyo` 호스트를 임시로 다른 도메인으로, 다음에 키 하나를 `baemim`으로 바꿔 각각 실패하는 것과 실패 메시지에 브랜드, 키, 값이 보이는 것을 본다. 세 번 다 되돌리고 `git diff`에 값 변경이 없는지 확인한다.
- 다른 모양의 키 이름 오타를 "모르는 키"로 잡는지 위 시험에 꼭 넣는다. 키 검사가 빠지면 오타 키가 조용히 통과한다(AGENTS.md "먼저 알 것": 부재를 주장하기 전에 제대로 봤다는 양성 신호).
- 모두 세는 양성 신호: 실제 파일 검사 테스트가 `links`를 1건 이상 실제로 훑었는지도 본다(`checked > 0`). 파일 읽기가 빈 맵을 돌려주거나 `links` 키 이름이 바뀌어 아무것도 안 훑어도 초록이 되는 것을 막는다. 설계 수치는 위 표(225개)이나, 테스트 안에 225를 박지 않는다. 브랜드가 늘 때마다 깨지기 때문이다. 하한(예: 1 이상)만 둔다.
- main에 직접 커밋하지 않는다. 화면 변경이 없어 웹 프리뷰는 생략한다.

## 검증

- `cd api && ./gradlew test`가 지금 파일로 통과한다. 새 테스트 이름이 출력에 보인다.
- 위 임시 변경 세 가지 각각에서 실제 파일 검사 테스트가 실패하고, 되돌리면 통과한다.
- 작은 예시 YAML 테스트가 위 표의 여덟 줄을 모두 덮는다.
- `git diff --stat`에 `BrandCatalogTest.java`와 `brands.yml`(주석 한 줄)만 나온다.

## 열린 질문

1. **`yogiyo`를 허용 목록에 넣고 스킴을 `yogiyolink`로 둔다. 이 판단이 맞는가.** 이슈 본문은 `baemin`과 `ddangyo`만 말하고 모든 값이 `https://`라고 했으나 파일은 다르다. 이 설계는 파일에 있는 사실을 따랐다. 이슈 작성자가 `yogiyo`를 일부러 뺀 것이라면(예: 그 값들을 다른 방식으로 정리하려는 계획), 지금 파일이 통과하지 못하므로 먼저 알려야 한다.
2. **tracker `check_brands.py`가 `links`를 이미 검사하는가.** 비공개 저장소라 이 세션은 확인하지 못했다. 이미 검사한다면 규칙을 어느 쪽 정본으로 둘지 정한다.
3. **원장에 `yogiyo`, `baemin`, `ddangyo` 말고 `links`에 올 수 있는 앱 값이 더 있는가.** 이슈는 "원장 앱 값으로 정한 목록"이라고 했으나 그 목록의 정본(원장 `platform` 값)이 이 저장소에 없다. 지금은 파일에 쓰인 세 개로 정했고, 새 앱을 쓰려면 테스트 상수에 한 줄 더하는 것이 규칙이다.
