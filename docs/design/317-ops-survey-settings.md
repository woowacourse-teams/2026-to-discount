# 317. 운영 콘솔에서 설문 켜기·끄기와 대상 문턱 바꾸기 (2026-11-04 작성)

추적 이슈: [#317](https://github.com/woowacourse-teams/2026-to-discount/issues/317)

## 결론

- **정본은 서버 데이터 파일 `survey-settings.json` 하나다.** 이벤트 원장(`events.jsonl`) 옆에 둔다. API는 요청마다 파일 수정 시각만 보고, 바뀌었으면 다시 읽는다. 재시작이 필요 없다. 파일이 없으면 지금 환경변수(`DISCOUNT_SURVEY_*`)가 기본값이다.
- **쓰기는 API 관리자 엔드포인트로만 한다.** `GET`/`PUT /api/admin/survey-settings`, `GET /api/admin/survey-settings/preview`. 인증은 새로 만들지 않고 새 오퍼 알림 관리(설계 46)와 같은 방식을 쓴다. Nginx가 `/ops` Basic Auth를 통과시킨 요청에만 `X-Ops-Authenticated`를 붙이고, API는 루프백에서 온 그 표시만 믿는다. `ops_apply`(콘솔이 파일을 써서 승인 반영하는 길)는 쓰지 않는다. 대상 수 미리보기에 필요한 방문자 집계가 API 메모리에만 있기 때문이다.
- **바꿀 때마다 별도 기록 파일 `survey-settings.log.jsonl`에 한 줄을 남긴다.** 누가(Basic Auth 사용자), 언제, 이전 값, 이후 값이다. 이벤트 원장에는 쓰지 않는다.
- **웹은 바꾸지 않는다.** `GET /api/survey`는 캐시 대상 경로가 아니고 서비스 워커는 fetch를 가로채지 않는다. 바뀐 값은 사용자가 다음에 페이지를 열 때 반영된다. 이미 열린 화면에서 끈 뒤 제출하면 서버가 `not_eligible`로 막는다.
- **선행: #316.** 문턱 다섯 칸 중 `recentDays`, `minSpanDays`는 #316이 만드는 판정이다. 이 문서를 쓴 시점의 main(`0cf75fb2`)에는 `open`, `minDays`, `minConversions` 셋만 있다.
- **콘솔(beggars-ops)은 이 저장소 밖이다.** 화면은 이 문서가 정하고, 구현은 beggars-ops 저장소의 별도 PR로 한다. API가 먼저 배포되고 콘솔이 뒤다.

## 먼저 풀어 둔 말

- 콘솔: 운영 콘솔 beggars-ops. 서버의 `/ops/` 아래에서 Basic Auth(사람별 계정, 설계 33)로 열린다.
- 문턱: 설문 대상이 되는 조건 숫자. 지금은 접속일 수(`minDays`)와 전환 수(`minConversions`) 둘이다.
- 전환: `offer_link_click`, `banner_click` 이벤트(`SurveyEligibility.CONVERSIONS`).
- 방문자 집계: `SurveyEligibility`가 원장을 이어 읽으며 메모리에 든 방문자별 접속 날짜 집합, 전환 수, 응답 여부, 개발 기기 여부(`Tally`).

## 배경

#308로 설문 열기와 문턱을 서버 설정으로 옮겼다(`SurveyService` 생성자의 `@Value("${discount.survey.open:false}")` 등). 값을 바꾸려면 서버의 systemd 설정 조각을 고치고 API를 재시작해야 한다(`docs/survey-questions.md` 2단계). 사용자 요청(2026-11-04)은 콘솔에서 켜고 끄고 문턱을 바꾸면 바로 반영되는 것이다.

코드로 확인한 사실:

- `SurveyService`는 `open`, `minDays`, `minConversions`를 생성자에서 한 번 받아 `final` 필드에 둔다(`SurveyService.java:75-97`). 지금은 재시작 없이 바꿀 길이 없다.
- `GET /api/survey`는 `{"eligible", "open"}`을 돌려준다(`SurveyController.java:35-37`). 웹 `useSurvey.js:33-41`은 `open`이 거짓이면 아무것도 안 띄운다. 저장된 코드가 있어도 안 띄운다.
- 대상 판정은 제출 때 다시 한다(`SurveyService.answer` 첫 줄 `qualifies`). 화면이 늦게 꺼져도 코드는 판정을 통과한 사람에게만 나간다.
- `WebConfig.CACHEABLE`은 `/api/brands`, `/api/brands/*/history`, `/api/banners` 셋이다. `/api/survey`에는 `Cache-Control`도 ETag도 안 붙는다.
- `web/public/sw.js`는 `push`, `notificationclick` 처리기만 있다. fetch 처리기가 없어 API 응답을 캐시하지 않는다.
- 관리자 인증 선례는 `PushAdminController.authorize` 하나다. 루프백 주소이고 `X-Ops-Authenticated: 1`일 때만 통과한다. CORS는 `WebConfig.addCorsMappings`에서 `/api/push/admin/**`에만 운영 출처의 `GET`, `PUT`을 연다(설계 46, 2026-10-12 운영 PUT 403 사고 뒤).
- `GifticonStore.remaining()`은 파일이 없을 때, 깨졌을 때, 다 나갔을 때를 모두 `0`으로 돌려준다(`GifticonStore.java:162-178`). 콘솔 경고에 그대로 쓰면 "파일을 못 읽음"이 "재고 0"으로 보인다.
- 배포 중에는 임시 인스턴스가 10~20초 같이 뜬다(설계 188). 프로세스 사이 파일 쓰기는 `InterProcessFileLock`으로 묶는다(설계 192).

## 변경 전파

`docs/CHANGE-PROPAGATION.md`에 설문 묶음은 아직 없다. 이 변경으로 생기는 묶음과 이미 있는 묶음:

| 묶음 | 이번에 넣나 | 이유 |
| --- | --- | --- |
| 새 묶음 "설문 설정": 칸 이름 다섯(`open`, `minDays`, `minConversions`, `recentDays`, `minSpanDays`)이 설정 파일, API 응답, 콘솔 화면 셋에 적힌다 | 넣는다 | 이름의 커네선스다. API PR이 `CHANGE-PROPAGATION.md`에 줄을 더하고, 콘솔 PR이 같은 이름을 쓴다. 맞대는 검사는 시험 계획 4번(응답 모양 고정 테스트)이 한쪽을 막는다. 콘솔 쪽은 콘솔 저장소 테스트가 같은 예시 응답을 읽는다 |
| 8번 배포 순서 | 넣는다 | API가 먼저다. 콘솔이 먼저 나가면 카드가 404를 받는다. 콘솔은 404를 "API가 아직 이 기능을 모름"으로 보여 준다 |
| 9번 새 파일(beggars-ops `web/` 배포 목록 두 곳, nginx `types`) | 콘솔 PR에서 넣는다 | 카드를 새 파일로 만들면 `deploy.yml`, `deploy/push.sh` 둘 다에 넣는다. 확장자가 `.js`면 이미 `types`에 있다(2026-09-24) |
| 7번 행동 이벤트 | 안 넣는다 | 새 이벤트를 쏘지 않는다. 기록은 원장 밖 파일이다 |
| 웹(`useSurvey.js`) | 안 넣는다 | 응답 모양 `{eligible, open}`을 바꾸지 않는다 |

## 결정

### 1. 정본: `survey-settings.json`

자리: `discount.survey.settings-path`. 비우면 이벤트 원장 옆(`Path.of(eventLogPath).toAbsolutePath().resolveSibling("survey-settings.json")`). `ReportController`가 `reports.jsonl`을 두는 방식과 같다. 상대 경로 기본값은 운영 작업 폴더에서 못 써 500이 난 적이 있다(2026-10-19).

모양:

```json
{
  "open": true,
  "minDays": 12,
  "minConversions": 5,
  "recentDays": 14,
  "minSpanDays": 30,
  "updatedAt": "2026-11-04T15:20:00+09:00",
  "updatedBy": "<Basic Auth 사용자 이름>"
}
```

- 다섯 칸은 전부 필수다. 빠진 칸을 환경변수로 메우지 않는다. 섞이면 콘솔에 보이는 값과 실제 판정이 어긋난다.
- 범위: `minDays` 1~365, `minConversions` 0~1000, `recentDays` 1~365, `minSpanDays` 0~365. 정수만 받는다. 범위 밖은 쓰기에서 400, 읽기에서는 "깨진 파일"로 본다.
- `recentDays`, `minSpanDays`의 뜻은 #316이 정한 판정을 그대로 따른다. **이 문서는 #316 본문을 읽지 못했다.** 이슈 #317 본문의 "최근 14일, 사용 30일"로 미루어 "마지막 접속이 최근 N일 안", "첫 접속과 마지막 접속 사이가 N일 이상"으로 추정한다. #316이 다르게 정했으면 #316을 따른다.

읽기 규칙:

| 파일 상태 | 쓰는 값 | `source` |
| --- | --- | --- |
| 없음 | 환경변수(지금 동작 그대로, 기본 닫힘) | `env` |
| 읽힘, 모양 맞음 | 파일 값 | `file` |
| 못 읽음, JSON 깨짐, 칸 빠짐, 범위 밖 | **닫힘**(`open=false`), 문턱은 환경변수 | `broken` |

- 깨진 파일을 닫힘으로 보는 이유: 기프티콘이 걸린 판정이다. 잘못 열리는 것은 되돌릴 수 없고(코드가 나간다), 잘못 닫히는 것은 콘솔에서 다시 저장하면 끝난다.
- 깨진 것을 "파일 없음"과 같게 다루지 않는다. 콘솔 `GET`이 `source: "broken"`과 사유를 돌려줘 화면에 빨갛게 보인다(AGENTS.md 첫 규칙: 미관측을 기본값으로 감추지 않는다). 처음 깨진 것을 본 때 `log.error` 한 번.
- Jackson 3 파싱 오류는 `IOException`이 아니다. `JacksonException`을 따로 잡는다(ADR-012).

반영 시점:

- 새 클래스 `SurveySettings`(`@Component`)가 마지막으로 읽은 값과 파일 수정 시각을 든다. `current()`는 부를 때마다 `Files.getLastModifiedTime`을 보고 바뀌었으면 다시 읽는다. 파일 하나의 시각 조회라 요청마다 해도 된다.
- 쓰기는 같은 프로세스에서 끝나면 그 자리에서 메모리 값도 바꾼다. 다른 인스턴스(배포 중 임시 인스턴스)는 수정 시각으로 따라온다.
- 수정 시각 해상도가 낮은 파일 시스템에서 같은 초에 두 번 쓰면 두 번째를 놓칠 수 있다. 시각과 함께 파일 크기도 견준다. 그래도 같으면 놓친다. 쓰기는 사람이 콘솔에서 하는 일이라 허용한다.
- `SurveyService`의 `open`, `minDays`, `minConversions` 필드를 없애고 `qualifies`와 `isOpen`이 `settings.current()`를 읽는다. `testVisitors`, `blockedVisitors`는 이번 범위가 아니다. 환경변수 그대로 둔다(뒷문이라 콘솔에서 쉽게 열리지 않는 편이 낫다).

### 2. API

모두 `SurveyAdminController`(새 파일, `com.discounttracker.analytics`)에 둔다. 인증 검사는 `PushAdminController.authorize`와 같은 내용이다. 두 곳에 복사하지 말고 `web` 패키지에 `OpsAuth.require(HttpServletRequest)` 같은 정적 메서드로 뽑아 둘이 같이 부른다.

**`GET /api/admin/survey-settings`**

```json
{
  "settings": { "open": false, "minDays": 7, "minConversions": 5, "recentDays": 14, "minSpanDays": 30,
                "updatedAt": null, "updatedBy": null },
  "source": "env",
  "problem": null,
  "version": "<수정 시각+크기에서 만든 문자열, 파일이 없으면 \"env\">",
  "stock": { "state": "ok", "remaining": 12, "total": 40 },
  "audience": { "eligible": 97, "visitors": 5210, "ledger": "ok" }
}
```

- `problem`: `source`가 `broken`일 때 사유 한 줄(예: `minDays 범위 밖: 0`). 그 밖에는 `null`.
- `stock.state`: `ok`, `missing`(파일 없음), `broken`(못 읽음). `GifticonStore`에 상태를 가르는 메서드(`stock()`)를 더한다. 지금 `remaining()`은 셋을 0으로 섞으므로 콘솔이 그 값을 쓰지 않는다. `remaining()` 자체의 동작은 바꾸지 않는다.
- `audience`: 지금 저장된 문턱으로 센 대상 수. 아래 미리보기와 같은 계산이다.

**`GET /api/admin/survey-settings/preview?minDays=&minConversions=&recentDays=&minSpanDays=`**

```json
{ "eligible": 103, "visitors": 5210, "excluded": { "answered": 41, "dev": 6 }, "ledger": "ok", "asOf": "2026-11-04T15:21:03+09:00" }
```

- 저장하지 않고 센다. 칸이 비거나 범위 밖이면 400.
- `open`은 받지 않는다. "열면 몇 명이 대상인가"를 센다.
- `SurveyEligibility`에 `audience(Thresholds)`를 더한다. `catchUp()` 뒤 메모리 집계(`tallies`)를 한 번 훑어 `qualifies(counts, thresholds)`를 센다. 같은 `synchronized` 안이라 판정과 집계가 같은 시점을 본다. 방문자 수천~수만 명이라 훑는 비용은 판정 한 번 수준이다. **방문자 수는 원장 34만 줄(2026-10-14)에서 추정했고 세지 않았다.**
- 원장을 못 읽으면 `count()`처럼 0을 돌려주지 않는다. `ledger: "unreadable"`, `eligible: null`로 돌려준다. 콘솔은 "대상 0명"이 아니라 "셀 수 없음"으로 보여 준다.
- `testVisitors`는 세지 않는다. 사람이 아니다.
- 이슈 본문의 근거 숫자(11-04 PostHog 기준, 접속 12일·전환 5회·최근 14일·사용 30일 → 약 100명)는 PostHog 집계다. 미리보기는 원장 집계라 다를 수 있다. 다르면 원장 쪽이 실제 판정과 같은 값이다. 구현 PR에서 운영 원장으로 한 번 세어 PR 본문에 둘을 나란히 적는다.

**`PUT /api/admin/survey-settings`**

요청:

```json
{ "open": true, "minDays": 12, "minConversions": 5, "recentDays": 14, "minSpanDays": 30, "version": "<GET에서 받은 값>" }
```

- 다섯 칸 전부 필수. 빠지거나 범위 밖이면 400과 칸 이름.
- `version`이 지금 파일과 다르면 409. 두 사람이 같이 열어 둔 화면에서 나중 저장이 앞 저장을 모르고 덮는 것을 막는다. 콘솔은 409를 받으면 새로 읽으라고 띄운다.
- 수정자는 Nginx가 붙이는 `X-Ops-User`(Basic Auth 사용자, `$remote_user`)다. 없으면 `unknown`으로 쓰지 않고 400으로 거절한다. 누가 바꿨는지 모르는 기록은 남기지 않는다. 외부에서 보낸 `X-Ops-User`는 Nginx가 지운다(`X-Ops-Authenticated`와 같은 처리).
- 순서: `InterProcessFileLock`(`survey-settings.json.lock`)을 잡는다. `version`을 대조한다. 기록 파일에 한 줄을 쓴다. 설정 파일을 tmp에 쓰고 `ATOMIC_MOVE`한다. 메모리 값을 바꾼다. 락을 놓는다.
- 기록을 먼저 쓰는 이유: 설정은 바뀌었는데 기록이 없는 상태를 만들지 않는다. 기록만 쓰고 설정 쓰기가 실패하면 기록 줄에 `"applied": false`를 실은 줄을 하나 더 남기고 500을 돌려준다.
- 응답은 `GET`과 같은 모양(새 `version` 포함).
- `open: true`로 저장하는데 `stock.state`가 `ok`가 아니거나 `remaining`이 0이어도 저장은 한다. 응답 그대로 콘솔이 경고를 띄운다. 재고가 없어도 응답은 받는 것이 지금 동작이다(`SurveyService.answer` 주석).

CORS: `WebConfig.addCorsMappings`에 `/api/admin/**`를 운영 출처 `GET`, `PUT`으로 더한다. `/api/push/admin/**` 줄과 같은 모양이다. 공개 `/api/**`에는 `PUT`을 열지 않는다.

### 3. 쓰기 경로: `ops_apply`가 아니라 API 엔드포인트

| 기준 | API 관리자 엔드포인트 (채택) | `ops_apply` 승인 반영 |
| --- | --- | --- |
| 대상 수 미리보기 | API 메모리 집계로 바로 센다 | 콘솔이 원장을 따로 훑어야 한다. 판정 규칙이 두 곳(Java, Python)에 생겨 1번 묶음(확실성)과 같은 꼴이 된다 |
| 즉시 반영 | 쓰기와 메모리 갱신이 한 프로세스 | 파일을 쓴 뒤 `reload` 같은 신호가 또 필요하다 |
| 인증 | 설계 46의 Basic Auth + 내부 표시 재사용 | 콘솔 인증 그대로 |
| 검증 자리 | API 한 곳 | 콘솔 스키마와 API 읽기 두 곳(2번 묶음에서 콘솔이 API보다 느슨해 배너가 빠진 일, 2026-10-15) |

경로 접두를 `/api/admin/`으로 새로 연다. 앞으로 관리 기능을 더할 때 Nginx와 CORS 설정을 한 번만 하면 된다. `/api/push/admin/next`는 옮기지 않는다(이번 범위 밖).

Nginx(beggars-ops `deploy/nginx-delivery-discount-api.conf`):

- 콘솔 쪽 관리 경로에서 Basic Auth를 통과한 요청을 `/api/admin/`으로 넘기며 `X-Ops-Authenticated: 1`, `X-Ops-User: $remote_user`를 붙인다. 지금 `/api/push/admin/`을 넘기는 블록과 같은 자리다.
- 공개 경로는 두 헤더를 지운다. 더해서 공개 서버 블록에서 `/api/admin/`을 404로 막는다. API 검사가 한 겹 더 있지만 공개 경로에 관리 엔드포인트가 보이지 않게 하는 편이 낫다.
- **이 Nginx 파일은 이 저장소에 없어 열어 보지 않았다.** 위 내용은 설계 46의 설명에서 옮겼다.

### 4. 기록: `survey-settings.log.jsonl`

자리는 설정 파일 옆. 한 줄 모양:

```json
{"at":"2026-11-04T15:20:00+09:00","by":"<사용자>","before":{...다섯 칸...},"after":{...다섯 칸...},"beforeSource":"env","applied":true}
```

- 추가만 한다. API가 지우거나 고치지 않는다.
- 이벤트 원장(`events.jsonl`)에 쓰지 않는 이유: 원장은 방문자 행동을 담고 `SurveyEligibility`, 인기 집계, PostHog 전달이 모두 읽는다. 관리 기록이 섞이면 읽는 쪽 셋이 전부 거르는 규칙을 더해야 한다.
- 콘솔에 최근 기록 다섯 줄을 보여 줄지는 열린 질문으로 둔다. 이번에는 `GET` 응답에 넣지 않는다.
- `log.info`로 같은 내용을 한 줄 남긴다. Grafana 로그(설계 72)에서도 찾을 수 있다.

### 5. 콘솔 화면 (beggars-ops)

"설문" 카드 하나. 위에서 아래로:

1. **상태 줄:** 지금 열림/닫힘, 값의 출처(`파일`, `환경변수 기본값`, `파일 깨짐: <사유>`), 마지막 수정자와 시각.
2. **켜기/끄기 스위치.**
3. **문턱 다섯 칸:** 접속일, 전환, 최근 접속, 사용 기간, (각 칸 옆 단위). 숫자만 받는다.
4. **미리보기 줄:** "이 조건이면 지금 대상 N명". 칸을 바꾸면 0.5초 쉬었다가 `preview`를 부른다. 원장을 못 읽으면 "셀 수 없음". 응답자와 개발 기기 제외 수를 작게 같이 적는다.
5. **기프티콘 줄:** "남은 코드 N / 전체 M". `state`가 `missing`이면 "기프티콘 파일 없음", `broken`이면 "기프티콘 파일을 못 읽음".
6. **경고:** 스위치가 켜짐이고 남은 코드가 0이거나 파일이 `ok`가 아니면 "켜도 코드가 나가지 않습니다. 응답만 받습니다."
7. **저장 버튼:** 바뀐 것이 있을 때만 누를 수 있다. 저장하면 응답으로 화면 전체를 다시 그린다. 409면 "다른 사람이 먼저 바꿨습니다. 새로 불러오세요"와 다시 읽기 버튼.

- 화면 문구는 콘솔 안 운영자용이라 `docs/COPY-STYLE.md`(사용자 화면 문구 규칙) 대상이 아니다. 그래도 수집기 말("판독" 등)은 쓰지 않는다.
- 콘솔 구현자 역할이 이 워크플로에 없다. 콘솔 PR은 beggars-ops 저장소에서 사람이 시키는 세션이 한다. beggars-ops는 개발 배포 경로가 없어 `작업 브랜치 → main`으로 반영한다(AGENTS.md).

### 6. 웹

바꾸지 않는다. 확인한 것:

- 응답 모양 `{eligible, open}` 그대로.
- API 쪽 캐시 없음(`CACHEABLE`에 없음, `Cache-Control` 없음). 서비스 워커 캐시 없음(fetch 처리기 없음). Vercel CDN은 API 서버 앞에 있지 않다(`API_BASE`로 직접 부른다).
- `useSurvey`는 페이지를 열 때 한 번 묻는다. 끈 순간 이미 열려 있던 화면에는 도크가 남는다. 그 화면에서 제출하면 `answer()`의 재판정이 `not_eligible`로 막는다. 켠 순간에는 다음 페이지 열기부터 뜬다.
- **Nginx가 `/api/survey`에 캐시 헤더를 붙이는지는 Nginx 파일을 못 봐 확인하지 못했다.** 구현 PR에서 운영 응답 헤더를 한 번 본다(시험 계획 9번).
- `useSurvey.js:14` 주석이 "서버 환경변수 DISCOUNT_SURVEY_OPEN"을 정본으로 적고 있다. 웹 변경은 프리뷰 절차가 필요해 이번에 고치지 않고 후속으로 둔다.

## 시험 계획

API(`api/src/test/java/com/discounttracker/analytics/`):

1. `SurveySettingsTest`: 파일 없음 → 환경변수 값, `source=env`. 맞는 파일 → 파일 값, `source=file`. 깨진 JSON, 칸 빠짐, 범위 밖, 문자열 숫자 → `open=false`, `source=broken`, `problem`에 칸 이름.
2. `SurveySettingsTest`: 파일을 다른 내용으로 바꾸고 수정 시각을 옮기면 다음 `current()`가 새 값. 재시작 없음.
3. `SurveyServiceTest`(또는 기존 `SurveyControllerTest` 확장): 설정 파일로 `open=false`를 쓰면 `GET /api/survey`가 `open:false`, 대상 문턱을 넘은 방문자도 `eligible:false`, 제출은 `not_eligible`. 다시 `true`로 쓰면 재시작 없이 `eligible:true`. 테스트 visitorId는 닫혀도 통과(지금 동작 유지).
4. `SurveyAdminControllerTest`: `GET` 응답의 키 집합을 고정한다(`settings`, `source`, `problem`, `version`, `stock`, `audience`와 그 안의 키). 콘솔과 맞대는 자리다. 같은 예시 응답을 `api/src/test/resources/contracts/survey-settings-response.json`에 두고 콘솔 테스트가 같은 모양을 쓴다.
5. `SurveyAdminControllerTest`: 인증. 루프백 아님 → 403. 표시 헤더 없음 → 403. `X-Ops-User` 없음 → `PUT` 400. 공개 출처에서 `PUT` preflight → 거부. 운영 출처 `PUT` preflight → 허용(`PushAdminCorsTest`와 같은 방식).
6. `SurveyAdminControllerTest`: `PUT` 검증. 칸 빠짐 400, 범위 밖 400, 옛 `version` 409, 맞는 요청 → 파일과 기록 한 줄, 응답의 새 `version`.
7. `SurveyAdminControllerTest`: 기록 줄의 `before`, `after`, `by`, `beforeSource`. 처음 저장(파일 없음)은 `beforeSource=env`.
8. `SurveyEligibilityTest`: `audience`가 응답자, 개발 기기, 문턱 미달을 빼고 센다. 원장을 못 읽으면 `ledger=unreadable`, `eligible=null`(0이 아님).
9. `GifticonStoreTest`: `stock()`이 없음, 깨짐, 정상을 가른다. `remaining()`은 지금과 같은 값.

운영 확인(구현 PR, 배포 뒤):

10. 콘솔 경로로 `GET` → `source=env`, 지금 값과 같음. 공개 경로로 `/api/admin/survey-settings` → 404 또는 403.
11. 미리보기로 접속 12일·전환 5회·최근 14일·사용 30일을 세어 PostHog 기준 약 100명과 나란히 적는다.
12. 켜기 저장 뒤 재시작 없이 `GET /api/survey`가 `open:true`. 끄기 저장 뒤 `open:false`. `GET /api/survey` 응답 헤더에 캐시 헤더가 없는지 본다.
13. 기록 파일에 두 줄이 남았는지 본다.

## 배포 순서

1. #316 병합.
2. API PR 병합과 배포. 설정 파일이 없으니 동작은 지금과 같다(`source=env`).
3. beggars-ops PR: Nginx 경로와 헤더, 콘솔 카드. 병합하면 서버에 바로 반영된다.
4. 콘솔에서 지금 값 그대로 한 번 저장해 파일을 만든다. 그 뒤로는 파일이 정본이다.
5. `docs/survey-questions.md`의 열고 닫기 절차를 "콘솔 설문 카드"로 바꾼다(API PR에 같이 넣는다). 환경변수 `DISCOUNT_SURVEY_OPEN`, `MIN_DAYS`, `MIN_CONVERSIONS`는 파일이 없을 때의 기본값으로만 남는다고 적는다.

## 대안과 버린 이유

- **환경변수 + 재시작을 콘솔이 대신 누르기:** 재시작마다 원장 이어 읽기와 무중단 배포 절차가 돈다. 콘솔에 systemd 권한을 줘야 한다. 버린다.
- **`POST /api/reload`에 설정 다시 읽기를 붙이기:** `reload`는 오퍼, 배너, 알림까지 같이 돈다. 설문 저장이 배너 알림을 깨울 이유가 없다. 쓰기 경로는 어차피 따로 필요하다. 버린다.
- **설정을 원장에 이벤트로 쓰고 마지막 줄을 정본으로:** 원장을 읽는 셋이 거르는 규칙을 더해야 하고, 정본을 찾으려면 원장을 끝까지 읽어야 한다. 버린다.

## 열린 질문

- 콘솔 카드에 최근 변경 기록 몇 줄을 같이 보여 줄까. 이번 범위에서는 뺐다.
- 켜기와 끄기를 슬랙으로도 알릴까. 기프티콘이 나가기 시작하는 시점이라 알리는 편이 낫다고 보지만 사용자 결정이 필요하다.
- `testVisitors`, `blockedVisitors`도 콘솔로 옮길까. 이번에는 뒷문이 쉽게 열리지 않도록 환경변수에 둔다.
