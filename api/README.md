# 배달앱 브랜드 할인 비교 API

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP.
데이터는 [delivery-discount-tracker](../delivery-discount-tracker) 파이썬
파이프라인이 판독해 공급한다.

## 실행

1. 데이터 갱신 (delivery-discount-tracker 레포에서):
   ```
   python export_data.py
   cp data/export.json ../delivery-discount-api/src/main/resources/data/export.json
   ```
2. API 기동: `./gradlew bootRun` (http://localhost:8080)
3. 프론트 기동: `cd web && npm install && npm run dev` (http://localhost:5173)
4. 데이터만 갱신했다면 재기동 대신: `curl -X POST http://localhost:8080/api/reload`

## 구조

- `data/ExportDataLoader` — export.json 읽기(리로드 가능)
- `alias/AliasResolver` — brand-aliases.yml로 같은 브랜드의 다른 표기를 묶음
- `service/BrandComparisonService` — 묶기 + 확정/미확정 판정 + 최고 확정 할인 큰 순 정렬
- `web/BrandController` — GET /api/brands, POST /api/reload
- `web/` — React(Vite) 교차 비교 화면

## 별칭 추가

같은 브랜드가 다른 이름으로 안 묶이면 `src/main/resources/brand-aliases.yml`에 추가한다.
전체 브랜드명은 delivery-discount-tracker의 `data/brands-sorted.txt`(이름 오름차순)에서 확인한다.
