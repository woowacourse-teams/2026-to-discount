# 수집 데이터 명세

분석하려는 사람이 먼저 알아야 할 것부터.

## 30초 요약

| 질문 | 답 |
|---|---|
| 무엇을 모으나 | 브라우저 행동 이벤트 18종 (`page_view`, `offer_link_click` 등) |
| 어디에 쌓이나 | **자체 원장** `events.jsonl`(단일 진실) + **PostHog**(탐색용) |
| 누구인지 아나 | 모른다. `visitorId`는 브라우저가 만든 난수, 지우면 끊긴다 |
| A/B는 어떻게 가르나 | 모든 이벤트의 `variant` 속성 (`a` / `b`) |
| 개발자 트래픽은 | `dev`(확실) 표시 + 원장 집계 때 세션 모양으로 추정. **지우지 않는다** |
| 판정은 무엇으로 | **원장**. PostHog는 탐색용 (아래 "왜 둘인가") |

**바로 쓰는 집계 명령**

```bash
cd <monorepo> && python scripts/experiments.py segments   # 차원별 전환율
python scripts/experiments.py compare --by variant        # A/B + z검정
python scripts/experiments.py --help                      # 나머지 명령
```

---

## 판단이 필요한 세 가지

### 1. 숫자가 어긋나면 원장이 맞다

같은 질문에 PostHog와 원장이 다른 답을 준다.

```
2026-08-20 실측
  PostHog  방문자 a 18명 / b 25명
  원장     방문자 a 13명 / b 22명
```

원장은 원본을 그대로 갖고 있어 판정 규칙을 나중에 고쳐 다시 셀 수 있다. PostHog는 보낸 시점의 속성이 박혀 있어 그럴 수 없다 — 실제로 개발 트래픽 추정 규칙이 틀린 것으로 드러났을 때 원장만 되돌릴 수 있었다. 확정 수치는 원장으로 낸다.

### 2. 표본이 작을 때 "1인당"은 거짓말한다

```
갈래 a  링크이동 16회 / 방문자 18명 = 0.89   ← 그럴듯해 보이지만
        실제로는 2명이 16회를 눌렀다
갈래 b  링크이동 10회 / 방문자 25명 = 0.40
        실제로는 4명이 10회를 눌렀다
```

**사람 수로 세라.** `uniqIf(distinct_id, event='offer_link_click')`이지 `countIf`가 아니다.

### 3. 없는 이벤트는 안 쌓인 것이지 안 일어난 것이 아니다

서버 허용 목록(`ALLOWED_EVENTS`)에 없는 이름은 **조용히 버려진다.** 실제로 2026-08-20까지 필터·담아보기 이벤트 6종이 그렇게 사라지고 있었다.

새 이벤트를 붙이면 `EventController.ALLOWED_EVENTS`도 같이 고쳐야 한다. `npm run test:event-contract`가 이 짝을 검사한다.

---

## 이벤트 18종

### 화면 진입·이탈

| 이벤트 | 언제 | 붙는 값 |
|---|---|---|
| `page_view` | 페이지 로드 1회 | — |
| `page_exit` | 탭을 떠날 때 | `dwellMs` (보고 있던 시간, 백그라운드 제외) |

### 무엇을 눌렀나

| 이벤트 | 언제 | 붙는 값 |
|---|---|---|
| `offer_link_click` | 할인 칩을 눌러 배달앱으로 나갈 때 | `brand`, `platform` |
| `banner_click` | 상단·하단 행사 배너 | `banner`(id), `brand`, `platform`, `position`(top/bottom) |
| `banner_impression` | 그 배너가 화면에 절반 이상 들어옴 | `banner`(id), `brand`, `platform`, `position` |
| `banner_dismiss` | 하단 배너 닫기(오늘 하루) | `banner`(id), `brand`, `platform` |
| `brand_expand` | 브랜드 카드를 펼침 | `brand`, `category` |
| `brands_retry` | 목록 불러오기 실패 후 재시도 | — |
| `scroll_to_top` | "맨 위로" | — |

