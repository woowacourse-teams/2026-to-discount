# 133. 쿠팡이츠가 아닌 https 링크는 허브 링크로 바뀌지 않음 테스트 추가

추적 이슈: [#133](https://github.com/woowacourse-teams/2026-to-discount/issues/133)

## 결론

`web/src/offerLink.test.js`에 테스트 하나를 더한다. 쿠팡이츠가 아닌 플랫폼의 https 링크를 `offerLink`에 넣으면 `COUPANGEATS_LINK`가 아니라 오퍼 자신의 링크가 그대로 나오는지 본다. 코드, 화면 문구, 동작은 바꾸지 않는다.

이 이슈는 설계 119 전체 흐름(설계, 승인, 구현, 요약 단계의 `allowed_bots` 수정 확인, 이슈 닫기)을 재시험하는 용도다. 변경은 일부러 작게 잡았다.

## 배경

쿠팡이츠 분기는 `offerLink`(`web/src/offerLink.js:172`) 첫 줄에 있다. `offer.platform === 'coupangeats'`일 때만 `COUPANGEATS_LINK`(`offerLink.js:79`)나 앱 링크를 돌려주고, 그 밖의 플랫폼은 `offer.link`를 먼저 돌려준다. 이 분기 조건이 넓어지거나 순서가 바뀌어 다른 플랫폼 링크가 쿠팡이츠 허브로 새면, 던지는 오류 없이 다른 앱 카드가 쿠팡이츠로 이동한다.

현재 테스트는 쿠팡이츠 쪽(`offerLink.test.js` 26~30행)과 일반 오퍼 링크 우선(5~8행, `https://a`)을 본다. 그러나 "쿠팡이츠가 아닌 https 링크가 허브로 바뀌지 않는다"를 허브 상수와 견줘 직접 못 박은 테스트는 없다.

이슈 배경 문장은 `openWithNotice`의 기본 이동을 말하지만, 요구사항이 지목한 검증 대상은 `offerLink`의 반환값이다. `openWithNotice`는 DOM(`document`, `window`)을 쓰므로 node 테스트에서 다루지 않고, 요구사항대로 `offerLink`만 본다. `openWithNotice`의 링크 판별은 `offerLink`가 돌려준 값 위에서 일어나므로 이 테스트가 그 입력 쪽을 지킨다.

## 변경

`web/src/offerLink.test.js` 파일 끝에 테스트를 더한다. import는 이미 `offerLink`, `COUPANGEATS_LINK`를 가져오므로 바꾸지 않는다.

```js
test('쿠팡이츠가 아닌 https 링크는 허브 링크로 바뀌지 않고 그대로 나간다', () => {
  for (const p of ['baemin', 'yogiyo', 'ddangyo']) {
    const link = `https://example.com/${p}`
    const got = offerLink({ platform: p, link }, {}, 'BBQ')
    assert.equal(got, link)
    assert.notEqual(got, COUPANGEATS_LINK)
  }
})
```

- 플랫폼 세 개를 도는 이유: 분기가 `baemin` 하나에만 맞는 우연이 아니라 "쿠팡이츠 외 전체"임을 보기 위해서다. 플랫폼 목록은 기존 테스트(10~14행)와 같은 이름에서 쿠팡이츠만 뺐다.
- 링크는 `example.com` 아래 임의 값이다. 실제 서비스 도메인이나 문구를 박지 않는다.
- `notEqual` 한 줄은 `equal`이 이미 포함하지만, 실패 메시지에서 "허브로 샜다"가 드러나도록 남긴다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 `offerLink`, `openWithNotice`를 검색했을 때 항목이 없다. 직전 설계 131과 같은 판단이다.

- 6번(화면에 나가는 글자): 문구를 만들지도 바꾸지도 않는다. 해당하지 않는다.
- 8번의 웹 프리뷰 절차: 화면이 바뀌지 않는 테스트 전용 변경이라 적용하지 않는다. 360px 스크린샷과 `preview/` push 대상이 아니다. 구현자 PR에서 이 판단을 한 줄로 적는다.
- 9번 "새 파일": 새 `*.test.js`를 만들지 않고 기존 파일에 더한다. `web/package.json`의 `test`는 수정하지 않는다. 구현자는 새 테스트 이름이 실행 출력에 나오는지 확인한다.
- 결론: 같이 고칠 자리가 없다.

## 구현자에게

- 만지는 경로는 `web/src/offerLink.test.js` 하나다. 웹 구현자 역할이다. API 변경은 없다.
- 테스트가 실제로 보는지 증명한다. `offerLink.js:175`의 조건을 임시로 `offer.platform !== 'x'`처럼 모든 플랫폼이 쿠팡이츠 분기로 가게 바꾸고 새 테스트가 실패하는 것을 한 번 본 뒤 되돌린다. 되돌린 뒤 `offerLink.js`에 diff가 없어야 한다.
- main에 직접 커밋하지 않는다. 화면 변경이 없어 프리뷰는 생략한다(위 판단).

## 검증

- `cd web && npm test`가 통과한다. 새 테스트 이름이 출력에 보인다.
- `git diff --stat`에 `web/src/offerLink.test.js`만 나온다.
- 위 임시 변경에서 새 테스트가 실패하고 되돌리면 통과한다.

## 열린 질문

없음.
