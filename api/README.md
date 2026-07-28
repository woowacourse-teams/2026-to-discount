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

- `data/ExportDataLoader` — export.json 읽기(리로드 가능)
- `alias/AliasResolver` — brand-aliases.yml로 같은 브랜드의 다른 표기를 묶음
- `service/BrandComparisonService` — 묶기 + 확정/미확정 판정 + 최고 확정 할인 큰 순 정렬
- `web/BrandController` — GET /api/brands, POST /api/reload
- `web/WebConfig` — CORS 허용 오리진. 현재
  `http://localhost:5173`(로컬 프론트) +
  `https://beggars-five.vercel.app`(delivery-discount-web 배포).
  프론트를 다른 곳에 새로 배포하면 여기에 오리진을 추가해야 API
  호출이 CORS로 막히지 않는다.

## 별칭 추가

같은 브랜드가 다른 이름으로 안 묶이면 `src/main/resources/brand-aliases.yml`에 추가한다.
전체 브랜드명은 delivery-discount-tracker의 `data/brands-sorted.txt`(이름 오름차순)에서 확인한다.
