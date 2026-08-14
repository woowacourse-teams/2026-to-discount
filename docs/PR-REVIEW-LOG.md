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
