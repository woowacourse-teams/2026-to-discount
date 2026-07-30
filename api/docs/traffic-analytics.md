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
  `brand_expand`, `offer_link_click`, `membership_open`, `capture_note_seen`.
  목록에 없는 `event` 값은 조용히 버려진다.
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

### 본인 테스트 트래픽 (`dev` 플래그)

배포된 사이트를 개발자가 직접 열어 확인하다 보면 그 클릭도 실 트래픽처럼
`events.jsonl`에 섞인다. 프론트(`delivery-discount-web/src/analytics.js`)에서
`?dev=1`을 한 번 열면 `localStorage`에 남아 이후 모든 이벤트에 `dev: true`가
붙는다(`?dev=0`으로 다시 끔). 기기·브라우저별로 따로 켜야 한다.

`TrafficStatsService.compute()`가 `dev: true`인 이벤트를 자동으로 제외하므로
`/api/stats/traffic`·`/stats.html` 수치는 이미 걸러진 값이다. 원본
`events.jsonl`을 직접 `jq`로 볼 때는 수동으로 걸러야 한다:

```bash
jq -c 'select(.dev != true)' events.jsonl
```

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