### 조건을 어떻게 고르나 (A/B의 핵심)

| 이벤트 | 언제 | 붙는 값 |
|---|---|---|
| `category_change` | 분류 선택 | `category`, `from`(`bar`/`sheet`) |
| `platform_filter_toggle` | 배달앱 켜고 끔 | `platform`, `from`(`bar`/`sheet`) |
| `filter_sheet_open` | 바텀시트 열기 (**B안에만 있음**) | — |
| `filters_apply` | 시트에서 "적용" | `platforms`, `categories`, `sort` |
| `filters_reset` | 초기화 버튼 | — |
| `membership_toggle` | 멤버십 라벨 (아직 미구현 기능) | `platform`, `state:'soon'`, `from` |

### 담아보기

| 이벤트 | 언제 | 붙는 값 |
|---|---|---|
| `cart_toggle` | 카드 담기/빼기 | `brand`, `state`(add/remove) |
| `cart_view_toggle` | 담아둔 것만 보기 켜고 끔 | `state`, `count` |
| `cart_clear` | 비우기 | `count` |

---

## 모든 이벤트에 함께 실리는 값

### 신원 (개인 식별 아님)

| 필드 | 뜻 | 수명 |
|---|---|---|
| `visitorId` | 브라우저가 만든 난수 (`v_` + 16자리) | localStorage. 지우면 **영구히 끊긴다** |
| `sessionId` | 한 번의 방문 (`s_` + 16자리) | sessionStorage. 탭 닫으면 끝 |
| `visitCount` | 이 브라우저의 누적 방문 회차 | localStorage |

`visitorId`가 PostHog `distinct_id`가 된다. 이름·연락처·계정은 받지 않는다.

### 맥락

| 필드 | 뜻 | 주의 |
|---|---|---|
| `variant` | A/B 갈래 (`a`/`b`) | `visitorId` 해시로 정해져 재방문해도 안 바뀐다 |
| `device` | `mobile` / `desktop` | UA가 아니라 `matchMedia('(hover: hover)')`. **일부 안드로이드 브라우저가 `hover:hover`를 보고해 폰이 desktop으로 잡힌다 — 이 값만으로 기기를 가르지 말 것** |
| `viewport` | `"390x844"` | 개발 트래픽 판정의 핵심 단서 (아래 참고) |
| `referrer` | `direct` / `internal` / `external` | 원본 URL은 안 받는다 |
| `path` | 경로만 | 쿼리스트링 없음 |
| `eventId` | 이벤트마다 UUID 1개 | 재전송·이중 경로 중복 제거 키 |
| `ipHash` | 날짜별 솔트로 해시한 IP | **서버가 붙인다.** 하루 지나면 연결 불가 |
| `dev` | 개발 트래픽 표시 | 아래 참고 |

### 지금 걸린 조건 (`props`에 합쳐짐)

링크를 누른 순간 어떤 필터 상태였는지가 A/B의 답이라, 이벤트마다 실린다.

| 키 | 뜻 |
|---|---|
| `fCategory` | 고른 분류 (`all` 또는 `chicken+pizza`) |
| `fPlatforms` | 켜둔 앱 개수 |
| `fSearch` | 검색어가 있었나 |
| `fCart` / `fSaved` | 담아보기 켜짐 / 담아둔 개수 |
| `fSort` | 정렬 기준 (`best_desc` 등) |

---

## 개발자 트래픽 구분

**표시는 지우지 않는다. 무엇이 개발 트래픽인지는 나중에 바뀔 수 있는 판단이라, 안 받아버리면 되돌릴 수 없다.**

| 표시 | 판정 | 어디서 |
|---|---|---|
| `dev: true` | `?dev=1`을 연 브라우저 | 수집 시점. 확실하다 |
| (추정) | 세션 안에서 창 폭이 여러 개이고 최대 폭 ≥ 800px | **집계 시점**. `scripts/experiments.py`만 |

