# 393. 제보 시트 내 제보 목록의 API

추적 이슈: [#393](https://github.com/woowacourse-teams/2026-to-discount/issues/393). 상위 설계: [#311 설계](https://github.com/woowacourse-teams/2026-to-discount/blob/feat/311-my-reports-v3/docs/design/311-my-reports-status.md)(웹 PR [#391](https://github.com/woowacourse-teams/2026-to-discount/pull/391)에 포함, 아직 main에 없음).

## 결론

#311 설계의 "API 응답 형태 (고정)"을 그대로 구현한다. 공개 경로 `GET /api/reports/mine`의 요청, 응답, 오류 코드는 한 글자도 바꾸지 않는다. 웹 #391은 이 경로만 부른다.

바꾸는 것은 하나다. **관리 경로를 `/api/reports/admin`에서 `/api/admin/reports`로 옮긴다.**

- #319가 관리 경로의 자리를 `/api/admin/`으로 정했다(`SurveyAdminController`). beggars-ops Nginx가 Basic Auth 뒤 `X-Ops-Authenticated`, `X-Ops-User`를 붙이는 location도 `/api/admin/`이다(`docs/CHANGE-PROPAGATION.md` 10번 "경로와 헤더").
- `/api/reports/admin`은 접두사가 `/api/admin/`이 아니라 그 location을 타지 않는다. 이슈 "확인할 것" 1번의 답이 "안 탄다"이고, 그러면 콘솔 Nginx 설정이 먼저 필요했다.
- `/api/admin/reports`는 Nginx, CORS(`WebConfig`의 `/api/admin/**` 매핑) 둘 다 이미 있는 설정에 들어간다. 새 Nginx location도, 새 CORS 매핑도 필요 없다.
- 웹은 관리 경로를 부르지 않는다. #391에는 영향이 없다.
- 승인자가 원래 경로를 원하면 경로 문자열 두 곳만 바꾸면 된다(아래 "열린 질문" 1).

나머지(상태 파일, 제보 번호, 상태 키 넷, 읽기 제한, 슬랙 번호 줄, 테스트 계획)는 #311 설계 그대로다. 이 문서는 구현자가 바로 칠 수 있게 파일, 메서드, 테스트를 구체적으로 적는다.

## 배경: 코드에서 확인한 것 (main `e5db8eee`)

- `ReportController`(`api/.../analytics/ReportController.java`)
  - 64~68행: `reportPath` 결정. 비면 `discount.event-log-path` 옆 `reports.jsonl`.
  - 103행: `append(mapper.writeValueAsString(row))`. 114~122행 `append`는 `synchronized` + `InterProcessFileLock.withOperationsWrite`로 `APPEND`한다. #311 설계는 "잠금 없음"이라 적었지만 실제로는 운영 쓰기 잠금 안에서 쓴다. 상태 파일 쓰기도 같은 잠금을 쓴다.
  - 124~139행 `allow(key, now)`: `PER_DAY`, `PER_MINUTE` 상수를 직접 읽는다. `ReportControllerTest.limitsPerDay`가 `controller.allow(...)`를 직접 부른다.
  - 86~91행: 슬랙 메시지. 107행: 저장 실패 때도 슬랙을 보낸다.
- `OpsAuth`(`api/.../web/OpsAuth.java`, #319): `require(request)`는 루프백 + `X-Ops-Authenticated: 1`이 아니면 403 `ResponseStatusException`. `user(request)`는 `X-Ops-User`가 없으면 400. `PushAdminController`, `SurveyAdminController`가 이미 쓴다. #311 설계의 "`OpsRequest.authorize`로 뽑기"는 #319가 끝냈다. 이 이슈는 부르기만 한다.
- `SurveyAdminController`: 경로 `/api/admin/survey-settings`. 쓰기(`PUT`)에서 `OpsAuth.user`로 바꾼 사람을 받는다.
- `WebConfig` 70~73행: `/api/admin/**`에 콘솔 출처, `GET`·`PUT`. 83~96행 `/api/**`는 `allowedHeaders`를 적지 않아 기본값(전부)이다. `CACHEABLE`(32행)에 `/api/reports/**`는 없다.
- 테스트 선례
  - `SurveyAdminControllerTest`: `@TempDir` + `MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler())`. 비루프백은 `with(r -> { r.setRemoteAddr("203.0.113.5"); return r; })`.
  - `PushAdminCorsTest`: `@WebMvcTest(...)` + `@Import(WebConfig.class)`로 preflight를 본다.
  - `ReportControllerTest`: `@SpringBootTest`, 모든 테스트가 `build/tmp/reports-test.jsonl` 한 파일에 이어 쓴다. 목록 테스트를 여기에 넣으면 행이 섞인다.
- 웹 대조(#391 `web/src/report.test.js`): `api/src/main/java/com/discounttracker/analytics/ReportLedger.java`를 읽어 `/STATUSES = List\.of\(([^)]*)\)/`로 키를 뽑는다. **경로와 클래스 이름, 한 줄 표기가 계약이다.** 파일이 없으면 그 테스트는 건너뜀이다.
- ADR-012: Jackson 3 파싱 오류는 `JacksonException`(비검사)이다. `IOException`과 같은 처리 길로 보낸다.

### 확인하지 못한 것

- **beggars-ops Nginx의 `/api/admin/` location이 Basic Auth를 거는지, 그리고 정규식 location 등 다른 location이 `/api/admin/reports`를 먼저 잡지 않는지.** 설정 파일은 이 저장소에 없다. 이슈 본문은 기본 location이 외부 `X-Ops-Authenticated`를 지운다는 것까지 확인했다. 배포 전에 사람이 본다(배포 순서 2).
- **운영 `reports.jsonl`의 행 모양과 `visitorId` 분포.** 이 세션은 서버에 접속하지 않았다. #311 설계 "운영 확인" 절차를 API 배포 뒤 PR에 적는다.

## API 계약

### `GET /api/reports/mine` (#311 그대로)

요청 머리 `X-Visitor-Id: v_0123456789abcdef`.

```json
{
  "reports": [
    { "id": "r_3f9a0c1d2e4b5a69", "at": "2026-11-04T03:12:45.123456Z", "type": "amount", "brand": "BBQ", "status": "reviewing" },
    { "id": "r_a1b2c3d4e5f60718", "at": "2026-10-19T05:00:00.000001Z", "type": null, "brand": null, "status": "received" }
  ]
}
```

- 행의 키는 정확히 `id, at, type, brand, status`.
- `type`: 저장값이 없거나 `ReportController.TYPES`에 없으면 `null`.
- `brand`: 저장값이 없거나 `"-"`이면 `null`.
- `status`: `STATUSES` 중 하나. 상태 행이 없으면 `received`.
- 순서: `at` 내림차순, 최대 50건.
- 머리 `Cache-Control: no-store`.
- 판정 순서와 오류
  1. `X-Visitor-Id`가 없거나 `^v_[0-9a-f]{16}$` 밖(`-` 포함) → 400 `{"ok":false}`.
  2. 읽기 제한(분당 10회, 쓰기와 별도 카운터) 초과 → 429 `{"ok":false}`.
  3. `reports.jsonl`이 없음 → 200 `{"reports":[]}`.
  4. 둘 중 어느 파일이든 있는데 읽다가 `IOException` → 500 `{"ok":false}`. **상태 파일을 못 읽었을 때 전부 `received`로 내지 않는다.** 틀린 상태를 보이느니 영역을 안 그리게 한다(웹은 `ok:false`면 영역을 그리지 않는다).
  5. JSON으로 못 읽는 줄(`JacksonException`)은 건너뛰고 경고 로그 한 줄. 줄 내용은 로그에 싣지 않는다(본문이 들어 있다). 줄 번호만 싣는다.

### `GET /api/admin/reports` (경로만 #311과 다름)

- `OpsAuth.require`. `X-Ops-User`는 요구하지 않는다(읽기, `SurveyAdminController.get`과 같다).
- `{"reports":[...]}`, 최신 100건. 행 키는 정확히 `id, at, type, platform, brand, text, status`. `visitorId`, `client`, `url`, `filters`는 싣지 않는다.
- `platform`, `brand`: `"-"`나 없음은 `null`. `type`은 `/mine`과 같은 규칙.
- `visitorId`가 `"-"`인 행도 나온다(운영자는 전부 본다).
- `Cache-Control: no-store`. 읽기 실패는 500.

### `PUT /api/admin/reports/{id}` (경로만 #311과 다름)

- `OpsAuth.require` 다음 `OpsAuth.user`(없으면 400). 바꾼 사람을 상태 행에 남긴다(#319 설문 설정과 같은 규칙: 누가 바꿨는지 모르는 변경은 받지 않는다).
- 본문 `{"status":"applied"}`.
- 판정 순서: 403(인증) → 400(`X-Ops-User` 없음) → 400(`id`가 `^r_[0-9a-f]{16}$` 밖이거나 `status`가 넷 밖이거나 본문 없음) → 404(그 번호의 제보 없음) → 상태 행 추가 → 200.
- 200 본문: 그 제보의 관리 행 하나(`GET /api/admin/reports` 행과 같은 키). `status`는 방금 쓴 값.
- 같은 상태를 다시 보내도 행을 덧붙이고 200(이력).
- 오류 본문: 400·404는 `{"ok":false}`. 403은 `OpsAuth`가 던지는 `ResponseStatusException`을 `GlobalExceptionHandler`가 내는 모양 그대로 둔다(푸시, 설문 관리 경로와 같게).

### 저장 모양

- 상태 파일: `reportPath.resolveSibling("report-status.jsonl")`. 새 설정 키 없음.
- 상태 행: `{"at":"<Instant>","id":"r_<16자>","status":"applied","by":"<X-Ops-User>"}`. `by`는 #311 설계에 없던 칸이다. 읽기는 `id`, `status`만 쓰므로 웹 계약에는 닿지 않는다.
- 제보 번호: `"r_" + HexFormat.of().formatHex(sha256(line.getBytes(UTF_8))).substring(0, 16)`. `line`은 `append`에 넘긴 문자열(끝 `\n` 없음), 읽을 때는 `Files.readAllLines(path, UTF_8)`의 한 줄. 다시 직렬화하지 않는다.
- 같은 `id`의 상태 행이 여럿이면 파일에서 마지막 행이 이긴다. `STATUSES` 밖 값의 행, JSON이 아닌 행은 무시한다(그 앞 행이 이긴다).

## 변경 (api/ 만)

### 새 `api/src/main/java/com/discounttracker/analytics/ReportLedger.java`

`@Component`. 제보 원장과 상태 원장을 함께 맡는다.

- 생성자: `ReportLedger(ObjectMapper mapper, @Value("${discount.report.path:}") String reportPath, @Value("${discount.event-log-path:data/events.jsonl}") String eventLogPath)`. 경로 결정은 지금 `ReportController` 64~68행을 옮긴다(주석 포함). 테스트용으로 `ReportLedger(ObjectMapper mapper, Path reportPath)` 패키지 생성자를 하나 더 둔다.
- 상수, **한 줄로**(웹 테스트가 정규식으로 읽는다):
  `static final List<String> STATUSES = List.of("received", "reviewing", "applied", "declined");`
- `synchronized String append(String line) throws IOException`: 지금 `ReportController.append`를 옮기고 `idOf(line)`을 돌려준다.
- `static String idOf(String line)`.
- `record Entry(String id, Instant at, String rawAt, JsonNode row, String status)` 정도의 내부 표현. `rawAt`은 응답에 그대로 싣는다(저장 문자열 유지).
- `List<Entry> mine(String visitorId, int limit) throws IOException`: `visitorId`가 같은 행만, 최신순 `limit`건.
- `List<Entry> recent(int limit) throws IOException`: 전부에서 최신순 `limit`건.
- `Optional<Entry> setStatus(String id, String status, String by) throws IOException`: 그 번호가 원장에 없으면 `Optional.empty()`(쓰지 않는다). 있으면 상태 행을 `InterProcessFileLock.withOperationsWrite` 안에서 `APPEND`로 덧붙이고 새 상태의 `Entry`를 돌려준다. `append`와 같은 모니터(`synchronized`)를 쓴다.
- 읽기 세부
  - 두 파일을 요청마다 처음부터 읽는다. 클래스 주석에 이유를 적는다: 제보는 한 사람 하루 20건 제한이라 작다. 커지면 ADR-011(증분 읽기)을 따른다.
  - 파일이 없으면 빈 목록, 빈 상태 지도. 있는데 `IOException`이면 그대로 던진다(빈 목록으로 바꾸지 않는다).
  - 줄 파싱의 `JacksonException`은 잡아 건너뛰고 `log.warn("report line {} unreadable in {}", 줄 번호, 파일 이름)`.
  - 빈 줄은 건너뛴다(경고 없이).
  - 정렬: `Instant.parse(at)` 내림차순. 같거나 `at`을 못 읽으면 파일 뒤쪽이 앞(추가 전용이라 뒤가 최신). `at`을 못 읽는 행은 맨 뒤.
  - 문자열 비교로 정렬하지 않는다. `Instant.toString()`은 소수 자릿수가 달라 `…45Z`와 `…45.1Z`의 사전 순서가 시간 순서와 다르다.
- 클래스 주석에 "이 두 파일은 추가 전용이다. `reports.jsonl`을 다시 포맷하면 번호가 바뀌어 상태가 `received`로 돌아간다"를 적는다.

### `ReportController` 변경

- 생성자: `ObjectMapper`, 경로 두 `@Value`를 빼고 `ReportLedger ledger`를 받는다. `mapper`는 행 직렬화에 계속 필요하면 남긴다.
- `submit`
  - `append(...)` 대신 `String id = ledger.append(line)`.
  - 성공 경로 슬랙 메시지 끝에 `"\n번호: " + id`. 저장 실패 경로(107행)는 번호가 없으므로 지금 메시지 그대로.
  - 응답은 지금 그대로 `{"ok":true}`. 번호를 응답에 싣지 않는다(웹 계약 밖).
- 읽기 제한기 분리
  - 지금 `allow` 본문을 같은 패키지의 작은 클래스 `ReportRateLimiter(int perMinute, int perDay)`로 옮긴다. 하루 제한이 없으면 `Integer.MAX_VALUE`.
  - 필드 둘: `writes = new ReportRateLimiter(PER_MINUTE, PER_DAY)`, `reads = new ReportRateLimiter(READS_PER_MINUTE, Integer.MAX_VALUE)`. `static final int READS_PER_MINUTE = 10;`
  - `allow(key, now)`는 `writes.allow(key, now)`를 부르는 한 줄로 남긴다. `limitsPerDay` 테스트가 그대로 돈다.
  - 10,000키 넘으면 하루 지난 기록을 걷는 지금 동작을 제한기 안으로 같이 옮긴다.
- `@GetMapping("/mine")` 추가: 위 계약의 판정 순서. 키는 `fingerprint.hashForLimit(request)`. 정규식은 `Pattern.compile("^v_[0-9a-f]{16}$")` 상수.

### 새 `api/src/main/java/com/discounttracker/analytics/ReportAdminController.java`

- `@RestController @RequestMapping("/api/admin/reports")`. 클래스 주석은 `SurveyAdminController`처럼 "공개 API가 아니다, 인증은 `OpsAuth`".
- `@GetMapping list(HttpServletRequest)`, `@PutMapping("/{id}") put(HttpServletRequest, @PathVariable String id, @RequestBody(required = false) JsonNode body)`.
- 본문의 `status`가 문자열이 아니면 400.
- `IOException`은 로그 후 500 `{"ok":false}`.
- 행 만들기(`Entry` → 응답 지도)는 `/mine`용, 관리용 두 함수로 둔다. **응답 키 집합은 이 두 함수에서만 정한다.** 테스트가 키 집합을 정확히 맞댄다.

### `WebConfig`

바꾸지 않는다. `/api/admin/**` 매핑이 콘솔 출처의 `GET`·`PUT`을 이미 연다. `/api/reports/mine`은 `/api/**` 매핑에 들고, `allowedHeaders` 기본값이 `X-Visitor-Id` preflight를 허용한다. 둘 다 테스트로 박는다(아래 19, 20).

### 새 시험 데이터 `api/src/test/resources/reports/legacy-reports.jsonl`

세 줄. 테스트가 `@TempDir`의 `reports.jsonl`로 복사해 쓴다.

- (a) 첫 모양: `{"at":"2026-10-19T05:00:00.000001Z","text":"옛 제보","brand":"-","url":"-","filters":"-","visitorId":"v_aaaaaaaaaaaaaaaa","client":"c1"}`
- (b) 지금 모양: `type`, `platform` 포함, `visitorId` 같은 값.
- (c) `visitorId: "-"`.

### `docs/PROJECT-STRUCTURE.md`

새 파일이 셋(`ReportLedger`, `ReportAdminController`, `ReportRateLimiter`)이다. `python scripts/generate_project_structure.py`로 다시 만들어 같은 커밋에 넣는다(묶음 9). 안 하면 push 훅이 막는다.

### 하지 않는 것

- 웹 변경(#391).
- 콘솔 화면(beggars-ops 탭).
- beggars-ops Nginx 설정 변경. 이 설계로는 필요 없다(확인만 한다).
- `/mine` 응답에 본문 앞부분, 거절 사유 싣기(#311 열린 질문 1, 2).

## 변경 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 닿나 | 이 이슈에 넣나 |
|---|---|---|
| 6. 화면에 나가는 글자 | 닿지 않는다 | 슬랙 `번호:` 줄은 운영자 화면이다. 사용자 문구는 #391 몫 |
| 7. 행동 이벤트 | 닿지 않는다 | `EventController.ALLOWED_EVENTS`를 건드리지 않는다 |
| 8. 배포 순서 | 닿는다 | API가 #391보다 먼저. 아래 "배포 순서" |
| 9. 새 파일 | 닿는다 | 넣는다. `PROJECT-STRUCTURE.md` 재생성 |
| 10. 설문 설정의 "경로와 헤더" | 닿는다(같은 Nginx `/api/admin/` location을 함께 쓴다) | 설정은 바꾸지 않는다. 배포 전 확인만(배포 순서 2). 설문 설정 묶음의 나머지(설정 파일, 계약 파일)는 닿지 않아 넣지 않는다 |
| 1~5 | 닿지 않는다 | 오퍼, 배너, 알림 경로를 건드리지 않는다 |

표에 없는 결합 셋.

| 결합 | 막는 것 |
|---|---|
| 상태 키: `ReportLedger.STATUSES` ↔ 웹 `REPORT_STATUSES` | #391 `report.test.js`가 Java 줄을 읽어 맞댄다. 이 PR이 들어가면 건너뜀이 실제 검사로 바뀐다. 구현자는 #391 브랜치의 `report.test.js` 정규식으로 새 파일을 한 번 읽어 키 넷이 나오는지 본다(아래 테스트 22) |
| `/mine` 응답 키 ↔ 웹 `MyReports.jsx` | API 테스트 11이 키 집합을 정확히 맞댄다. 웹은 #391 테스트가 같은 다섯 키 픽스처를 쓴다 |
| 관리 경로 인증 ↔ beggars-ops Nginx 헤더 제거, Basic Auth | 이 저장소 테스트로는 못 막는다. 배포 순서 2에서 사람이 본다 |

이 PR이 들어간 뒤 `CHANGE-PROPAGATION.md`에 "제보 상태" 묶음을 더할지는 리뷰에서 정한다(리뷰 포인트). 설계자는 `docs/design/` 밖을 고치지 않는다.

## 배포 순서

1. **이 API PR 먼저.** 새 경로만 더한다. 기존 `POST /api/reports` 응답은 그대로다. 슬랙 메시지에 줄 하나가 늘 뿐이다.
2. **배포 전 beggars-ops Nginx 확인.** 셋을 본다.
   - 공개 location 전부가 외부가 보낸 `X-Ops-Authenticated`, `X-Ops-User`를 지운다(이슈: 기본 location은 확인됨).
   - `/api/admin/` location이 Basic Auth 뒤에서만 두 헤더를 붙인다.
   - `/api/admin/reports`를 `/api/admin/`보다 먼저 잡는 location이 없다.
   - 하나라도 아니면 배포하지 않고 이슈에 적는다.
3. 배포 뒤 #311 설계 "운영 확인" 1~4를 루프백에서 하고 명령과 숫자를 PR에 적는다. `visitorId` 값 자체는 적지 않는다.
4. 배포 뒤 관리 경로를 한 번 시험한다: 루프백에서 `curl -H 'X-Ops-Authenticated: 1' http://127.0.0.1:<API 포트>/api/admin/reports`가 200, 같은 요청을 공개 주소로 보내면 403(외부 헤더가 지워져서). 이 두 결과가 Nginx 확인의 양성 신호다. 공개 주소 403만 보고 "막혔다"고 하지 않는다. 루프백 200이 먼저다.
5. 그다음 웹 #391(프리뷰 → 승인 → main).

콘솔 탭 전 상태 바꾸는 법(서버 안에서):
`curl -X PUT -H 'X-Ops-Authenticated: 1' -H 'X-Ops-User: <이름>' -H 'Content-Type: application/json' -d '{"status":"applied"}' http://127.0.0.1:<API 포트>/api/admin/reports/r_0123456789abcdef`

## 테스트

### 새 `ReportLedgerTest` (단위, `@TempDir`)

1. **번호 일치:** `append(line)`이 돌려준 번호가 `recent(…)`의 그 행 번호와 같고, `idOf(line)`과 같다. `r_` + 16진수 16자.
2. **옛 행(완료 조건 2):** `legacy-reports.jsonl` 복사 → `mine("v_aaaaaaaaaaaaaaaa", 50)`이 (a)(b) 둘. 상태는 둘 다 `received`. (c)는 어느 `visitorId`로도 안 나오고 `recent`에는 나온다.
3. **마지막이 이긴다:** `setStatus(id, "reviewing")` → `applied` → 상태 `applied`. 상태 파일에 두 줄, 각 줄에 `by`.
4. **없는 번호:** `setStatus("r_0000000000000000", …)`는 `Optional.empty()`이고 상태 파일이 생기지 않는다.
5. **망가진 줄:** 원장 마지막 줄이 잘린 JSON, 상태 파일 마지막 줄이 잘린 JSON이어도 나머지가 나온다. 상태 파일의 `"done"` 행은 무시되고 그 앞 행이 이긴다.
6. **정렬:** `at`이 `…45Z`와 `…45.1Z`인 두 행이 시간 순서(`.1Z`가 앞)로 나온다. 51행 넣으면 50건이고 가장 옛 행이 빠진다.
7. **못 읽음과 없음 구분:** 원장 파일이 없으면 빈 목록. 원장 자리가 폴더면 `IOException`. 상태 파일 자리가 폴더여도 `IOException`(전부 `received`로 내지 않는다).

### 새 `ReportMineTest` (`ReportController` standalone MockMvc, `@TempDir`의 `ReportLedger`, 목 `SlackReporter`, 진짜 `ClientFingerprint`)

`ClientFingerprint` 생성이 무거우면 `@SpringBootTest` + `@DynamicPropertySource`로 `discount.report.path`를 테스트마다 다른 경로로 준다. 어느 쪽이든 `build/tmp/reports-test.jsonl`을 함께 쓰지 않는다.

8. **보낸 제보가 목록에 나온다(완료 조건 1):** `v_aaaaaaaaaaaaaaaa`로 POST → 같은 값으로 `GET /api/reports/mine` → 한 건, `type`, `brand`가 보낸 값, `status` `received`, `Cache-Control` `no-store`.
9. **다른 사람 것은 안 나온다(완료 조건 4):** `v_aaaa…`, `v_bbbb…`가 하나씩 보낸다. **양성 신호 먼저:** `v_bbbb…` 목록에 그 번호가 있다. 그다음 `v_aaaa…` 목록에 그 번호가 없고 자기 것은 있다.
10. **형식 밖은 400:** 헤더 없음, `-`, `v_123`, `v_` + 대문자 16자, `v_` + 17자. 400 전에 원장을 읽지 않는다(원장 자리를 폴더로 둬도 500이 아니라 400).
11. **개인정보 경계(완료 조건 5):** 본문 `010-1234-5678`, 주소 `https://x/?q=secret`, 필터를 넣어 POST → `/mine` 행의 키 집합이 정확히 `{id, at, type, brand, status}`. 응답 문자열에 `010-1234-5678`, `secret`, `visitorId`, `client`, `platform`이 없다.
12. **슬랙 번호:** `ArgumentCaptor`로 잡은 슬랙 메시지 끝 줄 `번호: r_…`가 `/mine`의 `id`와 같다. 저장 실패 경로(원장 자리를 폴더로)에는 `번호:` 줄이 없다.
13. **읽기 제한:** 같은 클라이언트가 `/mine` 10번 200, 11번째 429. 그 뒤 같은 클라이언트 POST가 200(읽기가 쓰기 예산을 안 쓴다). 다른 클라이언트의 `/mine`은 200.
14. **못 읽음:** 원장 자리가 폴더면 500 `{"ok":false}`. 원장이 없으면 200 `{"reports":[]}`.

### 새 `ReportAdminControllerTest` (standalone MockMvc + `GlobalExceptionHandler`, `SurveyAdminControllerTest`와 같은 틀)

15. **상태를 바꾸면 목록이 바뀐다(완료 조건 3):** PUT `reviewing` → 200, 본문 `status` `reviewing` → `/mine`(같은 원장의 `ReportController`)이 `reviewing`. 다시 `applied` → `applied`.
16. **인증:** `X-Ops-Authenticated` 없음 403. 비루프백(`203.0.113.5`) + 헤더 403. 두 경우 모두 상태 파일이 생기지 않는다. GET도 같다.
17. **입력:** `X-Ops-User` 없음 400. `status` `done`, 숫자, 본문 없음 400. `id` `r_xyz` 400. 형식은 맞는데 없는 번호 404. 모두 상태 파일 줄 수가 그대로다.
18. **관리 목록 키:** 행 키 집합이 정확히 `{id, at, type, platform, brand, text, status}`. `visitorId: "-"` 행도 나온다. 응답 문자열에 `visitorId`, `client`가 없다.

### CORS (`ReportCorsTest`, `@WebMvcTest({ReportController.class, ReportAdminController.class})` + `@Import(WebConfig.class)`, `PushAdminCorsTest`를 따라)

19. 프리뷰 출처(`https://beggars-git-x-nn98s-projects.vercel.app`)의 `OPTIONS /api/reports/mine`, `Access-Control-Request-Headers: x-visitor-id`가 허용된다.
20. 콘솔 출처의 `OPTIONS /api/admin/reports/r_0123456789abcdef` `PUT` preflight가 허용된다. 프리뷰 출처의 같은 preflight는 403.

### 기존과 웹 대조

21. `ReportControllerTest` 전부(`limitsPerMinute`, `limitsPerDay` 포함), `PushAdminControllerTest`, `PushAdminCorsTest`, `SurveyAdminControllerTest`가 그대로 초록. `./gradlew test` 출력에 새 테스트 클래스 넷의 이름이 실제로 나오는지 본다(안 도는 테스트는 초록으로 보인다).
22. **웹 정규식으로 읽힌다:** #391 브랜치의 `web/src/report.test.js`의 정규식 `/STATUSES = List\.of\(([^)]*)\)/`로 새 `ReportLedger.java`를 읽으면 키 넷이 나온다. 구현자는 `git show origin/feat/311-my-reports-v3:web/src/report.test.js`로 정규식을 확인하고, 결과를 PR "확인" 절에 적는다. 이 저장소의 Java 테스트에 같은 정규식을 박지는 않는다(웹 테스트가 정본).

## 열린 질문

답 없이도 기본안으로 구현할 수 있다.

1. **관리 경로를 `/api/admin/reports`로 옮겨도 되나?** 기본안은 옮긴다(위 "결론"). 이슈 본문은 `/api/reports/admin`이다. 원래 경로를 원하면 `ReportAdminController`의 `@RequestMapping`과 테스트 경로만 바꾸고, `WebConfig`에 `/api/reports/admin/**` 매핑을 `/api/**`보다 앞에 더하고, beggars-ops Nginx에 location을 먼저 더한다.
2. **상태 행의 `by`(바꾼 사람)를 요구해도 되나?** 기본안은 요구한다(#319와 같은 규칙). 루프백 curl에 `-H 'X-Ops-User: <이름>'` 하나가 는다.

## 변경 이력

- 2026-11-14: 첫 판.
