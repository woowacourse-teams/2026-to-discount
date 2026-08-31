# 개발 환경 — 선택과 트레이드오프

개발·빌드·테스트·배포에 관해 실제로 고른 도구와 방식을 남긴다. 무엇을
왜 골랐고, 어떤 대안을 검토했고(안 했으면 그렇다고 적는다), 무엇이
아쉬운지. 규모에 안 맞는 항목은 "왜 지금 안 하는지"가 그 항목의 답이다.

기술 스택 자체의 선택 근거는 [TECH-CHOICES.md](TECH-CHOICES.md)에 있다.
여기는 그 스택을 어떻게 돌리고 있는지를 다룬다.

---

## CI/CD와 배포 자동화

**선택.** GitHub Actions, 저장소는 모노레포(`woowacourse-teams/2026-to-discount`)
하나. 사람은 여기에만 커밋하고, 배포는 `mirror-deploy-repos.yml`이 push마다
`web/`·`api/`를 `rsync -a --delete`로 개별 배포 저장소(`nn98/delivery-discount-web`,
`nn98/delivery-discount-api`)에 미러한다. web은 Vercel이 그 저장소를 보고
자동 배포하고, api는 `nn98/delivery-discount-api`에 붙은 self-hosted 러너가
`deploy.yml`로 빌드·재기동한다. 검증(`check-web.yml`, `check-project-structure.yml`,
`weekly-check.yml`)은 GitHub 호스팅 러너에서만 돈다 — 배포 권한이 있는
self-hosted 러너에는 `pull_request` 트리거를 안 붙인다.

**고려한 대안.** 처음엔 개별 저장소에 각자 직접 커밋했다. 팀원이 모노레포에
연 PR이 서비스에 안 닿아 손복사를 기다린 사례(2026-08-20)와, 하루에 사본이
두 번 벌어져 한쪽 문서가 코드보다 앞서게 된 사례(2026-08-21, "이벤트 18종"
문서 vs 실제 16종)를 겪고 미러 방식으로 옮겼다. 모노레포에서 바로 Vercel·
self-hosted 러너를 물리는 방법도 있었지만, 두 배포 대상이 이미 개별 저장소에
연결돼 있고 그 연결을 옮길 권한이 없었다.

**트레이드오프.** 개별 저장소에 직접 커밋하면 다음 미러에 조용히 지워진다
— 실수로라도 그쪽에서 작업하면 흔적 없이 사라진다. api 배포는 여전히 수동
(`workflow_dispatch`)이라 미러가 끝나도 사람이 눌러야 반영된다. mono repo
쪽 `deploy-api.yml`은 이제 수동 폴백일 뿐 자동 배포는 nn98 쪽에서만 돈다 —
두 저장소가 동시에 push로 배포하면 같은 서버에 경쟁 배포가 생기기 때문에
막아 둔 것이다.

---

## 개발 환경과 운영 환경 분리

**선택.** 프론트는 개발(vite dev server 프록시)과 배포(`vercel.json` rewrites)
양쪽에 **같은 규칙**을 둔다 — `/api/:path*`를 `bebeggars.duckdns.org`로
넘긴다(`web/vite.config.js`, `web/vercel.json`). 덕분에 브라우저 입장에서
동일 출처가 되어 CORS 프리플라이트가 아예 안 생긴다. 백엔드는 환경변수로
데이터 경로를 바꾼다(`application.yml`의 `DISCOUNT_EXPORT_PATH`,
`DISCOUNT_BANNERS_PATH`) — 기본값은 classpath 안의 **스키마 샘플 픽스처**
(`rawText`가 전부 `[샘플]`로 시작), 서버는 systemd가 실파일 경로를 지정해
띄운다.

**고려한 대안.** Spring 프로필(`application-dev.yml`/`application-prod.yml`)
분리는 검토한 적 없다 — 환경변수 하나로 데이터 소스만 바뀌면 되는 구조라
필요가 없었다.

**한계.** 백엔드 자체는 dev/prod가 갈리지 않는다. 로컬에서 프론트를 띄우면
비어 있는 샘플이 아닌 이상 **운영 API(`bebeggars.duckdns.org`)를 그대로
호출한다** — 별도 개발용 서버가 없다. 프론트 로컬 개발에서 로컬 API를
부르려면 `api.js`의 `API_BASE`를 손으로 바꿔야 한다. 이전엔 이 주소를
소스에 다르게 고정해 빌드 모드에 따라 조용히 실패한 적이 있었다(fetch가
자기 자신에게 나가 빈 화면, 에러로 안 잡힘) — 지금의 동일 출처 rewrite
방식으로 그 문제는 해소됐다.