### `?dev=1`은 창마다 따로 켜야 한다

`localStorage`라 **브라우저·프로필·시크릿창이 각각 별개다.** 폰에서 켰다고 데스크톱이 따라오지 않고, 크롬에서 켰다고 사파리가 따라오지 않는다. 브라우저 데이터를 지우거나 시크릿창을 닫으면 표시도 사라진다.

> 2026-08-20 실측: 방문자 43명 중 **8명(19%)**이 표시 없는 개발 트래픽이었다. 표본이 수십 명일 때 이 비율은 결론을 뒤집는다.

### 추정은 이벤트 하나로 못 한다 — 그렇게 하다 368명을 잃었다

예전 규칙은 `device == "desktop" AND 뷰포트 폭 < 400px`이었고, 이벤트 하나만 보고 판정해 수집 시점에 `dev_suspect`를 붙였다. **이 규칙이 안드로이드 폰 사용자 368명을 개발자로 몰아냈다.**

```
걸러낸 무리의 폭 분포   384(3203)  360(1337)  368(133)  320(83)   전부 폰 폭
걸러낸 무리의 전환율    41.9%   (남긴 쪽 33.9%보다 높다)  ← 이게 단서였다
걸러낸 무리의 93%      세션 내내 폭이 하나:  [384]  또는  [360]

진짜 개발자의 폭       [849, 1283]   [1309, 1554, 1745, 1862]   [390, 1280]
```

원인은 `device`가 `matchMedia('(hover: hover)')`라는 것 — 일부 안드로이드 브라우저가 `hover:hover`를 보고한다.

**지금 규칙**: 한 사람의 세션 전체에서 뷰포트 폭이 여러 개로 나오고 그중 최대가 800px 이상이면 개발자. 창을 조절해 가며 본 흔적이다. 폰은 세션 내내 폭이 하나다.

이 판정은 **한 사람의 이벤트를 전부 모아야** 내릴 수 있다. 그래서 이벤트 하나만 보는 서버 매퍼와 브라우저 SDK에서는 판정하지 않는다. `dev_suspect` 속성은 더 이상 붙지 않는다.

---

## 어디에 쌓이고 어떻게 보나

### 자체 원장 — 단일 진실

```
서버  /home/ubuntu/delivery-discount-api/data/events.jsonl
형식  한 줄 = 이벤트 하나 (JSONL)
```

```bash
# 집계 (개발 트래픽 제외는 기본값)
python scripts/experiments.py segments

# 직접 볼 때
ssh <서버> "jq -c 'select(.dev != true)' /home/ubuntu/delivery-discount-api/data/events.jsonl"
```

### PostHog — 탐색용

```
프로젝트  548055 (us.posthog.com)
```

브라우저에서 조회 API를 부르면 표를 뽑을 수 있다(로그인 세션 사용):

```js
const csrf = document.cookie.split('; ').find(c => c.startsWith('posthog_csrftoken='))?.split('=')[1]
await fetch('/api/projects/548055/query/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
  body: JSON.stringify({ query: { kind: 'HogQLQuery', query: '<HogQL>' } }),
})
```

PostHog에서는 `?dev=1` 트래픽이 애초에 안 넘어온다. 표시 없는 개발 트래픽은 PostHog 쪽에서 못 거른다 — 세션 전체를 봐야 갈리기 때문이다. 그 구분이 필요한 판정은 원장으로 낸다.

---

## 왜 둘인가

같은 이벤트가 **두 경로로** PostHog에 갈 수 있다. 같은 `eventId`를 `$insert_id`로 쓰므로 하나로 합쳐진다.

