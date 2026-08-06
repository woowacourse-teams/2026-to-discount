# 오케스트레이션 계약 (Orchestration Contract)

이 문서는 파이프라인의 다른 두 레포(delivery-discount-tracker,
delivery-discount-web)가 이 레포와 맞물리는 지점만 다룬다. 소스 코드를
직접 읽어 작성했다 — 다른 문서(README, ADR)와 다르면 이 파일이 아니라
소스가 맞다. 갱신은 코드가 바뀔 때마다, 최소한 아래 계약 표면이 바뀔 때
수동으로 반영한다.

## 1. 역할

파이프라인의 가운데 단계(가공) — tracker가 만든 `export.json`(판독 결과)을
읽어 브랜드 단위로 비교·정리한 뒤 HTTP API로 web에 내려준다. DB 없음,
파일 하나를 메모리에 캐시.

## 2. 노출 API (다른 레포가 호출)

베이스: `/api` (포트는 §4 참고). 전부 `@RestController`, 인증 없음.

### GET /api/brands

- 컨트롤러: `src/main/java/com/discounttracker/web/BrandController.java:26-29`
- 응답: `List<BrandComparison>` (`src/main/java/com/discounttracker/comparison/BrandComparison.java:23-27`, JSON 필드는 `@JsonProperty`/레코드 컴포넌트 기준)

```json
[
  {
    "name": "string",
    "category": "chicken | pizza | fastfood | cafe | convenience | null",
    "links": { "platformKey": "url", "...": "..." },
    "maxConfirmedAmount": "number | null",
    "offers": [
      {
        "platform": "string",
        "amount": "number | null",
        "qualifier": "string | null",
        "status": "confirmed | held",
        "rawText": "string | null",
        "capturedAt": "string | null (ISO-8601)",
        "minOrderAmount": "number | null",
        "tiers": [{
          "minOrder": "number | null",
          "amount": "number | null",
          "percent": "number | null",
          "channel": "배달 | 포장 | 매장식사 | null",
          "soldOut": "boolean | null",
          "expiresAt": "string | null (YYYY-MM-DD)"
        }, "null"],
        "conditions": "string | null",
        "expiresAt": "string | null (YYYY-MM-DD)",
        "badge": "string | null",
        "soldOut": "boolean"
      }
    ]
  }
]
```

- `maxHeldAmount`, `screenshotPath`는 서버 내부용 — `@JsonIgnore`, 응답에
  절대 안 나감(`BrandComparison.java:26`, `Offer.java:20`).
- `category`는 enum 소문자 키(`Category.java:28`). 미분류 브랜드는 `null`.
- `status`는 내부 enum이 아니라 소문자 문자열로 나감(`OfferStatus.java:22`,
  `Offer.java:29-32`).
- `links`의 키는 플랫폼 키(`ddangyo`, `baemin` 등, `brands.yml` 정의) → URL.
  모르는 앱은 키 자체가 없음(빈 맵이지 null 아님).
- `tiers`/`minOrderAmount`/`conditions`/`expiresAt`/`badge`는 원장에 없으면
  `null` (ADR-003) — 키는 항상 존재.
- `soldOut`은 오퍼 레벨에선 `boolean`(null을 `false`로 정규화), tier
  안에선 `Boolean`(null 그대로)이다.
- **`tiers`는 "구간 누진"만 뜻하지 않는다.** 같은 `minOrder`에 `amount`만
  다른 항목들은 구간이 아니라 채널·멤버십별 **별개 쿠폰**이다. 대표값
  (`amount`)은 조건 없이 받을 수 있는 쪽으로 골라 내려간다 — 품절 구간이나
  멤버십 전용가를 대표로 쓰지 않는다(청년피자 배민: 대표 4,000원,
  배민클럽 7,500원은 tier로).

### POST /api/reload

- 컨트롤러: `BrandController.java:32-36`
- 요청 바디: 없음
- 응답: `{"reloaded": <int>}` — 재로딩 후 캐시된 오퍼 레코드 수
- 용도: 재배포 없이 `export.json`을 갈아끼운 뒤 캐시 갱신(ADR-001).
  파일이 없으면 캐시를 빈 리스트로 비우고 에러 없이 200 반환
  (`OfferRepository.java:31-35`).

### POST /api/events

- 컨트롤러: `src/main/java/com/discounttracker/analytics/EventController.java:72-109`
- Content-Type: `application/json` **또는** `text/plain` 둘 다 받음 — `sendBeacon`은
  프리플라이트를 피하려 `text/plain`으로 보내기 때문(주석 `EventController.java:65-70`).
  본문은 `List<IncomingEvent>` 배열(JSON 문자열).
- 요청 아이템 모양 (`IncomingEvent`, `EventController.java:127-140`):

