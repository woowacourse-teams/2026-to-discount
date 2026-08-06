# to-discount

배민·쿠팡이츠·요기요·땡겨요의 **브랜드 단위 할인**을 한 화면에서 비교한다.

같은 브랜드가 앱마다 다른 할인을 걸어두는데, 사용자는 앱 넷을 오가며
비교해야 한다. 그 비교를 대신한다.

```
화면(배달앱)  →  tracker  →  export.json  →  api  →  /api/brands  →  web
                 판독·원장     파일 드롭      가공·판정              화면
```

| 디렉터리 | 역할 | 기술 |
|---|---|---|
| [`tracker/`](tracker/) | 앱 화면을 판독해 원장에 쌓고 `export.json`을 만든다 | Python |
| [`api/`](api/) | 별칭 정규화 · 확정/보류 판정 · 만료 제외 · 정렬 | Spring Boot |
| [`web/`](web/) | 브랜드 카드 교차 비교 화면 | React + Vite |

현재 원장 226건, 내보내는 오퍼 137건(땡겨요 44 · 쿠팡이츠 33 · 배민 33 ·
요기요 27), 브랜드 사전 109개.

## 문서

| 문서 | 내용 |
|---|---|
| [온보딩](ONBOARDING.md) | 개발 환경 구성과 실행 — **처음이면 여기부터** |
| [오케스트레이션 계약](docs/ORCHESTRATION.md) | 층을 가로지를 때 지켜야 하는 것과, 실제로 사고가 났던 지점 |
| [기술 선택과 근거](docs/TECH-CHOICES.md) | 무엇을 골랐고, 무엇이 아쉽고, 플랜 B는 무엇인지 |
| [컨벤션](docs/CONVENTIONS.md) | 커밋·주석·문서·데이터 규칙 |
| [의사결정기록](docs/decisions/) | 되돌리기 어려운 판단과 근거 |

앱별 계약과 ADR은 각 디렉터리의 `docs/` 아래에 있다 —
[tracker](tracker/docs/) 17건 · [api](api/docs/) 9건 · [web](web/docs/) 2건.

## 이 저장소를 읽는 법

**데이터가 어떻게 생겼는지** 보려면 `tracker/data/export.json`과 그 규칙인
`tracker/schema.py`. **왜 그렇게 생겼는지**는 `tracker/parse/CONTRACT.md`.

`tracker/data/log.jsonl`은 판독 원장이다 — append-only이고, 같은 브랜드를
여러 번 본 기록이 그대로 쌓여 있다. 화면에 나가는 건 그중 (앱, 브랜드)당
하나뿐이고, 고르는 규칙은 **확정 > 최신 캡처 > 금액**이다.

### 트래커에 판독 구현은 없다

화면을 실제로 여닫는 자동화(ADB 조작·앱별 진입 경로·좌표 상수)는 싣지
않았다. 남긴 것은 그 자동화가 **무엇을 지켜야 하는지** 정한 계약과, 그
결과물·검증·데이터 모델이다. 이유는
[루트 ADR-001](docs/decisions/ADR-001-monorepo-consolidation.md).

### 배포

배포 워크플로는 루트 `.github/workflows/`로 옮기고 경로도 모노레포 기준으로
고쳤지만, **트리거는 수동(`workflow_dispatch`)만 열어뒀다.** 둘 다
self-hosted 러너를 쓰는데 그 러너가 이 저장소에 등록돼 있지 않아서다.
**운영 배포는 아직 원래 세 저장소에서 돈다** — 자세한 건
[ADR-001](docs/decisions/ADR-001-monorepo-consolidation.md)의 "대가 / 아직
안 한 것".

## 이력

세 저장소를 `git filter-repo`로 합쳤다. 커밋 223개가 그대로 살아 있고
`git log --follow`도 동작한다.

```
git log --follow --oneline -- web/src/App.jsx
```

## 고지

배달의민족·쿠팡이츠·요기요·땡겨요와 **제휴 관계가 없으며** 각 사의 공식
서비스가 아니다. 로그인 없이 누구나 보는 화면만 수집하고, 자동 접근을
거부하는 곳은 우회하지 않는다
([ADR-015](tracker/docs/decisions/ADR-015-open-access-only-and-disclosure.md)).