> **2026-08-21 13:18(KST)부터 서버 릴레이는 켜져 있다**
> (`DISCOUNT_POSTHOG_ENABLED=true`).
>
> 그 전에 잠시 꺼 뒀던 이유는 같은 방문이 두 번 찍혀서였다 — SDK 자동
> pageview가 우리 `eventId`를 모르는 별개 id로 쏘고 있었다. 우리가 만든
> 이벤트끼리는 같은 `eventId`를 `$insert_id`로 써서 합쳐지지만, SDK가
> 스스로 쏘는 것은 그 규칙에 안 걸린다. 자동 발사를 끄면서
> (`capture_pageview: false`) 원인이 사라져 다시 켰다.
>
> 켜 두는 값어치: 광고 차단기·DNT로 클라이언트가 막힌 방문자도 회수된다
> (실측 10% 안팎, `scripts/coverage_snapshot.sh`).

| 경로 | 얻는 것 | 못 보는 것 |
|---|---|---|
| 클라이언트 SDK | Web Vitals, 기기·브라우저 속성 | 광고 차단기를 쓰는 방문자 |
| 서버 릴레이 | 차단기와 무관하게 도착 | 브라우저 정보 |

차단기를 쓰면 클라이언트 경로가 통째로 막힌다. 서버가 살아 있으면 그 방문자 이벤트도 남는다.

**자체 원장은 항상 전량을 받는다** — 같은 오리진이라 차단기에 안 막힌다. 그래서 판정을 원장으로 한다.

---

## 우리가 못 보는 사람들

**DNT/GPC를 켜면 네 경로 모두 아무것도 안 보낸다** — 자체 API·PostHog·GA4·Vercel Analytics. 광고 차단기도 `/api/events`를 막는다.

그 규모는 잴 수 있다. 화면을 그리려면 `/api/brands`를 반드시 부르는데 거기엔 게이트가 없다.

```
브랜드는 불렀는데 이벤트는 한 건도 안 보낸 IP  =  누락 추정
```

2026-08-07~21 실측: 하루 **4~17%**, 평균 **10% 안팎**이 그렇게 빠진다.

nginx 로그는 14일 뒤 사라지므로(`logrotate rotate 14`) 매일 새벽 집계만 뽑아 원장에 남긴다.

```
서버      /home/ubuntu/coverage_snapshot.sh   (크론 매일 01:05)
원장      data/coverage.jsonl
소스      scripts/coverage_snapshot.sh
```

```bash
ssh <서버> "cat /home/ubuntu/delivery-discount-api/data/coverage.jsonl"
```

**자릿수만 보는 값이다.** IP 기준이라 같은 와이파이는 뭉치고, 모바일은 흩어지고, 봇도 섞인다. "우리 통계가 실제의 대략 90%를 보고 있다" 정도로 읽는다.

전환율이나 A/B 비율을 볼 때 분모가 실제보다 작다는 뜻이라, **비율은 조금 부풀려져 있다.** 두 갈래에 같은 비율로 빠지므로 A/B 비교 자체는 성립한다.

## 안 모으는 것

의도적으로 받지 않는다. 없다고 버그가 아니다.

- 원본 IP (날짜별 해시만)
- User-Agent 문자열 (`device` 두 값으로 대체)
- 유입 URL 원문 (`direct`/`internal`/`external`만)
- 쿼리스트링, 검색어 원문 (`fSearch`는 있었나만)
- 이름·이메일·계정 — 로그인 기능 자체가 없다
- 세션 리플레이 (끔)
- `autocapture` (끔 — 명시적 이벤트와 중복되므로)

**DNT/GPC를 켜면 아무것도 안 보낸다.** 자체 API·PostHog·GA4·Vercel Analytics 전부.

---

# 상세

## A/B 갈래 배정

`visitorId`를 FNV-1a로 해시해 즉시 정한다.

```js
VARIANTS[hash(visitorId) % 2]   // src/variant.js
```

- **즉시 정해진다** — 서버나 SDK에 물으면 답이 올 때까지 무엇을 그릴지 모르고, 한쪽을 그렸다가 갈아끼우면 첫 화면이 눈앞에서 바뀐다. 그 깜빡임이 실험을 오염시킨다.
- **재방문해도 같다** — `visitorId`가 localStorage에 남는다. 매번 다른 화면을 주면 "이 화면이 쓸 만한가"가 아니라 "화면이 바뀌면 헷갈리는가"를 재게 된다.
- **비율은 원격에서 못 바꾼다** — 반반 고정. 다른 비율이 필요하면 PostHog 플래그로 옮겨야 한다(지금은 `advanced_disable_feature_flags`로 꺼둠).

