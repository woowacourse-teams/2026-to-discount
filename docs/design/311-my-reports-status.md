# 311. 제보 시트의 내 제보 목록과 처리 상태

추적 이슈: [#311](https://github.com/woowacourse-teams/2026-to-discount/issues/311)

## 결론

제보 시트 안, 보내기 버튼 아래에 "내 제보" 목록을 더한다. 새 화면, 이메일, 세션 기록, 동의 절차는 넣지 않는다. 영역은 API가 먼저, 웹이 나중이다.

1. **상태 저장:** `reports.jsonl`은 고치지 않는다. 옆에 추가만 하는 파일 `report-status.jsonl`을 새로 두고, 제보 하나에 상태 행을 덧붙인다. 같은 제보의 마지막 행이 이긴다. 상태 행이 없으면 "접수"(`received`)다.
2. **제보 번호:** 저장된 줄 그대로의 SHA-256 앞 16자로 `r_<16진수>`를 만든다. 새 칸을 더하지 않아 옛 행과 새 행이 같은 규칙으로 번호를 얻는다. 새 제보는 슬랙 메시지에 이 번호를 같이 띄운다.
3. **목록 읽기:** `GET /api/reports/mine`. `visitorId`는 주소가 아니라 헤더 `X-Visitor-Id`로 받는다. 응답에는 번호, 보낸 시각, 종류, 브랜드, 상태만 싣는다. 제보 본문은 싣지 않는다.
4. **상태 바꾸기:** `PUT /api/reports/admin/{id}`. 푸시 관리 경로(`PushAdminController`)와 같은 운영 인증(루프백 연결 + `X-Ops-Authenticated`)을 쓴다. 콘솔 화면은 beggars-ops 후속 이슈다. 그 전까지는 서버에서 루프백으로 부른다.
5. **상태 값:** `received`, `reviewing`, `applied`, `declined` 넷. 화면 문구는 개발자가 정한다(아래 "개발자에게 묻는 것"). 이슈의 "확인 중"은 `docs/COPY-STYLE.md` 1-4의 금지어 "확인"이 들어 있어 그대로 쓰지 않는다.

## 배경: 코드에서 확인한 것

- `web/src/analytics-context.js` 19~26행: `visitorId`는 `crypto.getRandomValues`로 만든 8바이트(64비트) 난수의 16진수에 `v_`를 붙인 값이다. 형식은 `^v_[0-9a-f]{16}$`.
  - `localStorage`가 막힌 환경(사파리 프라이빗)에서는 `safeStore`가 `null`을 돌려 `visitorId`가 `null`이다.
- `web/src/ReportButton.jsx` 86행: 제보 요청 본문에 `visitorId`를 싣는다.
- `api/.../analytics/ReportController.java` 99행: `row.put("visitorId", orDash(body.visitorId()))`. 값이 없으면 `"-"`로 적는다. **그래서 `"-"`는 "식별값 없음"을 뜻하고, 이 값으로 목록을 읽게 두면 `localStorage`가 막힌 모든 사람의 제보가 한 묶음으로 보인다.** 목록 읽기는 형식에 맞는 값만 받아야 한다.
- `git log -S visitorId`: 첫 커밋 `2e1a1c96`(2026-10-19)부터 `visitorId`를 저장했다. 같은 날 `bfc358f1`이 `type`, `platform` 칸을 더했다. 그래서 운영 파일에는 행 모양이 둘 있을 수 있다.
  - 첫 모양: `at, text, brand, url, filters, visitorId, client` (종류 칸 없음)
  - 지금 모양: `at, type, platform, text, brand, url, filters, visitorId, client`
- `ReportController.append` 113~118행: `StandardOpenOption.APPEND`로만 쓴다. ADR-013 "남은 것"에 이 파일이 추가 전용이라 락 범위 밖이라고 적혀 있다.
- `PER_MINUTE = 3`, `PER_DAY = 20`(47~48행)은 `submit`의 `allow`에서만 쓴다. 읽기 경로는 없다.
- 운영 인증 선례: `api/.../web/PushAdminController.java` 37~43행. 연결 주소가 루프백이고 `X-Ops-Authenticated: 1`일 때만 허용한다. 설계 46에 따르면 beggars-ops Nginx가 관리 경로에 Basic Auth를 건 뒤 이 헤더를 붙이고, 일반 공개 경로에서는 외부가 보낸 이 헤더를 지운다. CORS는 `WebConfig` 64~67행이 관리 경로에만 콘솔 출처를 연다.
- `visitorId`로 읽는 선례: `SurveyController` 34~51행 `GET /api/survey?visitorId=`. 주소 쿼리로 받는다.
- 응답 캐시: `WebConfig.CACHEABLE`(32행)은 `/api/brands`, `/api/banners` 계열뿐이다. 새 경로는 ETag 필터와 `public` 캐시 머리에 걸리지 않는다.
- 웹 테스트: `web/scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 전부 찾아 돈다. `couponCard.test.js`가 esbuild + `renderToStaticMarkup`으로 JSX 컴포넌트를 그려 보는 선례다.
- 제보 종류 키 대조: `web/src/report.test.js` 7~14행이 `ReportController.java`의 `TYPES = Map.of(...)`를 정규식으로 읽어 웹 `REPORT_TYPES`와 맞댄다.

### 확인하지 못한 것

- **운영 `reports.jsonl`의 실제 행 모양과 `visitorId` 분포.** 이 세션은 서버에 접속하지 않았다. 완료 조건 2번은 아래 "운영 확인"으로 가른다.
- **beggars-ops Nginx가 `X-Ops-Authenticated`를 모든 공개 경로에서 지우는지.** 설계 46 문장만 읽었고 설정 파일(beggars-ops `deploy/nginx-delivery-discount-api.conf`)은 이 저장소에 없다. API에 닿는 공개 요청은 전부 Nginx를 거쳐 루프백에서 오므로, 이 헤더를 지우지 않는 공개 경로가 하나라도 있으면 누구나 상태를 바꿀 수 있다. 배포 전에 확인한다(아래 "배포 순서" 2번).

## 정할 것에 대한 선택

### 상태 저장 위치: 추가 전용 상태 파일

| 안 | 고른 이유 / 버린 이유 |
|---|---|
| **`report-status.jsonl`에 상태 행 추가 (고름)** | 지금 `reports.jsonl`과 같은 `APPEND` 쓰기다. 읽기-고치기-쓰기가 없어 ADR-013의 잠금이 필요 없다. 무중단 배포 중 두 인스턴스가 함께 써도 행을 잃지 않는다. 바뀐 이력이 남는다 |
| `reports.jsonl` 행을 고쳐 다시 쓰기 | 파일 전체를 다시 쓴다. 잠금이 필요하고, 실패하면 제보를 잃는다. `ReportController` 주석의 "제보는 잃지 않는 게 먼저다"와 어긋난다. 번호(줄 해시)도 바뀐다 |
| 상태만 담는 JSON 지도 파일(`{id: status}`) | 읽기-고치기-쓰기라 ADR-013 잠금이 필요하다. 얻는 것이 행 수 절약뿐이다 |
| DB | 범위가 크다(ADR-013이 버린 이유와 같다) |

상태 행 모양: `{"at":"<Instant>","id":"r_<16자>","status":"applied"}`. 파일 자리는 `reports.jsonl`과 같은 폴더(`reportPath.resolveSibling("report-status.jsonl")`)다. 새 설정 키는 만들지 않는다.

### 제보 번호: 줄 해시

- `id = "r_" + hex(sha256(줄 UTF-8 바이트))[0..16]`. 줄은 끝의 `\n`을 뺀 문자열 그대로다. 다시 직렬화하지 않는다.
- 쓸 때는 `append`에 넘기는 문자열로, 읽을 때는 파일에서 읽은 줄로 계산한다. 같은 바이트라 같은 값이 난다.
- 버린 안: 새 행에만 `id` 칸을 더하고 옛 행은 `at`을 번호로 쓰기. 규칙이 둘이 되고 옛 행 번호가 다른 모양이 된다.
- 한계: 누군가 `reports.jsonl`을 다시 포맷하면 번호가 바뀌어 상태 행이 끊긴다. 끊긴 제보는 "접수"로 돌아간다(틀린 상태가 아니라 처음 상태로 떨어진다). 이 파일은 추가 전용이라는 주석을 `ReportLedger`에 남긴다.
- 두 줄이 바이트까지 같으면 번호가 같다. `at`이 마이크로초까지 찍히고 쓰기가 `synchronized`라 실제로 나지 않는다. 나면 두 제보가 상태를 함께 쓴다.

### `visitorId`는 추측하기 어려운가

- 값 자체는 64비트 암호 난수라 추측으로는 닿지 않는다. 분당 읽기 제한(아래)까지 걸면 무작위 대입은 의미가 없다.
- 위험은 추측이 아니라 **값이 새어 나가는 곳**이다. 지금 `visitorId`가 있는 곳: 브라우저 `localStorage`, `events.jsonl`, `reports.jsonl`, 슬랙 제보 채널(`방문자:` 줄), PostHog `distinct_id`, 푸시 상태 파일, 설문 조회 주소 쿼리(접근 기록). 모두 팀만 보는 곳이고 다른 사용자에게 나가지 않는다.
- 그래서 두 가지를 더 한다.
  - 목록은 **헤더 `X-Visitor-Id`**로 받는다. 주소 쿼리로 받으면 Nginx 접근 기록과 Grafana 로그(설계 72)에 남는다. 설문 경로는 이미 쿼리로 받고 있지만 그 응답은 자격 여부 하나다. 이 경로는 제보 이력을 내주므로 기록에 남기지 않는다.
  - 응답에 **제보 본문을 싣지 않는다.** 값이 새더라도 보이는 것은 종류, 브랜드, 날짜, 상태다. 본문에는 사용자가 무엇이든 쓸 수 있다.
- 같은 브라우저를 쓰는 다른 사람은 목록을 본다. 설문 코드 다시 보기와 같은 한계이고 사용자 결정(기기 한계를 알리지 않는다)과 같은 결이다.

### 본문을 보여 줄지: 요약만

종류, 브랜드, 보낸 날짜, 상태만 보여 준다. 위 노출 이유에 더해, 가장 가벼운 구성이라는 이슈 방향과 맞는다. 같은 날 같은 종류의 제보가 둘이면 구별이 안 되는 것은 감수한다(열린 질문 1).

### 시트 안인가 별도 화면인가: 시트 안

- 제보 시트 본문(`sheet__body`) 맨 아래, 보내기 버튼 다음에 둔다. 시트 본문은 이미 스크롤된다.
- 시트를 열 때마다 한 번 읽는다. 처리 상태가 바뀌었을 수 있어서 캐시하지 않는다.
- 목록이 비었거나 읽기에 실패하면 **영역 전체를 그리지 않는다.** "제보 없음" 같은 문구를 두지 않는다. 실패를 "없음"으로 그리면 미관측을 관측처럼 보이게 한다(AGENTS.md 1번). 둘은 컴포넌트 상태(`ok: false`와 빈 배열)로 구분해 테스트가 가른다.
- `visitorId`가 없으면(저장소가 막힘) 요청하지 않고 그리지 않는다.

### 읽기 횟수 제한

- 읽기는 쓰기와 다른 카운터를 쓴다. 키는 쓰기와 같은 `fingerprint.hashForLimit(request)`.
- 분당 10회, 하루 제한은 두지 않는다. 시트를 열 때만 읽으므로 사람이 닿을 수 없는 수다.
- 읽기가 쓰기 예산을 쓰면 안 된다(목록을 몇 번 열었다고 제보를 못 보내면 안 된다). 테스트로 박는다.
- 구현: 지금 `allow(key, now)`는 `PER_DAY`, `PER_MINUTE` 상수를 직접 읽는다. 맵과 한도를 받는 작은 제한기로 뽑아 쓰기·읽기가 같은 코드를 쓴다. 쓰기 쪽 동작(`limitsPerMinute`, `limitsPerDay` 테스트)은 그대로다.

### 상태를 바꾸는 방법

| 안 | 판단 |
|---|---|
| **운영 인증 관리 API + 나중에 콘솔 탭 (고름)** | 이미 있는 인증 경로(설계 46)를 다시 쓴다. 새 비밀값이 없다 |
| 슬랙 버튼(인터랙션) | 슬랙 앱 인터랙션 설정, 서명 비밀값, 공개 콜백 주소가 새로 필요하다. 지금 `SlackReporter`는 보내기 토큰만 쓴다 |
| 운영자가 `report-status.jsonl`에 손으로 줄 추가 | 형식 검사가 없다. 오타 하나가 조용히 무시된다 |

- 지금 처리하는 사람은 슬랙과 `reports.jsonl`을 본다. 새 제보는 슬랙에 번호가 뜨므로 그 번호로 바꾼다. 옛 제보는 관리 목록(`GET /api/reports/admin`)에서 번호를 찾는다.
- 콘솔 탭이 생기기 전 쓰는 법(서버 안에서):
  `curl -X PUT -H 'X-Ops-Authenticated: 1' -H 'Content-Type: application/json' -d '{"status":"applied"}' http://127.0.0.1:<API 포트>/api/reports/admin/r_0123456789abcdef`

## API 응답 형태 (고정)

API와 웹을 함께 바꾸므로 여기서 고정한다(설계 119 공통 규칙).

### `GET /api/reports/mine`

요청 머리 `X-Visitor-Id: v_0123456789abcdef`.

```json
{
  "reports": [
    { "id": "r_3f9a0c1d2e4b5a69", "at": "2026-11-04T03:12:45.123456Z", "type": "amount", "brand": "BBQ", "status": "reviewing" },
    { "id": "r_a1b2c3d4e5f60718", "at": "2026-10-19T05:00:00.000001Z", "type": null, "brand": null, "status": "received" }
  ]
}
```

- 칸은 이 다섯 개뿐이다. `text`, `platform`, `url`, `filters`, `visitorId`, `client`는 싣지 않는다.
- `type`: 옛 첫 모양 행이면 `null`. `TYPES`에 없는 값도 `null`.
- `brand`: 저장값이 `"-"`이면 `null`.
- `status`: `received`, `reviewing`, `applied`, `declined` 중 하나. 상태 행이 없으면 `received`.
- 순서: `at` 내림차순. 최대 50건(최신부터).
- 머리: `Cache-Control: no-store`.
- `X-Visitor-Id`가 없거나 `^v_[0-9a-f]{16}$`에 맞지 않으면 400 `{"ok":false}`. `"-"`도 여기서 막힌다.
- 분당 제한을 넘으면 429 `{"ok":false}`.
- `reports.jsonl`이 아직 없으면 200 `{"reports":[]}`. 파일이 있는데 읽다가 `IOException`이 나면 500 `{"ok":false}`. **읽지 못한 것을 빈 목록으로 내지 않는다.**
- JSON으로 못 읽는 줄(무중단 배포 중 다른 인스턴스가 쓰던 마지막 줄 등)은 건너뛰고 경고 로그를 남긴다. Jackson 3 파싱 오류는 `IOException`이 아니라 `JacksonException`(RuntimeException)이다(ADR-012). 그것을 잡는다.

### `GET /api/reports/admin`

운영 인증. 최신 100건. 행마다 `id, at, type, platform, brand, text, status`. `visitorId`, `client`는 싣지 않는다(처리에 필요 없다). `Cache-Control: no-store`.

### `PUT /api/reports/admin/{id}`

운영 인증. 본문 `{"status":"applied"}`.

- 성공 200: 그 제보의 관리 목록 행 하나.
- 상태 값이 넷 중 하나가 아니면 400. 없는 번호면 404. 인증이 없으면 403.
- 같은 상태를 다시 보내도 행을 덧붙이고 200이다(이력이 남는다).

## 변경

### API

#### 새 `analytics/ReportLedger.java`

- `reportPath` 결정(지금 `ReportController` 생성자 64~67행)을 이리로 옮기고, `statusPath = reportPath.resolveSibling("report-status.jsonl")`.
- `append(line)` → 쓴 줄의 번호를 돌려준다. 지금 `ReportController.append`를 옮긴 것이다.
- `mine(visitorId)`, `recent(limit)`, `setStatus(id, status)`.
- `STATUSES = List.of("received", "reviewing", "applied", "declined")`. 웹 테스트가 이 줄을 정규식으로 읽으므로 한 줄로 적는다.
- 두 파일을 매 요청 처음부터 읽는다. 제보는 하루 한 사람 20건 제한이라 작다. 커지면 ADR-011(증분 읽기)을 따른다. 클래스 주석에 이 판단을 적는다.
- 상태 파일의 행 중 `STATUSES` 밖 값은 무시한다(그 이전 행이 이긴다).

#### `ReportController`

- `submit`: `ledger.append`가 돌려준 번호를 슬랙 메시지 끝에 `\n번호: r_...`로 붙인다. 슬랙은 운영자 화면이라 문구 규칙(6번 묶음) 밖이다.
- `GET /mine` 추가(위 형태).
- 쓰기 제한기와 읽기 제한기를 나눈다(위 "읽기 횟수 제한").

#### 새 `analytics/ReportAdminController.java`

- `@RequestMapping("/api/reports/admin")`. 인증 검사는 `PushAdminController.authorize`와 같다. **복제하지 않는다.** 한 정적 메서드(예: `web/OpsRequest.authorize(HttpServletRequest)`)로 뽑고 두 컨트롤러가 함께 부른다. `PushAdminControllerTest`가 계속 초록이어야 한다.

#### `WebConfig`

- `/api/**` 매핑보다 **앞에** `/api/reports/admin/**`를 `https://bebeggars.duckdns.org`, `GET`·`PUT`으로 연다. 푸시 관리 매핑과 같은 이유(설계 46 "운영 콘솔 저장 요청 CORS 수정")다. 지금은 콘솔 화면이 없지만, 콘솔 탭을 붙일 때 같은 403이 다시 나지 않게 미리 연다.
- `/api/**`의 `allowedHeaders`는 기본값(전부 허용)이라 `X-Visitor-Id` preflight는 따로 열 필요가 없다. 테스트로 확인한다(아래 9번).

### 웹

#### `web/src/report.js`

- `REPORT_STATUSES = [{ key: 'received', label: … }, …]`. 라벨은 개발자 답을 받아 넣는다. 답이 오기 전에는 구현하지 않는다(COPY-STYLE 3절).
- `fetchMyReports(visitorId, fetchImpl = fetch)` → `{ ok: true, reports }` 또는 `{ ok: false }`. `visitorId`가 없으면 요청하지 않고 `{ ok: false }`. 주소에 `visitorId`를 넣지 않고 헤더로만 보낸다.
- `reportDate(at)` → 서울 시각 기준 날짜 문구. 형식은 개발자에게 묻는다(기본안 `11월 4일`).

#### 새 `web/src/MyReports.jsx`

- 프롭 `reports`(배열)만 받는 그리기 전용 컴포넌트. 읽기는 `ReportButton`이 한다.
- 빈 배열이면 아무것도 그리지 않는다(`null`).
- 줄마다: 종류 라벨(`REPORT_TYPES`, `null`이면 비움) · 브랜드(`null`이면 비움) · 날짜, 오른쪽에 상태 라벨. 알 수 없는 상태 키는 비운다(COPY-STYLE 1-5 "모르면 비운다").
- 목록은 `<ul>`, 영역 제목은 `<h3>`. 제목 문구는 개발자에게 묻는다(기본안 `내 제보`).

#### `web/src/ReportButton.jsx`

- `openSheet`에서 `fetchMyReports(getAnalyticsContext().visitorId)`를 부르고 결과를 상태에 둔다. 시트를 닫으면 버린다.
- `ok`이고 한 건 이상일 때만 `sheet__body` 끝(보내기 버튼 아래)에 `<MyReports>`를 그린다.
- 스타일은 `web/src/styles/report.css`에 더한다. 360px에서 줄이 한 줄에 들어가는지 스크린샷으로 본다.

### 하지 않는 것

- 이메일, 연락처, 세션 기록, 동의 절차.
- 기기를 바꾸면 안 보인다는 안내(2026-11-04 사용자 결정).
- 웹 푸시로 처리 결과 보내기(이슈 "참고").
- 콘솔 탭(beggars-ops). API만 열어 두고 후속 이슈로 둔다.
- 새 행동 이벤트. 아래 7번 묶음 참고.

## 변경 전파 확인

| 묶음 | 닿나 | 이 이슈에 넣나 |
|---|---|---|
| 6. 화면에 나가는 글자 | 닿는다 | 넣는다. 새 문구(영역 제목, 상태 넷, 날짜 형식, 옛 행 종류)는 개발자 답을 받아 넣는다. `web/scripts/check-copy.mjs`가 계속 초록인지 본다 |
| 7. 행동 이벤트 | 닿지 않게 한다 | 새 `track(...)`을 더하지 않는다. 목록을 본 수가 궁금하면 기존 `report_open`으로 갈음한다. 더하게 되면 `EventController.ALLOWED_EVENTS`와 `verify-analytics-event-contract.mjs`를 같은 PR에 넣는다 |
| 8. 배포 순서 | 닿는다 | 아래 "배포 순서" |
| 9. 새 파일 | 닿는다 | 넣는다. `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만든다(API PR, 웹 PR 각각). 새 `*.test.js`는 `run-node-tests.mjs`가 찾아 돈다. 구현자는 `npm test` 출력에 새 파일 이름이 실제로 나오는지 본다 |
| 1~5 | 닿지 않는다 | 오퍼, 배너, 알림 경로를 건드리지 않는다 |

묶음 표에 없는 결합 둘을 같이 묶는다.

| 결합 | 막는 것 |
|---|---|
| 상태 키: `ReportLedger.STATUSES` ↔ 웹 `REPORT_STATUSES` | `report.test.js`가 `TYPES`처럼 Java 줄을 읽어 맞댄다(웹 테스트 1번) |
| 운영 인증: API의 헤더 검사 ↔ beggars-ops Nginx의 헤더 제거와 Basic Auth | 이 저장소 테스트로는 못 막는다. 배포 순서 2번에서 사람이 본다 |

## 배포 순서

1. **API PR 먼저.** 새 경로만 더하고 기존 응답은 바꾸지 않는다. 옛 웹에는 영향이 없다.
2. **배포 전 beggars-ops Nginx 확인.** 공개 경로 전체에서 외부가 보낸 `X-Ops-Authenticated`를 지우는지 본다. 안 지우는 공개 경로가 있으면 API를 배포하지 않고 이슈에 알린다. `/api/reports/admin/`을 Basic Auth 위치에 넣는 것은 콘솔 탭 후속 이슈와 함께 해도 된다(그 전까지는 루프백 curl만 쓴다).
3. 운영 확인(아래)을 PR에 적는다.
4. **웹 PR.** 프리뷰 → 360px 스크린샷 → 승인 → main(AGENTS.md). 웹이 혹시 먼저 나가도 옛 API는 `/mine`에 404를 내고 웹은 영역을 그리지 않는다. 그래도 순서는 API 먼저다.

## 테스트

### API (`ReportControllerTest`에 더하거나 새 `ReportLedgerTest`, `ReportAdminControllerTest`)

각 테스트는 `@TempDir`로 파일을 따로 쓴다. 지금 `ReportControllerTest`는 모든 테스트가 한 파일(`build/tmp/reports-test.jsonl`)에 이어 쓰므로, 목록 테스트를 그 파일로 하면 다른 테스트의 행이 섞인다.

1. **보낸 제보가 목록에 나온다 (완료 조건 1):** `v_aaaaaaaaaaaaaaaa`로 POST → 같은 값으로 `GET /mine` → 그 제보의 `type`, `brand`가 있고 `status`가 `received`다.
2. **다른 사람 것은 안 나온다 (완료 조건 4):** `v_aaaa…`와 `v_bbbb…`가 하나씩 보낸다. `v_aaaa…`의 목록에 `v_bbbb…`의 번호가 없다. **양성 신호:** 같은 테스트에서 `v_bbbb…`의 목록에는 그 번호가 있음을 먼저 단언한다. 그래야 "없다"가 읽기 실패가 아니다.
3. **옛 행 (완료 조건 2):** 시험 데이터 `api/src/test/resources/reports/legacy-reports.jsonl`에 세 모양을 둔다. (a) 첫 모양(`type`, `platform` 없음), (b) 지금 모양, (c) `visitorId: "-"`. (a)(b)는 목록에 나오고 `status`는 `received`, (a)의 `type`은 `null`이다. (c)는 어느 요청으로도 안 나온다.
4. **`"-"`와 형식 밖 값은 400:** 헤더 없음, `-`, `v_123`, `v_` + 대문자 16자, 17자.
5. **상태를 바꾸면 목록이 바뀐다 (완료 조건 3):** `PUT /admin/{id}` `reviewing` → `/mine`이 `reviewing`. 다시 `applied` → `applied`(마지막이 이긴다). 상태 파일에 두 줄이 있다.
6. **관리 경로 인증:** `X-Ops-Authenticated` 없음 → 403. 루프백이 아닌 연결(`with(r -> { r.setRemoteAddr("10.0.0.9"); return r; })`) + 헤더 → 403. 없는 번호 → 404. `done` 같은 값 → 400.
7. **개인정보 경계 (완료 조건 5, ANALYTICS-CAPABILITY 3.7):** 본문에 `010-1234-5678`, 주소에 `?q=secret`, 필터를 넣어 보낸 뒤 `/mine` 응답 행의 **키 집합이 정확히** `{id, at, type, brand, status}`이고, 응답 문자열 어디에도 `010-1234-5678`, `secret`, `visitorId`, `client`가 없다.
8. **번호 일치:** POST 때 슬랙으로 간 메시지의 `번호: r_…`가 `/mine`의 `id`와 같다(`ArgumentCaptor`).
9. **CORS:** 프리뷰 출처에서 `X-Visitor-Id`를 요청하는 preflight(`OPTIONS /api/reports/mine`)가 허용된다. 콘솔 출처의 `PUT /api/reports/admin/...` preflight가 허용되고, 프리뷰 출처의 같은 preflight는 막힌다(`PushAdminCorsTest`를 따라 쓴다).
10. **읽기 제한:** 같은 클라이언트가 `/mine`을 11번 읽으면 11번째가 429. 그 뒤에도 같은 클라이언트의 POST는 200이다(읽기가 쓰기 예산을 안 쓴다).
11. **망가진 줄:** 파일 마지막 줄이 잘린 JSON이어도 나머지 행이 나온다.
12. **못 읽음과 없음 구분:** 파일이 없으면 200 빈 목록. 파일 자리가 폴더(읽기에서 `IOException`)면 500. 500을 빈 목록으로 바꾸지 않는다.
13. **기존 테스트:** `ReportControllerTest` 전부, `PushAdminControllerTest`, `PushAdminCorsTest`가 그대로 초록.

### 웹

1. **상태 키 대조** (`report.test.js`): `ReportLedger.java`의 `STATUSES = List.of(...)`를 읽어 `REPORT_STATUSES` 키와 같다.
2. **목록 그리기** (새 `web/src/myReports.test.js`, `couponCard.test.js`처럼 esbuild + `renderToStaticMarkup`): 두 줄을 넣으면 `<li>` 둘, 각 줄에 종류 라벨, 브랜드, 날짜, 상태 라벨이 있다. `2026-11-03T16:00:00Z`는 서울 기준 11월 4일로 그린다(시차 경계).
3. **빈 목록과 모르는 값:** 빈 배열이면 빈 출력. `type: null`, `brand: null` 줄은 그 자리가 비고 `null`이라는 글자가 없다. 모르는 상태 키는 상태 자리가 빈다.
4. **읽기 요청** (`report.test.js`): `fetchMyReports('v_…', fake)`가 `/api/reports/mine`을 부르고 헤더에 `X-Visitor-Id`가 있으며 **주소에 `v_`가 없다.** 응답이 `ok: false`(500, 429, 404)면 `{ ok: false }`. `visitorId`가 `null`이면 `fake`를 부르지 않는다.
5. **전체:** `npm test`(문구 검사 `test:copy` 포함).

## 운영 확인 (완료 조건 2)

이 세션은 운영에 접속하지 않았다. API 배포 후 구현자나 담당자가 서버에서 한다. 명령과 숫자를 PR에 적는다.

1. `reports.jsonl` 전체 행 수, `visitorId`가 `^v_[0-9a-f]{16}$`인 행 수, `"-"`인 행 수, 그 밖의 값인 행 수를 센다. **전체 행 수가 0이 아님을 먼저 본다.** 0이면 다른 파일을 본 것이다(기본 경로는 이벤트 원장 옆, 2026-10-19 `96f9373c`).
2. `type` 칸이 없는 행 수를 센다(첫 모양). 0이어도 시험 데이터 3번이 그 모양을 지킨다.
3. 형식에 맞는 `visitorId` 하나를 골라 루프백에서 `curl -H 'X-Visitor-Id: <값>' http://127.0.0.1:<포트>/api/reports/mine`을 부르고, 1번에서 그 값으로 센 행 수와 응답 건수(50건 이하일 때)가 같은지 본다. 값 자체는 PR에 적지 않는다.
4. 그 밖의 값(1번 넷째)이 있으면 어떤 모양인지 적는다. 이 설계는 그 행들을 목록에서 빼는 것으로 둔다.

## 개발자에게 묻는 것 (문구, COPY-STYLE 3절)

답이 오기 전에는 웹 구현자가 문구를 넣지 않는다. 기본안은 후보일 뿐이다.

| 자리 | 기본안 | 메모 |
|---|---|---|
| 영역 제목 | `내 제보` | 이슈 문구 |
| `received` | `접수` | |
| `reviewing` | `검토 중` | 이슈의 `확인 중`은 금지어 "확인"이 들어 있다(COPY-STYLE 1-4). 그래도 `확인 중`을 원하면 규칙 예외로 적는다 |
| `applied` | `반영` | 이슈는 `반영됨` |
| `declined` | `반영 안 함` | |
| 날짜 | `11월 4일` | 올해가 아니면 연도를 붙일지 |
| 옛 행 종류(`type: null`) | 비움 | COPY-STYLE 1-5 |

## 열린 질문

답 없이도 기본안으로 시작할 수 있다.

1. **본문 앞부분을 보여 줄까?** 기본안은 안 보여 준다(노출 최소화). 같은 날 같은 종류 제보를 구별하기 어렵다는 말이 나오면 앞 20자를 `/mine`에 더하는 것을 다시 본다.
2. **`declined`에 이유를 붙일까?** 기본안은 상태만. 이유 칸은 사람이 쓴 글이 사용자 화면에 그대로 나가는 길이라 6번 묶음 검사가 새로 필요하다.
3. **콘솔 탭은 언제?** 이 이슈는 API까지. 처리 빈도가 높아 curl이 번거로우면 beggars-ops 이슈를 연다.

## 변경 이력

- 2026-11-14 (이슈 댓글, 개발자 답): 영역 제목 `제보 내역`. 상태 라벨은 셋 `접수됨`, `확인됨`, `처리됨`이다. 상태 키 넷(`received`, `reviewing`, `applied`, `declined`)은 그대로 두고 `applied`와 `declined`가 둘 다 `처리됨`으로 나온다(API 계약을 바꾸지 않음). 날짜는 서울 기준 `yy-MM-dd`(예 `26-11-04`). 옛 행 종류는 비움(기본안). 위 "개발자에게 묻는 것" 표와 웹 `report.js` 절의 기본안은 이 답으로 바뀐다. API는 별도 이슈로 이 설계대로 동시에 진행해도 된다고 답했다.
