# PR 리뷰 기록

모노레포([`woowacourse-teams/2026-to-discount`](https://github.com/woowacourse-teams/2026-to-discount))에
쌓인 PR을 리뷰할 때마다 여기 남긴다. 목적은 "누가 뭘 지적했고 어떻게
반영했는지"를 나중에 다시 grep 안 해도 되게 하는 것 — 리뷰 자체의 회고
문서가 아니라 처리 로그다.

한 PR당 한 절. 형식:

```
## #N — 제목

- 링크: <PR URL>
- 작성자: <author>
- 상태: 리뷰중 / 반영대기 / 머지완료 / 보류

### 지적사항
- [ ] (누가) 무엇을 지적했는지, 파일:줄 단위로

### 반영
- 커밋 <sha> — 무엇을 고쳤는지, 지적사항 중 어느 항목에 대응하는지

### 검증
- 내가 직접 확인한 것(로컬 데이터 대조, 코드 존재 확인 등) — "지적을
  받아들였다"가 아니라 "맞는지 확인했다"를 기록한다.
```

## 작업 규칙 — PR 브랜치를 로컬에서 검증할 때

2026-08-14 사고(아래 "사고 기록" 참고) 이후로 고정한다:

1. `git checkout <pr-branch>` 또는 `git checkout <pr-branch> -- <path>`로
   PR 내용을 로컬에 꺼낸 뒤에는, **그 검증이 끝나는 즉시** `git checkout main`
   (또는 `git restore --staged --worktree <path>`)으로 되돌린다. 다음 작업
   시작 전이 아니라 검증 직후다.
2. `git status --short`로 워킹트리가 비어 있는지 확인하고 나서만 그다음
   커밋(리뷰 로그든 뭐든)을 만든다. 조회용으로 꺼내둔 파일이 다음
   `git add`에 같이 잡히는 게 이번 사고의 원인이었다 — 상태 확인 없이
   연달아 커밋하지 않는다.
3. 위 두 단계를 건너뛰고 커밋했다면, push 직후 `gh run list`로 그 커밋의
   CI 결과를 확인한다. 실패했으면 바로 되돌리고 여기에 기록한다.

---

## #1 — docs: 원장 재생성 금지 서술을 해소 기록으로 전환

- 링크: https://github.com/woowacourse-teams/2026-to-discount/pull/1
- 작성자: miniminjae92
- 상태: 머지완료 (`1b4549b`, 2026-08-14)

### 배경
`docs/ORCHESTRATION.md` §4가 "`export_data.py`를 그대로 돌리면 안 된다"
(2026-08-06 기준 20건 부활)로 적혀 있었는데, `is_stale_sweep` 도입
(2026-08-10)으로 실제로는 해소됐다. 문서만 안 따라간 상태를 반영.

### 검증 (2026-08-14, 로컬 tracker `origin/main` export.json 대조)
- 만료일 없는 레코드 131건 — PR 주장과 정확히 일치
- ddangyo 만료일 보유율 87.5%(주장 88%), yogiyo/coupangeats/baemin
  0%(주장과 일치)
- `needs_review` export 내 0건 — 일치
- `is_stale_sweep` 함수 `tracker/export_data.py:165` 실존
- `dcd0420` 커밋 실존 확인
- 총 레코드 수만 166(로컬) vs 문서 170 — PR 작성 이후 커밋 몇 개 더
  얹힌 시점 오차, 내용 오류 아님

### 지적사항 (CodeRabbit, 2026-08-13)
- [x] `is_stale_sweep`가 전수 수집이 성립하는 4개 플랫폼(배민·쿠팡이츠·
  요기요·땡겨요)에만 적용된다는 걸 명시해야 한다 — `docs/ORCHESTRATION.md`
  §4, `tracker/docs/ORCHESTRATION-CONTRACT.md` §1·§5 세 군데 다.

### 반영
- `487936f` — `tracker/docs/ORCHESTRATION-CONTRACT.md` §1에 4개 플랫폼
  한정 명시 (지적사항 중 §1분)
- `a29d1f5` — `docs/ORCHESTRATION.md` §4, `ORCHESTRATION-CONTRACT.md`
  §5에 같은 내용 추가 (나머지 두 군데)

### 남은 일
- CodeRabbit이 `a29d1f5` 재리뷰를 rate limit으로 못 돌렸다 — 지적사항은
  내용상 이미 다 반영·검증했다고 판단해 재리뷰 없이 머지(squash,
  브랜치 삭제).
- (참고) tracker 저장소 자체의 `docs/ORCHESTRATION-CONTRACT.md`는 아직
  이 PR의 새 내용을 안 담고 있다 — 이 PR은 모노레포 쪽만 고쳤다.
  ADR-018(원본 레포가 작업 사본)상 원래는 tracker에서 먼저 고치고
  미러해야 하는데, 이번엔 반대로 갔다. 별도로 tracker 쪽에도 같은
  수정을 넣을지는 미정.

---

## #2 — feat: 프로젝트 구조 문서 자동 생성과 CI 검사 추가

- 링크: https://github.com/woowacourse-teams/2026-to-discount/pull/2
- 작성자: miniminjae92
- 상태: 리뷰완료, 반영대기(테스트 추가 요청, 코멘트 게시)

### 배경
`docs/PROJECT-STRUCTURE.md`를 `git ls-files` 기반으로 자동 생성하고
`--check` 모드로 CI(`check-project-structure.yml`)에서 검증. ADR-001(문서가
stale인 걸 아무도 몰랐던 사고)이 동기.

### 규모
`scripts/generate_project_structure.py`(436줄, 신규) +
`.github/workflows/check-project-structure.yml`(30줄, 신규) +
`docs/PROJECT-STRUCTURE.md`(208줄, 자동생성 산출물) + `README.md` 1줄.

### 작성자가 리뷰에서 직접 남긴 질문
- 엔드포인트 가드의 false-positive 위험(매핑 아닌 애노테이션도 잡을 수
  있음)
- `API_RESPONSIBILITIES` 등 설명 상수를 누가 소유·유지하는지
- path filter를 제거한 근거(보안 함의 있음에도)
- CI를 self-hosted 대신 `ubuntu-latest`로만 돌리는 이유 — 외부 PR이
  배포 권한 있는 러너에 접근하지 못하게 하려는 의도로 보임, 타당해 보임

### CodeRabbit
- PR 작성 시점(2026-08-13) 기준 OSS 리뷰 한도 걸려 자동 리뷰 없음. 재확인
  시점(2026-08-14)에도 여전히 rate limited — 이번 PR은 CodeRabbit 없이
  직접 검증으로 갔다.

### 검증 (2026-08-14, 로컬에서 직접 실행)
- `python scripts/generate_project_structure.py`를 현재 main 기준 실행
  — 예외 없이 통과. 재생성 diff가 그 사이 새로 생긴 파일
  (`DiscountLadder.java`, `DiscountLadderTest.java`, `OfferRecordTest.java`,
  `test_ledger_consistency.py`)만 정확히 잡아냄 — 로직 정상.
- 엔드포인트 정규식(`@(Get|Post|Put|Delete|Patch)Mapping\("..."\)` 단일
  문자열 형태만 매칭)을 api 컨트롤러 7개(`EventController`,
  `StatsController`, `BannerController`, `BrandController`,
  `TestDataController` 등) 전수 대조 — 전부 이 형태라 지금 시점
  false-positive 없음. 작성자 본인이 제기한 위험(질문 #1)이지만 현재
  코드베이스에선 실현 안 됨. 스타일이 바뀌면 `declared != parsed`로
  fail-fast 걸리게 짜여 있다.
- CI 워크플로(`check-project-structure.yml`) — `permissions: contents:
  read`, `persist-credentials: false`, `ubuntu-latest`(self-hosted 배포
  권한 러너 안 씀), path filter 없음(새 top-level 유닛·새 deploy-*.yml
  놓치는 구멍 방지 목적으로 의도적) — 전부 근거 있고 타당. 작성자 질문
  #3·#4 둘 다 보안 의식한 설계로 확인됨.
- CI check 자체도 `pass` 확인.

### 요청사항 (내가 남김, 2026-08-14)
- [ ] 생성기 스크립트(436줄, fail-fast 가드 3종: 미분류 top-level
  유닛 / 배포 워크플로 불일치 / 엔드포인트 매핑 수 불일치)에
  유닛테스트가 없다. 지금은 수동 실행으로만 확인되고 회귀로 못 잡힌다.
  각 가드가 실제로 raise하는 경로 하나씩만이라도 테스트 요청 —
  [코멘트](https://github.com/woowacourse-teams/2026-to-discount/pull/2#issuecomment-5291400355)

### 다음
- 테스트 반영 확인되면 머지. PR은 열어둔 채 대기, PR #4로 이동.

---

## #4 — feat: PostHog 이벤트 영속 outbox 전달 추가

- 링크: https://github.com/woowacourse-teams/2026-to-discount/pull/4
- 작성자: everypine
- 상태: 머지완료 (`f7031ba`, 2026-08-14)

### 규모
24개 파일, +1272줄. 커밋 2개(`a81acf39` 기능, `0f79ff5d` 문서). 핵심:
`AnalyticsEventService`(경계 조정) · `PostHogOutbox`(파일 기반 영속
큐, pending/dead-letter) · `PostHogForwardingWorker`(단일 스레드,
5회 재시도 1시간) · `PostHogEventMapper`(필드 매핑) · `PostHogClient`.
dev 트래픽·visitorId 없는 이벤트 전달 제외, ipHash 외부 미전달, 기본
비활성.

### CodeRabbit 지적 5건 — 직접 코드 대조 (2026-08-14)
- [x] ~~"EventController가 AnalyticsEventService를 안 거치고 EventLog를
  직접 부른다"~~ — **오탐.** `EventController`는 `AnalyticsEventService
  events` 필드를 주입받아 `events.append(accepted)`로 호출하고, 그 안에서
  `eventLog.append()` → outbox enqueue → `worker.trigger()` 순서로
  이어진다(`AnalyticsEventService.java` 32-48행 직접 읽음). EventLog를
  우회하는 경로 없음. CodeRabbit이 리네임 전 코드나 다른 리비전을 보고
  낸 판단으로 보인다 — PR 코멘트에 반영 불필요라고 명시했다.
- [x] resend 중복제거 문서·구현 불일치 — `IncomingEvent`에 `eventId`
  없음, 서버가 요청마다 새 UUID 발급(`EventController.java`
  `UUID.randomUUID().toString()`). 재전송 시 PostHog에 중복 이벤트
  가능. **유효 → 반영됨(`012865b`).**
- [x] `PostHogEventMapper.timestamp()`가 `clientTs`를 `ts`보다 우선
  — 문서 계약(`ts` → PostHog `timestamp`)과 어긋남. 코드 직접
  확인(`PostHogEventMapper.java` `timestamp()` 메서드, clientTs 먼저
  파싱 시도). **유효 → 반영됨(`012865b`).**
- [x] `PostHogProperties` — forwarding 활성화 상태에서
  `DISCOUNT_POSTHOG_OUTBOX_PATH` 미설정 시 상대경로
  `data/posthog-outbox`로 조용히 폴백(`@Value(...:data/posthog-outbox)`
  확인). 재시작 시 pending 유실 위험. **유효 → 반영됨(`012865b`).**
- [ ] (nitpick) `PostHogForwardingWorker.trigger()`가 요청마다 단일
  스레드 executor(`Executors.newSingleThreadExecutor`, 무제한 큐)에
  스캔을 큐잉 — `processDue()`가 while(true)로 다 비우므로 데이터
  유실은 없지만 버스트 시 중복 스캔 낭비. 급하지 않아 머지 보류
  사유로 안 삼음, 미반영 상태로 머지.

### 요청사항 (내가 남김, [코멘트](https://github.com/woowacourse-teams/2026-to-discount/pull/4#issuecomment-5291486746))
- resend 중복제거, 타임스탬프 우선순위, outbox 경로 강제 — 3건 반영
  요청. 반영되면 재검토.

### 재검증 (2026-08-14, 새 커밋 `012865b`)
- 3건 diff 직접 대조 — 전부 정확히 반영 확인(위 체크박스).
- CodeRabbit이 재리뷰를 안 돌렸다(코멘트 5개 그대로, 새 코멘트 없음) —
  기다리지 않고 직접 검증으로 대체.
- `git checkout FETCH_HEAD`(PR 브랜치 전체)로 옮겨 로컬에서
  `./gradlew test --tests "com.discounttracker.analytics.*"` 직접 실행,
  통과 확인(EXIT=0). 검증 직후 `git checkout main`으로 복귀.
- [코멘트](https://github.com/woowacourse-teams/2026-to-discount/pull/4#issuecomment-5294399125)로 반영 확인 남기고 머지(squash, 브랜치 삭제).

### 다음
- 없음. 머지 완료.

---

## 사고 기록 — 2026-08-14, PR#2 검증 파일이 main에 직접 커밋됨

PR#2를 로컬에서 실행 검증하려고 `git checkout pr-2 -- <path>`로 스크립트
3개(`scripts/generate_project_structure.py`,
`.github/workflows/check-project-structure.yml`,
`docs/PROJECT-STRUCTURE.md`)를 워킹트리에 꺼냈다. 검증이 끝난 뒤 되돌리지
않은 채로 이어서 "PR#2 리뷰 로그" 커밋을 만들었는데, 그 커밋이
`docs/PR-REVIEW-LOG.md`만이 아니라 워킹트리에 남아 있던 그 3개 파일까지
같이 담아 **main에 직접 push됐다**(`74d9632`). PR#2는 아직 유닛테스트
보강을 요청해둔 상태라 리뷰 프로세스를 거치지 않은 코드가 main에 들어간
것.

CI(`Check Project Structure`)가 그 커밋에서 즉시 실패했다 — 커밋된
`docs/PROJECT-STRUCTURE.md`가 PR#2 작성 시점 기준으로 생성된 것이라 그
사이 main에 들어간 다른 변경(PR#1 등)과 맞지 않았다.

**조치**: 3개 파일을 `git rm --cached` + 삭제로 되돌리고 `5f3ca27`로
push. 되돌리는 커밋이 워크플로 정의 파일 자체를 지웠기 때문에
`Check Project Structure`는 그 커밋에서 아예 실행되지 않았다(트리거
평가가 그 커밋 시점의 워크플로 파일 존재 여부를 따름) — 별도 조치
없이 실패한 체크가 사라진 상태로 정리됨. self-hosted 배포 워크플로
(`Deploy Data`, `Build and Deploy API`)는 이 사고가 건드린 경로와
무관해 애초에 실행되지 않았다 — 실서버엔 영향 없음.

**재발 방지**: 위 "작업 규칙" 절 신설(검증 직후 원상복구, 커밋 전
`git status` 확인, push 후 CI 확인).

---

## 사고 기록 — 2026-08-14, PR#4 머지 직후 프로덕션 API 다운

PR#4(PostHog outbox)를 머지(`f7031ba`)하자 `Build and Deploy API` 워크플로가
자동 트리거됐고, 배포 뒤 헬스체크(`curl localhost:8088/api/brands`)가
실패했다.

**원인**: 서버 `/etc/delivery-discount-api.env`에 이미
`DISCOUNT_POSTHOG_ENABLED=true`와 `POSTHOG_PROJECT_TOKEN`이 설정돼
있었다(테스트 흔적이 아니라 실제로 기능을 켤 준비를 해둔 상태) — 그런데
`DISCOUNT_POSTHOG_OUTBOX_PATH`는 없었다. 이번 PR에서 반영한 요청사항
중 하나가 정확히 "forwarding 활성화 상태에서 경로 없으면 기동 실패"
가드였고, 그게 의도대로 작동해 서버가 crash loop에 들어갔다
(`PostHogProperties` 생성자에서 `IllegalStateException`).

리뷰 시점에 로컬 테스트로는 이 경로를 못 잡는다 — 유닛테스트는 이
가드가 "정상적으로 예외를 던지는지"만 확인하지, 실제 배포 환경에 이미
`enabled=true`가 설정돼 있었는지는 코드 리뷰만으론 알 수 없다.

**조치**: SSH로 서버 접속, env 파일에
`DISCOUNT_POSTHOG_OUTBOX_PATH=/home/ubuntu/delivery-discount-api/data/posthog-outbox`
추가 후 `systemctl restart delivery-discount-api`. `active` 상태 및
`/api/brands` 200 확인, `/api/events`로 실제 이벤트 전송해 outbox
`pending`/`dead-letter` 디렉토리가 정상 생성되는 것까지 확인. 기능을
끄는 대신 애초 의도(PostHog 실제로 켜기)대로 경로를 채워 살렸다.

**재발 방지 — PR 요청사항에 배포 설정이 얽혀 있으면**: "환경변수/설정
필수화" 류의 가드를 요청하거나 반영 확인할 때는, 머지 전에 실제
배포 환경(서버 env 파일)에 그 설정이 이미 켜져 있는지 먼저 확인한다.
이번엔 서버 상태를 확인하지 않고 코드 diff와 로컬 테스트만으로
"반영 확인, 머지 진행"이라고 판단했다 — 그게 이 사고의 진짜 원인이다.

---

## tracker#2 — docs: 원장 재생성 금지 경고를 해소 기록으로 전환 (머지 2026-08-16)

레포: `nn98/delivery-discount-tracker`. 문서 2개, +46/-19, 코드 변경 없음.

### 검증 (본문 수치를 믿지 않고 다시 뽑음)

- §1 "재생성이 원장만으로 완결된다" — main에서 `python export_data.py` 실행 후
  `git status` 깨끗함(바이트 불변). 참.
- §5 수치 전부 일치: 만료일 보유율 ddangyo 88%(35/40) / baemin 0%(0/74) /
  coupangeats 0%(0/30) / yogiyo 0%(0/22), 종료일 없는 오퍼 131건,
  `needs_review` 원장 39·대표 14·export 0.

### 지적 (전부 non-blocker)

1. §6 수치가 머지 시점에 이미 밀려 있었다(문서 170건, 실제 166건). 날짜가
   박혀 있어 거짓은 아니지만 **이 PR이 고치는 문제가 같은 방식으로 재발할
   자리**다.
2. 범위 밖 변경 1건 — README 표기 수정(`·` → `,`). 되돌릴 만큼은 아니라 두되
   다음부터 분리 요청.
3. 머지 직후 ADR-020(전수 수집 기록)으로 §1의 전제가 갱신 대상이 됨.

### 후속 (같은 날, `c440cb9`)

- `contract_numbers.py` 신설. §6이 그 명령을 가리킨다 — 세는 방법이 문서 밖에
  있으면 수치는 계속 낡는다. 1번 지적을 문서 수정이 아니라 **재발 구조 제거**로
  닫았다.
- §1에 "재생성 입력은 원장 한 파일이 아니라 원장 + `data/sweeps.jsonl` 두
  파일"을 명시(ADR-020).
- §5·§6 수치를 오늘자로 갱신(export 160건, 종료일 없는 오퍼 110건,
  yogiyo 94%, `needs_review` 원장 43).

## tracker#1 — data: 원장 363행 증거 상태 전수 확정 (리베이스 요청, 열린 채)

내용 리뷰 전에 상태 지적. base `2d71c60`, 그 뒤 main이 크게 이동해 4파일 충돌
(`data/log.jsonl`, `docs/decisions/README.md`, `schema.py`,
`tests/test_schema.py`).

- **ADR 번호 충돌** — PR의 ADR-019/020이 main에서 먼저 나갔다(cumulative tiers /
  sweep 기록). ADR-021·022로 재배정 요청. 특히 PR의 ADR-020과 main의 ADR-020이
  같은 사고를 다루면서 반대 결론처럼 읽힐 수 있어 상호 참조를 걸도록 요청.
- **원장 363 → 466행** — PR이 180행 재작성 + 76행 필드 추가를 하는데, 그 사이
  들어간 작업(cap 분리, cumulative 전환, 요기요 전수 수집, conditions 정리)이
  행 단위로 풀면 조용히 되돌아간다. 원장은 append-only라 **되돌아간 게 테스트로도
  안 잡힌다.** 손으로 풀지 말고 최신 원장을 입력으로 재적용 스크립트를 다시
  돌리도록 요청.

### 작업 규칙에 더함

- **PR 본문의 수치는 인용하지 말고 재측정한다.** tracker#2는 본문 수치가 전부
  맞았지만 §6은 머지 시점에 이미 틀려 있었다. 재측정 없이 승인했으면 낡은 수치를
  "검증됨"으로 승격시킬 뻔했다.
- **문서의 수치를 고칠 때는 그 수치를 뽑은 명령을 같이 남긴다.** 안 남기면 다음
  사람이 다시 셀 수 없고, 문서는 반드시 다시 낡는다.

## mono#2 — feat: 프로젝트 구조 문서 자동 생성과 CI 검사 (머지 2026-08-16, `6404429`)

08-13 리뷰에서 로직·보안 검증 후 **생성기 유닛테스트 부재**만 남겨두고 열어뒀던
PR. 이틀간 반영이 없었고 그 사이 main이 24커밋 움직여, 테스트를 리뷰어가 후속
커밋(`77e7a05`)으로 붙이고 머지했다.

### 머지 전 검증 — `--check`가 실제로 드리프트를 잡는가

main과 브랜치를 합친 트리에서 `--check`를 돌려 **실패를 확인**했다. 재생성하니
그 사이 들어온 PostHog 8클래스 + 테스트 5개, `DiscountLadder`, tracker의
`record_sweep.py`·`contract_numbers.py`·`test_ledger_consistency.py`가 전부
잡히고 집계도 tracker 18 → 21로 움직였다. 설계대로 동작한다.

**문서 재생성을 머지 커밋에 같이 넣었다.** 따로 넣었으면 main CI가 한 번
빨개진다. 머지 후 CI 통과 확인(12초, success).

### 붙인 테스트 7개

가드 셋(미분류 최상위 실행 단위 / 배포 그림에 없는 `deploy-*.yml` / 정규식이
놓친 매핑 어노테이션)마다 raise 경로 하나씩 + `--check`가 기대는 결정론(정렬
무관, 파일 교체 감지). 가드가 순수 함수라 `git` 없이 합성 경로로 돌아간다.

**워크플로가 `--check`보다 먼저 이 테스트를 돌리게 했다.** 가드가 조용히 죽으면
`--check`는 통과하면서 문서만 틀린다 — ADR-001이 기록한 사고와 같은 모양이다.

### 저자 질문 4건에 대한 답 (코멘트에 상세)

오탐 가드 유지 / 설명 상수 위치 유지 / `paths` 필터 제거 유지(잡 12초) /
`ubuntu-latest` 고정 유지 — 마지막이 제일 중요하다. self-hosted 러너는
`sudo systemctl restart` 권한을 갖고 있어 `pull_request`를 연결하면 외부 PR
코드가 운영에서 실행된다.

### 알아둘 성질

서명이 전체 경로 목록이라, **main이 움직이면 열려 있는 모든 PR의 문서가 낡는다.**
미탐을 없애는 근거가 곧 오래 열어두기 어려워지는 이유다. 문서 검사가 PR 회전율을
강제한다 — 나쁜 성질은 아니다.

### 작업 규칙에 더함

- **리뷰 요청이 이틀 이상 방치되고 base가 크게 밀리면, 요청 사항을 리뷰어가
  후속 커밋으로 처리하고 머지한다.** 더 두면 리베이스 비용만 커진다.
- **생성물을 검사하는 CI가 있는 저장소에서는, 머지 커밋에 생성물 재생성을 같이
  넣는다.** 나눠 넣으면 main이 반드시 한 번 빨개진다.