```json
{
  "event": "string",
  "visitorId": "string",
  "sessionId": "string",
  "visitCount": "number",
  "path": "string",
  "referrer": "string",
  "device": "string",
  "viewport": "string",
  "dwellMs": "number",
  "props": { "key": "value" },
  "clientTs": "string",
  "dev": "boolean"
}
```

- 응답: `{"accepted": <int>}` (200) 또는 429(레이트리밋 초과, 바디 없음).
  깨진/빈 본문은 에러 없이 `{"accepted": 0}`.
- 서버 측 정제: 배치 최대 20건, 문자열 필드 120자 컷, `props` 최대 6개
  키(`EventController.java:37-39`), `event`가 화이트리스트 밖이면 그 항목만
  조용히 버림(배치 전체는 실패 안 함).
- **ALLOWED_EVENTS 전체 목록** (`EventController.java:33-35`, 현재):
  - `page_view`
  - `page_exit`
  - `category_change`
  - `classify_change`
  - `brand_expand`
  - `offer_link_click`
  - `membership_open`
  - `capture_note_seen`

### GET /api/stats/traffic?days={n}

- 컨트롤러: `src/main/java/com/discounttracker/analytics/StatsController.java:20-24`
- 쿼리 파라미터: `days` (기본 7, 1~365로 clamp)
- 응답: `TrafficStats` (`src/main/java/com/discounttracker/analytics/TrafficStats.java:6-20`)

```json
{
  "rangeDays": "number",
  "from": "string",
  "to": "string",
  "totalEvents": "number",
  "uniqueVisitors": "number",
  "uniqueSessions": "number",
  "eventCounts": { "eventName": "number" },
  "dailyPageViews": [{ "date": "string", "count": "number" }],
  "topPaths": [{ "name": "string", "count": "number" }],
  "deviceBreakdown": { "deviceKey": "number" },
  "topReferrers": [{ "name": "string", "count": "number" }],
  "avgDwellMs": "number | null",
  "categoryChanges": { "categoryKey": "number" }
}
```

- 내부 대시보드용(`/stats.html`, `src/main/resources/static/stats.html`) —
  web 레포가 이걸 소비할 필요는 지금 없지만 계약 표면이라 기록.

## 3. 소비하는 외부 입력 (tracker의 export.json)

- 설정 프로퍼티: `discount.export-path` (`src/main/resources/application.yml:1-2`),
  로컬 기본값 `classpath:data/export.json`. 서버 배포 시
  `DISCOUNT_EXPORT_PATH` 환경변수로 `file:` 절대경로 오버라이드
  (relaxed binding, ADR-001) — 코드 변경 없이 Spring `Resource` 타입이
  classpath든 file이든 그대로 받음.
- 읽는 곳: `OfferRepository.reload()`
  (`src/main/java/com/discounttracker/offer/OfferRepository.java:31-41`).
  `InputStream`으로 전체를 한 번에 읽어 `OfferRecord[]`로 역직렬화, 배열
  전체를 `List`로 캐시. 파일 없으면(`source.exists()==false`) 캐시를
  빈 리스트로 두고 조용히 리턴 — 에러 없음. 앱 시작 시 1회 자동 호출
  (`OfferStartupLoader.java:17-20`) + `POST /api/reload`로 수동 재호출.
- 역직렬화 대상 (`src/main/java/com/discounttracker/offer/OfferRecord.java:13-27`),
  export.json의 각 원소가 이 필드들과 정확히 매칭돼야 함(camelCase):

```
platform:        String
brand:            String
amount:           Integer (nullable)
qualifier:        String (nullable)
needsReview:      boolean
offerType:        String
section:          String (nullable)
rawText:          String
capturedAt:       String
screenshotPath:   String
minOrderAmount:   Integer (nullable)
tiers:            List<DiscountTier> (nullable)
                  — {minOrder, amount, percent, channel, soldOut, expiresAt}
conditions:       String (nullable)
expiresAt:        String (nullable)   — 쿠폰 종료일 YYYY-MM-DD
badge:            String (nullable)   — 금액 옆 짧은 상태 라벨
soldOut:          Boolean (nullable)  — primitive 아님, 아래 참고
```

`soldOut`이 `Boolean`인 건 JSON에 `"soldOut": null`이 들어올 수 있어서다.
primitive `boolean`이면 `MismatchedInputException`으로 reload 전체가 깨진다
(사람이 export.json을 직접 편집하다 실측, 2026-08-04). `Offer.from`에서
`null`을 `false`로 정규화한다.

`DiscountTier.expiresAt`은 그 구간만 따로 끝날 때 채운다 — 비어 있으면
레코드의 `expiresAt`을 따른다. 한 브랜드의 쿠폰들이 같은 날 끝난다는 보장이
없어서 필요했다(청년피자 배민: 일반 08-30 / 배민클럽 08-31).

