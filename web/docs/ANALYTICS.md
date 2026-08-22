# 수집 데이터 명세

분석하려는 사람이 먼저 알아야 할 것부터.

## 30초 요약

| 질문 | 답 |
|---|---|
| 무엇을 모으나 | 브라우저 행동 이벤트 18종 (`page_view`, `offer_link_click` 등) |
| 어디에 쌓이나 | **자체 원장** `events.jsonl`(단일 진실) + **PostHog**(탐색용) |
| 누구인지 아나 | 모른다. `visitorId`는 브라우저가 만든 난수, 지우면 끊긴다 |
| A/B는 어떻게 가르나 | 모든 이벤트의 `variant` 속성 (`a` / `b`) |
| 개발자 트래픽은 | `dev`(확실) + `dev_suspect`(추정) 두 표시로 구분. **지우지 않는다** |
| 판정은 무엇으로 | **원장**. PostHog는 탐색용 (아래 "왜 둘인가") |

**바로 쓰는 집계 명령**

```bash
cd <monorepo> && bash scripts/ab_report.sh
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

원장에는 `dev_suspect` 규칙이 처음부터 있었고 PostHog에는 나중에 붙었다. **과거 데이터에는 PostHog 쪽에 그 표시가 없다.** 확정 수치는 원장으로 낸다.

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
| `device` | `mobile` / `desktop` | UA가 아니라 `matchMedia('(hover: hover)')` |
| `viewport` | `"390x844"` | `dev_suspect` 판정에 쓰인다 |
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

**두 겹이다. 둘 다 지우지 않고 표시만 남긴다.**

| 표시 | 판정 | 확실성 |
|---|---|---|
| `dev: true` | `?dev=1`을 연 브라우저 | 확실 |
| `dev_suspect: true` | `device=desktop` **AND** 뷰포트 폭 < 400px | 추정 |

### `?dev=1`은 창마다 따로 켜야 한다

`localStorage`라 **브라우저·프로필·시크릿창이 각각 별개다.** 폰에서 켰다고 데스크톱이 따라오지 않고, 크롬에서 켰다고 사파리가 따라오지 않는다. 브라우저 데이터를 지우거나 시크릿창을 닫으면 표시도 사라진다.

> 2026-08-20 실측: 방문자 43명 중 **8명(19%)**이 표시 없는 개발 트래픽이었다. 표본이 수십 명일 때 이 비율은 결론을 뒤집는다.

### `dev_suspect`가 보조하는 이유

`device`는 `matchMedia('(hover: hover)')`로 정한다. desktop인데 창이 좁으면 데스크톱 브라우저를 줄여 놓은 것, 곧 반응형 확인이다. 400px은 가장 넓은 흔한 폰(430px)보다 아래라 실기기와 안 겹친다.

폭을 못 읽으면 표시를 **안** 붙인다 — 모르는 것을 개발 트래픽으로 몰면 실사용자가 조용히 빠진다.

**주의**: `dev_suspect`는 2026-08-21부터 붙는다. 그 이전 PostHog 데이터에는 없다.

---

## 어디에 쌓이고 어떻게 보나

### 자체 원장 — 단일 진실

```
서버  /home/ubuntu/delivery-discount-api/data/events.jsonl
형식  한 줄 = 이벤트 하나 (JSONL)
```

```bash
# 갈래별 집계 (개발 트래픽 두 규칙 모두 제외)
bash scripts/ab_report.sh

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

PostHog에서 개발자를 빼려면 `dev_suspect is not set` 필터를 건다.

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
| PostHog와 원장 숫자가 다름 | `dev_suspect` 시점 차이 | 원장을 믿는다 |
| 리텐션이 끊김 | `person_profiles` 방침이 두 경로에서 갈림 | `posthog.js` 설정 |
| 갈래가 한쪽만 나옴 | `.env.production`에 `VITE_UI_VARIANT` 남아 있음 | 그 줄을 지운다 |

## 판정 기준이 두 곳에 있다

`dev_suspect` 규칙은 아래 두 곳에 각각 구현돼 있다.

```
api/.../PostHogEventMapper.looksLikeDeveloper()   PostHog로 넘길 때
scripts/ab_report.sh 의 KEEP 필터                  원장 집계할 때
```

원장은 jq로 읽고 릴레이는 Java라 코드를 공유할 수 없다. **기준을 바꿀 때는 둘 다 고쳐야 한다.** 한쪽만 고치면 도구마다 다른 숫자가 나온다.

## 관련 문서

- [api/docs/traffic-analytics.md](../api/docs/traffic-analytics.md) — 서버 수집·릴레이 계약
- [web/README.md](../web/README.md) — 프론트 계측과 개인정보 고지
- [api/docs/decisions/ADR-005](../api/docs/decisions/ADR-005-first-party-analytics.md) — 자체 수집을 둔 배경

**할인 원장(`log.jsonl`)은 별개 데이터다.** 브랜드·오퍼 수집 명세는 tracker 쪽 문서를 본다.