---

## 로깅·모니터링·알림

**선택.** 로그는 Spring Boot 기본(Logback, stdout → systemd journal)만
쓴다. `GlobalExceptionHandler`(`api/src/main/java/.../web/GlobalExceptionHandler.java`)가
예상 못 한 예외만 `log.error`로 스택트레이스를 남기고, Spring이 이미
의미를 아는 예외(404/405/400)는 그대로 상태코드만 내보낸다. 배포 헬스체크는
`deploy-api.yml`의 `curl -sf http://localhost:8088/api/brands`. 주간
모니터링은 `weekly-check.yml`(매주 월요일 09:00 KST 크론)이 "어느 플랫폼을
다시 훑어야 하는지"를 GitHub Actions Job Summary에 띄운다.

**고려한 대안.** 처음엔 `Exception` 하나로 다 잡았는데, 정적 리소스 없음
같은 정상 404까지 500으로 바뀌면서 봇 스캔(`/.env`, `/.git/config`) 로그가
30분 만에 쌓였다(2026-08-07 실측) — 그래서 `ResponseEntityExceptionHandler`
상속으로 좁혔다. **서버 APM**(Sentry, Datadog 등)은 도입한 적 없다 —
트래픽 규모(하루 방문 수백 명)와 단일 서버 구조에서 값어치가 로그 확인
비용보다 낮다고 판단했다.

이와는 별개로 **제품 분석 SaaS는 이미 쓰고 있다** — PostHog다. 성격이
다르다: APM은 "서버가 죽었나"를 보는 도구, PostHog은 "사람이 어떻게
쓰나"를 보는 도구다. **다만 "PostHog를 붙였다"는 사실 자체는 기술
활동이 아니다** — SaaS 하나 골라 SDK를 심는 건 도구 선택이지 우리가
만든 게 없다. 실제 기술 활동은 그 뒤에 "SDK 하나로 충분한가"를 검증하며
나온 것들이다. 가설을 세우고 실측으로 깨거나 확인한 과정 전체는
[ANALYTICS-CAPABILITY.md](ANALYTICS-CAPABILITY.md)에 있고, 여기는 그중
이 문서(개발 환경)와 맞닿은 결론만 옮긴다.

- **이중 기록으로 간 이유(H1 반증).** PostHog 직송 단독안을 먼저
  가정했다 — 경로 하나면 실패 지점도 하나일 거라고 봤다. 틀렸다: PostHog
  전달이 실패하면 SaaS 쪽엔 아무것도 안 남고, 재시도할 원본도 없다.
  자체 서버 원장(`events.jsonl`)에 먼저 적재하고 PostHog 전달은 파일
  기반 outbox로 큐잉·재시도(`PostHogOutbox.java`,
  `PostHogForwardingWorker.java`)하는 구조를 그래서 만들었다. 이
  결정이 실제로 값을 한 사례가 아래 개발 트래픽 판정이다 — PostHog
  단독이었다면 재계산 자체가 불가능했다.
- **개발 트래픽 판정을 통째로 다시 판 이유.** 서버가 이벤트 하나만 보고
  `device == desktop && viewport < 400px`로 개발자를 걸러내던 옛 규칙이
  있었다. 이상 신호를 실측으로 잡았다: **걸러낸 365명의 전환율(41.9%)이
  남긴 쪽(33.9%)보다 높았다** — 개발자가 실사용자보다 링크를 더 누를
  이유가 없다. 원장을 다시 뒤져 원인을 찾았다: 일부 안드로이드
  브라우저가 `matchMedia('hover: hover')`를 참으로 보고해 desktop으로
  오판정되고, 폰 화면 폭(384/360px)은 당연히 400 미만이라 규칙에 걸렸다
  — **368명이 오탐이었다.** 판정을 "세션 안에서 뷰포트 폭이 여러 개이고
  최댓값이 800px 이상이면 개발자"로 바꾸고, 판정 위치를 수집 시점(API·
  `PostHogEventMapper`, 되돌릴 수 없음)에서 집계 시점(`scripts/experiments.py`
  의 `looks_developer()` 하나, 다시 셀 수 있음)으로 옮겼다. 원장에
  원본이 그대로 남아 있었기 때문에 이 재계산과 368명 복구가 가능했다 —
  PostHog에만 의존했다면 오탐 여부조차 몰랐을 것이다.