확인·강제:

```
?variant=a   ?variant=b     URL로 강제 (배포 안 건드림)
VITE_UI_VARIANT=a           빌드 전체를 한쪽으로 고정 (사고 대응용)
```

두 안의 차이는 **상단 바 하나뿐**이다. 카드·배너·계측은 같은 코드를 쓴다.

```
A  앱 버튼 + 분류 캐러셀을 전부 펼침        (TopBarA.jsx)
B  검색 중심 바 + 분류 메뉴바 + 바텀시트     (App.jsx, MenuBar, FilterSheet)
```

CSS는 `[data-variant="a"]` 아래에 둔다. `variant.js`가 뿌리에 새기고, 첫 렌더 **전에** 새겨야 A안이 B 스타일로 한 프레임 그려지는 걸 막는다.

## 수집 경로 상세

### 1. 브라우저 → 자체 API

```
analytics.js  track() → 메모리 큐 → 3초마다 또는 10건마다 flush
              페이지 이탈 시 sendBeacon (실패하면 fetch 폴백)
POST /api/events   배열, text/plain도 받음 (sendBeacon이 preflight 못 해서)
```

서버가 받으면서 하는 일:

| 처리 | 값 |
|---|---|
| 허용 목록 대조 | 모르는 이름은 버림 |
| 배치 상한 | 20건 (초과분 버림) |
| 문자열 상한 | 120자 (자름) |
| props 개수 | 6개 |
| `variant` 검사 | `[a-z0-9_-]{1,16}` 아니면 `null` |
| IP 해시 | SHA-256(IP + 그날 날짜 + 프로세스 기동 시 만든 난수 솔트) |
| 시각 | 서버 수신 시각을 `ts`로 (클라이언트 `clientTs`는 따로 보관) |

### 2. 서버 → PostHog (릴레이)

```
events.jsonl 기록 후 → outbox(파일) → worker가 /batch/로 전송
DISCOUNT_POSTHOG_ENABLED=true
```

- `dev: true`인 이벤트는 **안 보낸다** (`PostHogEventMapper:25`)
- `visitorId` 없으면 안 보낸다 (`distinct_id`를 못 만듦)
- 변환: `page_view` → `$pageview`, `visitorId` → `distinct_id`, `eventId` → `$insert_id`
- 실패는 재시도, 계속 실패하면 `dead-letter/`

### 3. 브라우저 → PostHog (SDK 직송)

```
VITE_POSTHOG_KEY / VITE_POSTHOG_HOST 가 있어야 동작
없으면 지연 import가 통째로 제거된다 (번들에 posthog 청크가 안 생김)
```

- DNT/GPC면 SDK를 **아예 안 부른다**
- `?dev=1`이면 제품 이벤트를 안 보낸다 (연결 진단만 예외)
- `autocapture` 끔, 세션 리플레이 끔, Web Vitals 켬
- `person_profiles: 'always'` — 서버 릴레이와 방침을 맞춘 값. 한쪽만 `'never'`면 어느 쪽이 먼저 닿느냐에 따라 프로필이 생겼다 말았다 해서 리텐션이 들쭉날쭉해진다

## 알려진 함정

