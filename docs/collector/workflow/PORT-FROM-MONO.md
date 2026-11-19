<!-- 원본: tracker docs/workflow/PORT-FROM-MONO.md — 여기서 고치지 않는다 -->
# 개발 워크플로 이식 메모 (2026-10-22)

> **2026-10-22 정본화:** 아래 이식 내용은 정본 하나로 합쳤다. 워크플로 본문은 mono `.github/workflows/wf-*.yml`(재사용 워크플로) 한 곳에 있다. 이 저장소의 `design-session.yml` 등은 언제 부를지와 이 저장소 설정(설계 문서 위치, 영역 라벨과 구현자, mono·beggars-ops 테스트 체크아웃)만 담는다. 두 저장소 모두 세션은 커밋만 하고 워크플로가 App 토큰으로 push한다. PR 본문 스킬 정본은 mono `.claude/skills/pr-body-ko/`다. 고칠 때는 mono PR 하나로 두 저장소가 함께 바뀐다(tracker는 mono main을 부른다).

mono 설계 119(이슈에서 병합까지 개발 워크플로 자동화)의 워크플로를 이 저장소로 옮기며 그대로 둔 것과 바꾼 것을 적는다. 원본은 mono main의 워크플로와 `feat/119-review-reflect` 브랜치(PR #135)의 `reflect-session.yml`, `implement-session.yml`, `result-comment.yml`이다. 설계에서 바뀐 이유는 mono `docs/design/119-dev-workflow-asbuilt.md`, 시행착오는 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)에 있다. 여기서는 이식에서 생긴 차이만 다룬다.

## 그대로 가져온 것

- 사람 관문 셋: `ready` 라벨, `/approve-design`(이슈 댓글), `/approve`(PR 댓글). 권한자(admin, write)만 받는다.
- 세션 입력 파일에는 OWNER, MEMBER, COLLABORATOR 댓글만 넣는다.
- 결과물은 워크플로가 확인한다(브랜치, PR, 새 커밋, `인계:`/`반영:` 댓글). 세션의 성공 보고를 믿지 않는다.
- 허용 도구는 명령 단위.
- 전체 출력은 끄고 거부된 도구와 턴 수만 남긴다.
- 셸 격리 설정(`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, bubblewrap)은 쓰지 않는다.
- 구현 push와 병합은 같은 GitHub App(`2026-to-discount`, 시크릿 `WF_APP_ID`, `WF_APP_PRIVATE_KEY`)의 토큰으로 한다. 요약 세션은 `allowed_bots`로 이 App만 허용한다.
- 턴 상한: 설계 50, 구현 80, 반영 30, 요약 20. 반영은 최대 2회.
- 실패하면 이슈에 `blocked`와 실패 단계 댓글. 자동 재시도 없음.
- 액션 SHA: Claude, checkout, App 토큰, upload-artifact는 mono와 같은 커밋 SHA. `setup-python`은 mono에 SHA가 없어 `tests.yml`과 같은 `@v5` 태그.
- `approve-merge.yml`은 머리 주석만 바꿨다.

## 바꾼 것

| 무엇 | mono | tracker | 이유 |
| --- | --- | --- | --- |
| 영역 라벨 | `web`, `api`, `collect` | `export`, `collect` | tracker 일은 폰이 필요한지로 갈린다. `export`는 내보내기, 판정기, 테스트, 스크립트 |
| 구현자 | web, api 구현자 | `export-implementer` 하나 | `collect`는 "폰이 필요해 로컬 러너 몫(설계 119 4단계)" 댓글만 달고 끝낸다. 구현과 반영 둘 다 |
| 테스트 | `npm`, `./gradlew` | `Bash(python -m pytest:*)` | 앞에 `tests.yml`과 같은 준비(mono를 `mono/`에, 토큰이 있으면 beggars-ops를 `beggars-ops/`에, python 3.12, `pip install -r requirements.txt pytest`) |
| beggars-ops 토큰 | 없음 | 있는지만 단계 출력으로 넘김 | 시크릿은 `if`에 못 쓴다. 잡(job) 환경에 넣으면 세션 환경까지 들어가므로 체크아웃 단계에만 준다 |
| `beggars-ops/` | 없음 | `.git/info/exclude`에 추가 | `.gitignore`에 없어 세션이 `git add`로 담을 수 있다. `mono/`는 이미 `.gitignore`에 있다 |
| 설계 문서 자리 | `docs/design/<번호>-*.md` | `docs/specs/issue-<번호>-*.md` | tracker 설계는 `docs/specs/`에 있다. 날짜 이름 문서와 섞이지 않게 `issue-` 접두사 |
| 설계 세션 체크아웃 | 저장소 하나 | mono도 `mono/`에 | 설계자가 `mono/docs/CHANGE-PROPAGATION.md`로 폭발 반경을 잰다(`AGENTS.md` "손대기 전에") |
| 설계 브랜치 찾기 | 체크아웃 전 `git ls-remote <공개 주소>` | `gh api .../git/matching-refs` | 비공개 저장소는 인증 없는 `ls-remote`가 실패한다 |
| 구현 결과 보관 | `web/src/`, `api/src/` 디렉터리 | `git format-patch` 패치와 커밋 안 된 diff | tracker 코드는 루트와 여러 폴더에 흩어져 있다. 패치는 push 실패 때 그대로 다시 적용된다 |
| 결과 댓글 | 프리뷰, 360px 스크린샷, 성능 점수 줄, 쓰이지 않는 `workflow_call` | 검사 표와 남은 리뷰 지적만 | 웹 전용 줄이다. `workflow_call`은 asbuilt "남은 것"에서 아무도 안 부른다고 확인됨. Actions 검사 요약에는 pytest 수가 없어 테스트 수 grep도 뺐고 로그를 가리키는 한 줄로 바꿨다 |
| 요약 검사 | 공개 금지 패턴(서버 경로, 비밀 파일 이름 등)과 키 모양 문자열 | 키 모양 문자열만 | 비공개 저장소라 경로가 남아도 공개되지 않는다. 비밀값은 비공개여도 안 된다(하네스 `rules/secrets.md`). GitHub 토큰 접두사와 Slack 토큰을 더했다 |
| push와 PR 생성 | 세션이 `Bash(git push:*)`, `gh pr create`로 직접. main은 저장소 규칙이 막음 | 세션은 커밋만. 세션 뒤 워크플로 단계가 push하고 설계 초안 PR을 염. 설계는 브랜치 이름이 `^feat/<이슈번호>-[a-z0-9-]+$`일 때만, 구현과 반영은 checkout한 feat 브랜치로만 `HEAD:refs/heads/<브랜치>` push. 새 커밋이 없으면 push를 건너뛰고 결과물 확인이 실패를 잡음. 설계 세션도 App 토큰으로 checkout | tracker는 무료 요금제 개인 비공개 저장소라 저장소 규칙과 브랜치 보호를 쓸 수 없음(API 403 "Upgrade to GitHub Pro"). main을 막는 장치가 없으니 세션에서 push 자체를 뺌 |
| `.claude/` 추적 | `.claude/agents/`만 추적 | 그대로 | tracker `.gitignore`는 `.claude/`를 무시하지 않는다(`.claude/settings.json`이 이미 추적 중) |

## 역할 규칙에 넣은 tracker 사실

값은 정본에 두고 역할 파일은 가리키기만 한다.

- `AGENTS.md` "먼저 알 것": 값을 조용히 잃는다, 부재는 양성 신호로 증명한다, 결론은 테스트로 박는다. 설계자, 구현자, 리뷰어에 넣었다.
- 원장 append-only(`AGENTS.md` "이 저장소의 규칙", `ingest.py` 머리말). 구현자는 원장을 고치지 않는다.
- 예약 수집 시각 회피([`ROUTINE-SPEC.md`](../setup/ROUTINE-SPEC.md)). 클라우드 구현자는 폰을 잡지 않는다. 예약 수집이 부르는 코드를 고쳤으면 로컬 단계 시험이 필요하다고 인계 댓글에 적는다.
- 그 밖의 로컬 규칙은 [`LOCAL-RULES.md`](LOCAL-RULES.md)가 정본이다.

## 아직 안 한 것

- 시크릿 셋(`CLAUDE_CODE_OAUTH_TOKEN`, `WF_APP_ID`, `WF_APP_PRIVATE_KEY`) 등록과 App의 이 저장소 설치. 그 전에는 세션 워크플로가 인증에서 실패한다.
- 실제 이슈로 한 바퀴 돌리기. YAML 문법만 확인했다.
- `collect` 로컬 러너(설계 119 4단계).
