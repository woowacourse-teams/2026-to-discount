# 배달앱 브랜드할인 추적기

배민·쿠팡이츠·요기요·땡겨요의 브랜드 단위 할인을 수집해 판독하는
데이터 공급 파이프라인. 이 레포는 원본 캡처 판독까지만 하고, 실제
비교 화면은 별도 레포 2개가 이어받는다 — 아키텍처 전체는
[ADR-012](docs/decisions/ADR-012-three-repo-split-and-deployment.md) 참고.

> 현재 상태: **4개 앱 모두 캡처·판독 완료(배민만 자동, 나머지는 수동
> +비전 — [ADR-013](docs/decisions/ADR-013-manual-capture-scope-freeze.md)).
> `export_data.py`로 [delivery-discount-api](../delivery-discount-api)에
> 공급 중이고, [delivery-discount-web](../delivery-discount-web)이 실제
> 화면을 배포해 운영 중이다.**

## 문서

| 문서 | 내용 |
|---|---|
| [설계 명세](docs/specs/2026-07-26-design.md) | 수집 대상 화면, 아키텍처, 스키마, 자동화 비용 지도, 범위 |
| [의사결정기록](docs/decisions/) | 되돌리기 어려운 판단 13건과 근거 |
| [기기 설정](docs/setup/device-setup.md) | 캡처 기기, 앱 패키지명, 앱별 실측 좌표 상수 |

## 데이터 내보내기

`python export_data.py`가 `data/log.jsonl` 원장을 읽어 `data/export.json`·
`data/brands-sorted.txt`를 만든다. `data/export.json`을 커밋해 main에
푸시하면 `.github/workflows/deploy.yml`이 서버로 옮기고 `POST /api/reload`
까지 부른다 — 사람이 복사하지 않는다.

재생성은 원장만으로 완결된다. 2026-08-10 이후 `export.json`이 바뀐 커밋은
전부 원장 재생성 결과와 일치한다. 한동안은 그렇지 않아 "그대로 돌리면 안
된다"는 경고가 여기 있었다. 경위와 커밋별 검증은
[오케스트레이션 계약](docs/ORCHESTRATION-CONTRACT.md) §1.

원장에 새 관측을 넣을 때는 `export.json`을 직접 고치지 말고
`python ingest.py <records.json>`을 쓴다(`--dry-run`으로 판정을 먼저 볼 수
있다). 원장은 append-only라 **정정은 삭제가 아니라 덮어쓰기**다 — 더 최신
시각의 새 관측을 넣어야 하고, 승자는 `store._prefer`가 정한다(확정 > 최신
> 금액).

## 핵심 구조

```
capture(platform)  → 앱별 화면 진입 + 롱스크롤 캡처 → 롱스크롤 이미지
parse(evidence)    → 판독 → 표준 레코드
store(records)     → append-only 원장(JSONL)
dashboard(log)     → 정적 HTML 재생성
```

계층 간 계약은 두 개뿐이다.

1. `capture` 산출물 = **롱스크롤 이미지 + 메타데이터**
2. `parse` 산출물 = **표준 레코드**

이 계약만 지키면 각 계층은 서로의 구현을 모른다.

## 알아둘 것 세 가지

**1. 판독이 유일한 실질 비용이다.**
페이지 진입·캡처·저장·대시보드는 모두 결정론적이라 비용이 거의 없다. 앱 화면을 읽는 단계만 비전 호출이 필요하고, 여기가 정확도 위험도 함께 있는 지점이다. 자세한 내용은 [명세 §6](docs/specs/2026-07-26-design.md#6-자동화-비용-지도).

**2. 반자동 전환은 구현이 아니라 정의로 보장된다.**
수동 캡처(폰 스크롤 캡처)와 자동 캡처의 산출물이 같은 롱스크롤 이미지다. 특정 앱의 판독이 불안해지면 그 앱만 `capture_mode: manual`로 내리고 사람이 캡처를 넣어주면, 나머지 파이프라인은 코드 변경 없이 그대로 돈다. → [ADR-008](docs/decisions/ADR-008-manual-fallback-parity.md)

**3. 금액을 숫자 하나로 믿으면 안 된다.**
`최대 6,000원`과 `최소 4,000원`이 같은 화면에 섞여 나오고, 수식어는 큰 숫자 옆에 아주 작게 붙는다. `qualifier`를 분리 보존하고 `raw_text` 원문을 항상 남기는 이유다. → [ADR-004](docs/decisions/ADR-004-preserve-qualifier.md)

## 앱별 난이도

| 앱 | 대상 화면 | 화면 형태 | 진입 방법 | 캡처 |
|---|---|---|---|---|
| 배달의민족 | `브랜드관` → `오늘의 할인` | WebView | 딥링크 | ✅ 자동 |
| 배달의민족 | `배짱할인` | WebView | **없음** — 주차별 서버 지정 URL | 수동 |
| 쿠팡이츠 | `와우컬렉션` | WebView + 이미지 혼재 | 앱 내 탭 | ✅ 수동 캡처 + 비전 판독 |
| 땡겨요 | `오늘 땡길만한 브랜드` | 100% 이미지 배너 | 앱 내 탭 | ✅ 수동 캡처 + 비전 판독 |
| 요기요 | `쿠폰함`(매장별) | 앱 화면 | 앱 내 탭 | ✅ 수동 캡처 + 비전 판독(전량 `needs_review` — 쿠폰 실적용가 재확인 전) |

배민 브랜드관은 설계 당시 네이티브 리스트로 봤으나 실제로는 WebView였다. 화면 진입은 딥링크를 우선하고, 딥링크가 없으면 수동 캡처로 내린다 ([ADR-011](docs/decisions/ADR-011-deeplink-entry-over-tap-path.md)) — 고정 좌표 탭은 그날그날 뜨는 프로모션 모달에 깨진다.

쿠팡이츠·땡겨요·요기요는 자동 스크롤 캡처를 만들지 않기로 했다 —
사람이 폰에서 스크린샷을 찍어 넘기고 비전이 판독한다
([ADR-013](docs/decisions/ADR-013-manual-capture-scope-freeze.md)).
땡겨요는 특히 화면에 추출 가능한 텍스트가 하나도 없어 비전이 유일한
경로다.

## 1차 범위

**포함** — 배민·쿠팡이츠·땡겨요·요기요 4개 앱의 메인 할인 페이지, 캡처부터 export까지 전 구간
**제외** — 하위 프로모션 페이지([ADR-005](docs/decisions/ADR-005-main-page-only.md)), 배달특급(화면 미조사), 매장 단위 할인, 변화 알림

## 실행 환경

- Python + `adb` CLI ([ADR-001](docs/decisions/ADR-001-python-adb-cli.md))
- **USB로 연결한 실기** — 에뮬레이터는 쓰지 않는다 ([ADR-009](docs/decisions/ADR-009-real-device-over-emulator.md))
- 앱 로그인은 사람이 최초 1회 직접 수행한다
- 기기, 앱 패키지명, 좌표 상수는 [기기 설정 문서](docs/setup/device-setup.md) 참고

좌표 상수가 현재 기기 해상도(1220x2712)에 묶여 있어 **기기를 바꾸면 재측정이 필요하다.**