| 증상 | 원인 | 확인 |
|---|---|---|
| 새 이벤트가 안 쌓인다 | `ALLOWED_EVENTS`에 없음 | `npm run test:event-contract` |
| PostHog에 `web` 출처가 0건 | 키 없음 또는 DNT | 번들에 posthog 청크 있는지, `navigator.doNotTrack` |
| 내 클릭이 실데이터에 섞임 | 그 창에 `?dev=1` 안 켬 | `localStorage.dk_dev` |
| PostHog와 원장 숫자가 다름 | 개발 트래픽 제외 범위가 다르다 | 원장을 믿는다 |
| 리텐션이 끊김 | `person_profiles` 방침이 두 경로에서 갈림 | `posthog.js` 설정 |
| 갈래가 한쪽만 나옴 | `.env.production`에 `VITE_UI_VARIANT` 남아 있음 | 그 줄을 지운다 |
| 갈래 차이가 두 배로 보임 | 1인당 총합을 봤다 — 소수가 많이 눌러 부푼다 | `experiments.py compare`의 전환율 |
| 모바일 사용자가 통계에서 사라짐 | `device`만 보고 걸렀다 — 폰이 desktop으로 잡힌다 | `compare --by width` |

## 지표를 볼 때 지켜야 할 것

### 총합이 아니라 전환율을 본다

"1인당 링크이동"(총합 ÷ 사람 수)은 소수가 많이 누르면 통째로 부푼다.

```
2026-08-24 실측
  1인당      a 0.37   b 0.74     b가 두 배로 보인다
  전환율     a 18.7%  b 18.1%    차이 없음 (p=0.89)
  중앙값     a 1회    b 1회
  최다 1명   a 15회   b 43회     ← b 총 클릭 115회 중 43회가 한 사람
```

`experiments.py`는 방문자 단위로만 센다 — 한 사람이 몇 번 누르든 1이다.
신뢰구간(Wilson)과 z검정을 같이 내므로 "차이가 있어 보인다"와 "차이가
있다"를 구분할 수 있다.

### 방문자 급증은 배포와 무관하다

홍보로 들어온 트래픽이라 릴리스 평가에 쓸 수 없다. 07-31(671명, 커밋
26건)만 보면 릴리스 효과처럼 읽히지만 08-18(396명, 커밋 1건)과
08-24(200명, 커밋 0건)가 그 해석을 깬다.

**릴리스를 재려면 방문자로 나눈 지표를 본다.**

### 신규와 재방문을 갈라 본다

UI를 바꾸면 **재방문자만** 흔들린다. 그들은 이전 화면에 익숙해서
위치가 바뀌면 못 찾고, 신규는 비교 대상이 없어 영향이 없다.

2026-08-19 개편(배너 도입 + 상단 바·필터 시트 재구성, 커밋 19건)
전후를 갈라 보면 그 패턴이 그대로 나온다.

```
           08-10~18       08-19~24      검정
재방문     34.8%          18.0%         z=-5.28  p<0.0001  유의
신규       17.6%          20.6%         z= 1.11  p=0.27    변화 없음
```

같은 개편에서 `brand_expand`(카드 펼치기)가 사실상 죽었다. 08-14 51건 →
08-16 7건 → 이후 한 자릿수. 재방문자가 익힌 경로가 통째로 바뀐 것이
원인이라는 해석과 맞는다.

```bash
python scripts/experiments.py compare --by period:2026-08-19
python scripts/experiments.py funnel --steps page_view,category_change,brand_expand,offer_link_click
```

합쳐서 보면 "전환율이 25%에서 18%로 떨어졌다"로만 보이고 원인이 안
드러난다. 갈라야 어느 쪽이 무엇에 반응했는지 보인다.

## 판정 기준은 한 곳에만 둔다

개발 트래픽 판정은 `scripts/experiments.py`의 `Visitor.looks_developer()`
하나뿐이다. 예전에는 같은 규칙이 서버 매퍼·브라우저 SDK·집계 셸 스크립트
세 곳에 복사돼 있었고, 그 규칙이 틀린 것으로 드러났을 때 세 곳이 각각 다른
숫자를 내고 있었다.

수집 쪽(서버·브라우저)은 판정하지 않는다 — `viewport`를 그대로 실어 보낼
뿐이다. 판정은 원장 전체를 읽는 집계 쪽에서만 한다. 규칙이 또 바뀌어도
과거 데이터를 다시 셀 수 있다.

## 실험을 세우고 검증하는 법

