# 131. 쿠팡이츠 안내 문구 상수 비어 있지 않음 테스트 추가

추적 이슈: [#131](https://github.com/woowacourse-teams/2026-to-discount/issues/131)

## 결론

`web/src/offerLink.test.js`에 테스트 하나를 더한다. `COUPANGEATS_NOTICE`가 문자열이고 공백을 뺀 길이가 0보다 큰지 본다. 코드, 화면 문구, 동작은 바꾸지 않는다.

이 이슈는 설계 119 전체 흐름(설계, `/approve-design`, `/approve`, 요약, 이슈 닫기)을 시험하는 용도다. 변경은 일부러 작게 잡았다.

## 배경

`COUPANGEATS_NOTICE`(`web/src/offerLink.js:84`)는 쿠팡이츠 링크를 누르면 이동 전에 어두운 화면 위로 띄우는 안내 문구다(`offerLink.js:123`, `el.textContent = COUPANGEATS_NOTICE`). 이 상수가 `''`가 되면 사용자는 아무 설명 없이 빈 토스트를 보고 이동한다. 던지는 오류가 없어서 화면을 보기 전에는 모른다.

이 상수를 읽는 테스트는 지금 없다(`offerLink.test.js`는 import하지 않는다).

## 변경

`web/src/offerLink.test.js`에서 두 가지를 바꾼다.

1. 3행 import에 `COUPANGEATS_NOTICE`를 더한다.
2. 파일 끝에 테스트를 더한다.

```js
test('쿠팡이츠 안내 문구는 비어 있지 않다', () => {
  assert.equal(typeof COUPANGEATS_NOTICE, 'string')
  assert.ok(COUPANGEATS_NOTICE.trim().length > 0, '쿠팡이츠 안내 문구가 비었다')
})
```

- 이슈 요구는 "빈 문자열이 아닌지"다. 공백만 있는 값도 사용자에게는 빈 토스트라서 `trim()`을 거친다. 이 한 줄만 이슈 문장보다 조금 넓다.
- 문구 내용(`행사 페이지에서\n해당 브랜드를 클릭해주세요!`)은 박지 않는다. 문구는 사용자가 정하고 바뀐다(`docs/COPY-STYLE.md`, 묶음 6번). 내용을 박으면 문구를 고칠 때마다 테스트가 깨진다.
- `COUPANGEATS_HINT`는 이번 범위가 아니다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 이 자리를 찾았다.

- 1~5, 7번 묶음에 `offerLink.js`와 `offerLink.test.js`는 없다.
- 6번(화면에 나가는 글자)은 문구를 새로 정하거나 바꿀 때 해당한다. 이번엔 문구를 만들지도 바꾸지도 않는다. 테스트는 값이 비었는지만 보므로 해당하지 않는다고 판단했다.
- 8번의 웹 프리뷰 절차는 화면이 바뀌지 않는 테스트 전용 변경이라 적용하지 않는다. 360px 스크린샷과 `preview/` push 대상이 아니다. 구현자 PR에서 이 판단을 한 줄로 적는다.
- 9번 "새 파일": 새 `*.test.js`를 만들지 않고 기존 파일에 더한다. `web/package.json`의 `test`는 수정하지 않는다. 구현자는 새 테스트 이름이 실행 출력에 나오는지 확인한다.
- 결론: 같이 고칠 자리가 없다.

## 구현자에게

- 만지는 경로는 `web/src/offerLink.test.js` 하나다. 웹 구현자 역할이다. API 변경은 없다.
- 테스트가 실제로 보는지 증명한다. `COUPANGEATS_NOTICE`를 임시로 `''`로 바꿔 새 테스트가 실패하는 것을 한 번 보고 되돌린다. 되돌린 뒤 `offerLink.js`에 diff가 없어야 한다.
- 문구를 새로 정하지 않는다. 화면에 나가는 글자가 없다.

## 검증

- `cd web && npm test`가 통과한다. 새 테스트 이름이 출력에 보인다.
- `git diff --stat`에 `web/src/offerLink.test.js`만 나온다.
- 위 임시 변경에서 새 테스트만 실패한다.

## 열린 질문

없음.
