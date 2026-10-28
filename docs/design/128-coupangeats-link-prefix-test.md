# 128. 쿠팡이츠 허브 링크 형식 테스트 추가

추적 이슈: [#128](https://github.com/woowacourse-teams/2026-to-discount/issues/128)

## 결론

`web/src/offerLink.test.js`에 테스트 하나를 더한다. `COUPANGEATS_LINK`가 `https://share.coupangeats.com/`으로 시작하는지 본다. 코드, 화면 문구, 동작은 바꾸지 않는다.

이 이슈는 설계 119의 2단계(설계, `/approve-design`, 구현, 검사)를 끝까지 시험하는 용도다. 변경은 일부러 작게 잡았다.

## 배경

`COUPANGEATS_LINK`(`web/src/offerLink.js:79`)는 쿠팡이츠 오퍼의 폴백 링크이자 허브 공유 링크다. 앱이 안 열릴 때 4초 뒤 이동하는 곳이고(`offerLink.js:141`), 배너 클릭에도 쓰인다(`EventBanner.jsx:126`). 상수가 주에 한 번 바뀌는데(최근 #124) 형식이 틀리게 바뀌어도 잡는 테스트가 없다.

현재 테스트(`offerLink.test.js:26-30`)는 `offerLink()`가 이 상수를 돌려주는지만 본다. 상수 자체가 맞는 값인지는 보지 않는다. 상수가 `''`나 오타여도 `assert.equal(x, COUPANGEATS_LINK)`는 통과한다.

## 변경

`web/src/offerLink.test.js` 끝에 추가한다. 기존 import에 `COUPANGEATS_LINK`가 이미 있어 import는 바꾸지 않는다.

```js
test('쿠팡이츠 허브 링크는 공유 링크 도메인으로 시작한다', () => {
  assert.ok(COUPANGEATS_LINK.startsWith('https://share.coupangeats.com/'), `허브 링크 형식이 틀렸다: ${COUPANGEATS_LINK}`)
})
```

- 정확한 전체 값(`VzLO0IN8k7b`)은 박지 않는다. 링크는 주마다 바뀌므로 매번 테스트가 깨지고, 형식 검사라는 이슈 취지와도 다르다.
- 접두사 뒤에 경로가 하나 이상 있는지는 이번 범위가 아니다. 이슈가 정한 조건만 본다.
- 실패 메시지에 값을 넣는다. 비었는지, 오타인지 로그만 보고 안다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 이 자리를 찾았다.

- 1~7번 묶음에 `offerLink.js`와 `offerLink.test.js`는 없다.
- 8번의 웹 프리뷰 절차는 이 변경에 해당하지 않는다. 화면이 바뀌지 않는 테스트 전용 변경이다. 360px 스크린샷과 `preview/` push 대상이 아니라고 판단했다. 구현자 PR에서 이 판단을 한 줄로 적는다.
- 9번 "새 파일": 새 `*.test.js`를 만들지 않고 기존 파일에 더한다. `web/package.json`의 `test`는 `scripts/run-node-tests.mjs`가 돌리는 기존 파일이라 수정하지 않는다. 구현자는 새 테스트 이름이 실행 출력에 나오는지 확인한다.
- 결론: 묶음이 없어 같이 고칠 자리가 없다.

## 구현자에게

- 만지는 경로는 `web/src/offerLink.test.js` 하나다. 웹 구현자 역할이다. API 변경은 없다.
- 테스트가 실제로 보는지 증명한다. `COUPANGEATS_LINK`를 임시로 `'http://x'`로 바꿔 새 테스트가 실패하는 것을 한 번 보고 되돌린다. 되돌린 뒤 `offerLink.js`에 diff가 없어야 한다.
- 문구를 새로 정하지 않는다. 화면에 나가는 글자가 없다.

## 검증

- `cd web && npm test`가 통과한다. 새 테스트 이름이 출력에 보인다.
- `git diff --stat`에 `web/src/offerLink.test.js`만 나온다.
- 위 임시 변경에서 새 테스트만 실패한다.

## 열린 질문

없음.
