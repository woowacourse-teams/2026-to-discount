# 27. 개발/운영 환경 분리 (2026-09-15 작성, 2026-09-29 갱신)

**상태: 보류 — 나중에 한다(2026-09-29 결정).** 지금은 착수하지 않지만 접은 설계가 아니다. 사용자는 2026-09-15에 "즉시 도입 안 한다, 계획만 둔다"로 답했고, 2026-09-29에 "지금은 아니지만 한다. 나중에는 서버와 클라이언트를 완전히 갈라 두 트랙으로 운영한다"로 다시 정했다(추적 이슈 #27). 이 문서는 웹, API, 데이터를 세트로 갈라 운영과 분리하는 갈래(A/B/C)와 그 뒤의 두 트랙 분리(8절)를 적는다.

2026-09-29 갱신: 0절(지금 상태)과 3절(비용)을 지금 코드에 맞췄고, 5절의 검수 화면 부분은 보관으로 옮긴 28·30번을 가리키게 고쳤다. 8절(두 트랙 분리)을 새로 붙였다. 1·2·4·6절의 판단과 사용자 답은 2026-09-15 그대로다.

## 0. 지금 상태 (2026-09-29 코드 기준)

| 층 | 운영 | 개발 | 갈리는 정도 |
|---|---|---|---|
| 코드 | mono(`woowacourse-teams/2026-to-discount`)가 `api/`와 `web/`의 단일 정본. `mirror-deploy-repos.yml`이 main push마다 `nn98/delivery-discount-api`, `nn98/delivery-discount-web`로 복사한다 | 로컬 체크아웃 | **main만 미러된다.** 다른 브랜치는 미러 저장소에 안 가서 Vercel 프리뷰가 뜨지 않는다 |
| 웹 | Vercel(프로젝트 슬러그 `beggars`, 운영 별칭 `beggars-five.vercel.app`) | `vite dev` 로컬 | **API 주소가 운영으로 고정**(`web/src/api.js`의 `API_BASE = 'https://bebeggars.duckdns.org'`, 빌드 변수 아님). 로컬 프론트도 운영 API를 친다. `vercel.json` rewrites는 비어 있다 |
| API | OCI 1대, nginx 뒤 Spring(`delivery-discount-api`). API 미러에 붙은 러너가 빌드하고 재시작한다 | `./gradlew bootRun` 로컬. 데이터는 classpath 샘플 | 데이터 경로와 기능은 환경변수(`DISCOUNT_EXPORT_PATH`, `DISCOUNT_BANNERS_PATH`, `DISCOUNT_POSTHOG_ENABLED`, `DISCOUNT_PUSH_ENABLED` 등). 프로필 없음 |
| API 표면 | 읽기 `GET /api/brands`, `/api/banners`, `/api/survey/code`, `/api/push/public-key`. 쓰기 `POST /api/events`, `/api/reload`, 푸시 구독과 추적 | 같음 | 2026-09-29에 인증 없는 `/api/stats`(통계 화면)와 검수용 가짜 데이터 `/api/test`를 지웠다 |
| CORS | `/api/**`에 `beggars-five.vercel.app`, `beggars-five-*.vercel.app`, `beggars-git-*-nn98s-projects.vercel.app`, `beggars-*-nn98s-projects.vercel.app`만 허용(`WebConfig.java`) | 같음 | 2026-09-29에 옛 프론트 주소(`delivery-discount-web-*`)를 뺐다. **Vercel 프리뷰 주소는 이미 허용된다** — 프리뷰가 생기면 운영 API를 그대로 부를 수 있다 |
| 데이터 | 서버의 `export.json`, `banners.yml`, `gifticons.yml`, 이벤트 원장 | 없음 | 수집 PC `reflect_daily`가 `deploy_export.py`로 **운영에 직접** 올린다. mono를 거치지 않는다 |
| 운영 콘솔 | 비공개 beggars-ops 저장소가 정본. 자기 `deploy.yml`로 서버에 올라간다. 배너 제안 승인, 배너 직접 편집, 사람별 계정과 편집 이력 | 없음 | 운영 API(Spring)에는 쓰기 경로를 열지 않고 별도 프로세스가 파일 하나(`banners.yml`)만 고친 뒤 `/api/reload`를 부른다(7절) |
| 계측 | PostHog 프로젝트 하나(탐색과 대시보드) + API의 이벤트 원장(확정 수치, ANALYTICS.md) | 같은 곳 | `?dev=1`로 붙는 `dev: true` 표시와 원장 집계 때 세션 모양 추정으로 **사후 판정**해 걸러낸다. 지우지 않는다 |
| 배포 | mono main → 미러 둘 → API 러너 / Vercel | 없음 | 프리뷰 없음. main = 운영 |

**사고 기록에서 오는 필요.**

- 2026-09-02: 개발 트래픽을 실사용으로 착각했다. `?dev=1` 표시 추가로 대응했다.
- 2026-09-15: "배포됐는데 안 보인다". 운영에서 눈으로 확인하는 것 말고 검증 수단이 없다.
- 수집 PC 자동 반영이 운영 원장에 바로 쓰는 구조다. 잘못 넣으면 사용자가 본다(2026-09-15 190건이 164건으로 준 사고).
- 배너 자동 반영이 사람 수정을 되살렸다. 이것은 2026-09-18 콘솔 승인 경로로 해결했다(7절).

## 1. "분리"가 뜻할 수 있는 것: 다섯 층

1. **코드 경로 분리**: 브랜치/프리뷰 배포. "배포 전에 본다".
2. **데이터 분리**: 개발이 운영 원장, 배너, 기프티콘을 못 건드린다.
3. **계측 분리**: 개발 이벤트가 운영 지표에 안 섞인다.
4. **런타임 분리**: 별도 API 프로세스/서버/도메인.
5. **비밀과 설정 분리**: 토큰과 경로가 환경별로 갈린다.

지금 규모에서 전부 할 이유는 없다. 아픈 순서는 **3 > 2 > 1 > 5 > 4**다.

## 2. 갈래

### A. 최소: "계측만 가른다" (반나절)

- PostHog **두 번째 프로젝트**(dev)를 만들고 `VITE_POSTHOG_KEY`를 Vercel 환경별로
  갈라둔다(Production / Preview+Development). API 쪽 `POSTHOG_PROJECT_TOKEN`도
  로컬은 dev 프로젝트를 쓴다.
- 자체 원장은 `dev: true` 표시가 이미 있으니 그대로 둔다. 대신 서버 API가 `dev`
  이벤트를 **별도 파일**(`events-dev.jsonl`)로 쓰게 하면 원장 분석에서 걸러낼
  일이 없어진다.
- 얻는 것: 2026-09-02류 사고 재발 차단, `experiments.py`의 개발 판정 로직 부담 감소.
- 잃는 것: 거의 없음. 대시보드는 운영 프로젝트만 본다.

### B. 프리뷰: "배포 전에 눈으로 본다" (하루)

- **Vercel Preview**는 이미 공짜로 있다. mirror가 main만 밀어서 안 쓰일 뿐이다.
  mirror 워크플로가 `preview/*` 브랜치도 밀거나, mono PR을 그대로 nn98 브랜치로
  미러하면 PR마다 프리뷰 URL이 뜬다.
- 프리뷰가 운영 API(`bebeggars.duckdns.org`)를 읽는 건 **괜찮다**. 읽기뿐이다.
  문제는 프리뷰가 쏘는 `POST /api/events`가 운영 원장에 섞이는 것이다.
  `VITE_API_BASE`를 빌드 변수로 빼고, 프리뷰는 dev API를 보거나(갈래 C), A안대로
  `dev` 표시를 강제한다(`import.meta.env.MODE !== 'production'`이면 dev=true).
- 2026-09-15 같은 "고쳤는데 안 보인다"는 프리뷰 URL에서 먼저 봤으면 끝났다.
- 잃는 것: mirror 워크플로 복잡도, Vercel 빌드 분 소모(무료 한도 안).

### C. 같은 서버에 dev API 하나 더 (하루)

- systemd 유닛을 복사해 `delivery-discount-api-dev` :8089, nginx `dev.bebeggars.duckdns.org`
  (또는 `/dev-api/` 경로)를 만든다. 데이터 디렉터리는 `data-dev/`다. export.json은 운영 것을
  **복사**해 시작하고, banners와 gifticons는 샘플이다. 원장은 `events-dev.jsonl`이다.
- 서버 여유(2 vCPU, 메모리 9GB 가용)로 Spring 하나 더는 문제없다. 도메인은
  duckdns 서브도메인이 안 되면 경로 기반으로 한다.
- 미니PC `reflect_daily`가 **먼저 dev에 올리고 검증(`check_deploy`)한 뒤 운영**으로
  가면 2026-09-15 190건이 164건으로 준 사고가 운영에 닿기 전에 잡힌다. 단 자동 반영 정책
  (ROUTINE-SPEC §3)이 "검증 통과 후 즉시 운영"이라 dev 단계는 **추가 검증 관문**이지
  사람 승인 관문이 아니다. 그 선은 지킨다.
- 잃는 것: 서버 설정 둘 관리, 배포 워크플로 둘(dev는 push, prod는 태그/수동?).

### D. 완전 분리: 서버 둘, 도메인 둘, 저장소 브랜치 전략 (며칠 + 운영 비용)

- OCI 무료 티어 인스턴스 하나 더, `develop`은 dev, `main`은 prod, 프로필
  `application-dev.yml`/`prod.yml`.
- 이 규모(1~2명, 하루 수백 명)에서는 **과하다**. 서버 둘을 같은 상태로 유지하는
  일 자체가 새 일이 된다. 지금도 미러 저장소 둘이 "뒤처진 사본"을 만든 전력이
  있었다(지금은 지운 mono `deploy-api.yml`의 주석). 갈래를 늘릴수록 그 사고가 는다.

### E. 분리 대신 "운영 안에서 안전하게" (대안)

- **기능 플래그 + 카나리 visitorId**: `DISCOUNT_SURVEY_TEST_VISITORS`처럼 이미
  있는 패턴이다. 새 기능을 특정 visitorId에게만 켠다. 화면 확인이 목적이면 이게 가장
  싸다.
- **원장 되돌리기**: `deploy_export.py`가 백업을 만들듯, `reflect_daily`도 반영
  전 스냅샷과 `--rollback`을 갖추면 dev 환경 없이도 사고 복구 시간이 준다.
- 한계: "배포 전에 본다"는 못 한다.

## 3. 규모 대비 판단 (2026-09-29 비용 갱신)

| | 비용(2026-09-29) | 무엇이 달라졌나 | 막는 사고 | 지금 규모 값어치 |
|---|---|---|---|---|
| A 계측 분리 | 반나절 | PostHog 두 번째 프로젝트나 dev 이벤트 별도 파일. 사용자 답(4절 2)은 "dev에는 PostHog를 아예 안 건다"라 실제 작업은 dev 빌드에서 `VITE_POSTHOG_KEY`를 비우는 것뿐이다 | 개발 트래픽 오염 | 높음. `?dev=1` 사후 판정이 지금도 그 부담을 진다 |
| B 프리뷰 | 반나절~하루 | **CORS는 이미 프리뷰 주소(`beggars-git-*`, `beggars-*-nn98s-projects`)를 허용한다.** 남은 일은 `mirror-deploy-repos.yml`이 main 밖 브랜치도 웹 미러로 밀게 하는 것과 `API_BASE`를 `VITE_API_BASE` 빌드 변수로 빼는 것 | "배포됐는데 안 보임", UI 회귀 | 높음 |
| C dev API | 하루 | 서버 유닛 하나, nginx 블록 하나, 인증서, dev 데이터 디렉터리. `/api/stats`·`/api/test`가 없어져 운영 API 표면이 작아졌으니 복사할 것도 줄었다 | 자동 반영 데이터 사고 | 중간. `check_deploy`와 매니페스트 검증이 절반은 막는다 |
| D 완전 분리 | 며칠+ | 8절의 두 트랙 분리가 이 방향이다 | 위 전부 | 지금은 낮음. 나중에 한다 |
| E 플래그, 롤백 | 반나절 | 변화 없음 | 복구 시간 | 중간 |

2026-09-15 추천은 "A + B 먼저, C는 사고가 한 번 더 나면"이었고 사용자 답은 B + C 한 묶음이었다(4절). 2026-09-29에는 어느 것도 지금 하지 않는다.

## 4. 사용자 답 (2026-09-15)

1. **투트랙으로 간다.** 프리뷰 웹이 운영 API를 읽는 것 자체는 상관없지만,
   환경을 격리하려면 웹, API, 데이터가 세트로 갈려야 한다. 운영 웹은 운영 API,
   프리뷰/로컬 웹은 dev API(:8089, `data-dev/`)를 본다. 실반영 때 운영에서 다시 확인하는
   것은 그것대로 한다. 결론은 **B + C를 한 묶음으로**. `VITE_API_BASE`를 빌드 변수로
   빼고 Vercel Production만 운영 주소, Preview/Development는 dev 주소를 쓴다.
2. **개발 환경에는 PostHog를 아예 안 건다.** 별도 dev 프로젝트를 파지 않는다.
   dev API는 `DISCOUNT_POSTHOG_ENABLED=false`, 프리뷰 빌드는 `VITE_POSTHOG_KEY`를
   비운다. 수집 무결성 때문에 필요한가. **아니다.** 판정의 단일 진실은 자체 원장
   `events.jsonl`이고 PostHog는 탐색용이다(ANALYTICS.md). 브라우저, API, 원장으로 이어지는 경로는
   dev API가 `events-dev.jsonl`을 쓰게 두면 그대로 검증된다. API에서 PostHog로 전달하는
   코드는 단위 테스트(`verify-posthog-sdk`, `PostHogForwarder` 테스트)와 운영
   outbox 지표로 본다. 프리뷰 트래픽이 운영 API로 안 오게 되면 운영 원장의 `dev` 표시와 사후 판정 로직은
   **로컬에서 운영 API를 손으로 친 경우**만 남는다. 유지하되 의존하지 않는다.
3. 질문 3을 맥락 없이 다시 쓰면 다음과 같다. *지금은 미니PC의 예약 실행이 수집 결과를 검사한
   뒤 사람 없이 운영 원장에 쓰고 운영 서버에 올린다. dev API가 생기면 그 예약
   실행이 ① dev에 올려 검사하고 통과하면 곧바로 운영에도 올리는가(지금처럼 사람
   없이 끝), ② dev까지만 올리고 운영 반영은 사람이 하는가.* 둘 중 하나를 정해야
   한다. ①은 dev가 검사 단계 하나를 더 얻는 것이다. ②는 2026-09-15에 정한 "검증 후
   자동 반영, 같은 날 사람이 만진 것만 안 덮음" 정책을 되돌리는 것이다. 이
   문서에서는 **①로 둔다**. 정책 변경은 별도 결정이다.
4. 도메인 추가는 자유다. `dev-api.bebeggars.duckdns.org`(nginx 서버 블록 하나 더,
   certbot)로 간다. 경로 분기는 안 한다.

### 4-1. 추가 답 (같은 날, 두 번째 회신)

- 2 확정: dev에서는 **이벤트가 원장에 제대로 쌓이는지만** 본다. PostHog 전달은
  안 건다.
- 3 확장: dev 환경을 **검수 화면**으로 쓴다. 자동 수집 결과가 dev API와 dev 웹에
  먼저 뜬다. 사람이 실제 화면에서 보고 브라우저에서 **오퍼를 바로 조작**(금액과
  조건 수정, 빼기, 승인)한 뒤 운영에 반영한다. 구조는
  **자동 수집, 검수(dev 화면), 반영 결정** 순서다. dev 화면이 최종 방어선이 된다.
  이렇게 되면 질문 3의 답은 ②(운영 반영은 사람의 결정)로 바뀌는 것이 자연스럽다.
  단 "검수를 안 하면 언제 운영에 가는가"를 정해야 한다(아래 §5-4).
- **즉시 도입 안 한다. 계획만 둔다.**

## 5. 계획 (도입 시 순서, 착수는 별도 지시)

1. 서버: `delivery-discount-api-dev.service`(:8089, `data-dev/`, PostHog off,
   원장 `events-dev.jsonl`), nginx `dev-api.` 블록, 인증서.
2. 웹: `api.js`의 `API_BASE`를 `import.meta.env.VITE_API_BASE ?? 운영주소`로 바꾼다.
   Vercel 환경변수는 Production=운영, Preview와 Development=dev다. `.env.development`에
   dev 주소를 둔다. 프리뷰 빌드는 `VITE_POSTHOG_KEY`가 없다.
3. 미러: `mirror-deploy-repos.yml`이 main 외 브랜치도 `nn98/delivery-discount-web`
   같은 이름 브랜치로 밀어 Vercel Preview가 뜨게 한다. API 미러는 main만이다. dev API는
   운영 jar와 같은 빌드를 쓰고 데이터만 다르다. 코드 프리뷰가 필요하면 그때
   dev 배포 워크플로를 따로 만든다.
4. 트래커: `reflect_daily`가 **dev에만** 올린다. 운영 반영은 검수 화면의
   "반영" 버튼(dev API `POST /api/review/publish`가 운영 export.json 갱신과
   reload) 또는 미니PC `deploy_export --apply`가 한다. 검수가 없을 때의 규칙은 둘 중
   하나로 정한다. (가) 정해진 시각까지 검수가 없으면 자동 반영(현 정책 유지,
   검수는 선택), (나) 검수 전엔 운영에 안 감(정책 변경). 미정이다.
5. (2026-09-29: 이 항목의 검수 화면과 검수 API는 보관으로 옮겼다 — [archive/28](archive/28-review-screen.md), [archive/30](archive/30-review-api-and-auth.md). 배너 승인·편집과 사람별 계정은 beggars-ops 콘솔이 대신한다. 오퍼 관리와 즉시 대응은 나중에 다시 볼 수 있다.)
   검수 화면(dev 웹에만 켜지는 모드, `import.meta.env.MODE !== 'production'`):
   - 카드의 오퍼마다 금액, 최소주문, 기한, 조건을 **인라인 편집**, 빼기, 되살리기.
   - 편집은 원장에 `capture_mode: manual` 행으로 append한다(ADR-016). 사람 수정으로
     기록되어 같은 날 자동 반영이 안 덮는다. ROUTINE-SPEC §3 정책과 맞물린다.
   - 배너도 같은 화면에서 `banners.yml`을 편집한다(지금 ssh로 손보는 것을 대체).
   - 저장 대상은 dev 데이터다. "반영"이 운영으로 복사한다.
   - API: dev API에만 활성화되는 `review` 컨트롤러(프로필 대신 환경변수
     `DISCOUNT_REVIEW_ENABLED=true`). 운영 jar에는 켜지지 않는다. 인증이 없기 때문이다.
   - 인증: dev 도메인을 nginx basic auth 또는 IP 허용으로 막는다(사용자 1~2명).
6. 문서: DEV-ENVIRONMENT.md "개발 환경과 운영 환경 분리" 절 갱신, ROUTINE-SPEC
   §2, §3에 검수 단계와 반영 규칙 추가.

대략 비용(2026-09-29): 1~3 하루(CORS가 이미 프리뷰를 허용해 조금 줄었다), 4 반나절. 5는 보관으로 옮겨 이 계획에서 뺐다.

## 6. 하지 말 것

- 브랜치 전략(`develop`/`release`)부터 세우기. 1~2명에 main 하나가 맞다.
- Spring 프로필 파일 분리. 환경변수로 이미 갈린다(DEV-ENVIRONMENT.md).
  프로필은 "설정이 3개 넘게 갈릴 때" 꺼낸다.
- 서버 둘. 위 D다.

## 7. 예외: 배너 제안 승인 경로 (2026-09-18 선제 구현)

이 문서의 전제 하나는 "운영 API에 쓰기 경로를 열지 않는다"였고, 그래서 검수 화면(28, 보관)과 검수 API(30, 보관)는 개발 환경 분리(27) 뒤로 미뤄 두었다. 2026-09-18에 그 전제에 예외를 하나 두고 먼저 구현했다. 사용자 결정: 배너는 기계가 수집하고, 사람이 확인한 뒤 반영한다. 09-15의 "배너는 수동 반영" 결정이 로그에만 남는 대조로 굳어져, 09-14에 사람이 쓴 쿠팡이츠 선착순 배너가 나흘째 그대로였기 때문이다.

무엇이 열렸나.

- 수집 PC의 배너 루틴(`scripts/banner_routine.py --propose`)이 변경안을 작업 목록(`add`, `set`, `expire`)으로 서버 `<서버>/ops/proposals/<날짜>.json`에 올리고 슬랙에 요약을 보낸다.
- 운영 화면 `/ops/` 데이터 탭이 제안마다 승인 또는 거부를 받고 `POST /ops/apply`로 보낸다.
- 서버의 별도 프로세스 적용 프로세스(정본은 비공개 beggars-ops 저장소)가 승인된 작업만 `banners.yml`에 적용하고 백업을 남긴 뒤 `POST /api/reload`를 부른다.

왜 전제를 지킨 셈인가.

- 운영 API(Spring)에는 여전히 쓰기 경로가 없다. 쓰는 것은 nginx Basic Auth 뒤의 별도 프로세스이고 파일 하나(`banners.yml`)만 만진다.
- 인증은 `/ops/`와 같은 Basic Auth 한 겹이다. 30이 말한 인증 3층 중 사람별 계정과 이력은 2026-09-18 콘솔에 들어갔다. 배너 밖의 데이터(오퍼)를 이 길로 고치고 싶어지면 그때 보관한 30을 다시 꺼낸다.

28(검수 화면)과 31(배너 문구 구조화)은 이 경로 위에 얹을 수 있다. 검수 화면의 첫 형태가 곧 이 승인 화면이다.

같은 날 오후에 이 경로 위에 배너 편집기를 얹었다(콘솔 `/ops/#banner`). 사람이 목록에서 고르고 필드를 고쳐 저장하면 `POST /ops/edit`가 같은 프로세스로 적용한다. 검수 화면(28)의 첫 형태가 이것이다. 편집 이력은 `<서버>/ops/edits/<날짜>.jsonl`, 편집한 필드는 스냅샷에 사람 것으로 남아 루틴이 덮지 않는다.

## 8. 나중에: 서버와 클라이언트를 두 트랙으로 가르기 (2026-09-29)

사용자 결정: 분리는 나중에 하고, 그때는 서버(API)와 클라이언트(웹)를 완전히 갈라 두 트랙으로 운영한다. 여기에는 지금 코드가 보여 주는, 가를 때 옮기거나 바꿔야 하는 것만 적는다. 방식(저장소를 나눌지, mono 안에서 트랙만 가를지)은 정하지 않았다.

| 무엇 | 지금 | 두 트랙이 되면 손댈 곳 |
|---|---|---|
| 정본 | mono 하나가 `api/`와 `web/`을 함께 담는다 | 트랙마다 정본 자리. 미러가 이미 둘로 나뉘어 있어(`nn98/delivery-discount-api`, `nn98/delivery-discount-web`) 배포 쪽은 이미 두 줄이다 |
| 미러 | `mirror-deploy-repos.yml` 한 워크플로가 matrix로 둘을 민다 | 트랙별 워크플로 또는 트랙별 트리거(경로 필터) |
| 검사 | `check-api.yml`, `check-web.yml`이 이미 따로 돈다 | 그대로 옮길 수 있다 |
| 계약 | 웹과 API의 계약 정본을 API로 옮겼다(`f9b49f7`, 2026-09-29). 배너·오퍼·플랫폼 계약 파일과 계약 테스트가 양쪽에서 같은 파일을 읽는다 | 저장소가 갈리면 계약 파일을 한쪽이 발행하고 다른 쪽이 가져가는 길이 필요하다. 지금은 같은 저장소라 파일 공유로 끝난다 |
| API 주소 | `web/src/api.js`에 운영 주소 상수 | `VITE_API_BASE` 빌드 변수(B안과 같은 일) |
| CORS | `WebConfig.java`에 Vercel 운영·프리뷰 주소 패턴 | 클라이언트 트랙의 주소가 바뀌면 여기를 같이 고친다 |
| 이벤트 허용 목록 | API가 받는 이벤트 이름과 속성 허용 목록이 API 코드에 있고, 웹이 보내는 이벤트와 맞아야 한다(`43c16a1`) | 계약과 같은 방식으로 한쪽 정본이 필요하다 |
| 문서 | mono `docs/`가 둘 다 설명한다. 전파본은 tracker `docs/public/`에서 온다 | 트랙별 문서 자리와 전파 대상 |

운영 콘솔(beggars-ops)과 데이터 경로(수집 PC → 서버)는 이미 mono 밖에 있어 이 분리와 무관하다.
