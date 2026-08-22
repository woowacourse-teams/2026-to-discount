# 트래픽 수집·통계

> 수집·저장 코드(`analytics` 패키지)는 원래 커밋 없이 서버에만 배포되어 있었다.
> 2026-07-30에 배포된 jar를 디컴파일해 git으로 복구했고, 그 김에 통계 조회
> 기능(`TrafficStatsService`/`StatsController`/`stats.html`)을 새로 얹었다.

## 수집 방식

프론트(`delivery-discount-web`)가 방문자 행동을 배치로 모아
`POST /api/events`에 보낸다(구현: `com.discounttracker.analytics.EventController`).

- **요청 형식**: JSON 배열, 각 원소는 `event, visitorId, sessionId, visitCount,
  path, referrer, device, viewport, dwellMs, props, clientTs` 필드를 가진
  객체(전부 optional).
- **허용 이벤트 화이트리스트**: `page_view`, `page_exit`, `category_change`,
  `brand_expand`, `offer_link_click`, `banner_click`, `platform_filter_toggle`,
  `filters_reset`, `brands_retry`, `scroll_to_top`, `membership_toggle`,
  `filters_apply`, `cart_toggle`, `filter_sheet_open`, `cart_view_toggle`,
  `cart_clear`. 목록에 없는 `event` 값은 조용히 버려진다.
- **배치 상한**: 요청 하나당 최대 20건(넘으면 앞의 20건만 처리).
- **필드 길이 제한**: 문자열 필드는 120자로 잘리고, `props`는 키 6개까지만
  유지된다(악성/비대 payload 방어).
- **레이트 리밋**: 클라이언트(ipHash)당 분당 120개 이벤트. 초과 시
  `429 Too Many Requests`.
- **응답**: `{"accepted": N}` — 저장에 성공한 이벤트 수.

## 프라이버시 (IP 해싱)

원본 IP는 저장하지 않는다. `ClientFingerprint`가 `SHA-256(salt + 날짜 +
IP)`를 16진수 8바이트로 잘라 `ipHash`로 남긴다.

- `salt`는 32바이트 랜덤값으로, **프로세스가 뜰 때 한 번** 생성되어 메모리에만
  존재한다 — 재배포·재시작마다 새로 생성되므로, 재시작 전후의 `ipHash`는
  서로 대응시킬 수 없다.
- 같은 프로세스 안에서도 날짜(`LocalDate.now()`, 서버 로컬 타임존 기준)가
  바뀌면 같은 IP라도 `ipHash`가 달라진다.
- 즉 "이 해시가 언제 어떤 실제 IP였는지"는 그 프로세스가 살아있는 동안,
  같은 날짜 안에서만 내부적으로 일관된다 — 외부에서 역산은 불가능(salt를
  모르므로)하고, 운영자도 재시작 이후엔 이전 해시와 연결 짓지 못한다.

## 저장 형식

한 줄에 이벤트 하나, JSON Lines(`.jsonl`)로 append-only 기록한다
(`EventLog`). 경로는 `discount.event-log-path` 프로퍼티로 설정하며:

- 로컬 기본값: `data/events.jsonl` (`application.yml`에 명시 안 하면 이 기본값)
- 운영(systemd, `/etc/systemd/system/delivery-discount-api.service`):
  `DISCOUNT_EVENT_LOG_PATH=/home/ubuntu/delivery-discount-api/data/events.jsonl`
  환경변수로 오버라이드. 같은 서비스 파일에서 `export.json`도
  `DISCOUNT_EXPORT_PATH=file:.../data/export.json`로 이 저장소 루트의
  `data/` 디렉터리를 가리키게 되어 있다 — 그래서 `data/`가 이 저장소
  워킹 디렉터리에 실제 운영 데이터로 존재한다(git에는 커밋하지 않음,
  `.gitignore` 참고).

### `VisitEvent` 스키마 (한 줄 = 한 레코드)

| 필드 | 설명 |
|---|---|
| `ts` | 서버가 이벤트를 받은 시각 (`OffsetDateTime`, ISO-8601) |
| `event` | 이벤트 종류 (위 화이트리스트 중 하나) |
| `visitorId`, `sessionId` | 프론트가 생성한 익명 식별자 |
| `visitCount` | 해당 방문자의 누적 방문 횟수(프론트 계산) |
| `path`, `referrer`, `device`, `viewport` | 페이지 컨텍스트 |
| `dwellMs` | 체류 시간(ms), 보통 `page_exit`에 실림 |
| `props` | 이벤트별 부가 정보(예: `category_change`의 `{"category":"chicken"}`) |
| `clientTs` | 클라이언트 측 타임스탬프(있으면) |
| `ipHash` | 위 프라이버시 절 참고 |
| `dev` | 본인 테스트 트래픽 표시(2026-07-31 추가). 아래 참고 |
| `eventId` | 클라이언트가 이벤트마다 발급한 UUID. 없거나 잘못된 값이면 서버가 발급하며, PostHog 재전송 중복 방지용 `$insert_id`로 사용 |

### 본인 테스트 트래픽 (`dev` 플래그)

