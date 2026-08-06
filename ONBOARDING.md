# 온보딩

## 환경

| | 버전 |
|---|---|
| Python | 3.10 이상 |
| Java | 17 |
| Node / npm | 24 / 11 |

Gradle·Spring Boot·React·Vite는 저장소에 고정돼 있다. 따로 설치하지 않는다.

## 구조

```
tracker  →  export.json  →  api  →  /api/brands  →  web
판독·원장    파일 드롭      가공·판정              화면
```

| 파트 | 역할 |
|---|---|
| [`tracker/`](tracker/) | 판독 계약·데이터 모델·원장 |
| [`api/`](api/) | 별칭 정규화 · 확정/보류 · 만료 제외 · 정렬 |
| [`web/`](web/) | 브랜드 카드 교차 비교 화면 |

세 디렉터리는 따로 빌드된다.

## 실행

수집은 돌리지 않는다. 판독 데이터가 저장소에 들어 있다.

### 1. api

```bash
cd api
DISCOUNT_EXPORT_PATH=file:../tracker/data/export.json ./gradlew bootRun
```

http://localhost:8080/api/brands — 브랜드 83개.

`DISCOUNT_EXPORT_PATH`를 빼면 스키마 예시 6건만 뜬다.

### 2. web

```bash
cd web
npm install
npm run dev
```

http://localhost:5173

**web은 로컬 api가 아니라 운영 서버를 부른다.** 로컬 api를 화면에서 보려면
`src/api.js`의 `API_BASE`를 `http://localhost:8080`으로 바꾼다. 커밋하지
않는다.

### 3. tracker

```bash
cd tracker
pip install pyyaml pytest
python -m pytest -q
```

새 데이터를 만드는 코드는 이 저장소에 없다. 원장에 관측을 추가할 때는
`ingest.py`를 쓴다. **`export_data.py`는 돌리지 않는다** — 종료된 할인이
되살아난다.

## 테스트

```bash
cd tracker && python -m pytest -q   # 67 passed
cd api     && ./gradlew test        # 75 passed
cd web     && npm run build         # ✓ built
```

## 더 볼 것

| 문서 | 내용 |
|---|---|
| [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) | 층 간 계약, 실제 사고 사례 |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | 커밋·주석·문서·데이터 규칙 |
| [`docs/decisions/`](docs/decisions/) | 되돌리기 어려운 판단과 근거 |