- **분석 도구를 직접 만든 이유.** PostHog UI로는 못 푸는 질문(방문자
  단위 집계로 헤비 유저 편향 제거, 시각순+세션범위 퍼널, 두 비율
  z검정·Wilson 신뢰구간·표본 크기 계산)이 있어 `scripts/experiments.py`를
  직접 짰다(`audit`/`compare`/`funnel`/`paths`/`power` 등, `--selftest`로
  계산 자체를 고정). 이 도구가 실제로 잡아낸 버그가 있다 — 퍼널을
  "각 단계를 언젠가 했나"로 세면 순서가 아니라 교집합이 돼 같은 4단계
  도달이 139명(순서 무시)/81명(시각순)/44명(세션+시각순)으로 갈렸다.

결론적으로 SDK 값을 버리는 게 아니다 — "권위 있는 기록"의 자리는 원장이
갖고("이벤트 유실 대비"라는 원래 이유가 실측으로 증명됐다), PostHog은
그 위에서 탐색하는 도구로 역할이 갈린다: **탐색은 PostHog에서, 판정은
원장에서.**

**한계.** 알림이 능동적이지 않다 — 장애가 나도 누가 로그를 보러 가지
않으면 모른다. 헬스체크는 배포 직후 한 번뿐이고 상시 모니터링이 아니다.
PostHog 쪽도 마찬가지로 알림을 설정해 두지 않았다 — 사람이 직접 인사이트를
열어봐야 안다.

---

## 에러 추적과 장애 대응

방문 이벤트 관측·판정 파이프라인(원장 SSOT, PostHog 보조, 개발 트래픽
판정)은 [ANALYTICS-CAPABILITY.md](ANALYTICS-CAPABILITY.md)에서 다룬다.
여기선 서버 에러만 본다.

**선택.** 위 `GlobalExceptionHandler`가 유일한 장애 대응 지점이다. 응답
본문엔 `{"error": "internal_error"}`만 내려가고 예외 메시지는 안 담는다 —
내부 경로·파일명이 새어나갈 이유가 없어서다. 데이터 배포(`deploy-data.yml`)
쪽엔 별도 가드가 있다: 커밋된 `export.json`이 서버 실물보다 오래된 경우
(`capturedAt` 최신값 비교)와, 캡처 시각은 같은데 상세 필드(tiers, badge)만
빈 경우(`tracker/check_deploy.py`)를 막아 배포를 중단시킨다 — 둘 다 실측
사고(2026-08-05 서버 138건 vs 커밋 135건으로 데이터 유실 직전, 청년피자
땡겨요 tiers·badge 소실)에서 나온 가드다.

**고려한 대안.** 에러 리포팅 서비스는 위 로깅 항목과 같은 이유로 안 붙였다.

**한계.** 배포 타이밍 문제(신필드를 실은 데이터가 구버전 API에 먼저
도착해 Jackson이 500을 냄, 2026-08-03 실측)는 근본 해결이 아니라 재시도
(5회, 15초 간격)로 흡수하고 있다.

---

## API 문서화

**선택.** 없다. 기획 문서(`api/docs/README.md`)와 계약 문서
(`api/docs/ORCHESTRATION-CONTRACT.md`)가 산문으로 엔드포인트 동작을
설명하지만, Swagger/OpenAPI 같은 기계가 읽는 스펙은 없다.

**고려한 대안.** springdoc-openapi 도입은 검토한 적 없다.

**왜 지금 안 하는가.** 엔드포인트가 `/api/brands`, `/api/banners`,
`/api/reload` 세 개뿐이고 소비자가 팀 자신의 프론트 하나다. 외부
연동자가 없는 상태에서 스펙 문서 유지 비용이 값어치보다 크다. 엔드포인트가
늘거나 외부에 API를 여는 시점이 뒤집을 조건이다.

---

## 인증·인가와 보안

**선택.** 없다 — 이 서비스엔 로그인 자체가 없다. 모든 엔드포인트가
비로그인으로 열려 있고 인증·인가 계층(Spring Security 등)을 두지 않았다.
`GlobalExceptionHandler`의 예외 메시지 은닉이 사실상 유일한 보안 조치다.

**고려한 대안.** 검토한 적 없다 — 제품 자체가 계정 개념 없이 "할인 정보를
누구나 본다"는 전제로 설계됐다(비로그인 서비스, [TECH-CHOICES.md](TECH-CHOICES.md#관통하는-원칙)의
"공개된 경로로만 수집한다" 원칙과 같은 결).

