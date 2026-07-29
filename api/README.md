# 배달앱 브랜드 할인 비교 API

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP의 백엔드(Spring Boot).
데이터는 [delivery-discount-tracker](../delivery-discount-tracker) 파이썬
파이프라인이 판독해 공급한다. 프론트엔드는
[delivery-discount-web](../delivery-discount-web) 별도 레포다.

## 실행

1. 데이터 갱신 (delivery-discount-tracker 레포에서):
   ```
   python export_data.py
   cp data/export.json ../delivery-discount-api/src/main/resources/data/export.json
   ```
2. API 기동: `./gradlew bootRun` (http://localhost:8080)
3. 프론트 기동 (delivery-discount-web 레포에서): `npm install && npm run dev` (http://localhost:5173)
4. 데이터만 갱신했다면 재기동 대신: `curl -X POST http://localhost:8080/api/reload`

## 배포 (bebeggars.duckdns.org)

OCI 인스턴스, systemd(`delivery-discount-api.service`) + nginx(TLS
종료, `/`를 8088로 프록시). 데이터는 jar에 안 박고 외부 파일로 읽는다
— 이유와 구조는 [docs/decisions/ADR-001-external-export-path.md](docs/decisions/ADR-001-external-export-path.md).

데이터 갱신(재배포 불필요):

```bash
scp data/export.json ubuntu@bebeggars.duckdns.org:/home/ubuntu/delivery-discount-api/data/export.json
curl -X POST https://bebeggars.duckdns.org/api/reload
```

## 구조

패키지는 계층(model/service/dao)이 아니라 **도메인**으로 나눈다. 한 가지를
고치려고 여러 패키지를 헤집지 않아도 되게 하는 게 목적이다.

- `brand/` — 브랜드에 대해 우리가 아는 것
  - `BrandCatalog` — `brands.yml`을 읽어 별칭·카테고리·바로가기를 제공
  - `Brand`, `Category` — 브랜드 정보와 분류
- `offer/` — 원장에서 온 할인 데이터
  - `OfferRepository` — export.json 읽기(리로드 가능)
  - `OfferRecord`(원장 한 줄), `Offer`(화면의 칩 하나), `OfferStatus`(확정/보류)
- `comparison/` — 브랜드 단위로 묶어 비교
  - `BrandComparisonService` — 별칭 묶기, 앱별 중복 정리, 정렬
  - `BrandComparison` — 카드 하나. 정렬 규칙(`byBestDiscount`)도 여기 있다
- `web/` — 바깥과 닿는 부분
  - `BrandController` — GET /api/brands, POST /api/reload
  - `WebConfig` — CORS 허용 오리진. 현재 `http://localhost:5173`(로컬 프론트)
    + `https://beggars-five.vercel.app`(delivery-discount-web 배포).
    프론트를 다른 곳에 새로 배포하면 여기에 오리진을 추가해야 한다.

### 응답 스키마는 계약이다

`/api/brands`는 평평한 모양(`name`, `category`, `link`,
`maxConfirmedAmount`, `offers[]`)으로 나간다. 내부에서 `Brand`를 중첩해
들고 있어도 응답까지 중첩되면 프론트가 도메인 구조 변경에 끌려다니므로,
`BrandComparison`이 내보낼 것만 골라 노출한다. 이 모양은
`BrandControllerTest.brandResponseKeepsFlatContract`가 지킨다.

## 방문 측정 (analytics)

경로·재방문·체류·행동을 자체 API로만 수집한다. 외부 분석 도구(GA4 등)를
안 쓰므로 이용자 데이터가 제3자로 넘어가지 않는다 — 왜 자체 구현인지는
[ADR-005](docs/decisions/ADR-005-first-party-analytics.md).

### 엔드포인트

```
POST /api/events
```

브라우저가 이벤트를 배치(JSON 배열)로 보내면 서버는 검증 후
`data/events.jsonl`에 한 줄씩 append한다. 인증 없는 공개 쓰기라 다음을
건다: 이벤트명 화이트리스트(`EventController.ALLOWED_EVENTS`), 배치
20건·문자열 120자·props 6개 상한, IP 해시별 분당 120건
(`EventRateLimiter`). 화이트리스트에 없는 이벤트명이나 레이트리밋을
넘긴 요청은 조용히 버려진다(에러 아님, `accepted` 수만 줄어듦).

**`application/json`과 `text/plain` 둘 다 받는다.** 프론트가 페이지 이탈
시점(체류 시간)엔 `navigator.sendBeacon`을 쓰는데, 비콘은 CORS
프리플라이트를 못 해서 `application/json`으로 보내면 요청이 조용히
사라진다 — 그래서 그 경로만 `text/plain`으로 온다. 서버는 본문을 문자열로
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
| 원본 IP | 저장 안 함. 날짜별 솔트 + 프로세스 난수 솔트로 해시(`ClientFingerprint`) — 하루 지나거나 서버 재시작하면 연결 끊김 |
| UA 문자열 | 안 받음. 클라이언트가 `mobile`/`desktop`만 보냄 |
| 유입 URL | 안 받음. `direct`/`internal`/`external` 구분만 |
| DNT/GPC | 프론트가 감지해 켜져 있으면 아예 전송 안 함 |

### 로그 위치

기본값 `data/events.jsonl`(원장 export.json과 같은 자리 규칙). 배포
환경은 systemd 유닛의 `DISCOUNT_EVENT_LOG_PATH`로 지정돼 있다
(`/home/ubuntu/delivery-discount-api/data/events.jsonl`). 로컬에서
경로를 바꾸려면:

```bash
DISCOUNT_EVENT_LOG_PATH=/tmp/events.jsonl ./gradlew bootRun
```

### 집계 예시

DB가 없다 — 이 트래픽 규모에서는 `jq` 한 줄이면 충분하다.

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
2. 프론트에서 `track('새이벤트명', { ...props })` 호출을 붙인다
   (delivery-discount-web `src/analytics.js`).
3. 배치·문자열 길이 상한에 걸리지 않는지 확인한다(`EventController`의
   `MAX_TEXT`/`MAX_PROPS`).

## 브랜드 추가·수정

`src/main/resources/brands.yml` **한 곳만** 고치면 된다 — 별칭, 카테고리,
땡겨요 바로가기가 모두 여기 있고 API가 그대로 프론트에 내려주므로 프론트
재배포가 필요 없다.

```yaml
brands:
  BBQ:
    category: chicken                  # 생략하면 "전체" 탭에서만 보인다
    aliases: [BBQ치킨]                  # 원장에 다른 이름으로 찍힐 때만
    link: https://fdofd.ddangyo.com/…  # 땡겨요 쿠폰 바로가기, 있을 때만
```

로고 이미지만 `delivery-discount-web/public/logos/<대표명>.png`로 따로
넣는다. 전체 브랜드명은 delivery-discount-tracker의
`data/brands-sorted.txt`(이름 오름차순)에서 확인한다.