- **ObjectMapper: 미지 필드를 무시한다** —
  `OfferRepository`가 Spring 자동구성 빈 대신 직접 만든 ObjectMapper에
  `FAIL_ON_UNKNOWN_PROPERTIES=false`를 건다(`88250ad`). 기본값(엄격)이던
  시절엔 tracker가 새 필드를 실은 export.json을 먼저 배포하면 구버전 API가
  `UnrecognizedPropertyException`을 내고 `/api/reload`가 500으로 죽었다 —
  두 레포가 별도 워크플로로 독립 배포돼 순서를 보장할 수 없어서 같은 사고가
  세 번 반복됐다(badge 추가 때 실측, 2026-08-03).

  **그래도 필드를 추가할 때는 API를 먼저 배포한다.** 무시된다는 건 깨지지
  않는다는 뜻이지 값이 전달된다는 뜻이 아니다 — 그 사이엔 새 필드가 비어
  보인다.

  참고로 `EventController`의 ObjectMapper(생성자 주입, Spring 자동구성 빈)는
  여전히 기본값상 엄격하지만, 파싱 실패를 `try/catch(IOException)`로 감싸
  빈 리스트로 흡수한다(§2 POST /api/events) — 앱을 죽이지 않고 조용히
  이벤트를 버리는 차이가 있다.

## 4. 다른 레포가 의존하는 설정값

- **CORS 허용 origin** (`WebConfig.java`, `/api/**`에 적용). 정확한 origin이
  아니라 `allowedOriginPatterns`라 와일드카드가 들어간다(Vercel 프리뷰
  배포마다 서브도메인이 바뀐다):
  - `http://localhost:5173`
  - `https://beggars-five.vercel.app`
  - `https://beggars-five-*.vercel.app`
  - `https://delivery-discount-web-*.vercel.app`
  - 허용 메서드: `GET`, `POST`만 명시(정적으로 적어뒀지만 Spring
    기본값도 어차피 GET/HEAD/POST).
  - 코드에 `TODO`가 남아 있다 — 실제 Vercel project slug를 확인해 안 맞는
    패턴을 지워야 한다. 지금은 넉넉하게 열려 있는 상태다.
- **서버 포트**: `8080` (`application.yml`, `server.port`).
- **export.json 경로**: 기본값은 `classpath:data/export.json` — 레포에
  커밋된 픽스처다. 서버(systemd)는 `DISCOUNT_EXPORT_PATH`로
  `file:/home/ubuntu/delivery-discount-api/data/export.json`을 가리킨다
  (ADR-001). **로컬에서 export.json을 고쳐도 안 보이는 건 이 기본값 때문**
  이다 — 환경변수를 걸어야 한다.
- **갱신 절차는 `scp`가 아니다.** tracker 레포의
  `.github/workflows/deploy.yml`이 main 푸시마다 서버로 `cp`하고
  `POST /api/reload`를 부른다(사람 개입 없음). 복사 전에 낡은 파일이
  서버를 덮지 않는지 검사하는 가드가 있다 — tracker `check_deploy.py`.

## 5. 알려진 갭/WIP

- 코드 내 `TODO`/`FIXME` 주석은 없음(검색 결과 0건).
- **멤버십 반영 미구현** — `docs/plans/2026-07-28-membership-pricing.md`:
  프론트에 멤버십/지역화폐 체크박스(배민클럽·쿠팡 와우·요기패스·땡겨요
  지역화폐) UI만 배치돼 있고 계산 로직은 없음("준비 중" 배지). 계획 초안은
  `Offer`에 `membershipAdjustments` 필드를 얹거나 `/api/brands`에
  멤버십 쿼리 파라미터를 추가하는 두 방향을 검토 중이나 아직 미착수 —
  선행 작업(tracker 쪽 멤버십 화면 판독)이 먼저 필요하다고 명시.
- **오퍼 상세 필드 대부분 비어 있음** — ADR-003: `minOrderAmount`/`tiers`/
  `conditions`는 스키마만 있고 원장에 채워진 값은 (ADR 작성 시점 기준)
  거의 없음("비어 있다는 사실도 데이터"로 취급, null로 그대로 노출).
  구간 데이터 수집은 tracker 레포의 별도 계획 문서에서 다룸.
- 이 섹션은 자동 grep 결과 기반이라 완전하지 않을 수 있음 — 다른 갭을
  발견하면 이 목록에 추가할 것.

## 6. 최종 검증

`git rev-parse HEAD`: `6c522cea9275d04b67d9e04e492058d2299fb71` (short: `6c522ce`) — 2026-08-01 기준.
검증 시점에 워킹트리에 커밋 안 된 변경 있음(`git status --short`):
`docs/traffic-analytics.md`, `EventController.java`, `Offer.java` — 이 문서는
그 워킹트리 상태(디스크의 실제 소스)를 기준으로 작성됨, HEAD 커밋 스냅샷과는
다를 수 있음.
