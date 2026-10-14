# 배거스 API

배달앱별 브랜드 할인을 한 화면에서 비교하는 서비스의 서버다. Spring Boot(자바 웹 서버 프레임워크)로
만들었고 DB 없이 파일만 읽고 쓴다. 할인 데이터는 비공개 tracker 저장소의 수집 파이프라인이 만들어 서버에
올린다. 웹은 같은 저장소의 [web/](../web)이다. 저장소와 배포 경로 전체는
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)에 있다.

- 갱신: 2026-10-14(저장소 통합 뒤 낡은 실행, 배포, 배너 절을 고쳤다)

## 실행

1. API: `./gradlew bootRun` (http://localhost:8080)
2. 웹: `cd ../web && npm install && npm run dev` (http://localhost:5173)

기본 입력은 저장소 안의 샘플이다. `src/main/resources/data/export.json`은 `rawText`가 전부 "[샘플]"로
시작하는 스키마 샘플이라, 화면에 그 글자가 보이면 실데이터를 안 읽고 있는 것이다
([ADR-009](docs/decisions/ADR-009-synthetic-fixture-over-production-snapshot.md)). 실데이터로 보려면
환경변수로 jar 밖 파일을 가리킨다([ADR-001](docs/decisions/ADR-001-external-export-path.md)).

| 환경변수 | 가리키는 파일 | 기본값 |
| --- | --- | --- |
| `DISCOUNT_EXPORT_PATH` | 오퍼 목록. tracker `data/export.json` | 저장소 샘플 |
| `DISCOUNT_HISTORY_PATH` | 할인 이력. tracker `data/history.json` | 저장소 샘플 |
| `DISCOUNT_BANNERS_PATH` | 배너. 운영 서버 파일이 유일본이다 | 빈 목록 |
| `DISCOUNT_EVENT_LOG_PATH` | 방문 이벤트 원장 | `data/events.jsonl` |

경로 앞에는 `file:`을 붙인다(예: `DISCOUNT_EXPORT_PATH=file:/절대/경로/export.json`). 이벤트 원장만 붙이지
않는다. 전체 설정과 기본값은 `src/main/resources/application.yml` 한 곳에 있다.

파일만 바꿨다면 재기동 대신 `POST /api/reload`가 오퍼, 이력, 배너, 인기를 다시 읽는다. 응답의
`bannersOk`가 `false`면 배너 파일에 문제가 있다(`unknownBrands`, `dropped`, `duplicateIds`를 본다).
운영에서는 nginx가 이 경로에 Basic Auth(아이디와 비밀번호를 묻는 가장 단순한 웹 인증)를 건다.

## 배포 (bebeggars.duckdns.org)

세 가지가 서로 다른 길로 서버에 닿는다.

| 무엇 | 길 |
| --- | --- |
| 코드 | mono `main` push, 미러 저장소 `nn98/delivery-discount-api`, 운영 서버에 붙은 러너(미러의 워크플로를 실행하는 기계)가 `./gradlew build`(테스트 포함), `systemctl restart`, `/api/brands` 헬스체크. 헬스체크가 30초 안에 안 되면 이전 jar로 되돌린다 |
| 오퍼와 이력 | tracker 수집 8단계(`deploy_export.py`)가 서버에 올리고 reload한다. 다른 데이터 배포 경로는 없다 |
| 배너 | 운영 콘솔(`/ops/`, beggars-ops)이 서버의 `banners.yml`을 고치고 reload한다 |

재시작하는 동안 약 5초 응답이 끊긴다. Spring Boot 4.1부터는 내릴 때 처리 중인 요청을 끝내고 내린다
(graceful shutdown, [ADR-012](docs/decisions/ADR-012-spring-boot-4-jackson-3.md)). 서버 앞단은 HTTPS를 받아
넘겨주는 웹 서버 nginx이고, 리눅스 서비스 관리자 systemd의 유닛 `delivery-discount-api.service`가 jar를 띄운다.

## 구조

패키지는 계층(model, service, dao)이 아니라 **도메인**으로 나눈다
([ADR-002](docs/decisions/ADR-002-domain-packages-and-single-brand-source.md)). 한 가지를 고치려고 여러
패키지를 헤집지 않게 하는 것이 목적이다.

| 패키지 | 맡는 일 | 주요 클래스 |
| --- | --- | --- |
| `brand/` | 브랜드 목록(`brands.yml`): 별칭, 카테고리, 앱별 링크, 짧은 이름 | `BrandCatalog` |
| `banner/` | 배너 읽기와 오늘 띄울 것 판정, 묶음 접기, 화면 문구, 배너를 카드 오퍼로 바꾸기 | `BannerCatalog`, `BannerAmount`, `BannerText`, `BannerOffers` |
| `offer/` | 원장 한 줄(`OfferRecord`)을 카드의 오퍼 하나(`Offer`)로. 금액을 견줄 수 있는지(`Certainty`)와 정렬 금액(`OfferComparison`) | `OfferRepository`, `OfferRecord`, `Offer` |
| `comparison/` | 별칭으로 브랜드를 묶고 앱별 칸을 정리해 할인 큰 순으로 세운다 | `BrandComparisonService`, `BrandComparison` |
| `history/` | 할인 이력(`history.json`). 신규 여부 판정과 이력 그래프 | `HistoryRepository`, `OfferHistory` |
| `analytics/` | 방문 이벤트 받기와 원장 기록, 인기, 설문, PostHog 전달 | `EventController`, `EventLog`, `PopularityIndex`, `SurveyService` |
| `push/` | 웹 푸시 구독과 발송(배너 알림, 새 오퍼 알림) | `BannerNotificationService`, `NewOfferNotificationService` |
| `web/` | 컨트롤러, CORS 허용 주소(`WebConfig`), 요청 ID, 오류 응답 | `BrandController`, `BannerController` |

`OfferComparison`의 판정은 웹 `filters.js`에도 있다. 둘이 같은 판정표
(`src/test/resources/contracts/certainty-cases.json`)를 읽어 어긋남을 막는다. 같이 고쳐야 하는 자리는
[docs/CHANGE-PROPAGATION.md](../docs/CHANGE-PROPAGATION.md)에 있다.

### 엔드포인트

| 메서드와 경로 | 하는 일 |
| --- | --- |
| `GET /api/brands` | 브랜드 카드 목록(정렬됨). 60초 캐시 헤더와 ETag(본문 해시) |
| `GET /api/brands/{brand}/history?range=1m` | 그 브랜드의 할인 이력 |
| `GET /api/banners` | 오늘 띄울 배너 |
| `POST /api/reload` | 파일 다시 읽기. 운영은 Basic Auth |
| `POST /api/events` | 방문 이벤트 받기(아래 "방문 측정") |
| `GET /api/survey`, `GET /api/survey/code`, `POST /api/survey` | 설문 대상 판정, 받은 코드 다시 보기, 응답 |
| `/api/push/**` | 푸시 공개 키, 구독, 표시와 클릭 추적, 다음 알림 관리 |

### 응답 스키마는 계약이다

`/api/brands`는 평평한 모양(`name`, `category`, `links`,
`maxConfirmedAmount`, `offers[]`)으로 나간다. 내부에서 `Brand`를 중첩해
들고 있어도 응답까지 중첩되면 프론트가 도메인 구조 변경에 끌려다니므로,
`BrandComparison`이 내보낼 것만 골라 노출한다. 이 모양은
`BrandControllerTest.brandResponseKeepsFlatContract`가 지킨다.
`links`는 플랫폼 키(`ddangyo`, `baemin`, ...) -> 링크 맵이다. 앱이
하나뿐이라고 가정한 문자열 하나였다가 배민 링크가 추가되며 맵으로
바뀌었다([ADR-004](docs/decisions/ADR-004-per-platform-brand-links.md)).

## 방문 측정 (analytics)

경로, 재방문, 체류, 행동은 자체 API가 수집하고 `events.jsonl`을 원본으로
보존한다. **서버 outbox는 2026-08-21 13:18(KST)부터 켜져 있다**
(`DISCOUNT_POSTHOG_ENABLED=true`). 광고 차단기, DNT로 클라이언트가 막힌
방문자를 서버 경로로 회수한다(실측 10% 안팎, `scripts/coverage_snapshot.sh`).

그 전에 잠시 꺼 뒀던 이유는 `$pageview`가 두 번 기록돼서였다. 우리가 만든
이벤트는 같은 `eventId`를 `$insert_id`로 써서 합쳐지지만, SDK가 자동으로
쏘는 이벤트는 제 uuid를 달고 와서 그 규칙에 안 걸린다. 자동 발사를 끄면서
(`capture_pageview: false`) 원인이 사라졌다. 자체 수집을 둔 배경은
[ADR-005](docs/decisions/ADR-005-first-party-analytics.md), 전달 세부사항은
[트래픽 수집 및 통계 문서](docs/traffic-analytics.md)를 참고한다.

### 엔드포인트

```
POST /api/events
```

브라우저가 이벤트를 배치(JSON 배열)로 보내면 서버는 검증 후
`data/events.jsonl`에 한 줄씩 append한다. 인증 없는 공개 쓰기라 다음을
건다: 이벤트명 화이트리스트(`EventController.ALLOWED_EVENTS`), 배치
20건, 문자열 120자, props 6개 상한, IP 해시별 분당 120건
(`EventRateLimiter`). 화이트리스트에 없는 이벤트명이나 레이트리밋을
넘긴 요청은 조용히 버려진다(에러 아님, `accepted` 수만 줄어듦).

**`application/json`과 `text/plain` 둘 다 받는다.** 프론트가 페이지 이탈
시점(체류 시간)엔 `navigator.sendBeacon`을 쓰는데, 비콘은 CORS
프리플라이트를 못 해서 `application/json`으로 보내면 요청이 조용히
사라진다. 그래서 그 경로만 `text/plain`으로 온다. 서버는 본문을 문자열로
받아 직접 파싱해 두 경우를 같은 코드로 처리한다.

로컬에서 확인:

```bash
curl -X POST http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d '[{"event":"page_view","visitorId":"v_test","sessionId":"s_test","visitCount":1,"path":"/","device":"mobile"}]'
# {"accepted":1}
```

### 개인정보 처리

| 항목 | 처리 |
|---|---|
| 원본 IP | 저장 안 함. 날짜별 솔트 + 프로세스 난수 솔트로 해시(`ClientFingerprint`). 하루 지나거나 서버 재시작하면 연결 끊김 |
| UA 문자열 | 안 받음. 클라이언트가 `mobile`/`desktop`만 보냄 |
| 유입 URL | 안 받음. `direct`/`internal`/`external` 구분만 |
| DNT/GPC | 프론트가 감지해 켜져 있으면 아예 전송 안 함 |

### 로그 위치

기본값 `data/events.jsonl`(원장 export.json과 같은 자리 규칙). 배포
환경은 systemd 유닛의 `DISCOUNT_EVENT_LOG_PATH`로 지정돼 있다
(`<서버>/delivery-discount-api/data/events.jsonl`). 로컬에서
경로를 바꾸려면:

```bash
DISCOUNT_EVENT_LOG_PATH=/tmp/events.jsonl ./gradlew bootRun
```

### PostHog outbox (웹 SDK 직접 전송 시 비활성)

웹 SDK와 서버가 같은 이벤트를 이중 전송하지 않도록 웹 SDK 직접 전송 배포 전에
운영 systemd 환경에 다음 값을 명시한다. 비활성 상태에서도 `/api/events`와
`events.jsonl` 기록은 그대로 동작한다.

```bash
DISCOUNT_POSTHOG_ENABLED=false
```

롤백으로 서버 전달을 다시 사용할 때만 다음 값을 모두 주입한다. 토큰은 저장소나
서비스 유닛 본문에 직접 기록하지 않는다.

```bash
DISCOUNT_POSTHOG_ENABLED=true
POSTHOG_PROJECT_TOKEN=<project-token>
POSTHOG_HOST=https://us.i.posthog.com
DISCOUNT_POSTHOG_OUTBOX_PATH=<서버>/delivery-discount-api/data/posthog-outbox
```

원본 기록 후 이벤트별 pending 파일을 만들고 즉시 비동기 전송한다. 실패하면
1시간 간격으로 재시도하며, 최초 시도를 포함해 5회 실패한 파일은
`posthog-outbox/dead-letter/`로 이동한다. pending과 dead-letter에는
`ipHash`를 저장하지 않고 `dev=true` 이벤트는 등록하지 않는다.

`DISCOUNT_POSTHOG_ENABLED=true`인데 토큰이나 명시적인 outbox 경로가 없거나
outbox 디렉터리를 준비할 수 없으면 애플리케이션 시작이 실패한다. 실행 중
PostHog 장애는 `/api/events`의 JSONL 기록과 `accepted` 응답에 영향을 주지 않는다.

### 집계 예시

DB가 없다. 이 트래픽 규모에서는 `jq` 한 줄이면 충분하다.

```bash
# 일별 방문 수
jq -r 'select(.event=="page_view") | .ts[0:10]' events.jsonl | sort | uniq -c

# 재방문 비율(신규 vs 재방문)
jq -r 'select(.event=="page_view") | if .visitCount>1 then "재방문" else "신규" end' \
  events.jsonl | sort | uniq -c

# 중위 체류 시간(초)
jq -r 'select(.event=="page_exit") | .dwellMs' events.jsonl \
  | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]/1000}'

# 많이 펼쳐본 브랜드 Top 10
jq -r 'select(.event=="brand_expand") | .props.brand' events.jsonl \
  | sort | uniq -c | sort -rn | head -10

# 실제로 앱까지 넘어간 클릭(브랜드×앱)
jq -r 'select(.event=="offer_link_click") | "\(.props.platform)\t\(.props.brand)"' \
  events.jsonl | sort | uniq -c | sort -rn | head -10

# 카테고리 필터 사용 빈도
jq -r 'select(.event=="category_change") | .props.category' events.jsonl \
  | sort | uniq -c | sort -rn
```

### 이벤트를 새로 추가하려면

1. `EventController.ALLOWED_EVENTS`에 이름을 추가한다(빠뜨리면 서버가
   조용히 버려서 아무리 프론트를 고쳐도 로그에 안 쌓인다).
2. 웹에서 `track('새이벤트명', { ...props })` 호출을 붙인다
   (`web/src/analytics.js`). 이벤트 계약은 [docs/ANALYTICS.md](../docs/ANALYTICS.md)에 있다.
3. 배치, 문자열 길이 상한에 걸리지 않는지 확인한다(`EventController`의
   `MAX_TEXT`/`MAX_PROPS`).

## 브랜드 추가와 수정

`src/main/resources/brands.yml` **한 곳만** 고친다. 별칭, 카테고리, 앱별 바로가기, 짧은 이름이 모두 여기
있고 API가 그대로 웹에 내려준다. 이 파일은 jar 안에 있어서 **API를 다시 배포해야** 반영된다(reload로는 안
바뀐다). 웹은 다시 배포할 필요가 없다.

```yaml
brands:
  BBQ:
    category: chicken              # 생략하면 "전체" 탭에서만 보인다
    aliases: [BBQ치킨]              # 원장에 다른 이름으로 찍힐 때만
    links:                         # 앱별 브랜드 쿠폰 바로가기, 있는 것만
      ddangyo: https://fdofd.ddangyo.com/…
      baemin: https://s.baemin.com/…
```

로고 이미지는 `web/public/logos/<대표명>.png`로 따로 넣는다. 원장에 있는데 이 목록에 없는 브랜드는 화면에
안 나간다. tracker 루트의 `check_brands.py`가 그런 이름을 찾는다.

## 당일 행사 배너

배너는 운영 콘솔(`/ops/`, beggars-ops)에서 고친다. 수집 루틴이 매일 제안을 올리고, 사람이 콘솔에서 승인하면
서버의 `banners.yml`에 적용하고 reload한다(되풀이 행사는 자동 반영). 서버 파일이 유일본이고 저장소의
`src/main/resources/banners.yml`은 빈 목록이다. 파일을 손으로 고치면 콘솔의 검사(문구 규칙, 금액 모양, id
중복)를 건너뛰게 되니 하지 않는다.

배너 한 장은 이런 모양이다(2026-10-14 운영 파일에서 옮김). 칸의 뜻과 금지된 옛 칸은 콘솔 스키마
(`/ops/schema`)와 [설계 31](../docs/design/31-banner-text-normalization.md)이 정한다.

```yaml
banners:
  - id: 두찜-20261014              # 필수, 고유
    brand: 두찜                     # 생략하면 앱 전체 행사
    platform: baemin               # 필수
    url: https://baemin.go.link/…  # 필수
    amount:                        # 금액은 구조로 적는다. 화면 문구는 서버(BannerText)가 만든다
      won: 6500
    startsAt: '2026-10-14T00:00:00'
    endsAt: '2026-10-14T23:59:59'
    priority: 2                    # 생략 시 999. 낮을수록 먼저
    firstCome: use                 # 선착순(사용 선착순). 상시 할인과 다른 칸에 선다
    opensAt: '11:00'
    minOrder: 25000
    soldOutOn: 2026-10-14          # 이날 소진. 기계 관측이 적는다
```

- **날짜 판정은 서버가 한다.** `startsAt <= 지금 <= endsAt`인 것만 내려간다(`Asia/Seoul`). 웹이 판정하면
  사용자 기기 시계를 따라가 시차 문제가 생긴다. 끝난 배너는 어제 이전 것을 beggars-ops `archive/`로 옮긴다.
- **필수 값이 빠진 항목은 건너뛴다.** 오타 하나가 기동이나 reload 전체를 죽이면 안 된다. 건너뛴 id는 reload
  응답의 `dropped`에 실리고 그때 `bannersOk`가 `false`가 된다.
- **배너도 카드에 선다.** 브랜드가 있는 배너는 `BannerOffers`가 원장 레코드 모양으로 바꿔 원장 앞에 붙인다.
  그 뒤 묶기, 중복 정리, 정렬은 원장과 같은 길을 탄다.

### 웹 푸시

Push는 기본 비활성화다. `DISCOUNT_PUSH_ENABLED=true`, VAPID 공개 키와 비공개 키,
`DISCOUNT_PUSH_STATE_PATH`가 모두 설정돼야 구독과 발송 API가 활성화된다. 비공개 키와
상태 파일은 저장소에 넣지 않는다. 오전 11시에는 지난 24시간의 미발송 대상 배너를
한 건으로 요약한다. 즉시 발송에 성공한 배너는 요약에서 제외한다. 배너의 `notify: true`가 알림 대상이고,
`notifyImmediately: true`는 07:00 이상 22:00 미만에만 즉시 발송을 요청한다.

구독은 기존 분석의 `visitorId`와 연결한다. 표시와 클릭 이벤트는 발송 토큰을 통해
같은 `distinct_id`로 기록된다. Push endpoint와 암호화 키는 분석 이벤트에 남기지 않는다.

## 성능 지표

API와 분리된 내부 관리 포트에서 Prometheus 형식의 성능 지표를 제공합니다.
수집 범위와 조회 방법은 [성능 지표 문서](docs/performance-metrics.md)를 참고하세요.
