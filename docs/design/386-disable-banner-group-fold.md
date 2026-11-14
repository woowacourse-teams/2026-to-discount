# 설계: 배너 묶기(group 접어 그리기) 끄기

이슈: [#386](https://github.com/woowacourse-teams/2026-to-discount/issues/386)
상태: 2026-11-14 설계 초안. 승인 전.

## 0. 결론

- `BannerCatalog`에 스위치 하나(`discount.banner-group-fold`, 기본 `false`)를 둔다. 끄면 `active()`는 `activeMembers()`를 그대로 돌려준다. `group`이 있어도 접지 않고, `members`는 늘 `null`이다.
- 끈 상태에서는 묶음 규칙 검사(`groupRuleBreak`)와 묶음 우선순위 합치기(`groupPriority`)도 돌지 않는다. 구성원은 자기 `priority`로 선다.
- 묶기 코드, `members` 칸, `group` 칸, 웹 묶음 카드 코드는 지우지 않는다. 스위치를 켜면 지금과 같은 응답이 나온다(기존 묶음 테스트가 켠 상태로 그대로 지킨다).
- **API 응답 칸은 바뀌지 않는다.** 칸 목록(`responseKeys`, `memberKeys`)은 그대로이고, `members`가 늘 `null`이 되고 `group` 배너가 각자 한 장이 되는 것만 다르다. 웹은 이미 이 모양(`members` 없는 카드)을 그린다.
- 웹은 분석 이벤트 한 칸만 고친다. `opens_at`이 `members`에서만 읽혀 끈 뒤 쿠팡이츠 선착순 배너의 여는 시각이 조용히 `null`이 되므로, `members`가 없으면 `spec.opensAt`을 읽는다(§4).
- 순서: API 구현 → 웹 구현. 웹 변경은 화면을 바꾸지 않는다(분석 속성만).

## 1. 지금 동작

| 자리 | 하는 일 | 파일 |
| --- | --- | --- |
| 화면용 목록 | `group`이 같은 살아 있는 배너를 한 장으로 접고 `brands`, `brandLabels`, `members`, 합친 금액(`groupAmount`), 전원 소진일 때만 `soldOut`을 싣는다. 규칙(링크, 기간, 플랫폼이 같음)을 어기면 접지 않고 경고 로그 | `api/.../banner/BannerCatalog.java` `active()` 154-217행 |
| 오퍼용 목록 | 접지 않는다. 다만 `group` 구성원의 `priority`를 묶음 최솟값으로 덮는다 | 같은 파일 `activeMembers()` 279-295행 |
| 오퍼 세우기 | `activeMembers()`로 브랜드마다 오퍼 하나 | `BrandComparisonService.java:102`, `BannerOffers.java` |
| 레일 | `active()` | `BannerController.java:29`, 건수는 `BrandController.java:112`(reload 응답) |
| 그리기 | `brands`가 둘 이상이면 로고 여럿, `bannerMemberLabels`로 구성원 줄 | `web/src/EventBanner.jsx` 156-224행, `web/src/bannerMembers.js` |
| 분석 | `group`, `member_count`, `opens_at`(members에서만) | `web/src/bannerAnalytics.js` 41-65행 |

`brands: [a, b]` 배열로 한 장에 여러 브랜드를 적는 옛 묶음은 `group`과 별개다. 파일이 그렇게 적으면 한 장으로 그대로 나온다. 이번 스위치가 건드리지 않는다(이슈는 `group` 접기만 끈다).

## 2. API 변경

### 2-1. 스위치

`api/src/main/resources/application.yml`의 `discount:` 아래, `banners-path` 바로 뒤에 한 줄.

```yaml
  # group이 같은 배너를 한 장으로 접을지(2026-11-14 사용자: 끈다). 끄면 구성원이 각자 한 장이고 members가 없다.
  # 켜려면 DISCOUNT_BANNER_GROUP_FOLD=true 뒤 재시작. POST /api/reload로는 바뀌지 않는다.
  banner-group-fold: ${DISCOUNT_BANNER_GROUP_FOLD:false}
```

`BannerCatalog`에는 생성자를 건드리지 않고 setter 주입으로 받는다. 생성자를 바꾸면 `new BannerCatalog(res, clock, brands)`를 부르는 테스트 전부가 바뀐다. `SurveyService.setWindow`(`analytics/SurveyService.java:82-88`)와 같은 꼴이다.

```java
/** group이 같은 배너를 한 장으로 접을지. 기본은 끔(2026-11-14, #386). */
private volatile boolean groupFold = false;

@org.springframework.beans.factory.annotation.Autowired(required = false)
void setGroupFold(@Value("${discount.banner-group-fold:false}") boolean groupFold) {
    this.groupFold = groupFold;
    log.info("배너 묶기(group 접기): {}", groupFold ? "켬" : "끔");
}
```

- 접근 범위는 패키지(`com.discounttracker.banner`)다. 묶음 테스트가 같은 패키지라 직접 켠다.
- 필드 기본값을 `false`로 둔다. 스프링 밖에서 만든 카탈로그(테스트)도 끈 상태가 기본이다.

### 2-2. `activeMembers()`

`groupPriority`를 채우는 반복과 `priority` 덮어쓰기를 `groupFold`일 때만 한다.

```java
if (groupFold) {
    for (Banner b : live) { if (b.group() != null) groupPriority.merge(b.group(), b.priority(), Math::min); }
}
return live.stream()
        .map(b -> !groupFold || b.group() == null ? b : b.toBuilder().priority(groupPriority.get(b.group())).build())
        ... (정렬과 resolvedFor는 그대로)
```

끈 뒤 구성원은 파일에 적힌 자기 `priority`로 선다. tracker는 쿠팡이츠 묶음 구성원에 금액 큰 순으로 6, 7, 8을 준다(`BannerGroupTest` 186-221행의 실제 모양). 그래서 레일에서도 금액 큰 순으로 이어 선다. 같은 `priority`면 지금처럼 종료 시각, 여는 시각(`opensAtKey`), id 순이다.

오퍼 쪽(`BannerOffers`)은 브랜드마다 다른 카드로 가므로 순서가 바뀌어도 결과가 같다.

### 2-3. `active()`

맨 앞에 한 줄.

```java
if (!groupFold) return activeMembers();
```

- `groupRuleBreak`, `groupAmount`, `brokenGroupsLogged` 경고는 끈 상태에서 불리지 않는다. 지우지 않는다.
- `activeMembers()`가 이미 `List.copyOf`와 같은 불변 목록(`toList()`)을 돌려주므로 감싸지 않는다.
- `reload()`의 `brokenGroupsLogged.clear()`는 그대로 둔다.
- `active()` Javadoc 첫 줄을 "오늘 이 시각에 띄울 배너. 묶기를 켰을 때만 묶음을 한 장으로 접는다(기본 끔, #386)."로 고친다. `Banner.java:81` 주석도 "묶기를 켰을 때 `BannerCatalog.active()`가 접은 카드에만 있다. 기본은 끔이라 늘 null"로 고친다.

### 2-4. 테스트

| 파일 | 할 일 |
| --- | --- |
| `BannerGroupTest` | `catalog(yml)` 도우미에서 만든 카탈로그에 `setGroupFold(true)`를 부른다. 기존 테스트는 전부 켠 상태의 동작을 지키는 것으로 남는다. 클래스 Javadoc에 "묶기를 켠 상태(#386 뒤 기본은 끔)"를 덧붙인다 |
| `BannerGroupTest` 새 테스트 1 | `groupIsNotFoldedByDefault`: 켜지 않은 카탈로그에 `TWO_IN_A_GROUP` → `active()`가 2장, 둘 다 `members == null`, `brands == null`, 각자 `group`은 `"ddangyo-doubleday-0922"` 그대로, 금액은 각자 `"8,000원"`, `"7,000원"` |
| `BannerGroupTest` 새 테스트 2 | `unfoldedMembersKeepTheirOwnPriority`: 켜지 않은 카탈로그에 `TWO_IN_A_GROUP` → `active()`의 `priority`가 `[2, 5]`, 순서는 피자알볼로, 던킨. 켠 카탈로그는 둘 다 2로 덮인 것과 대비한다 |
| `BannerGroupTest` 새 테스트 3 | `unfoldedDailyOpenGroupLinesUpByOpeningTime`: `dailyOpenGroupKeepsEachMembersOpeningTime`의 yml(9시 뚜레쥬르 priority 6, 17시 두찜 priority 7)을 끈 카탈로그로 → 2장, 순서 뚜레쥬르, 두찜, `period`가 각자 `"오전 9시 오픈"`, `"오후 5시 오픈"`(대표 하루 문구로 바뀌지 않음), `spec().opensAt()`이 `"09:00"`, `"17:00"` |
| `BannerCatalogTest` 545-594행 테스트 | 기대가 "묶음 둘은 한 장으로 접힌다"(2장)이다. 테스트 안에서 `catalog.setGroupFold(true)`를 부르고 메시지를 "묶기를 켜면 묶음 둘은 한 장으로 접힌다"로 바꾼다. 끈 상태 검사는 위 새 테스트가 맡는다 |
| `BannerContractTest` | §3대로 계약 사례의 `groupFold`를 읽어 켠다 |
| `BrandComparisonServiceTest`, `BannerOfferCertaintyTest` | `activeMembers()`로 오퍼를 세우는 테스트다. 구성원 금액과 최소주문만 보므로 그대로 초록이어야 한다. 깨지면 구현을 멈추고 이슈에 묻는다 |

확인 명령은 `docs/WORKFLOW.md` §5의 api 테스트다.

## 3. 배너 계약(`api/src/test/resources/contracts/banner-cases.json`)

계약은 운영 응답을 적는다. 끈 것이 운영 기본이므로 기본 응답 사례를 하나 더하고, 접은 카드 사례는 켠 상태 표시를 달아 남긴다. 웹 묶음 카드 코드가 남아 있어 접은 응답 예시도 계속 필요하다(`web/src/bannerContract.test.js` 37-49행이 읽는다).

1. `cases[]`의 `ce-event-group`과 `group-rule-broken`에 `"groupFold": true` 한 칸을 더한다. 응답(`response`)은 그대로다.
2. 새 사례 `ce-event-group-unfolded`를 `ce-event-group` 바로 뒤에 더한다.
   - `why`: "묶기를 끈 기본 상태(2026-11-14, #386). 같은 group 구성원이 각자 한 장으로 나가고 members가 없다"
   - `banners`: `ce-event-group`의 `banners`와 글자까지 같은 두 장.
   - `response`: 두 장. 각자 `members: null`, `brands: null`, `brandLabels: null`, `group: "coupangeats-weekly-20260929"`, 자기 `amount`, `priority`, `soldOut`. 손으로 쓰지 않고 테스트 실패 메시지의 "실제:" 값을 옮긴 뒤 위 다섯 칸을 눈으로 확인한다.
3. `BannerContractTest.activeFor`에 사례 노드를 넘겨 `c.path("groupFold").asBoolean(false)`이면 `setGroupFold(true)`를 부른다. 칸 검사 테스트(`everyResponseCarriesExactlyTheContractKeys`)도 같은 도우미를 쓴다.
4. `responseKeys`, `memberKeys`, `specKeys`는 바꾸지 않는다.

`docs/CROSS-REPO-TESTS.md`에 따르면 같은 파일을 tracker 수집기 테스트와 beggars-ops 콘솔 테스트도 읽는다. 둘 다 이 저장소에 없어 사례 객체에 모르는 칸(`groupFold`)이 붙어도 괜찮은지 여기서 확인하지 못했다. 리뷰 포인트로 남긴다.

## 4. 웹 변경

### 4-1. 분석 `opens_at`

지금 `firstOpensAt`(`web/src/bannerAnalytics.js:41-44`)은 `members[].opensAt`만 읽는다. 쿠팡이츠 선착순 오픈은 2026-09-30부터 늘 묶음이었고 분석 속성은 2026-10-02에 생겨, 지금까지 `opens_at`은 묶음 카드에서만 값이 있었다. 접지 않으면 같은 배너가 `members` 없이 오고 여는 시각은 `spec.opensAt`에만 있다. 고치지 않으면 `opens_at`과 `opened`가 전부 `null`이 되고, 그것이 "여는 시각 없는 배너"와 구분되지 않는다.

```js
function firstOpensAt(banner) {
  const fromMembers = (Array.isArray(banner.members) ? banner.members : []).map((m) => m.opensAt).filter(Boolean).sort()
  return fromMembers[0] ?? banner.spec?.opensAt ?? null
}
```

62행 주석을 "여는 시각은 묶음이면 구성원(members[].opensAt) 중 가장 이른 것, 아니면 배너 자신의 spec.opensAt"으로 고친다.

나머지 속성은 고치지 않는다.

- `group`: `banner.group`을 그대로 싣는다. 끈 뒤에도 API가 `group`을 내려주므로 같은 행사의 구성원끼리 묶어 셀 수 있다. 깨지지 않는다.
- `member_count`: `members`가 없고 `brands`도 없으면 1이다. 끈 뒤 모든 `group` 배너가 1로 잡힌다. 사실 그대로다.
- `brands`: `brand` 하나가 실린다.

`web/src/bannerAnalytics.test.js`에 테스트 하나를 더한다.

```js
test('묶지 않은 선착순 배너는 spec.opensAt으로 여는 시각을 싣는다', () => {
  const p = bannerProps({ id: 'y', platform: 'coupangeats', brand: '두찜', amount: '7,000원', group: 'g1',
    spec: { opensAt: '17:00' } }, new Date(2026, 9, 2, 10, 0))
  assert.equal(p.opens_at, '17:00')
  assert.equal(p.opened, false)
  assert.equal(p.member_count, 1)
  assert.equal(p.group, 'g1')
})
```

### 4-2. 계약 소비 테스트

`web/src/bannerContract.test.js`에 테스트 하나를 더한다. `ce-event-group-unfolded`의 응답 각 장에 `bannerMemberLabels`를 돌리면 `brands`가 없어 빈 배열이고(`EventBanner.jsx`는 `brands?.length > 1`일 때만 구성원 줄을 그린다), `members`는 `null`이고, `bannerProps(item).opens_at`은 `null`이다(이 사례는 주간 행사라 여는 시각이 없다). 접힌 카드 테스트(37-49행)는 고치지 않는다.

두 파일 다 이미 `web/package.json`의 `test` 명령에 있다. 새 파일을 만들지 않는다.

### 4-3. 화면

화면 코드는 바꾸지 않는다. `bannerMembers.js`, `EventBanner.jsx`의 묶음 분기는 `brands?.length > 1`일 때만 타므로 그대로 둔다. 360px 스크린샷은 API를 끈 상태로 띄운 프리뷰에서 레일 한 장을 찍어 PR에 붙인다(웹 구현자 역할의 끝 조건).

## 5. 화면이 어떻게 달라지나

- 레일은 한 번에 한 장을 보이는 캐러셀이다(`EventBanner.jsx` 397-413행, 위와 목록 안 `inline` 모두). 장수가 늘어도 첫 화면 높이는 그대로이고 첫 화면이 밀리지 않는다.
- 달라지는 것은 한 바퀴 길이와 점 개수다. 쿠팡이츠 하루 선착순 묶음이 네 곳이면 1장이 4장, 주간 행사 묶음이 두 곳이면 1장이 2장이 된다. 4.3초마다 넘어가므로(`ROTATE_MS`, `docs/design/banner-grouping.md` 12-17행) 묶음 하나가 구성원 n곳이면 한 바퀴가 (n−1)×4.3초 늘어난다.
- 2026-09-09 묶기 설계(`docs/design/banner-grouping.md`)는 동시 배너가 5장에서 11장으로 늘자 배너 전환이 16%에서 9%로 떨어졌다고 적었다(이틀 표본). 묶기를 끄면 그 방향으로 돌아갈 수 있다. 이 이슈는 사용자 결정으로 끄는 것이라 막지 않고, 병합 뒤 볼 지표로 후속 조치에 남긴다.
- 구성원 한 장 한 장은 지금 묶음 규칙을 어긴 묶음이 이미 보이던 모양(`group-rule-broken` 사례)과 같다. 여는 시각은 카드 기간 문구가 말한다("오후 5시 오픈").
- 운영 배너 파일은 이 저장소에 없다(`api/src/main/resources/banners.yml`에 `group` 0건). 지금 올라가 있는 `group` 배너 개수는 이 세션에서 관측하지 못했다. 구현자가 프리뷰 또는 운영 `GET /api/banners`에서 `group`이 있는 장의 수를 세어 PR에 적는다.

## 6. 문서

이슈 "확인할 것"의 문서 수정은 API PR에 같이 넣는다. 한 묶음(변경 전파 3번)의 코드와 설명이 따로 병합되면 문서가 거짓말을 한다. API 구현자가 아래 세 곳을 고친다. 설계 문서가 정한 범위라 역할 경계(`api/`만) 예외로 둔다.

| 문서 | 고칠 것 |
| --- | --- |
| `docs/superpowers/decisions/2026-09-22-banner-model-rules.md` §4(103행) | 절 맨 위에 인용 한 단락: "> 2026-11-14 사용자 결정(#386): 서버 묶기를 끈다(`discount.banner-group-fold`, 기본 `false`). 아래 규칙은 켰을 때의 규칙이다. 끈 동안 `group`은 읽고 응답에 싣지만 접지 않고, 규칙 검사와 우선순위 합치기도 하지 않는다. 콘솔과 수집기 쪽 규칙은 tracker 이슈가 따로 정한다." 본문 문장은 지우지 않는다 |
| `docs/CHANGE-PROPAGATION.md` §3(106-119행) | 절 제목 아래 첫 줄에 "2026-11-14부터 서버 묶기는 꺼져 있다(`discount.banner-group-fold`, #386). 끈 동안 `active()`와 `activeMembers()`가 같은 목록이라 이 묶음의 '접는 쪽'이 쉰다. 켜면 아래가 다시 산다." 표의 "접는 쪽" 칸에 "(스위치를 켰을 때)"를 덧붙인다 |
| `docs/CROSS-REPO-TESTS.md` 122행 | 계약 설명 "yml 예시(새 모양, 묶음, 기간 밖)" 뒤에 "사례의 `groupFold: true`는 서버 묶기를 켠 응답이다. 없으면 기본(끔)" 한 문장 |

`docs/design/banner-grouping.md`는 승인된 설계라 고치지 않는다(`docs/design/README.md`).

## 7. 변경 전파

`docs/CHANGE-PROPAGATION.md`에서 이 변경이 닿는 묶음은 둘이다.

- **3번 묶음 배너(group)**: 만드는 쪽(tracker `propose_ce_ops`), 접는 쪽(`active()`), 안 접는 쪽(`activeMembers()`), 그리는 쪽(`EventBanner.jsx`). 접는 쪽과 안 접는 쪽은 이번에 같이 고친다(§2-2, §2-3). 그리는 쪽은 `members` 없는 카드를 이미 그려 고치지 않는다(§4-3). 만드는 쪽은 tracker 이슈가 맡는다. mono 스위치가 꺼져 있으면 tracker가 `group`을 계속 적어도 화면은 같다. 그래서 두 저장소의 병합 순서는 상관없다.
- **2번 배너 모양**: 응답 칸 이름은 그대로다. 계약 파일만 사례 하나와 칸 하나가 는다(§3). 계약을 읽는 tracker와 beggars-ops 테스트가 모르는 칸을 견디는지는 리뷰 포인트다.

알림(5번)은 `all()`을 쓰고 `active()`를 쓰지 않아 닿지 않는다.

## 8. 하지 않는 것

- 묶기 코드(`groupRuleBreak`, `groupAmount`, `Banner.Member`), `group`과 `members` 칸, 웹 묶음 카드 코드 삭제.
- 운영 배너 데이터 수정.
- `brands` 배열 묶음 끄기.
- 콘솔(beggars-ops)의 묶음 규칙 검사 끄기. tracker 이슈가 맡는다.
- reload로 스위치를 바꾸는 길. 재시작으로 충분하다.

## 9. 뒤집을 조건

- 배너 클릭 전환이 끈 뒤 눈에 띄게 떨어지고 사용자가 다시 묶자고 하면 `DISCOUNT_BANNER_GROUP_FOLD=true`로 재시작한다. 코드 변경은 없다.
- 묶기를 다시 쓸 일이 없다고 사용자가 정하면 별도 이슈로 묶기 코드와 `members` 칸을 지운다.
