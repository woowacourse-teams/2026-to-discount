# 21. 개발/운영 환경 분리 — 브레인스토밍 (2026-09-15)

결정 문서가 아니다. 지금 환경과 규모에서 "분리"가 무엇을 뜻하고, 어디까지가
값어치가 있는지 갈래를 늘어놓는다. 결정은 사용자가 한다.

## 0. 지금 상태 (실측)

| 층 | 운영 | 개발 | 갈리는 정도 |
|---|---|---|---|
| 웹 | Vercel, `nn98/delivery-discount-web` main → `beggars-five.vercel.app` | `vite dev` 로컬 | **API 주소가 운영으로 고정**(`api.js API_BASE = https://bebeggars.duckdns.org`). 로컬 프론트도 운영 API를 친다 |
| API | OCI 1대(2 vCPU/12GB, 디스크 171GB 여유), nginx → systemd `delivery-discount-api` :8088 | `./gradlew bootRun` 로컬 — 데이터는 classpath 샘플 픽스처 | 데이터 경로만 환경변수(`DISCOUNT_EXPORT_PATH` 등). 프로필 없음 |
| 데이터 | 서버 `data/export.json`·`banners.yml`·`gifticons.yml`·`events.jsonl` | 없음 | 미니PC `reflect_daily`/`deploy_export`가 **운영에 직접** 올림 |
| 계측 | PostHog 프로젝트 548055 하나, 원장 `events.jsonl` 하나 | 같은 곳 | `?dev=1`·세션 모양으로 **사후 판정**해 걸러냄 |
| 배포 | mono push → mirror → nn98 두 저장소 → Vercel / self-hosted runner(같은 서버) | — | 프리뷰 없음. main = 운영 |
| 규모 | 하루 실사용 수백 명, 스파이크 1,000명, API 요청 수천/일 | 개발자 1~2명 | |

**사고 기록에서 오는 필요.** 09-02 개발 트래픽을 실사용으로 착각(`?dev=1` 표시
추가로 대응), 09-15 오늘 "배포됐는데 안 보인다"(운영에서 눈으로 확인하는 것 말고
검증 수단이 없음), 미니PC 자동 반영이 운영 원장에 바로 쓰는 구조(잘못 넣으면
사용자가 본다 — 09-15 190→164건 사고), 배너 자동 반영이 사람 수정을 되살림.

## 1. "분리"가 뜻할 수 있는 것 — 다섯 층

1. **코드 경로 분리** — 브랜치/프리뷰 배포. "배포 전에 본다".
2. **데이터 분리** — 개발이 운영 원장·배너·기프티콘을 못 건드린다.
3. **계측 분리** — 개발 이벤트가 운영 지표에 안 섞인다.
4. **런타임 분리** — 별도 API 프로세스/서버/도메인.
5. **비밀·설정 분리** — 토큰·경로가 환경별로 갈린다.

지금 규모에서 전부 할 이유는 없다. 아픈 순서는 **3 > 2 > 1 > 5 > 4**다.

## 2. 갈래

### A. 최소 — "계측만 가른다" (반나절)

- PostHog **두 번째 프로젝트**(dev) 만들고 `VITE_POSTHOG_KEY`를 Vercel 환경별로
  갈라둔다(Production / Preview+Development). API 쪽 `POSTHOG_PROJECT_TOKEN`도
  로컬은 dev 프로젝트.
- 자체 원장은 `dev: true` 표시가 이미 있으니 그대로. 대신 서버 API가 `dev`
  이벤트를 **별도 파일**(`events-dev.jsonl`)로 쓰게 하면 원장 분석에서 걸러낼
  일이 없어진다.
- 얻는 것: 09-02류 사고 재발 차단, `experiments.py`의 개발 판정 로직 부담 감소.
- 잃는 것: 거의 없음. 대시보드는 운영 프로젝트만 본다.

### B. 프리뷰 — "배포 전에 눈으로 본다" (하루)

- **Vercel Preview**는 이미 공짜로 있다 — mirror가 main만 밀어서 안 쓰일 뿐.
  mirror 워크플로가 `preview/*` 브랜치도 밀거나, mono PR을 그대로 nn98 브랜치로
  미러하면 PR마다 프리뷰 URL이 뜬다.
- 프리뷰가 운영 API(`bebeggars.duckdns.org`)를 읽는 건 **괜찮다** — 읽기뿐이다.
  문제는 프리뷰가 쏘는 `POST /api/events`가 운영 원장에 섞이는 것 →
  `VITE_API_BASE`를 빌드 변수로 빼고, 프리뷰는 dev API를 보거나(갈래 C), A안대로
  `dev` 표시를 강제한다(`import.meta.env.MODE !== 'production'`이면 dev=true).
