# 이 프로젝트에 적용된 것들 — 한 장 요약

무엇이 실제로 돌고 있는지를 한자리에 모은다. **여기는 목록이고, 왜
그렇게 골랐는지는 각 문서에 있다.**

| 알고 싶은 것 | 볼 문서 |
|---|---|
| 스택을 왜 골랐나 | [TECH-CHOICES.md](TECH-CHOICES.md) |
| 어떻게 빌드·배포·운영하나 | [DEV-ENVIRONMENT.md](DEV-ENVIRONMENT.md) |
| 이벤트 분석에 무슨 공학을 넣었나 | [ANALYTICS-CAPABILITY.md](ANALYTICS-CAPABILITY.md) |
| 언제 무엇을 했나 | [WORK-HISTORY.md](WORK-HISTORY.md) |
| 지표가 어떻게 움직였나 | [PRODUCT-HISTORY.md](PRODUCT-HISTORY.md) |
| 검색 노출에서 무엇을 고쳐야 하나 | [SEO-ACTIONS.md](SEO-ACTIONS.md) |

---

## 한 줄 정의

배달의민족·쿠팡이츠·요기요·땡겨요 네 앱의 **브랜드 할인을 한 화면에서
견주는** 페이지. 로그인이 없고, 사용자는 카드를 보고 앱 딥링크로 나간다.
**전환 = 앱으로 나감**이고 그 뒤는 우리가 못 본다.

---

## 1. 제품 기능

| 기능 | 상태 | 비고 |
|---|---|---|
| 브랜드별 4개 앱 할인 비교 카드 | 운영중 | 브랜드 110여 개 |
| 최고 할인 강조(hero) | 운영중 | 같은 브랜드 안에서 가장 큰 할인 |
| 앱 딥링크 이동 | 운영중 | `brands.yml`의 앱별 링크. 배너 오퍼는 배너 자기 링크가 이긴다 |
| 분류 필터 | 운영중 | |
| 브랜드 검색 | 운영중 | 검색 확정 시 분류를 비운다(분류에 막혀 0건 나오던 버그 수정) |
| 정렬 | 운영중 | 확정 금액 기준(ADR-016) |
| 당일 행사 배너 | 운영중 | 진행 막대(4.3초), hover 정지, 매진 표시 |
| 누적 쿠폰(복합) 표기 | 운영중 | ADR-019, 대표금액은 사다리 꼭대기 |
| 미확인 값 표기 | 운영중 | 모르는 값을 지어내지 않는다 |
| 담아보기(장바구니) | **꺼둠** | `CART_ENABLED = false`. 침투율 3.0%로 껐다 |
| 멤버십 비교 | **제거됨** | 최근 7일 사용 0% |

## 2. 데이터 수집 (tracker)

| 무엇 | 어떻게 |
|---|---|
| 수집 방식 | Python + ADB CLI, **USB 실기**(에뮬레이터 탐지 회피) |
| 수집 주기 | 하루 1회 배치 — 실시간 아님 |
| 판독 | 화면을 매번 다시 읽는다. 앱 내부 API 안 씀(비공개 API·약관) |
| 배너 일일 갱신 | 매일 10시 Windows 작업 스케줄러가 배짱할인 오늘의 핫딜 재확인 |
| 실패 안전장치 | **못 읽으면 아무것도 안 한다**(no-op) + 재시도 3회 |
| 최신성 가드 | 커밋된 `export.json`이 서버 실물보다 오래됐거나 상세 필드만 빈 경우 배포 중단 |

## 3. 백엔드 (api)

Java 17 + Spring Boot 3.3, **DB 없음**(브랜드 137건 규모, 파일로 충분).

| 무엇 | 어디 |
|---|---|
| 엔드포인트 | `/api/brands`, `/api/banners`, `/api/reload` — 3개뿐 |
| 도메인이 규칙을 든다 | `OfferRecord.status()/isExpired()/liveTiers()`, `Offer.preferredOver()`, `Banner.effectiveMinOrder()/resolvedFor()` |
| 브랜드 지식 단일 출처 | `brands.yml` — 고치고 `/api/reload`만 부르면 반영 |
| 예외 처리 | `GlobalExceptionHandler` — 내부 경로 은닉(`{"error":"internal_error"}`), 정상 404는 500으로 안 바꾼다 |
| 이벤트 수집 | 공개 쓰기 엔드포인트 + **이름 화이트리스트**(19종) |
| 개인정보 경계 | 검색어 원문은 안 남긴다(props 화이트리스트, 테스트로 고정). `ipHash`는 날짜별 솔트 |

## 4. 프론트 (web)

React 18 + Vite 5, **정적 `dist/`**. 라우터·SSR·API 라우트 안 씀.

