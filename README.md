# 배거스

프로젝트 이름은 임시로 **배거스**다(2026-09-18). 화면(web)에는 아직 이 이름을 쓰지 않는다.

> 배민, 쿠팡이츠, 요기요, 땡겨요의 브랜드별 할인 정보를 한곳에서 비교하는 서비스

**[서비스 바로가기](https://beggars-five.vercel.app)**

## 서비스 소개

오늘의 할인은 브랜드별 할인 정보를 한 화면에서 비교하는 서비스다. 같은 브랜드라도 배달앱마다 할인 금액과 조건이 다르다. 여러 배달앱을 번갈아 확인하는 번거로움을 줄이려고 만들었다.

현재 배달의민족, 쿠팡이츠, 땡겨요, 요기요의 공개 할인 정보를 수작업으로 수집하고 정리해 제공한다. 비영리 정보 제공 목적이며, 특정 배달 플랫폼과 제휴 관계가 없다.

## 핵심 기능

- **브랜드 단위 할인 비교**: 동일 브랜드의 할인 정보를 배달앱별로 한 화면에서 확인한다.
- **카테고리별 탐색**: 치킨, 피자, 패스트푸드, 카페, 편의점 등 카테고리별로 브랜드를 거른다.
- **할인 상태 구분**: 확정된 할인 금액과 확인이 더 필요한 정보를 구분해 표시한다.
- **할인 상세 정보**: 브랜드 카드를 열어 앱별 할인 금액, 최소 주문 금액, 조건, 확인일을 확인한다.
- **배달앱 바로가기**: 지원되는 브랜드는 해당 배달앱의 브랜드 페이지나 쿠폰 페이지로 바로 이동한다.

## 대표 화면

서비스 대표 화면을 여기에 넣는다.

## 팀원

| 팀원 1 | 팀원 2 | 팀원 3 |
|:-------:|:------:|:--------:|
| 이미지 삽입 | 이미지 삽입 | 이미지 삽입 |
| @{github-nickname} | @{github-nickname} | @{github-nickname} |

## 기술 스택

| 구분 | 개발 환경 |
|---|---|
| Frontend | React 18, Vite, Node.js, npm |
| Backend | Java 17, Spring Boot, Gradle |
| Data Tracker | Python, PyYAML, pytest, ADB CLI |

---

## 구조

```
tracker  →  export.json  →  api  →  /api/brands  →  web
판독·원장    파일 드롭      가공·판정              화면
```

| 디렉터리 | 역할 |
|---|---|
| [`tracker/`](tracker/) | 판독 계약과 원장을 둔다. 원장에서 `export.json`을 만든다 |
| [`api/`](api/) | 별칭 정규화, 확정/보류 판정, 만료 제외, 정렬 |
| [`web/`](web/) | 브랜드 카드 교차 비교 화면 |

원장 226건, 오퍼 137건(땡겨요 44, 쿠팡이츠 33, 배민 33, 요기요 27), 브랜드 사전 109개.

**`tracker/`에는 판독 구현이 없다.** 앱 화면을 여닫는 자동화 코드는 이 저장소에 싣지 않았다. 그 자동화가 지켜야 할 계약(`tracker/parse/CONTRACT.md`)과 결과물(`tracker/data/`)만 남겼다. 근거는 [ADR-001](docs/decisions/ADR-001-monorepo-consolidation.md)에 있다.

**배포는 이 저장소의 push가 시작한다.**

- 데이터: `tracker/data/export.json`이 바뀌면 `deploy-data.yml`이 서버 파일을 갈아치우고 `POST /api/reload`를 부른다.
- 웹과 API: `mirror-deploy-repos.yml`이 `web/`, `api/`를 배포 저장소(`nn98/delivery-discount-web`, `nn98/delivery-discount-api`)로 미러한다. 웹은 Vercel이, API는 OCI self-hosted runner가 그 저장소에서 배포한다.
- 원본 세 저장소는 수동 폴백만 남아 있다. 같은 ADR-001의 "대가" 절 참고.

운영 현황 대시보드는 https://bebeggars.duckdns.org/ops/ 에 있다. 설계는 [docs/design/32-ops-monitoring.md](docs/design/32-ops-monitoring.md).

## 문서

| 문서 | 내용 |
|---|---|
| [온보딩](ONBOARDING.md) | 개발 환경 구성과 실행. **처음이면 여기부터** |
| [작업 가이드](docs/WORKFLOW.md) | 저장소 넷의 역할, 진실이 있는 자리, 일의 종류별 길(수집, API, 웹 프리뷰, 데이터 반영, 설계→계획→ADR) |
| [기술 선택과 근거](docs/TECH-CHOICES.md) | 무엇을 골랐고, 무엇이 아쉽고, 플랜 B는 무엇인지 |
| [오케스트레이션 계약](docs/ORCHESTRATION.md) | 층을 가로지를 때 지켜야 하는 것과 실제 사고 사례 |
| [프로젝트 구조](docs/PROJECT-STRUCTURE.md) | 코드에서 자동 생성되는 구조, 데이터 흐름, 배포 경계 |
| [수집 데이터 명세](docs/ANALYTICS.md) | 무엇을 모으고 어떻게 가르나. **분석 전에 읽는다** |
| [컨벤션](docs/CONVENTIONS.md) | 커밋, 주석, 문서, 데이터 규칙 |
| [의사결정기록](docs/decisions/) | 되돌리기 어려운 판단과 근거 |

앱별 ADR: [tracker](tracker/docs/) 26건, [api](api/docs/) 10건, [web](web/docs/) 2건 (2026-09-17 기준).

이력은 `git filter-repo`로 세 저장소를 합쳤다. 커밋 223개가 그대로 살아 있고 `git log --follow -- web/src/App.jsx`도 동작한다.

## 유의사항

- 할인 정보는 수집 시점에 따라 달라질 수 있다.
- 일부 할인 정보는 확인이 진행 중이라 화면에서 미확인 또는 보류 상태로 표시될 수 있다.
- 비영리 정보 제공 서비스이며, 배달 플랫폼과 제휴하거나 수수료를 받지 않는다.
- 로그인 없이 누구나 보는 화면만 수집한다. 자동 접근을 거부하는 곳은 우회하지 않는다 ([ADR-015](tracker/docs/decisions/ADR-015-open-access-only-and-disclosure.md)).

### 개인정보

방문 통계를 자체 서버에 수집한다. 제3자에게 넘기지 않는다.

- **IP는 원본을 저장하지 않는다.** 날짜별 솔트로 해시해 재식별할 수 없게 한다.
- **User-Agent 문자열을 수집하지 않는다.** 모바일/데스크톱 구분만 남긴다.
- **DNT와 GPC를 존중한다.** 브라우저에서 켜져 있으면 수집 자체를 하지 않는다.

근거: [api ADR-005](api/docs/decisions/ADR-005-first-party-analytics.md).
