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