배포된 사이트를 개발자가 직접 열어 확인하다 보면 그 클릭도 실 트래픽처럼
`events.jsonl`에 섞인다. 프론트(`delivery-discount-web/src/analytics.js`)에서
`?dev=1`을 한 번 열면 `localStorage`에 남아 이후 모든 이벤트에 `dev: true`가
붙는다(`?dev=0`으로 다시 끔).

> **개발자가 반드시 알아야 할 것**
>
> 이 표시는 `localStorage`에 저장되므로 **브라우저·프로필·시크릿창마다 따로
> 잡힌다.** 한 기기에서 켰다고 다른 기기가 따라오지 않고, 같은 기기라도
> 크롬·사파리·시크릿창이 각각 별개다. 확인용으로 여는 창마다 한 번씩
> `?dev=1`을 열어야 한다.
>
> 실제로 이 때문에 새고 있었다 — 2026-08-20 실측에서 방문자 43명 중 8명
> (19%)이 표시 없는 개발 트래픽이었다. A/B 표본이 수십 명일 때 이 비율은
> 결론을 뒤집는다.
>
> `localStorage`를 비우면(브라우저 데이터 삭제, 시크릿창 종료) 표시도 같이
> 사라진다. 그때는 다시 켜야 한다.

#### 표시가 빠졌을 때의 보조 판정 (`dev_suspect`)

표시를 빠뜨린 트래픽을 잡기 위해, 서버가 PostHog로 넘길 때 조건을 하나 더
본다.

```
device == "desktop"  AND  뷰포트 폭 < 400px   ->  dev_suspect: true
```

`device`는 프론트가 `matchMedia('(hover: hover)')`로 정한다. desktop인데 창이
좁으면 데스크톱 브라우저를 줄여 놓은 것, 곧 반응형 확인이다. 실제 사용자에게는
거의 안 나오는 조합이고, 400px은 가장 넓은 흔한 폰(430px)보다 아래라 실기기와
겹치지 않는다.

**거르지 않고 표시만 남긴다.** 무엇이 개발 트래픽인지는 나중에 바뀔 수 있는
판단이라, 안 보내버리면 되돌릴 수 없다. PostHog에서는 이 속성으로 필터하고,
자체 원장은 원본을 그대로 갖고 있어 집계할 때 같은 규칙을 다시 적용한다
(`scripts/ab_report.sh`).

폭을 못 읽으면 모르는 것이지 좁은 것이 아니다 — 표시를 안 붙인다. 모르는 것을
개발 트래픽으로 몰면 실사용자가 조용히 빠진다.

판정 기준은 `PostHogEventMapper.looksLikeDeveloper()` 한 곳에만 있다. 바꿀 때는
`scripts/ab_report.sh`의 같은 규칙도 함께 고쳐야 한다 — 두 곳이 갈리면 도구마다
다른 숫자가 나온다.

`TrafficStatsService.compute()`가 `dev: true`인 이벤트를 자동으로 제외하므로
`/api/stats/traffic`·`/stats.html` 수치는 이미 걸러진 값이다. 원본
`events.jsonl`을 직접 `jq`로 볼 때는 수동으로 걸러야 한다:

```bash
jq -c 'select(.dev != true)' events.jsonl
```

## PostHog 자동 전달

PostHog 전달은 원본 수집과 분리된 부가 경로다. `EventLog`가
`events.jsonl` 기록을 마친 뒤 `AnalyticsEventService`가 정제된 payload를
파일 outbox에 등록하고, 단일 worker가 PostHog `/batch/`로 전달한다.
`POST /api/events`의 `accepted`는 PostHog 도착 건수가 아니라 원본 JSONL에
기록된 건수다.

**서버 outbox는 2026-08-21 13:18(KST)부터 켜져 있다**
(`DISCOUNT_POSTHOG_ENABLED=true`). 두 경로가 같은 이벤트를 보내지만 같은
`eventId`를 `$insert_id`로 쓰므로 PostHog가 하나로 합친다.

그 전에 잠시 꺼 뒀던 이유는 SDK가 **자동으로** 쏘는 이벤트(`$pageview` 등)가
제 uuid를 달고 와서 그 규칙에 안 걸렸기 때문이다 — 같은 방문이 속성이 다른
두 건으로 남았다. 자동 발사를 끄면서(`capture_pageview: false`) 원인이
사라졌다. 다시 끄거나 SDK 설정을 되돌릴 때는 이 짝을 먼저 확인한다.

둘을 함께 두는 이유는 각자 못 보는 곳이 다르기 때문이다.

| 경로 | 얻는 것 | 못 보는 것 |
|---|---|---|
| 클라이언트 SDK | Web Vitals, 기기·브라우저 속성 | 광고 차단기를 쓰는 방문자 |
| 서버 릴레이 | 차단기와 무관하게 도착 | 브라우저 정보 |

차단기를 쓰면 클라이언트 경로가 통째로 막힌다. 서버가 살아 있으면 그
방문자의 이벤트도 남는다.

