# mono에서 일하기 전에

배달앱 할인 비교 서비스의 서버(`api/`)와 웹(`web/`)이다. 할인 수집기와 원장은 이 저장소에 없다. 저장소 관계와 일의 종류별 길은 [`docs/WORKFLOW.md`](docs/WORKFLOW.md)에 있다.

## 먼저 알 것

"없다", "0", "통과"를 출력할 때 그것이 관측인지 미관측인지 구분되지 않는다. 수집과 표시는 틀린 값을 내기보다 값을 조용히 잃는다.

1. 부재를 주장하기 전에 제대로 봤다는 양성 신호를 증명한다.
2. 문구가 아니라 구조로 짚는다. 앱 문구는 바뀐다.
3. 결론은 테스트로 박는다. 되돌림을 실제로 막은 것은 전부 테스트였다.

## 고치기 전에: 어디까지 번지나

[`docs/CHANGE-PROPAGATION.md`](docs/CHANGE-PROPAGATION.md)에서 고칠 자리가 어느 묶음에 있는지 찾는다. 있으면 같은 묶음의 나머지를 이번 작업에 넣을지, 왜 안 넣어도 되는지 말하고 시작한다. 한 묶음의 절반만 고친 변경은 고친 쪽 테스트가 초록이어도 운영에서 깨졌다.

## 웹은 프리뷰 먼저, 승인 뒤 main

main에 직접 커밋하지 않는다. 브랜치, 360px 스크린샷, mono `preview/<이름>` 브랜치 push(CI가 미러로 옮겨 프리뷰를 띄운다), 승인, 머지 순서다. 절차는 [`docs/WORKFLOW.md`](docs/WORKFLOW.md) §3-3.

## 점검과 새 파일

- 확인 명령은 [`docs/WORKFLOW.md`](docs/WORKFLOW.md) §5. `git config core.hooksPath scripts/githooks`로 구조 문서 검사를 push 전에 자동으로 돌린다.
- `web/src/*.test.js`를 새로 만들면 `web/package.json`의 `test` 명령에 넣는다. 안 넣으면 안 돌고, 안 도는 줄도 모른다.
- 비밀값은 코드와 커밋에 값으로 적지 않는다. CI(`secret-scan`)가 작업 트리를 검사한다.