| 무엇 | 어떻게 |
|---|---|
| API 호출 | 동일 출처 — vite proxy(개발) + vercel rewrites(배포) 같은 규칙, CORS 프리플라이트 자체가 안 생김 |
| A/B 배정 | `visitorId` FNV-1a 해시로 **즉시** 결정(깜빡임이 실험을 오염시키므로) |
| 계측 | 이벤트 하나를 만들어 서버 큐와 PostHog로 동시에 부친다 |
| SEO 프리렌더 | 빌드 후 `prerender.mjs`가 크롤러용 본문 주입 + `robots.txt` + `sitemap.xml`(111 URL) + `/brand/*.html` 110장 |
| 소유 확인 | 구글·네이버 verification 메타 태그 배포됨 |

## 5. 관측·분석

**원장(`events.jsonl`)이 제품 이벤트 19종의 권위 있는 기록, PostHog은 탐색용.**
겹치는 범위에서 숫자가 갈리면 원장이 이긴다 — 원본이 변형 없이 남아
재계산이 되기 때문이다.

```
탐색은 PostHog에서, 판정은 원장에서.
```

| 무엇 | 어떻게 |
|---|---|
| 이중 기록 | 서버 원장 + PostHog. PostHog 전달은 파일 outbox(재시도·dead-letter·격리) |
| 중복 제거 | 클라이언트 `eventId` → PostHog `$insert_id` |
| 유실 방지 | `page_exit`은 `sendBeacon`(`text/plain`으로 받아 프리플라이트 회피) |
| 계약 검사 | 프론트 `track()` 호출을 정적 추출해 서버 화이트리스트와 대조 — **잊으면 CI가 실패** |
| 개발 트래픽 판정 | `experiments.py`의 `looks_developer()` **한 곳**. `?dev=1` 또는 세션 내 폭 2개+ & 최대 800px 이상 |
| 분석 도구 | `scripts/experiments.py` — `audit/daily/segments/compare/features/funnel/paths/top/power` |
| 통계 | 두 비율 z검정, Wilson 신뢰구간, 검정력 기반 표본 크기 — 직접 구현, `--selftest`로 고정 |
| 편향 방지 | 집계 단위가 **사람**. 한 명이 43번 눌러도 1. 중앙값·최다 1명을 같은 표에 찍어 왜곡을 눈치챌 수 있게 |

## 6. CI/CD·운영

| 무엇 | 어떻게 |
|---|---|
| 저장소 구조 | 사람은 모노레포에만 커밋 → `mirror-deploy-repos.yml`이 `rsync -a --delete`로 개별 배포 저장소에 미러 |
| web 배포 | Vercel 자동 |
| api 배포 | self-hosted 러너, **수동**(`workflow_dispatch`) + 헬스체크 |
| 검증 | `check-web.yml`, `check-project-structure.yml` — GitHub 호스팅 러너에서만(배포 권한 있는 러너엔 PR 트리거 안 붙임) |
| 주간 모니터링 | `weekly-check.yml` 월요일 09:00 KST — 어느 플랫폼을 다시 훑어야 하는지 |
| 백업 | 별도 인프라 없이 **git 커밋 자체가 백업**(DB가 없다) |
| 로그 | Logback → systemd journal |

## 7. 결정 기록 (ADR)

| ADR | 무엇 |
|---|---|
| ADR-005 | 자체 수집(first-party analytics)을 둔 배경 |
| ADR-013 | 전자동 캡처를 포기하고 실기로 전환 |
| ADR-016 | dedup 시 확정(confirmed)이 최신성보다 우선 |
| ADR-019 | 누적 쿠폰 tier, 대표금액은 사다리 꼭대기 |

---

## 지금 없는 것 (의도적)

규모에 안 맞아 **일부러 안 한 것들**이다. 왜 안 하는지와 뒤집을 조건은
[DEV-ENVIRONMENT.md](DEV-ENVIRONMENT.md)에 항목별로 적혀 있다.

| 없는 것 | 왜 |
|---|---|
| 인증·인가 | 로그인 자체가 없는 서비스 |
| API 스펙 문서(Swagger) | 엔드포인트 3개, 소비자는 우리 프론트 하나 |
| 무중단 배포 | 단일 인스턴스 — 인프라를 새로 들여야 값어치가 생긴다 |
| 캐시 | 하루 1회 갱신 소량 데이터라 이미 빠르다 |
| 부하 테스트 | 하루 방문 수백 명대, 부하가 안 생긴다 |
| 쿼리 튜닝 | 137건. 메모리에 올려 순회해도 즉시 |
| 서버 APM(Sentry 등) | 로그 확인 비용보다 값어치가 낮다 |

## 알려진 약점

- **능동 알림이 없다.** 장애가 나도 누가 보러 가야 안다.
- **`visitorId`는 `localStorage` 난수.** 한 사람이 여러 방문자로
  쪼개지는 방향(데이터 삭제·시크릿창·기기 여럿)은 못 막는다. 봇 판별도
  아직 없다.
- **수집이 하루 단위다.** 앱이 값을 바꿔도 다음 수집까지 모른다.
- **개별 배포 저장소에 직접 커밋하면 다음 미러에 조용히 지워진다.**