- 오늘 같은 "고쳤는데 안 보인다"는 프리뷰 URL에서 먼저 봤으면 끝났다.
- 잃는 것: mirror 워크플로 복잡도, Vercel 빌드 분 소모(무료 한도 안).

### C. 같은 서버에 dev API 하나 더 (하루)

- systemd 유닛 복사 `delivery-discount-api-dev` :8089, nginx `dev.bebeggars.duckdns.org`
  (또는 `/dev-api/` 경로). 데이터 디렉터리 `data-dev/` — export.json은 운영 것을
  **복사**해 시작, banners·gifticons는 샘플. 원장은 `events-dev.jsonl`.
- 서버 여유(2 vCPU, 메모리 9GB 가용)로 Spring 하나 더는 문제없다. 도메인은
  duckdns 서브도메인이 안 되면 경로 기반.
- 미니PC `reflect_daily`가 **먼저 dev에 올리고 검증(`check_deploy`) → 운영**으로
  가면 09-15 190→164 사고가 운영에 닿기 전에 잡힌다. 단 자동 반영 정책
  (ROUTINE-SPEC §3)이 "검증 통과 후 즉시 운영"이라 dev 단계는 **추가 검증 관문**이지
  사람 승인 관문이 아니다 — 그 선은 지킨다.
- 잃는 것: 서버 설정 둘 관리, 배포 워크플로 둘(dev는 push, prod는 태그/수동?).

### D. 완전 분리 — 서버 둘·도메인 둘·저장소 브랜치 전략 (며칠 + 운영 비용)

- OCI 무료 티어 인스턴스 하나 더, `develop`→dev, `main`→prod, 프로필
  `application-dev.yml`/`prod.yml`.
- 이 규모(1~2명, 하루 수백 명)에서는 **과하다**. 서버 둘을 같은 상태로 유지하는
  일 자체가 새 일이 되고, 지금도 미러 저장소 둘이 "뒤처진 사본"을 만든 전력이
  있다(deploy-api.yml 주석). 갈래를 늘릴수록 그 사고가 는다.

### E. 분리 대신 "운영 안에서 안전하게" (대안)

- **기능 플래그 + 카나리 visitorId**: `DISCOUNT_SURVEY_TEST_VISITORS`처럼 이미
  있는 패턴. 새 기능을 특정 visitorId에게만 켠다. 화면 확인이 목적이면 이게 가장
  싸다.
- **원장 되돌리기**: `deploy_export.py`가 백업을 만들듯, `reflect_daily`도 반영
  전 스냅샷 + `--rollback`을 갖추면 dev 환경 없이도 사고 복구 시간이 준다.
- 한계: "배포 전에 본다"는 못 한다.

## 3. 규모 대비 판단 (초안)

| | 비용 | 막는 사고 | 지금 규모 값어치 |
|---|---|---|---|
| A 계측 분리 | 반나절 | 개발 트래픽 오염 | **높음** — 이미 한 번 당했고 분석 코드가 그 부담을 지고 있다 |
| B 프리뷰 | 하루 | "배포됐는데 안 보임", UI 회귀 | **높음** — 오늘 사고. Vercel이 공짜로 준다 |
| C dev API | 하루 | 자동 반영 데이터 사고 | **중간** — 사고는 있었지만 `check_deploy`·매니페스트 검증으로 이미 절반은 막는다 |
| D 완전 분리 | 며칠+ | 위 전부 | **낮음** — 유지비가 이득을 넘는다 |
| E 플래그·롤백 | 반나절 | 복구 시간 | 중간 — A·B와 겹치지 않아 같이 가도 된다 |

**추천: A + B를 먼저, C는 자동 반영 사고가 한 번 더 나면.** D는 안 한다.

## 4. 열린 질문 (사용자 결정 필요)

1. 프리뷰가 운영 API를 **읽는** 건 허용하나? (허용하면 B가 반나절로 준다)
2. dev PostHog 프로젝트를 새로 파나, 운영 프로젝트 안에서 `dev` 속성 필터로
   끝내나? (후자는 지금 상태 — 대시보드마다 필터를 잊으면 오염)
3. `reflect_daily`가 dev를 거치게 할 때 **자동으로 운영까지** 가는가(정책 유지),
   아니면 dev까지만 자동이고 운영은 사람이 미나? — 이건 ROUTINE-SPEC §3 정책
   자체를 바꾸는 일이라 여기서 정하지 않는다.
4. 도메인: duckdns 서브도메인 추가가 되는지(안 되면 nginx 경로 분기).

## 5. 하지 말 것

- 브랜치 전략(`develop`/`release`)부터 세우기 — 1~2명에 main 하나가 맞다.
- Spring 프로필 파일 분리 — 환경변수로 이미 갈린다(DEV-ENVIRONMENT.md).
  프로필은 "설정이 3개 넘게 갈릴 때" 꺼낸다.
- 서버 둘 — 위 D.