`scripts/experiments.py` 하나로 다 한다. 원장을 방문자 단위로 접어
집단을 나누고, 전환율과 신뢰구간과 z검정을 낸다.

### 시작 전: 표본이 되는지 먼저 본다

```bash
python scripts/experiments.py power --baseline 0.34
```
```
기준 전환율 33.3%, 상대 개선 목표별 갈래당 필요 인원 (검정력 80%)
  +   5%  →  12,730명       ← 이 규모는 못 모은다
  +  10%  →   3,218명
  +  15%  →   1,445명
  +  20%  →     821명
  +  30%  →     371명       ← 현실적인 하한
```

**지금 트래픽(하루 60~250명)으로는 상대 30% 이상 차이만 잡힌다.**
그보다 작은 개선을 A/B로 증명하려 들면 몇 달이 걸린다. 작은 변화는
A/B 대신 퍼널의 어느 단계가 새는지로 판단한다.

### 갈래를 가르는 축

| `--by` | 나누는 기준 | 쓰는 곳 |
|---|---|---|
| `variant` | `a` / `b` | 계획된 A/B |
| `returning` | 재방문 / 신규 | UI 개편의 영향 (재방문자만 흔들린다) |
| `width` | 최소 뷰포트 폭 | 기기 구분. `device`보다 믿을 만하다 |
| `referrer` | direct / external / internal | 유입 경로 |
| `period:YYYY-MM-DD` | 그 날 전/후 **첫 유입** | 배포 전후 코호트 |

`--only returning|new`, `--since`, `--until`로 모수를 더 좁힌다.

### 무엇을 전환으로 볼지 바꾼다

`--goal`은 아무 이벤트나 받는다. 링크 이동 말고 다른 것을 재고 싶을 때:

```bash
python scripts/experiments.py compare --by variant --goal banner_click
python scripts/experiments.py compare --by variant --goal cart_toggle
```

### 어디서 새는지 본다

```bash
python scripts/experiments.py funnel --steps page_view,category_change,brand_expand,offer_link_click --only returning
```

단계마다 **앞 단계를 모두 거친 사람 중에서만** 센다. 순서를 잘못 주면
도달률이 100%를 넘는 대신 급격히 줄어든다 — 그건 사용자가 그 순서로
움직이지 않는다는 뜻이다.

### 어떤 브랜드·배너가 먹혔나

```bash
python scripts/experiments.py top --event offer_link_click --prop brand
python scripts/experiments.py top --event banner_click --prop banner
python scripts/experiments.py top --event banner_click --prop position
python scripts/experiments.py top --event category_change --prop category
```

`props`에 실린 키는 위 "지금 걸린 조건" 표와 이벤트별 값 전부 쓸 수 있다.

### 판정을 믿기 전에

1. **`audit`를 먼저 본다.** 개발 트래픽 판정이 사람을 잡아먹고 있지 않은지.
   걸러낸 무리의 전환율이 남긴 쪽보다 **높으면** 규칙이 틀린 것이다.
2. **`p >= 0.05`는 "차이 없음"이 아니라 "모른다"다.** 그럴 때 도구가
   필요한 표본 수를 같이 알려준다.
3. **여러 축을 훑다 보면 하나는 우연히 유의해진다.** `segments`로 여섯
   개를 보면 그중 하나가 p<0.05인 것은 정상이다. 미리 정한 가설만 판정에
   쓰고 나머지는 다음 실험의 후보로 남긴다.

## 관련 문서

- [api/docs/traffic-analytics.md](../api/docs/traffic-analytics.md) — 서버 수집·릴레이 계약
- [web/README.md](../web/README.md) — 프론트 계측과 개인정보 고지
- [api/docs/decisions/ADR-005](../api/docs/decisions/ADR-005-first-party-analytics.md) — 자체 수집을 둔 배경

**할인 원장(`log.jsonl`)은 별개 데이터다.** 브랜드·오퍼 수집 명세는 tracker 쪽 문서를 본다.