**한계.** `/api/reload`도 인증 없이 열려 있다 — 아무나 호출해 데이터
리로드를 트리거할 수 있다. 지금은 값을 바꾸는 게 아니라 파일을 다시
읽는 것뿐이라 피해가 제한적이지만, 계정·개인정보를 다루는 기능이 생기면
이 항목 전체를 다시 설계해야 한다.

---

## 데이터 백업과 복구

**선택.** 별도 백업 인프라 없이 **git 자체가 백업**이다. `export.json`,
`banners.yml`, `brands.yml`이 전부 저장소에 커밋되는 파일이라, 복구는
이전 커밋으로 되돌리는 것과 같다. 원본 캡처(`tracker/data/log.jsonl`,
방문 원장 `events.jsonl`)도 마찬가지로 append-only 파일이며 커밋 이력이
곧 스냅샷 이력이다.

**고려한 대안.** DB 스냅샷·주기적 오프사이트 백업은 검토한 적 없다 —
DB 자체가 없다([TECH-CHOICES.md](TECH-CHOICES.md#api) "DB가 없다" 참고).

**한계.** 서버 실물 데이터(`~/delivery-discount-api/data/export.json`)와
커밋된 사본이 어긋날 수 있다 — 실제로 서버 138건 vs 커밋 135건 사고가
있었고, 그래서 `deploy-data.yml`에 최신성 가드가 붙었다. 즉 "백업"은
있지만 "서버가 항상 최신 백업과 일치함을 보장"하는 장치는 배포 가드가
간접적으로만 대신한다.

---

## 대량 데이터와 쿼리 성능 개선

**왜 지금 안 하는가.** 브랜드 137건, 배너 2건 규모다. 전부 메모리에
올려 순회해도 응답이 즉시 나온다. 인덱스·페이지네이션·쿼리 튜닝을 고려할
데이터량 자체가 아니다. [TECH-CHOICES.md](TECH-CHOICES.md#api)의 플랜B대로
"데이터가 수천 건이 됨"이 뒤집을 조건이다.

---

## 부하 테스트와 서버 튜닝

**왜 지금 안 하는가.** 하루 방문자가 수백 명대([PRODUCT-HISTORY.md](PRODUCT-HISTORY.md)
참고)라 동시접속 부하 자체가 발생하지 않는다. 부하 테스트 도구(k6, nGrinder
등)는 검토한 적 없다. 트래픽이 이 규모를 벗어나는 시점(외부 홍보로 순간
유입이 몰리는 경우 등)이 뒤집을 조건이다.

---

## 무중단 배포

**선택.** 없다 — `deploy-api.yml`이 `systemctl restart`로 재기동하는
동안 짧은 다운타임이 생긴다. 블루/그린이나 롤링 배포는 안 한다.

**고려한 대안.** 검토한 적 없다.

**왜 지금 안 하는가.** 단일 서버 단일 인스턴스([TECH-CHOICES.md](TECH-CHOICES.md#api)
"단일 서버, 단일 인스턴스" 참고)라 무중단 배포는 최소 인스턴스 2대나
로드밸런서 같은 인프라를 새로 들여야 값어치가 생긴다. 지금 배포 빈도와
다운타임 길이(재기동 수 초 + 헬스체크 5초 대기)로는 감수할 만하다고 봤다.

---

## 캐시와 확장 가능한 시스템 구조

**선택.** 없다 — HTTP 캐시 헤더(`Cache-Control`, `ETag`)도, 서버 내부
캐시(`@Cacheable` 등)도 붙이지 않았다. 응답은 매 요청 메모리에 이미
올라간 데이터를 그대로 직렬화한다.

**고려한 대안.** 검토한 적 없다.

**왜 지금 안 하는가.** 데이터가 하루 한 번만 바뀌고 규모가 작아 캐시가
없어도 응답이 이미 빠르다. [TECH-CHOICES.md](TECH-CHOICES.md#api) 플랜B가
말하는 "가용성이 문제가 됨 → CDN 캐시가 먼저"가 이 항목이 실제로 필요해질
조건이다.

---

## 팀의 제품 문제에 필요한 자체 정의 요구사항

체크리스트 표준 항목엔 없지만 이 제품 특유의 문제라서 별도로 다룬 것들.

**하루 1회 배치 수집, 실시간 아님.** 배달앱 UI를 실기 ADB로 매일 훑어
`export.json`을 만든다([TECH-CHOICES.md](TECH-CHOICES.md#tracker) 참고).
"오늘 데이터가 최신인가"를 보장하는 장치(`weekly-check.yml`,
`deploy-data.yml`의 최신성 가드)가 이 프로젝트에서만 필요한 인프라다.

**방문 원장(events.jsonl)이 SSOT, PostHog은 보조.** 3rd-party SDK 유실
가능성 때문에 자체 서버가 이벤트를 직접 기록한다. 자세한 내용은
[ANALYTICS-CAPABILITY.md](ANALYTICS-CAPABILITY.md)와
[api/docs/traffic-analytics.md](../api/docs/traffic-analytics.md).

**개발 트래픽 판정이 파이프라인 하나로 통합됨.** 예전엔 API(PostHogEventMapper의
`dev_suspect`)와 분석 스크립트 양쪽에 판정 로직이 흩어져 있었다. 지금은
`scripts/experiments.py`의 `looks_developer()` 하나로 모았다 — 명시적
`?dev=1` 플래그, 또는 한 세션 안에서 뷰포트 폭을 2개 이상 관측했고 그중
최댓값이 데스크톱 폭(800px) 이상이면(창 크기 조절) 개발자로 본다. API 쪽
`dev_suspect` 필드는 완전히 제거했다(`PostHogEventMapper.java`에 이유
주석만 남아 있다).

**브랜드 딥링크가 `brands.yml` 하나로 모임.** 브랜드 추가·수정이 가장
잦은 변경인데 예전엔 네 군데 수정 + 프론트 재배포가 필요했다. 지금은 이
파일 하나 고치고 `POST /api/reload`만 부르면 반영된다.

**빌드 타임에 크롤러용 정적 페이지를 만든다.** Vite엔 프리렌더 API가
없고(`web/src`의 `variant.js`가 모듈 로드 시 `localStorage`를 읽어 SSR
자체가 불가능) SSR로 옮기는 건 스택 전체를 바꾸는 값어치가 없어서, 빌드
후 스크립트(`web/scripts/prerender.mjs`)로 `dist/`에 검색엔진용 본문을
따로 주입하는 절충을 택했다. `robots.txt`·`sitemap.xml`(111 URL)·
브랜드별 정적 페이지(`/brand/*.html`, 110장)를 이 스크립트가 만든다.
검증 스크립트(`web/scripts/verify-search-filters.mjs`)는 `logos.jsx`의
JSX import를 인라인 스텁으로 바꿔치기해 node 환경에서도 필터 로직을
그대로 import해 테스트한다 — 별도 프레임워크 없이 순수 스크립트로
회귀를 잡는다.

**일일 루틴을 OS 스케줄러로 돌린다.** 배너 갱신(`scripts/banner_routine.py`)은
CI가 아니라 로컬 기기의 Windows 작업 스케줄러(`schtasks`)가 돈다 — 실기 ADB
캡처라 CI 러너에 폰을 물릴 수 없어서다. 읽기 실패 시 아무것도 안 하는
안전장치(no-op)와 최대 3회 재시도를 붙여, 조용한 실패가 배너를 잘못 내리는
사고로 이어지지 않게 했다.

**올리는 일과 확인하는 일을 나눴다.** 핫딜은 하루 안에도 바뀐다(실측
2026-08-29: 어제 8,000원이던 처갓집이 7,000원). 한 번만 보면 그 사이 바뀐
것을 놓친다.

    02:00  banner-routine   그날 핫딜을 읽어 배너를 맞춘다
    10:00  banner-verify    --verify — 어긋났는지만 본다. 고치지 않는다

검증이 안 고치는 이유는 시각 때문이다. 선착순 발급이 11시라, 그 직전에
기계가 배너를 갈아치우면 그 순간 화면을 보던 사람이 다른 금액을 본다.
어긋났다는 사실만 종료 코드로 남기고(0 같음 / 1 다름 / 2 못 읽음) 사람이
판단한다.

재시도는 예외도 받아야 했다. `read_today_hotdeal`은 화면이 비면 `None`을
돌려주지만 앱이 안 열리면 예외를 던지는데, 처음엔 `None`만 다시 시도하게
짜 놔서 예외가 루프를 뚫고 나갔다 — 재시도도 안 하고 no-op 안전장치까지
건너뛰었다. 고치자마자 값을 했다(첫 시도가 `exit 137`로 죽고 두 번째에
읽었다).
