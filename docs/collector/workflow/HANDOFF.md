<!-- 원본: tracker docs/workflow/HANDOFF.md — 여기서 고치지 않는다 -->
# 개발 워크플로 인계 (2026-10-22)

이슈에서 병합까지 자동 흐름(mono 설계 119)을 이어받는 로컬 세션용이다. **흐름의 정본은 mono `docs/design/119-dev-workflow-asbuilt.md` "지금 상태"**(단계표, 사람 관문, 저장소별 설정)다. 이 폴더에는 tracker와 이 PC에만 있는 것을 둔다.

| 문서 | 내용 |
| --- | --- |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | 막힌 것과 대응, 안전 가드에 막혔을 때 |
| [`PUSH-IDENTITY.md`](PUSH-IDENTITY.md) | push 신분, 토큰, 검사가 붙는 규칙 |
| [`LOCAL-RULES.md`](LOCAL-RULES.md) | 로컬 세션 규칙 |
| [`PORT-FROM-MONO.md`](PORT-FROM-MONO.md) | 이식 기록(정본화 전) |
| [`CANDIDATES.md`](CANDIDATES.md) | 하네스로 올릴 후보 |

## 지금 상태

- 워크플로 본문은 mono `.github/workflows/wf-*.yml` 한 곳. 이 저장소 `.github/workflows/*-session.yml` 등은 언제 부를지와 설정만 둔다. 고칠 때는 mono PR 하나.
- 구현은 로컬 우선. 예약 작업 `beggars-local-implement`가 1분마다 창 없이 `scripts/local_implement.py poll`을 돌려 tracker(`export`)와 mono(`web`, `api`) 이슈의 첫 줄 `/approve-design`을 잡는다. 잡으면 `local` 라벨과 Windows Terminal 대화형 세션. 사람이 지켜보고, 세션이 인계 댓글을 남기면 `/exit`로 닫는다. 닫으면 스크립트가 push하고 PR 초안을 푼다. 기록은 `logs/local_implement.log`(`{key} #{n}` 머리. 창 제목은 `구현 {key} #{n}`. 종료 줄 `종료: 코드 N`). push 전에 원격을 합치고(충돌이면 중단하고 이슈 댓글), 실패는 `종료: 코드 1, <사유>`로 남는다.
- 첫 실전 2026-10-22: tracker #22(PR #23), mono #141(PR #143). 로컬이 맡고 클라우드가 물러났다.

## 시험과 재실행

- 각 단계 실행은 `gh run list -R <저장소> --workflow <파일>`. 실패하면 "거부된 도구와 턴 수" 단계부터 본다.
- 재실행: 이슈의 `blocked`를 떼고 트리거를 다시 단다. 설계는 `ready`를 뗐다 다시, 구현은 `/approve-design`을 새 댓글로(로컬이 맡았던 이슈면 `local`도 뗀다).
- 승인 댓글은 고치지 말고 새로 단다(고친 댓글은 안 돈다).
- 설계에 넣을 결정은 mono 이슈에서는 본문에 `## 결정 (날짜)` 절로 적는다. 세션 입력은 `author_association`이 OWNER, MEMBER, COLLABORATOR인 댓글만 싣는데, mono #201, #203 재설계가 사용자 결정 댓글을 두 번 못 읽었다(2026-10-29). 조직 멤버십이 비공개라 워크플로 토큰에는 CONTRIBUTOR로 보이는 것으로 추정한다. 본문에 적자 반영됐다. tracker는 개인 저장소라 OWNER로 읽힌다.
- 로컬 구현이 도는 동안 같은 이슈의 설계를 다시 돌리지 않는다(`ready` 재부착). 설계 커밋이 먼저 push되면 구현 push가 거절되고 스크립트가 PR 갱신까지 건너뛴다(tracker #53, 고침은 #74).

## 사람이 해야 하는 것

자동 판정이 막는다. 명령을 넘기고 결과를 폴링한다.

- `/approve`(자기 승인), PR 병합.
- 저장소 설정, 시크릿 등록. 시크릿은 대화창 `!`로 넣지 않는다(빈 값이 저장된다).
- 워크플로의 권한, 허용 도구를 넓히는 커밋.
- 로컬 구현 창의 `/exit`.
- 예약 수집 시각(`ROUTINE-SPEC.md` §1) 앞뒤 15분에는 수집 PC에서 전체 pytest, 빌드, 수집 시험을 돌리지 않는다. 1단계 시간이 부하 겹침으로 늘면 회차 로그의 `최상위` 근거로 가른다(#141).

## 막는 자리 기준

새 문제는 먼저 `TROUBLESHOOTING.md`에 적는다. 워크플로 안에서 기계로 판정되면 워크플로 단계, 세션 습관이면 프롬프트, 저장소 설정이면 사람, 빈발·지속·충돌이면 하네스로 올린다.