대신 두 경로의 person 처리 방침이 갈리면 안 된다. 어느 쪽이 먼저 닿을지
정해져 있지 않아서, 한쪽만 `$process_person_profile: false`를 실어 보내면
같은 종류의 이벤트인데도 프로필이 생겼다 말았다 한다. 웹 SDK를
`person_profiles: 'always'`로 두어 서버(프로필 생성)와 맞춘다.

### 변환 규칙

- `page_view` → `$pageview`
- `visitorId` → `distinct_id`
- `sessionId` → `source_session_id`
- `eventId` → `$insert_id`
- 서버 수신 시각 `ts` → PostHog top-level `timestamp`
- `visitCount`, 페이지 컨텍스트와 정제된 `props` → event properties
- `ipHash`와 `dev=true` → 전달하지 않음

`visitorId`가 없는 이벤트는 PostHog의 필수 `distinct_id`를 만들 수 없으므로
원본 JSONL에만 남기고 outbox에는 등록하지 않는다.

서버 소유 속성(`distinct_id`, `$insert_id` 등)은 클라이언트의 `props`가
덮어쓸 수 없다. 클라이언트가 이벤트 생성 시 발급한 유효한 `eventId`는 서버가
그대로 `$insert_id`로 사용하므로, 같은 payload를 재전송해도 PostHog에서 중복
집계되지 않는다. `eventId`가 없거나 잘못된 구버전 요청은 서버 UUID로 보완하므로
요청 간 중복 제거까지는 보장하지 않고, 동일한 outbox 레코드의 재시도만 같은
`$insert_id`를 유지한다.

### outbox와 재시도

전달을 활성화할 때는 `DISCOUNT_POSTHOG_OUTBOX_PATH`로 jar 밖의 영속 경로를
반드시 지정한다. 비활성 상태에서는 이 값이 없어도 시작할 수 있다.

```text
posthog-outbox/
├── pending/{eventId}.json
└── dead-letter/{eventId}.json
```

pending 파일은 임시 파일 작성 후 원자적으로 이동한다. worker는 HTTP 요청
전에 `attemptCount`를 올리고 다음 시도 시각을 저장한다. 실패하면 1시간 뒤
다시 시도하며 최초 시도를 포함해 최대 5회만 전송한다. 다섯 번째 실패 파일은
마지막 오류와 실패 시각을 기록해 dead-letter로 이동하고 자동 재시도를
중단한다.

웹 SDK 직접 전송 배포 전 운영 서버에 적용할 설정:

```bash
DISCOUNT_POSTHOG_ENABLED=false
```

웹을 이전 버전으로 롤백해 서버 전달을 다시 활성화할 때 필요한 환경변수:

```bash
DISCOUNT_POSTHOG_ENABLED=true
POSTHOG_PROJECT_TOKEN=<project-token>
POSTHOG_HOST=https://us.i.posthog.com
DISCOUNT_POSTHOG_OUTBOX_PATH=/home/ubuntu/delivery-discount-api/data/posthog-outbox
```

활성 상태에서 토큰이 비어 있거나 outbox를 준비할 수 없으면 시작을 실패시킨다.
PostHog의 HTTP 오류·타임아웃·네트워크 오류는 원본 수집 응답에 전파하지 않는다.

## 통계 조회 (신규)

파일을 다시 스캔해 그때그때 집계하는 방식이라 별도 배치/스케줄러가 없다 —
요청할 때마다 최신 `events.jsonl` 기준으로 계산된다(`TrafficStatsService`).

- **`GET /api/stats/traffic?days=N`** (기본 7, 최대 365): 아래를 JSON으로
  반환.
  - `totalEvents`, `uniqueVisitors`, `uniqueSessions`
  - `eventCounts` — 이벤트 종류별 개수
  - `dailyPageViews` — 날짜별 `page_view` 수(시간순 정렬)
  - `topPaths`, `topReferrers` — `page_view` 기준 상위 10개
  - `deviceBreakdown` — `page_view`의 `device`별 개수
  - `avgDwellMs` — `page_exit`의 평균 체류시간
  - `categoryChanges` — `category_change`의 `props.category`별 개수
- **`/stats.html`**: 위 API를 호출해 막대그래프/표로 보여주는 정적
  대시보드(같은 앱이 서빙, 외부 CDN 의존 없음). 브라우저에서
  `https://bebeggars.duckdns.org/stats.html`로 바로 열면 된다. 기간(7/14/30/90일)
  버튼으로 다시 조회.

### 주의

- 이 API·대시보드는 나머지 `/api/**`와 마찬가지로 **인증이 없다.** 집계값만
  보여주고 개별 `ipHash`/`visitorId` 로우는 노출하지 않지만, 완전히 비공개로
  두고 싶다면 nginx 단에서 basic auth나 IP 제한을 추가로 걸어야 한다(지금은
  걸려 있지 않음).
- `days`가 크고 `events.jsonl`이 매우 커지면 매 요청마다 전체 파일을 다시
  읽는다. 지금 규모(수백~수천 줄)에서는 문제없지만, 파일이 크게 자라면
  캐싱이나 사전 집계를 고려할 것.
